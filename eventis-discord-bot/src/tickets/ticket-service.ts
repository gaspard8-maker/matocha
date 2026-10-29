import type { OwnerTarget } from "../config/env.js";
import type { Logger } from "../logging/logger.js";
import type { Ticket, TicketRepository } from "../persistence/ticket-repository.js";
import { buildTicketMessage, ticketThreadName } from "./ticket-message.js";
import type { TicketGateway } from "./ticket-gateway.js";

export type OpenTicketResult =
  | { kind: "created"; ticket: Ticket; threadId: string }
  | { kind: "existing"; threadId: string }
  | { kind: "cooldown"; retryAfterSeconds: number }
  | { kind: "busy" }
  | { kind: "missing_permissions"; missing: string[] }
  | { kind: "error" };

export type CloseTicketResult =
  | { kind: "closed"; ticket: Ticket; threadArchived: boolean }
  | { kind: "not_a_ticket" }
  | { kind: "already_closed" }
  | { kind: "forbidden" };

export type ClaimTicketResult = { kind: "claimed" } | { kind: "not_a_ticket" } | { kind: "already_closed" } | { kind: "forbidden" };

export interface Actor {
  id: string;
  isStaff: boolean;
}

export interface TicketServiceOptions {
  guildId: string;
  owner: OwnerTarget;
  cooldownSeconds: number;
  now?: () => Date;
}

export class TicketService {
  private readonly inFlight = new Set<string>();
  private readonly lastCreated = new Map<string, number>();
  private readonly now: () => Date;

  constructor(
    private readonly repo: TicketRepository,
    private readonly gateway: TicketGateway,
    private readonly options: TicketServiceOptions,
    private readonly logger: Logger,
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async open(userId: string): Promise<OpenTicketResult> {
    if (this.inFlight.has(userId)) return { kind: "busy" };
    this.inFlight.add(userId);
    try {
      return await this.openUnlocked(userId);
    } catch (error) {
      this.logger.error({ err: error, userId }, "ouverture de ticket impossible");
      return { kind: "error" };
    } finally {
      this.inFlight.delete(userId);
    }
  }

  private async openUnlocked(userId: string): Promise<OpenTicketResult> {
    const { guildId } = this.options;
    const active = this.repo.findActiveForMember(guildId, userId);
    if (active) {
      if (active.status === "opening" || !active.threadId) return { kind: "busy" };
      const state = await this.gateway.threadState(active.threadId);
      if (state === "missing") {
        this.repo.close(active.id, null, "thread_missing", this.now());
      } else {
        if (state === "archived") await this.gateway.reopen(active.threadId);
        return { kind: "existing", threadId: active.threadId };
      }
    }

    const last = this.lastCreated.get(userId);
    const cooldownMs = this.options.cooldownSeconds * 1000;
    if (last !== undefined && this.now().getTime() - last < cooldownMs) {
      return { kind: "cooldown", retryAfterSeconds: Math.ceil((last + cooldownMs - this.now().getTime()) / 1000) };
    }

    const missing = await this.gateway.missingPermissions();
    if (missing.length > 0) {
      this.logger.warn({ missing }, "ticket refusé : permissions manquantes sur le salon des tickets");
      return { kind: "missing_permissions", missing };
    }

    const ticket = this.repo.reserve(guildId, userId, this.now());
    if (!ticket) return { kind: "busy" };

    let threadId: string;
    try {
      threadId = await this.gateway.createPrivateThread(ticketThreadName(ticket.id));
    } catch (error) {
      this.repo.close(ticket.id, null, "creation_failed", this.now());
      throw error;
    }
    this.repo.attachThread(ticket.id, threadId, this.now());

    try {
      await this.gateway.sendInThread(threadId, buildTicketMessage(userId, this.options.owner));
      await this.gateway.addMember(threadId, userId);
    } catch (error) {
      this.repo.close(ticket.id, null, "creation_failed", this.now());
      await this.gateway.closeThread(threadId).catch(() => undefined);
      throw error;
    }

    for (const staffId of await this.gateway.staffMemberIds().catch(() => [])) {
      if (staffId === userId) continue;
      await this.gateway.addMember(threadId, staffId).catch((error: unknown) => {
        this.logger.warn({ err: error, ticketId: ticket.id, staffId }, "ajout d'un membre du support impossible");
      });
    }

    this.lastCreated.set(userId, this.now().getTime());
    this.logger.info({ ticketId: ticket.id, threadId, userId }, "ticket ouvert");
    const opened = this.repo.findById(ticket.id) ?? ticket;
    return { kind: "created", ticket: opened, threadId };
  }

  async close(threadId: string, actor: Actor, reason?: string): Promise<CloseTicketResult> {
    const ticket = this.repo.findByThread(threadId);
    if (!ticket) return { kind: "not_a_ticket" };
    if (ticket.status === "closed") return { kind: "already_closed" };
    if (ticket.authorId !== actor.id && !actor.isStaff) return { kind: "forbidden" };

    this.repo.close(ticket.id, actor.id, reason?.trim() || "closed_by_command", this.now());
    let threadArchived = true;
    try {
      await this.gateway.closeThread(threadId);
    } catch (error) {
      threadArchived = false;
      this.logger.warn({ err: error, ticketId: ticket.id }, "archivage du fil impossible");
    }
    this.logger.info({ ticketId: ticket.id, closedBy: actor.id }, "ticket fermé");
    return { kind: "closed", ticket: this.repo.findById(ticket.id) ?? ticket, threadArchived };
  }

  claim(threadId: string, actor: Actor): ClaimTicketResult {
    const ticket = this.repo.findByThread(threadId);
    if (!ticket) return { kind: "not_a_ticket" };
    if (ticket.status === "closed") return { kind: "already_closed" };
    if (!actor.isStaff) return { kind: "forbidden" };
    this.repo.assign(ticket.id, actor.id, this.now());
    return { kind: "claimed" };
  }

  /** Fil supprimé manuellement sur Discord : le ticket est marqué fermé (rien n'est supprimé en base). */
  handleThreadDeleted(threadId: string): void {
    const ticket = this.repo.findByThread(threadId);
    if (ticket && ticket.status !== "closed") {
      this.repo.close(ticket.id, null, "thread_deleted", this.now());
    }
  }

  /** Au démarrage : remet la base en cohérence avec Discord après un arrêt ou un crash. */
  async reconcile(): Promise<void> {
    for (const ticket of this.repo.listByStatus("opening")) {
      this.repo.close(ticket.id, null, "interrupted", this.now());
    }
    for (const ticket of this.repo.listByStatus("open")) {
      if (!ticket.threadId) continue;
      const state = await this.gateway.threadState(ticket.threadId).catch(() => "active" as const);
      if (state === "missing") this.repo.close(ticket.id, null, "thread_missing", this.now());
    }
  }
}
