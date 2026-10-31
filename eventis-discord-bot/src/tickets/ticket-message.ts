import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type APIEmbed } from "discord.js";
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

/** Panneau du salon 🎫・ouvrir-un-ticket (modèle fourni) : un embed et le bouton « Ouvrir un ticket ». */
export function buildTicketPanel(owner: OwnerTarget): {
  embeds: APIEmbed[];
  components: ActionRowBuilder<ButtonBuilder>[];
  allowedMentions: { parse: [] };
} {
  return {
    embeds: [
      {
        title: "Ouvrir un ticket privé",
        description:
          `Une question ou besoin d’aide ? Ouvre un ticket pour échanger avec ${ownerMention(owner)}. ` +
          "Si tu as déjà un ticket ouvert, tu y seras redirigé. " +
          "Les paniers que tu réserves seront ajoutés à ce même ticket.",
        color: BRAND_COLOR,
      },
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(OPEN_TICKET_BUTTON_ID).setLabel("Ouvrir un ticket").setStyle(ButtonStyle.Primary),
      ),
    ],
    allowedMentions: { parse: [] },
  };
}

export interface TicketOwnerNames {
  displayName: string;
  username: string;
}

/** Nom du fil : « pseudo · @compte » (100 caractères max, limite Discord). */
export function ticketThreadName(names: TicketOwnerNames | undefined, ticketId: number): string {
  const clean = (v: string) => v.replace(/\s+/g, " ").trim();
  const username = clean(names?.username ?? "");
  if (!username) return `ticket-${String(ticketId).padStart(4, "0")}`;
  const displayName = clean(names?.displayName ?? "") || username;
  return `${displayName} · @${username}`.slice(0, 100);
}
