import type { Logger } from "../logging/logger.js";
import type { MessagePublisher } from "../bot/outbound-message.js";
import { isPermanentDiscordError, nonceFor } from "../bot/publisher.js";
import type { EventRepository, InboundEvent } from "../persistence/event-repository.js";
import type { EventHandler, PublishOutcome } from "./handler.js";

export class UnknownEventTypeError extends Error {
  constructor(type: string) {
    super(`Type d'événement inconnu : ${type}`);
    this.name = "UnknownEventTypeError";
  }
}

export type ReceiveResult =
  | { status: "accepted"; dedupeKey: string }
  | { status: "ignored"; dedupeKey: string; reason: string }
  | { status: "duplicate"; dedupeKey: string };

export interface ProcessorOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  now?: () => Date;
}

const DEFAULT_OPTIONS: ProcessorOptions = { maxAttempts: 8, baseDelayMs: 15_000, maxDelayMs: 3_600_000 };

/**
 * Boîte de réception idempotente : chaque événement est enregistré avant toute publication,
 * publié au plus une fois, et réessayé avec un délai croissant en cas d'erreur Discord temporaire.
 */
export class EventProcessor {
  private readonly handlers = new Map<string, EventHandler<unknown>>();
  private readonly inProgress = new Set<string>();
  private readonly options: ProcessorOptions;
  private readonly now: () => Date;
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly repo: EventRepository,
    handlers: EventHandler<unknown>[],
    private readonly publisher: MessagePublisher,
    private readonly logger: Logger,
    options: Partial<ProcessorOptions> = {},
  ) {
    for (const h of handlers) this.handlers.set(h.type, h);
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.now = options.now ?? (() => new Date());
  }

  private handler(type: string): EventHandler<unknown> {
    const handler = this.handlers.get(type);
    if (!handler) throw new UnknownEventTypeError(type);
    return handler;
  }

  /** Valide et enregistre un événement (lève une erreur Zod si les données sont invalides). */
  receive(envelopeId: string, type: string, rawData: unknown): ReceiveResult {
    const handler = this.handler(type);
    const data = handler.parse(rawData);
    const dedupeKey = handler.dedupeKey(data);
    const reason = handler.rejectionReason(data);
    const inserted = this.repo.insert(
      { dedupeKey, envelopeId, type, payload: data, status: reason ? "ignored" : "pending", statusReason: reason },
      this.now(),
    );
    if (!inserted) return { status: "duplicate", dedupeKey };
    this.logger.info({ dedupeKey, envelopeId, type, ignored: reason ?? undefined }, "événement Eventis reçu");
    return reason ? { status: "ignored", dedupeKey, reason } : { status: "accepted", dedupeKey };
  }

  /** Enregistre puis publie immédiatement (publication manuelle confirmée par un administrateur). */
  async publishNow(envelopeId: string, type: string, data: unknown): Promise<PublishOutcome> {
    const received = this.receive(envelopeId, type, data);
    if (received.status === "duplicate") return { status: "duplicate" };
    if (received.status === "ignored") return { status: "ignored", reason: received.reason };
    return this.processOne(received.dedupeKey);
  }

  async processOne(dedupeKey: string): Promise<PublishOutcome> {
    const event = this.repo.get(dedupeKey);
    if (!event) return { status: "failed", error: "événement introuvable" };
    if (event.status === "published") return { status: "duplicate" };
    if (event.status === "ignored") return { status: "ignored", reason: event.statusReason ?? "ignored" };
    if (event.status === "failed") return { status: "failed", error: event.lastError ?? "échec" };
    if (this.inProgress.has(dedupeKey)) return { status: "retrying", error: "publication déjà en cours" };

    this.inProgress.add(dedupeKey);
    try {
      return await this.publish(event);
    } finally {
      this.inProgress.delete(dedupeKey);
    }
  }

  private async publish(event: InboundEvent): Promise<PublishOutcome> {
    const handler = this.handler(event.type);
    const prepared = await handler.prepare(handler.parse(event.payload));
    if ("ignore" in prepared) {
      this.repo.markIgnored(event.dedupeKey, prepared.ignore);
      return { status: "ignored", reason: prepared.ignore };
    }
    try {
      const messageId = await this.publisher.send(prepared.channelId, prepared.message, {
        nonce: nonceFor(event.dedupeKey),
      });
      this.repo.markPublished(event.dedupeKey, messageId, this.now());
      this.logger.info({ dedupeKey: event.dedupeKey, messageId }, "événement publié sur Discord");
      return { status: "published", messageId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const attempts = event.attempts + 1;
      if (isPermanentDiscordError(error) || attempts >= this.options.maxAttempts) {
        this.repo.markFailed(event.dedupeKey, message);
        this.logger.error({ dedupeKey: event.dedupeKey, attempts, error: message }, "publication abandonnée");
        return { status: "failed", error: message };
      }
      const delay = Math.min(this.options.baseDelayMs * 2 ** (attempts - 1), this.options.maxDelayMs);
      this.repo.markRetry(event.dedupeKey, message, new Date(this.now().getTime() + delay));
      this.logger.warn({ dedupeKey: event.dedupeKey, attempts, delayMs: delay }, "publication reportée");
      return { status: "retrying", error: message };
    }
  }

  /** Publie les événements en attente dont l'heure est venue (y compris après un redémarrage). */
  async processDue(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (const event of this.repo.listDue(this.now(), 20)) {
        await this.processOne(event.dedupeKey).catch((error: unknown) => {
          this.logger.error({ err: error, dedupeKey: event.dedupeKey }, "traitement impossible");
        });
      }
    } finally {
      this.running = false;
    }
  }

  kick(): void {
    setImmediate(() => void this.processDue());
  }

  start(intervalMs = 10_000): void {
    this.stop();
    this.kick();
    this.timer = setInterval(() => void this.processDue(), intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
