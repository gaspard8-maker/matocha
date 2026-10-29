import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type Database = DatabaseSync;

const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        author_id TEXT NOT NULL,
        thread_id TEXT UNIQUE,
        status TEXT NOT NULL CHECK (status IN ('opening', 'open', 'closed')),
        assignee_id TEXT,
        created_at TEXT NOT NULL,
        closed_at TEXT,
        closed_by TEXT,
        close_reason TEXT
      );
      -- Un seul ticket actif par membre, garanti par la base (y compris en cas de double clic).
      CREATE UNIQUE INDEX tickets_one_active_per_member
        ON tickets (guild_id, author_id) WHERE status IN ('opening', 'open');

      CREATE TABLE ticket_actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id INTEGER NOT NULL REFERENCES tickets (id),
        action TEXT NOT NULL,
        actor_id TEXT,
        details TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX ticket_actions_ticket ON ticket_actions (ticket_id);

      CREATE TABLE inbound_events (
        dedupe_key TEXT PRIMARY KEY,
        envelope_id TEXT NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'published', 'ignored', 'failed')),
        status_reason TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT,
        received_at TEXT NOT NULL,
        published_at TEXT,
        discord_message_id TEXT,
        last_error TEXT
      );
      CREATE INDEX inbound_events_due ON inbound_events (status, next_attempt_at);

      CREATE TABLE welcomes (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        joined_at TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('sending', 'sent', 'skipped', 'failed')),
        status_reason TEXT,
        message_id TEXT,
        created_at TEXT NOT NULL,
        PRIMARY KEY (guild_id, user_id, joined_at)
      );
    `,
  },
];

/** Ouvre (ou crée) la base SQLite et applique les migrations manquantes. */
export function openDatabase(path: string): Database {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  migrate(db);
  return db;
}

function migrate(db: Database): void {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);",
  );
  const row = db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get() as
    | { version: number | null }
    | undefined;
  const current = row?.version ?? 0;
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    db.exec("BEGIN");
    try {
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
        migration.version,
        new Date().toISOString(),
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message);
}
