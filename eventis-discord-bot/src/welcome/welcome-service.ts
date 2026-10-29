import type { Logger } from "../logging/logger.js";
import type { MessagePublisher } from "../bot/outbound-message.js";
import type { WelcomeRepository } from "../persistence/welcome-repository.js";
import { nonceFor } from "../bot/publisher.js";
import { buildWelcomeMessage } from "./welcome-message.js";

export interface JoiningMember {
  guildId: string;
  userId: string;
  isBot: boolean;
  joinedAt: Date | null;
  avatarUrl: string;
}

export type WelcomeResult = "sent" | "duplicate" | "skipped_bot" | "skipped_recent" | "failed";

export interface WelcomeDeps {
  repo: WelcomeRepository;
  publisher: MessagePublisher;
  channelId: string;
  rejoinCooldownHours: number;
  fetchAvatar: (url: string) => Promise<Buffer | null>;
  renderBanner: (avatar: Buffer | null) => Promise<Buffer>;
  logger: Logger;
  now?: () => Date;
}

export class WelcomeService {
  private readonly now: () => Date;

  constructor(private readonly deps: WelcomeDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async handleMemberJoin(member: JoiningMember): Promise<WelcomeResult> {
    const { repo, logger } = this.deps;
    if (member.isBot) return "skipped_bot";

    const now = this.now();
    const lastSent = repo.lastSentAt(member.guildId, member.userId);
    const joinedAt = (member.joinedAt ?? now).toISOString();
    // Un même événement d'arrivée (même date) n'est traité qu'une fois, même après un redémarrage.
    if (!repo.reserve(member.guildId, member.userId, joinedAt, now)) return "duplicate";

    if (lastSent && now.getTime() - lastSent.getTime() < this.deps.rejoinCooldownHours * 3_600_000) {
      repo.markOutcome(member.guildId, member.userId, joinedAt, "skipped", "recent_rejoin");
      return "skipped_recent";
    }

    try {
      const avatar = await this.deps.fetchAvatar(member.avatarUrl);
      if (!avatar) logger.warn({ userId: member.userId }, "avatar indisponible : bannière sans photo");
      const banner = await this.deps.renderBanner(avatar);
      const messageId = await this.deps.publisher.send(this.deps.channelId, buildWelcomeMessage(member.userId, banner), {
        nonce: nonceFor(`welcome:${member.guildId}:${member.userId}:${joinedAt}`),
      });
      repo.markSent(member.guildId, member.userId, joinedAt, messageId);
      return "sent";
    } catch (error) {
      logger.error({ err: error, userId: member.userId }, "message de bienvenue non envoyé");
      repo.markOutcome(member.guildId, member.userId, joinedAt, "failed", error instanceof Error ? error.message : "error");
      return "failed";
    }
  }
}
