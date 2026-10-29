import { BRAND_COLOR, COMMUNITY_NAME } from "../branding/brand.js";
import type { OutboundMessage } from "../bot/outbound-message.js";

export const WELCOME_BANNER_FILE = "welcome.png";

/**
 * Message de bienvenue (capture 4) : mention du membre, puis l'embed contenant exactement
 * les deux lignes et la bannière. Aucun autre texte, lien, bouton ni second message.
 */
export function buildWelcomeMessage(memberId: string, banner: Buffer): OutboundMessage {
  return {
    content: `<@${memberId}>`,
    embeds: [
      {
        description: `🎉 Welcome to **${COMMUNITY_NAME}**, <@${memberId}>!\nGlad to have you here.`,
        color: BRAND_COLOR,
        image: { url: `attachment://${WELCOME_BANNER_FILE}` },
      },
    ],
    files: [{ name: WELCOME_BANNER_FILE, data: banner }],
    allowedMentions: { parse: [], users: [memberId] },
  };
}
