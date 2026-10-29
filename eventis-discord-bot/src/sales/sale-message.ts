import { escapeMarkdown } from "discord.js";
import { BRAND_COLOR, MARKETPLACE_NAME } from "../branding/brand.js";
import type { OutboundMessage } from "../bot/outbound-message.js";
import type { SaleData } from "./sale-schema.js";

export function formatPrice(amountMinor: number, currency: SaleData["price"]["currency"]): string {
  const amount = (amountMinor / 100).toFixed(2);
  switch (currency) {
    case "EUR":
      return `${amount}€`;
    case "GBP":
      return `£${amount}`;
    case "USD":
      return `$${amount}`;
    case "CHF":
      return `${amount} CHF`;
  }
}

export function formatStartDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone, day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(iso),
  );
}

function text(value: string, max = 1024): string {
  const escaped = escapeMarkdown(value);
  return escaped.length > max ? `${escaped.slice(0, max - 1)}…` : escaped;
}

export interface SaleMessageOptions {
  timeZone: string;
  marketplaceUrl?: string | undefined;
  /** Miniature fournie en pièce jointe (prévisualisation uniquement). */
  thumbnailAttachment?: { name: string; data: Buffer };
}

/**
 * Embed « New Sale On Eventis » (capture 3) : colonnes Event | Start Date | Venue,
 * Section | Row | Quantity, puis Sale Price. Aucune donnée financière privée ni personnelle.
 */
export function buildSaleMessage(sale: SaleData, options: SaleMessageOptions): OutboundMessage {
  const url = sale.event.url ?? options.marketplaceUrl;
  const thumbnail = options.thumbnailAttachment
    ? `attachment://${options.thumbnailAttachment.name}`
    : sale.event.image_url;
  const quantity = sale.tickets.quantity;
  return {
    embeds: [
      {
        title: `New Sale On ${MARKETPLACE_NAME}`,
        ...(url ? { url } : {}),
        color: BRAND_COLOR,
        fields: [
          { name: "Event", value: text(sale.event.name), inline: true },
          { name: "Start Date", value: formatStartDate(sale.event.starts_at, options.timeZone), inline: true },
          { name: "Venue", value: text(sale.event.venue), inline: true },
          { name: "Section", value: text(sale.tickets.section), inline: true },
          { name: "Row", value: sale.tickets.row ? text(sale.tickets.row) : "—", inline: true },
          { name: "Quantity", value: `${quantity} ${quantity > 1 ? "tickets" : "ticket"}`, inline: true },
          { name: "Sale Price", value: formatPrice(sale.price.amount_minor, sale.price.currency), inline: true },
        ],
        ...(thumbnail ? { thumbnail: { url: thumbnail } } : {}),
        footer: { text: MARKETPLACE_NAME },
        timestamp: new Date(sale.confirmed_at).toISOString(),
      },
    ],
    ...(options.thumbnailAttachment ? { files: [options.thumbnailAttachment] } : {}),
    allowedMentions: { parse: [] },
  };
}

/** Données fictives, utilisées uniquement pour les prévisualisations administrateur (jamais publiées). */
export const SAMPLE_SALE: SaleData = {
  sale_id: "preview",
  livemode: false,
  status: "confirmed",
  payment_status: "succeeded",
  channel: "marketplace",
  confirmed_at: "2026-10-29T13:36:00+01:00",
  event: { name: "Concert Exemple", starts_at: "2027-05-08T20:00:00+02:00", venue: "Paris La Défense Arena" },
  tickets: { section: "105", row: "23", quantity: 2 },
  price: { amount_minor: 110000, currency: "EUR" },
};
