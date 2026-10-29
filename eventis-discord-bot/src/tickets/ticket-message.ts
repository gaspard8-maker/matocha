import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { BRAND_COLOR } from "../branding/brand.js";
import type { OwnerTarget } from "../config/env.js";
import type { OutboundMessage } from "../bot/outbound-message.js";

export const OPEN_TICKET_BUTTON_ID = "eventis:ticket:open";

export function ownerMention(owner: OwnerTarget): string {
  return owner.kind === "role" ? `<@&${owner.id}>` : `<@${owner.id}>`;
}

/**
 * Message envoyé dans le fil privé (capture 1) :
 * mention du membre au-dessus, puis l'embed « Ton ticket privé ». Rien d'autre.
 * Seul le membre est notifié ; la mention @Owner de l'embed est affichée sans notification.
 */
export function buildTicketMessage(memberId: string, owner: OwnerTarget): OutboundMessage {
  return {
    content: `<@${memberId}>`,
    embeds: [
      {
        title: "Ton ticket privé",
        description: `Explique ta demande ici pour échanger avec ${ownerMention(owner)}.`,
        color: BRAND_COLOR,
      },
    ],
    allowedMentions: { parse: [], users: [memberId] },
  };
}

/** Panneau du salon 🎫・ouvrir-un-ticket : un seul bouton, aucun texte. */
export function buildTicketPanelComponents(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(OPEN_TICKET_BUTTON_ID).setLabel("Ouvrir un ticket").setStyle(ButtonStyle.Secondary),
    ),
  ];
}

export function ticketThreadName(ticketId: number): string {
  return `ticket-${String(ticketId).padStart(4, "0")}`;
}
