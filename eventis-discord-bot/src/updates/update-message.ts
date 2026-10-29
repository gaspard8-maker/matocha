import { BRAND_COLOR } from "../branding/brand.js";
import type { OutboundMessage } from "../bot/outbound-message.js";
import { RELEASE_SECTIONS, type ReleaseData } from "./release-schema.js";

export const UPDATE_LOGO_FILE = "eventispro.png";

/**
 * Description de l'embed (capture 2) :
 * titre de section, puces « • », une ligne vide entre les sections.
 */
export function renderUpdateDescription(changes: ReleaseData["changes"]): string {
  return RELEASE_SECTIONS.flatMap(({ category, heading }) => {
    const items = changes.filter((c) => c.category === category);
    if (items.length === 0) return [];
    return [[heading, ...items.map((c) => `• ${c.description}`)].join("\n")];
  }).join("\n\n");
}

/** Annonce de mise à jour : un seul embed, sans mention, lien, bouton ni texte additionnel. */
export function buildUpdateMessage(release: Pick<ReleaseData, "version" | "changes">, logo: Buffer | null): OutboundMessage {
  return {
    embeds: [
      {
        title: `UPDATE ${release.version}`,
        description: renderUpdateDescription(release.changes),
        color: BRAND_COLOR,
        ...(logo ? { thumbnail: { url: `attachment://${UPDATE_LOGO_FILE}` } } : {}),
      },
    ],
    ...(logo ? { files: [{ name: UPDATE_LOGO_FILE, data: logo }] } : {}),
    allowedMentions: { parse: [] },
  };
}
