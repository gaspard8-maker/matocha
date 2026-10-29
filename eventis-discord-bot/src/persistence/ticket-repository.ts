import { isUniqueViolation, type Database } from "./database.js";

export type TicketStatus = "opening" | "open" | "closed";

export interface Ticket {
  id: number;
  guildId: string;
  authorId: string;
  threadId: string | null;
  status: TicketStatus;
  assigneeId: string | null;
  createdAt: string;
  closedAt: string | null;
  closedBy: string | null;
  closeReason: string | null;
}

export interface TicketAction {
  id: number;
  ticketId: number;
  action: string;
  actorId: string | null;
  details: string | null;
  createdAt: string;
}

interface TicketRow {
  id: number;
  guild_id: string;
  author_id: string;
  thread_id: string | null;
  status: TicketStatus;
  assignee_id: string | null;
  created_at: string;
  closed_at: string | null;
  closed_by: string | null;
  close_reason: string | null;
}

function toTicket(row: TicketRow): Ticket {
  return {
    id: row.id,
    guildId: row.guild_id,
    authorId: row.author_id,
    threadId: row.thread_id,
    status: row.status,
    assigneeId: row.assignee_id,
    createdAt: row.created_at,
    closedAt: row.closed_at,
    closedBy: row.closed_by,
    closeReason: row.close_reason,
  };
}

export class TicketRepository {
  constructor(private readonly db: Database) {}

  /**
   * Réserve un numéro de ticket pour ce membre.
   * Retourne null si le membre a déjà un ticket actif (contrainte d'unicité en base).
   */
  reserve(guildId: string, authorId: string, now: Date): Ticket | null {
    try {
      const result = this.db
        .prepare(
          "INSERT INTO tickets (guild_id, author_id, status, created_at) VALUES (?, ?, 'opening', ?)",
        )
        .run(guildId, authorId, now.toISOString());
      const ticket = this.findById(Number(result.lastInsertRowid));
      if (ticket) this.logAction(ticket.id, "reserved", authorId, null, now);
      return ticket;
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }

  attachThread(ticketId: number, threadId: string, now: Date): void {
    this.db
      .prepare("UPDATE tickets SET thread_id = ?, status = 'open' WHERE id = ? AND status = 'opening'")
      .run(threadId, ticketId);
    this.logAction(ticketId, "opened", null, threadId, now);
  }

  close(ticketId: number, closedBy: string | null, reason: string, now: Date): boolean {
    const result = this.db
      .prepare(
        "UPDATE tickets SET status = 'closed', closed_at = ?, closed_by = ?, close_reason = ? WHERE id = ? AND status != 'closed'",
      )
      .run(now.toISOString(), closedBy, reason, ticketId);
    if (Number(result.changes) > 0) {
      this.logAction(ticketId, "closed", closedBy, reason, now);
      return true;
    }
    return false;
  }

  assign(ticketId: number, assigneeId: string, now: Date): void {
    this.db.prepare("UPDATE tickets SET assignee_id = ? WHERE id = ?").run(assigneeId, ticketId);
    this.logAction(ticketId, "assigned", assigneeId, null, now);
  }

  findById(id: number): Ticket | null {
    const row = this.db.prepare("SELECT * FROM tickets WHERE id = ?").get(id) as TicketRow | undefined;
    return row ? toTicket(row) : null;
  }

  findByThread(threadId: string): Ticket | null {
    const row = this.db.prepare("SELECT * FROM tickets WHERE thread_id = ?").get(threadId) as
      | TicketRow
      | undefined;
    return row ? toTicket(row) : null;
  }

  findActiveForMember(guildId: string, authorId: string): Ticket | null {
    const row = this.db
      .prepare("SELECT * FROM tickets WHERE guild_id = ? AND author_id = ? AND status IN ('opening', 'open')")
      .get(guildId, authorId) as TicketRow | undefined;
    return row ? toTicket(row) : null;
  }

  listByStatus(status: TicketStatus): Ticket[] {
    const rows = this.db.prepare("SELECT * FROM tickets WHERE status = ? ORDER BY id").all(status) as unknown as TicketRow[];
    return rows.map(toTicket);
  }

  logAction(ticketId: number, action: string, actorId: string | null, details: string | null, now: Date): void {
    this.db
      .prepare("INSERT INTO ticket_actions (ticket_id, action, actor_id, details, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(ticketId, action, actorId, details, now.toISOString());
  }

  history(ticketId: number): TicketAction[] {
    const rows = this.db
      .prepare("SELECT * FROM ticket_actions WHERE ticket_id = ? ORDER BY id")
      .all(ticketId) as unknown as {
      id: number;
      ticket_id: number;
      action: string;
      actor_id: string | null;
      details: string | null;
      created_at: string;
    }[];
    return rows.map((r) => ({
      id: r.id,
      ticketId: r.ticket_id,
      action: r.action,
      actorId: r.actor_id,
      details: r.details,
      createdAt: r.created_at,
    }));
  }
}
