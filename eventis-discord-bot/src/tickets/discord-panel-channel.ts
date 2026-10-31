import { ComponentType, type Message, type TextChannel } from "discord.js";
import { OPEN_TICKET_BUTTON_ID } from "./ticket-message.js";
import type { PanelChannel, PanelMessage } from "./ticket-panel.js";

function hasOpenButton(message: Message): boolean {
  return message.components.some(
    (row) =>
      row.type === ComponentType.ActionRow &&
      row.components.some((c) => "customId" in c && c.customId === OPEN_TICKET_BUTTON_ID),
  );
}

function wrap(message: Message): PanelMessage {
  return {
    id: message.id,
    authorId: message.author.id,
    hasOpenTicketButton: hasOpenButton(message),
    edit: (payload) => message.edit({ content: null, ...payload }),
  };
}

export function discordPanelChannel(channel: TextChannel): PanelChannel {
  return {
    async fetchMessage(id) {
      const message = await channel.messages.fetch(id).catch(() => null);
      return message ? wrap(message) : null;
    },
    async recentMessages(limit) {
      const messages = await channel.messages.fetch({ limit }).catch(() => null);
      return messages ? [...messages.values()].map(wrap) : [];
    },
    async send(payload) {
      const sent = await channel.send(payload);
      return { id: sent.id };
    },
  };
}
