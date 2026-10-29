import { isUniqueViolation, type Database } from "./database.js";

export type InboundEventStatus = "pending" | "published" | "ignored" | "failed";

export interface InboundEvent {
  dedupeKey: string;
  envelopeId: string;
  type: string;
  payload: unknown;
  status: InboundEventStatus;
  statusReason: string | null;
  attempts: number;
  nextAttemptAt: string | null;
  receivedAt: string;
  publishedAt: string | null;
  discordMessageId: string | null;
  lastError: string | null;
}

interface Row {
  dedupe_key: string;
  envelope_id: string;
  type: string;
  payload: string;
  status: InboundEventStatus;
  status_reason: string | null;
  attempts: number;
  next_attempt_at: string | null;
  received_at: string;
  published_at: string | null;
  discord_message_id: string | null;
  last_error: string | null;
}

function toEvent(row: Row): InboundEvent {
  return {
    dedupeKey: row.dedupe_key,
    envelopeId: row.envelope_id,
    type: row.type,
    payload: JSON.parse(row.payload) as unknown,
    status: row.status,
    statusReason: row.status_reason,
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    receivedAt: row.received_at,
    publishedAt: row.published_at,
    discordMessageId: row.discord_message_id,
    lastError: row.last_error,
  };
}

export interface NewInboundEvent {
  dedupeKey: string;
  envelopeId: string;
  type: string;
  payload: unknown;
  status: "pending" | "ignored";
  statusReason?: string | null;
}

/** Historique et file d'attente des événements reçus d'Eventis (boîte de réception idempotente). */
export class EventRepository {
  constructor(private readonly db: Database) {}

  /** Enregistre l'événement. Retourne false s'il a déjà été reçu (doublon). */
  insert(event: NewInboundEvent, now: Date): boolean {
    try {
      this.db
        .prepare(
          `INSERT INTO inbound_events (dedupe_key, envelope_id, type, payload, status, status_reason, next_attempt_at, received_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          event.dedupeKey,
          event.envelopeId,
          event.type,
          JSON.stringify(event.payload),
          event.status,
          event.statusReason ?? null,
          event.status === "pending" ? now.toISOString() : null,
          now.toISOString(),
        );
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }

  get(dedupeKey: string): InboundEvent | null {
    const row = this.db.prepare("SELECT * FROM inbound_events WHERE dedupe_key = ?").get(dedupeKey) as Row | undefined;
    return row ? toEvent(row) : null;
  }

  listDue(now: Date, limit: number): InboundEvent[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM inbound_events WHERE status = 'pending' AND next_attempt_at <= ? ORDER BY received_at LIMIT ?",
      )
      .all(now.toISOString(), limit) as unknown as Row[];
    return rows.map(toEvent);
  }

  /** Vrai si une version identique a déjà été annoncée publiquement. */
  isReleaseVersionPublished(version: string): boolean {
    const row = this.db
      .prepare(
        "SELECT 1 FROM inbound_events WHERE type = 'site.release.published' AND status = 'published' AND json_extract(payload, '$.version') = ? LIMIT 1",
      )
      .get(version);
    return row !== undefined;
  }

  markPublished(dedupeKey: string, messageId: string, now: Date): void {
    this.db
      .prepare(
        "UPDATE inbound_events SET status = 'published', published_at = ?, discord_message_id = ?, next_attempt_at = NULL, last_error = NULL, attempts = attempts + 1 WHERE dedupe_key = ?",
      )
      .run(now.toISOString(), messageId, dedupeKey);
  }

  markIgnored(dedupeKey: string, reason: string): void {
    this.db
      .prepare("UPDATE inbound_events SET status = 'ignored', status_reason = ?, next_attempt_at = NULL WHERE dedupe_key = ?")
      .run(reason, dedupeKey);
  }

  markRetry(dedupeKey: string, error: string, nextAttemptAt: Date): void {
    this.db
      .prepare(
        "UPDATE inbound_events SET attempts = attempts + 1, last_error = ?, next_attempt_at = ? WHERE dedupe_key = ?",
      )
      .run(error, nextAttemptAt.toISOString(), dedupeKey);
  }

  markFailed(dedupeKey: string, error: string): void {
    this.db
      .prepare(
        "UPDATE inbound_events SET status = 'failed', attempts = attempts + 1, last_error = ?, next_attempt_at = NULL WHERE dedupe_key = ?",
      )
      .run(error, dedupeKey);
  }
}
