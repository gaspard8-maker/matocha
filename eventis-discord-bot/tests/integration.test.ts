import type { AddressInfo } from "node:net";
import { Writable } from "node:stream";
import { pino } from "pino";
import { afterEach, describe, expect, it } from "vitest";
import { PermanentPublishError } from "../src/bot/outbound-message.js";
import { EventProcessor } from "../src/integration/event-processor.js";
import type { EventHandler } from "../src/integration/handler.js";
import { createWebhookServer } from "../src/integration/webhook-server.js";
import { REDACTED_PATHS } from "../src/logging/logger.js";
import { EventRepository } from "../src/persistence/event-repository.js";
import { SaleHandler } from "../src/sales/sale-handler.js";
import { RateLimiter } from "../src/security/rate-limiter.js";
import { SIGNATURE_HEADER, signatureHeader, TIMESTAMP_HEADER, verifySignature } from "../src/security/signature.js";
import { ReleaseHandler } from "../src/updates/release-handler.js";
import { FakePublisher, IDS, memoryDb, silentLogger, TEST_SECRET } from "./helpers.js";
import { sampleRelease, sampleSale } from "./fixtures.js";

const NOW = 1_800_000_000;
const LOGO = Buffer.from("logo");

function makeProcessor(options: { salesEnabled?: boolean; clock?: { t: number }; logger?: typeof silentLogger } = {}) {
  const repo = new EventRepository(memoryDb());
  const publisher = new FakePublisher();
  const clock = options.clock ?? { t: NOW * 1000 };
  const processor = new EventProcessor(
    repo,
    [
      new ReleaseHandler({ channelId: IDS.updatesChannel, showLogo: true }, repo, () => Promise.resolve(LOGO)),
      new SaleHandler({ channelId: IDS.salesChannel, enabled: options.salesEnabled ?? true, timeZone: "Europe/Paris" }),
    ] as EventHandler<unknown>[],
    publisher,
    options.logger ?? silentLogger,
    { maxAttempts: 3, baseDelayMs: 1000, now: () => new Date(clock.t) },
  );
  return { repo, publisher, processor, clock };
}

const servers: { close: () => void }[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

async function startServer(processor: EventProcessor, opts: { limit?: number; logger?: typeof silentLogger } = {}) {
  const server = createWebhookServer({
    processor,
    secrets: [TEST_SECRET],
    toleranceSeconds: 300,
    rateLimiter: new RateLimiter(opts.limit ?? 100),
    logger: opts.logger ?? silentLogger,
    nowSeconds: () => NOW,
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function envelope(type: string, data: unknown, id = "evt_1") {
  return JSON.stringify({ id, type, created_at: "2026-10-29T12:00:00Z", data });
}

function post(base: string, body: string, opts: { secret?: string; timestamp?: number; signature?: string } = {}) {
  const timestamp = String(opts.timestamp ?? NOW);
  return fetch(`${base}/webhooks/eventis`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [TIMESTAMP_HEADER]: timestamp,
      [SIGNATURE_HEADER]: opts.signature ?? signatureHeader(opts.secret ?? TEST_SECRET, timestamp, body),
    },
    body,
  });
}

async function settle(processor: EventProcessor) {
  await new Promise((r) => setImmediate(r));
  await processor.processDue();
}

describe("signature HMAC", () => {
  const body = Buffer.from('{"a":1}');
  const base = { secrets: [TEST_SECRET], rawBody: body, nowSeconds: NOW, toleranceSeconds: 300 };

  it("accepte une signature valide, y compris avec l'ancien secret pendant une rotation", () => {
    const sig = signatureHeader(TEST_SECRET, String(NOW), body);
    expect(verifySignature({ ...base, timestamp: String(NOW), signature: sig })).toEqual({ ok: true });
    const old = "old-secret-0123456789abcdef0123456789abcdef";
    expect(
      verifySignature({ ...base, secrets: [TEST_SECRET, old], timestamp: String(NOW), signature: signatureHeader(old, String(NOW), body) }),
    ).toEqual({ ok: true });
  });

  it("refuse une signature invalide, un corps modifié, des en-têtes absents ou un horodatage ancien", () => {
    const sig = signatureHeader(TEST_SECRET, String(NOW), body);
    expect(verifySignature({ ...base, timestamp: String(NOW), signature: "v1=deadbeef" })).toMatchObject({ reason: "invalid_signature" });
    expect(verifySignature({ ...base, rawBody: Buffer.from('{"a":2}'), timestamp: String(NOW), signature: sig })).toMatchObject({ ok: false });
    expect(verifySignature({ ...base, timestamp: undefined, signature: sig })).toMatchObject({ reason: "missing_headers" });
    expect(verifySignature({ ...base, timestamp: String(NOW - 301), signature: signatureHeader(TEST_SECRET, String(NOW - 301), body) })).toMatchObject({ reason: "stale_timestamp" });
  });
});

describe("API de réception d'événements", () => {
  it("publie une mise à jour authentifiée une seule fois", async () => {
    const { processor, publisher, repo } = makeProcessor();
    const base = await startServer(processor);
    const body = envelope("site.release.published", sampleRelease());
    const first = await post(base, body);
    expect(first.status).toBe(202);
    expect(await first.json()).toEqual({ status: "accepted" });
    await settle(processor);
    expect(publisher.sent).toHaveLength(1);
    expect(publisher.sent[0]?.channelId).toBe(IDS.updatesChannel);
    expect(publisher.sent[0]?.message.embeds[0]?.title).toBe("UPDATE 6.4.2");

    // Rejeu de la même requête (et renvoi avec un autre identifiant d'enveloppe) : aucun doublon.
    expect((await post(base, body)).status).toBe(200);
    expect((await post(base, envelope("site.release.published", sampleRelease(), "evt_2"))).status).toBe(200);
    await settle(processor);
    expect(publisher.sent).toHaveLength(1);
    expect(repo.get("release:rel_2026_10_29_01")?.status).toBe("published");
  });

  it("rejette les requêtes non authentifiées ou rejouées hors délai sans rien enregistrer", async () => {
    const { processor, publisher, repo } = makeProcessor();
    const base = await startServer(processor);
    const body = envelope("site.release.published", sampleRelease());
    expect((await post(base, body, { secret: "wrong-secret-0123456789abcdef0123456789" })).status).toBe(401);
    expect((await post(base, body, { signature: "" })).status).toBe(401);
    expect((await post(base, body, { timestamp: NOW - 3600 })).status).toBe(401);
    await settle(processor);
    expect(publisher.sent).toHaveLength(0);
    expect(repo.get("release:rel_2026_10_29_01")).toBeNull();
  });

  it("valide le contenu et ne renvoie jamais les valeurs reçues", async () => {
    const { processor } = makeProcessor();
    const base = await startServer(processor);
    const bad = await post(base, envelope("marketplace.sale.confirmed", sampleSale({ buyer_email: "client@exemple.fr" })));
    expect(bad.status).toBe(422);
    expect(await bad.text()).not.toContain("client@exemple.fr");
    expect((await post(base, envelope("site.unknown", {}))).status).toBe(422);
    expect((await post(base, "{pas du json")).status).toBe(400);
    expect((await fetch(`${base}/webhooks/eventis`)).status).toBe(405);
    expect((await fetch(`${base}/health`)).status).toBe(200);
  });

  it("publie une vente réelle confirmée, une seule fois", async () => {
    const { processor, publisher } = makeProcessor();
    const base = await startServer(processor);
    expect((await post(base, envelope("marketplace.sale.confirmed", sampleSale()))).status).toBe(202);
    expect((await post(base, envelope("marketplace.sale.confirmed", sampleSale(), "evt_retry"))).status).toBe(200);
    await settle(processor);
    expect(publisher.sent).toHaveLength(1);
    expect(publisher.sent[0]?.channelId).toBe(IDS.salesChannel);
  });

  it("ne publie ni vente sandbox, ni paiement en attente, ni vente tant que la fonction est désactivée", async () => {
    const { processor, publisher } = makeProcessor();
    const base = await startServer(processor);
    const sandbox = await post(base, envelope("marketplace.sale.confirmed", sampleSale({ sale_id: "s1", livemode: false })));
    expect(await sandbox.json()).toEqual({ status: "ignored", reason: "sandbox_sale" });
    const pending = await post(base, envelope("marketplace.sale.confirmed", sampleSale({ sale_id: "s2", payment_status: "pending" })));
    expect(await pending.json()).toEqual({ status: "ignored", reason: "payment_not_succeeded" });
    await settle(processor);
    expect(publisher.sent).toHaveLength(0);

    const disabled = makeProcessor({ salesEnabled: false });
    const base2 = await startServer(disabled.processor);
    const res = await post(base2, envelope("marketplace.sale.confirmed", sampleSale()));
    expect(await res.json()).toEqual({ status: "ignored", reason: "sales_feed_disabled" });
    await settle(disabled.processor);
    expect(disabled.publisher.sent).toHaveLength(0);
  });

  it("limite le nombre de requêtes", async () => {
    const { processor } = makeProcessor();
    const base = await startServer(processor, { limit: 2 });
    const body = envelope("site.release.published", sampleRelease({ environment: "staging" }));
    expect((await post(base, body)).status).toBe(202);
    expect((await post(base, body)).status).toBe(200);
    expect((await post(base, body)).status).toBe(429);
  });
});

describe("réessais et erreurs Discord", () => {
  it("réessaie après une erreur temporaire puis publie", async () => {
    const { processor, publisher, repo, clock } = makeProcessor();
    publisher.failures.push(new Error("Service Unavailable"));
    processor.receive("evt", "marketplace.sale.confirmed", sampleSale());
    expect(await processor.processOne("sale:sale_123")).toMatchObject({ status: "retrying" });
    await processor.processDue();
    expect(publisher.sent).toHaveLength(0); // pas encore l'heure
    clock.t += 1000;
    await processor.processDue();
    expect(publisher.sent).toHaveLength(1);
    expect(repo.get("sale:sale_123")).toMatchObject({ status: "published", attempts: 2 });
  });

  it("abandonne après le nombre maximal d'essais ou sur une erreur définitive", async () => {
    const { processor, publisher, repo, clock } = makeProcessor();
    publisher.failures.push(new Error("a"), new Error("b"), new Error("c"));
    processor.receive("evt", "marketplace.sale.confirmed", sampleSale());
    for (let i = 0; i < 3; i++) {
      await processor.processDue();
      clock.t += 10_000;
    }
    expect(repo.get("sale:sale_123")?.status).toBe("failed");

    publisher.failures.push(new PermanentPublishError("Missing Permissions"));
    processor.receive("evt2", "marketplace.sale.confirmed", sampleSale({ sale_id: "other" }));
    expect(await processor.processOne("sale:other")).toEqual({ status: "failed", error: "Missing Permissions" });
    expect(publisher.sent).toHaveLength(0);
  });

  it("reprend les événements en attente après un redémarrage", async () => {
    const first = makeProcessor();
    first.processor.receive("evt", "site.release.published", sampleRelease());
    // Nouveau processeur sur la même base, comme après un redémarrage.
    const publisher = new FakePublisher();
    const restarted = new EventProcessor(
      first.repo,
      [new ReleaseHandler({ channelId: IDS.updatesChannel, showLogo: false }, first.repo)] as EventHandler<unknown>[],
      publisher,
      silentLogger,
      { now: () => new Date(NOW * 1000) },
    );
    await restarted.processDue();
    expect(publisher.sent).toHaveLength(1);
    expect(publisher.sent[0]?.nonce).toHaveLength(25);
  });

  it("publication manuelle : refuse une version déjà annoncée", async () => {
    const { processor, publisher } = makeProcessor();
    expect(await processor.publishNow("m1", "site.release.published", sampleRelease({ release_id: "manual-1" }))).toMatchObject({ status: "published" });
    expect(await processor.publishNow("m2", "site.release.published", sampleRelease({ release_id: "manual-2" }))).toEqual({
      status: "ignored",
      reason: "version_already_announced",
    });
    expect(publisher.sent).toHaveLength(1);
  });
});

describe("absence de fuite de secrets dans les logs", () => {
  it("masque token, secret et signature", () => {
    let output = "";
    const sink = new Writable({
      write(chunk: Buffer, _enc, cb) {
        output += chunk.toString();
        cb();
      },
    });
    const logger = pino({ redact: { paths: REDACTED_PATHS, censor: "[redacted]" } }, sink);
    logger.info({ token: "MTAx.token", secret: TEST_SECRET, headers: { "x-eventis-signature": "v1=abc" }, config: { discord: { token: "tok" } } }, "test");
    expect(output).not.toContain("MTAx.token");
    expect(output).not.toContain(TEST_SECRET);
    expect(output).not.toContain("v1=abc");
    expect(output).toContain("[redacted]");
  });

  it("les refus d'authentification ne journalisent ni secret ni signature", async () => {
    let output = "";
    const sink = new Writable({
      write(chunk: Buffer, _enc, cb) {
        output += chunk.toString();
        cb();
      },
    });
    const logger = pino({ redact: { paths: REDACTED_PATHS, censor: "[redacted]" } }, sink);
    const { processor } = makeProcessor({ logger });
    const base = await startServer(processor, { logger });
    await post(base, envelope("site.release.published", sampleRelease()), { signature: "v1=0123456789abcdef" });
    expect(output).toContain("invalid_signature");
    expect(output).not.toContain("0123456789abcdef");
    expect(output).not.toContain(TEST_SECRET);
  });
});
