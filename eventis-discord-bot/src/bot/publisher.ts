import { createHash } from "node:crypto";
import { AttachmentBuilder, DiscordAPIError, type Client } from "discord.js";
import { PermanentPublishError, type MessagePublisher, type OutboundMessage } from "./outbound-message.js";

/** Codes d'erreur Discord pour lesquels réessayer ne servirait à rien. */
const PERMANENT_DISCORD_CODES = new Set([
  10003, // Unknown Channel
  50001, // Missing Access
  50013, // Missing Permissions
  50035, // Invalid Form Body
  50006, // Cannot send an empty message
]);

export function isPermanentDiscordError(error: unknown): boolean {
  return (
    error instanceof PermanentPublishError ||
    (error instanceof DiscordAPIError && typeof error.code === "number" && PERMANENT_DISCORD_CODES.has(error.code))
  );
}

/** Nonce Discord (25 caractères max) dérivé d'une clé : empêche un double envoi pendant quelques minutes. */
export function nonceFor(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 25);
}

export function toDiscordPayload(message: OutboundMessage, nonce?: string) {
  return {
    ...(message.content !== undefined ? { content: message.content } : {}),
    embeds: message.embeds,
    files: (message.files ?? []).map((f) => new AttachmentBuilder(f.data, { name: f.name })),
    allowedMentions: message.allowedMentions,
    ...(nonce ? { nonce, enforceNonce: true } : {}),
  };
}

export class DiscordPublisher implements MessagePublisher {
  constructor(private readonly client: Client) {}

  async send(channelId: string, message: OutboundMessage, options?: { nonce?: string }): Promise<string> {
    const channel = await this.client.channels.fetch(channelId).catch((error: unknown) => {
      if (isPermanentDiscordError(error)) throw new PermanentPublishError(`Salon ${channelId} inaccessible.`);
      throw error;
    });
    if (!channel?.isSendable()) {
      throw new PermanentPublishError(`Le salon ${channelId} n'accepte pas de messages du bot.`);
    }
    const sent = await channel.send(toDiscordPayload(message, options?.nonce));
    return sent.id;
  }
}
