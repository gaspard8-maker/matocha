import type { OutboundMessage } from "../bot/outbound-message.js";

export type PreparedPublication = { channelId: string; message: OutboundMessage } | { ignore: string };

/** Traitement d'un type d'événement Eventis (validation, idempotence, rendu). */
export interface EventHandler<T> {
  readonly type: string;
  /** Validation stricte des données (Zod). Lève une erreur si invalide. */
  parse(data: unknown): T;
  /** Clé métier unique : un même objet (vente, publication) ne génère qu'un seul message. */
  dedupeKey(data: T): string;
  /** Raison d'ignorer l'événement dès sa réception, ou null s'il est publiable. */
  rejectionReason(data: T): string | null;
  /** Construit le message au moment de la publication (ou une raison de ne pas publier). */
  prepare(data: T): Promise<PreparedPublication>;
}

export type PublishOutcome =
  | { status: "published"; messageId: string }
  | { status: "ignored"; reason: string }
  | { status: "duplicate" }
  | { status: "retrying"; error: string }
  | { status: "failed"; error: string };
