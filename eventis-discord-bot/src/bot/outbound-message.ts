import type { APIAllowedMentions, APIEmbed } from "discord.js";

export interface OutboundFile {
  name: string;
  data: Buffer;
}

/** Message Discord indépendant de discord.js : construit par les modules, envoyé par le publisher. */
export interface OutboundMessage {
  content?: string;
  embeds: APIEmbed[];
  files?: OutboundFile[];
  allowedMentions: APIAllowedMentions;
}

export interface MessagePublisher {
  /** Envoie le message dans le salon et retourne l'identifiant du message Discord. */
  send(channelId: string, message: OutboundMessage, options?: { nonce?: string }): Promise<string>;
}

/** Erreur définitive (salon introuvable, permissions manquantes…) : inutile de réessayer. */
export class PermanentPublishError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentPublishError";
  }
}
