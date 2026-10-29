import { isUniqueViolation, type Database } from "./database.js";

export class WelcomeRepository {
  constructor(private readonly db: Database) {}

  /** Réserve l'envoi du message de bienvenue pour cette arrivée. Retourne false si déjà traitée. */
  reserve(guildId: string, userId: string, joinedAt: string, now: Date): boolean {
    try {
      this.db
        .prepare(
          "INSERT INTO welcomes (guild_id, user_id, joined_at, status, created_at) VALUES (?, ?, ?, 'sending', ?)",
        )
        .run(guildId, userId, joinedAt, now.toISOString());
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }

  /** Date du dernier message de bienvenue envoyé à ce membre, s'il existe. */
  lastSentAt(guildId: string, userId: string): Date | null {
    const row = this.db
      .prepare(
        "SELECT MAX(created_at) AS created_at FROM welcomes WHERE guild_id = ? AND user_id = ? AND status = 'sent'",
      )
      .get(guildId, userId) as { created_at: string | null } | undefined;
    return row?.created_at ? new Date(row.created_at) : null;
  }

  markSent(guildId: string, userId: string, joinedAt: string, messageId: string): void {
    this.db
      .prepare("UPDATE welcomes SET status = 'sent', message_id = ? WHERE guild_id = ? AND user_id = ? AND joined_at = ?")
      .run(messageId, guildId, userId, joinedAt);
  }

  markOutcome(guildId: string, userId: string, joinedAt: string, status: "skipped" | "failed", reason: string): void {
    this.db
      .prepare("UPDATE welcomes SET status = ?, status_reason = ? WHERE guild_id = ? AND user_id = ? AND joined_at = ?")
      .run(status, reason, guildId, userId, joinedAt);
  }

  status(guildId: string, userId: string, joinedAt: string): string | null {
    const row = this.db
      .prepare("SELECT status FROM welcomes WHERE guild_id = ? AND user_id = ? AND joined_at = ?")
      .get(guildId, userId, joinedAt) as { status: string } | undefined;
    return row?.status ?? null;
  }
}
