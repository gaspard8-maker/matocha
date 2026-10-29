import {
  ChannelType,
  ThreadAutoArchiveDuration,
  type Client,
  type TextChannel,
  type ThreadChannel,
} from "discord.js";
import type { AppConfig } from "../config/env.js";
import type { Logger } from "../logging/logger.js";
import { PermanentPublishError, type OutboundMessage } from "../bot/outbound-message.js";
import { missingPermissions, REQUIRED_CHANNEL_PERMISSIONS } from "../bot/permissions.js";
import { toDiscordPayload } from "../bot/publisher.js";

export type ThreadState = "active" | "archived" | "missing";

/** Opérations Discord nécessaires aux tickets (abstraites pour être testables). */
export interface TicketGateway {
  missingPermissions(): Promise<string[]>;
  /** Crée un fil PRIVÉ dans le salon des tickets. Ne crée jamais de salon ni de fil public. */
  createPrivateThread(name: string): Promise<string>;
  sendInThread(threadId: string, message: OutboundMessage): Promise<void>;
  addMember(threadId: string, userId: string): Promise<void>;
  staffMemberIds(): Promise<string[]>;
  threadState(threadId: string): Promise<ThreadState>;
  reopen(threadId: string): Promise<void>;
  closeThread(threadId: string): Promise<void>;
}

export class NotPrivateThreadError extends Error {
  constructor() {
    super("Discord n'a pas créé un fil privé : création annulée.");
    this.name = "NotPrivateThreadError";
  }
}

export class DiscordTicketGateway implements TicketGateway {
  constructor(
    private readonly client: Client,
    private readonly config: AppConfig,
    private readonly logger: Logger,
  ) {}

  private async ticketChannel(): Promise<TextChannel> {
    const channel = await this.client.channels.fetch(this.config.discord.ticketChannelId).catch(() => null);
    if (channel?.type !== ChannelType.GuildText) {
      throw new PermanentPublishError("Le salon des tickets est introuvable ou n'est pas un salon textuel.");
    }
    return channel;
  }

  private async thread(threadId: string): Promise<ThreadChannel | null> {
    const channel = await this.client.channels.fetch(threadId).catch(() => null);
    return channel?.isThread() ? channel : null;
  }

  private async requireThread(threadId: string): Promise<ThreadChannel> {
    const thread = await this.thread(threadId);
    if (!thread) throw new PermanentPublishError(`Fil ${threadId} introuvable.`);
    return thread;
  }

  async missingPermissions(): Promise<string[]> {
    const channel = await this.ticketChannel();
    const me = await channel.guild.members.fetchMe();
    return missingPermissions(channel.permissionsFor(me), REQUIRED_CHANNEL_PERMISSIONS.tickets);
  }

  async createPrivateThread(name: string): Promise<string> {
    const channel = await this.ticketChannel();
    const thread = await channel.threads.create({
      name,
      type: ChannelType.PrivateThread,
      invitable: false,
      autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
      reason: "Ticket EventisPro",
    });
    if (thread.type !== ChannelType.PrivateThread) {
      // Garde-fou : un fil public ne doit jamais contenir un ticket.
      await thread.delete("Fil non privé : ticket annulé").catch((error: unknown) => {
        this.logger.error({ err: error, threadId: thread.id }, "suppression du fil non privé impossible");
      });
      throw new NotPrivateThreadError();
    }
    return thread.id;
  }

  async sendInThread(threadId: string, message: OutboundMessage): Promise<void> {
    const thread = await this.requireThread(threadId);
    await thread.send(toDiscordPayload(message));
  }

  async addMember(threadId: string, userId: string): Promise<void> {
    const thread = await this.requireThread(threadId);
    await thread.members.add(userId);
  }

  async staffMemberIds(): Promise<string[]> {
    const channel = await this.ticketChannel();
    const guild = channel.guild;
    const ids = new Set<string>();
    const { owner, supportRoleId } = this.config.discord;
    if (owner.kind === "user") ids.add(owner.id);
    const roleIds = [owner.kind === "role" ? owner.id : undefined, supportRoleId].filter(
      (id): id is string => id !== undefined,
    );
    for (const roleId of roleIds) {
      const role = await guild.roles.fetch(roleId).catch(() => null);
      for (const member of role?.members.values() ?? []) {
        if (!member.user.bot) ids.add(member.id);
      }
    }
    return [...ids].slice(0, this.config.tickets.maxStaffAdded);
  }

  async threadState(threadId: string): Promise<ThreadState> {
    const thread = await this.thread(threadId);
    if (!thread) return "missing";
    return thread.archived ? "archived" : "active";
  }

  async reopen(threadId: string): Promise<void> {
    const thread = await this.requireThread(threadId);
    if (thread.archived) await thread.setArchived(false, "Ticket encore ouvert");
  }

  async closeThread(threadId: string): Promise<void> {
    const thread = await this.thread(threadId);
    if (!thread) return;
    if (thread.archived) await thread.setArchived(false);
    await thread.setLocked(true, "Ticket fermé");
    await thread.setArchived(true, "Ticket fermé");
  }
}
