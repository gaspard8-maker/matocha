import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import type { Logger } from "../logging/logger.js";
import type { RateLimiter } from "../security/rate-limiter.js";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verifySignature } from "../security/signature.js";
import { envelopeSchema } from "./envelope.js";
import { UnknownEventTypeError, type EventProcessor } from "./event-processor.js";

export const WEBHOOK_PATH = "/webhooks/eventis";
const MAX_BODY_BYTES = 64 * 1024;

export interface WebhookServerOptions {
  processor: EventProcessor;
  secrets: string[];
  toleranceSeconds: number;
  rateLimiter: RateLimiter;
  logger: Logger;
  /** Faire confiance à X-Forwarded-For (derrière un reverse proxy uniquement). */
  trustProxy?: boolean;
  nowSeconds?: () => number;
}

class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly body: Record<string, unknown>,
  ) {
    super(`HTTP ${statusCode}`);
  }
}

function send(res: ServerResponse, statusCode: number, body: Record<string, unknown>): void {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, { error: "payload_too_large" }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    req.on("error", reject);
  });
}

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export function createWebhookServer(options: WebhookServerOptions): Server {
  const nowSeconds = options.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
  const { logger } = options;

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/health") {
      if (req.method !== "GET") throw new HttpError(405, { error: "method_not_allowed" });
      send(res, 200, { status: "ok" });
      return;
    }
    if (url.pathname !== WEBHOOK_PATH) throw new HttpError(404, { error: "not_found" });
    if (req.method !== "POST") throw new HttpError(405, { error: "method_not_allowed" });

    const forwarded = options.trustProxy ? header(req, "x-forwarded-for")?.split(",")[0]?.trim() : undefined;
    const ip = forwarded ?? req.socket.remoteAddress ?? "unknown";
    if (!options.rateLimiter.allow(ip)) throw new HttpError(429, { error: "rate_limited" });
    if (!header(req, "content-type")?.toLowerCase().startsWith("application/json")) {
      throw new HttpError(415, { error: "unsupported_media_type" });
    }

    const rawBody = await readBody(req);
    // Authentification AVANT toute lecture du contenu.
    const check = verifySignature({
      secrets: options.secrets,
      timestamp: header(req, TIMESTAMP_HEADER),
      signature: header(req, SIGNATURE_HEADER),
      rawBody,
      nowSeconds: nowSeconds(),
      toleranceSeconds: options.toleranceSeconds,
    });
    if (!check.ok) {
      logger.warn({ ip, reason: check.reason }, "requête webhook refusée");
      throw new HttpError(401, { error: check.reason });
    }

    let json: unknown;
    try {
      json = JSON.parse(rawBody.toString("utf8"));
    } catch {
      throw new HttpError(400, { error: "invalid_json" });
    }
    const envelope = envelopeSchema.parse(json);
    const result = options.processor.receive(envelope.id, envelope.type, envelope.data);
    if (result.status === "accepted") options.processor.kick();
    send(res, result.status === "duplicate" ? 200 : 202, {
      status: result.status,
      ...(result.status === "ignored" ? { reason: result.reason } : {}),
    });
  }

  return createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      if (error instanceof HttpError) {
        send(res, error.statusCode, error.body);
      } else if (error instanceof UnknownEventTypeError) {
        send(res, 422, { error: "unknown_event_type" });
      } else if (error instanceof ZodError) {
        // Seuls les chemins des champs invalides sont renvoyés, jamais leurs valeurs.
        send(res, 422, {
          error: "invalid_payload",
          issues: error.issues.map((i) => ({ path: i.path.join("."), code: i.code })),
        });
      } else {
        logger.error({ err: error }, "erreur interne du webhook");
        send(res, 500, { error: "internal_error" });
      }
    });
  });
}
