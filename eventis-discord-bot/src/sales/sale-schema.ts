import { z } from "zod";

const httpsUrl = z.url({ protocol: /^https$/, error: "URL https attendue" });

/**
 * Contrat strict : tout champ non prévu (acheteur, vendeur, prix d'achat, marge, billets…)
 * fait rejeter l'événement. Aucune donnée privée ne peut donc transiter jusqu'à Discord.
 */
export const saleDataSchema = z
  .object({
    sale_id: z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/, "sale_id invalide"),
    livemode: z.boolean(),
    status: z.enum(["confirmed", "pending", "failed", "cancelled", "refunded"]),
    payment_status: z.enum(["succeeded", "pending", "failed", "refunded"]),
    channel: z.enum(["marketplace", "external_manual"]),
    confirmed_at: z.iso.datetime({ offset: true }),
    event: z
      .object({
        name: z.string().trim().min(1).max(200),
        starts_at: z.iso.datetime({ offset: true }),
        venue: z.string().trim().min(1).max(200),
        image_url: httpsUrl.optional(),
        url: httpsUrl.optional(),
      })
      .strict(),
    tickets: z
      .object({
        section: z.string().trim().min(1).max(100),
        row: z.string().trim().min(1).max(50).nullable().optional(),
        quantity: z.number().int().min(1).max(100),
      })
      .strict(),
    price: z
      .object({
        /** Prix de vente total de l'annonce (prix unitaire × quantité), en centimes, hors frais de service. */
        amount_minor: z.number().int().positive().max(100_000_000),
        currency: z.enum(["EUR", "GBP", "USD", "CHF"]),
      })
      .strict(),
  })
  .strict();

export type SaleData = z.output<typeof saleDataSchema>;

export type SaleRejection =
  | "sandbox_sale"
  | "sale_not_confirmed"
  | "payment_not_succeeded"
  | "external_sale"
  | "sales_feed_disabled";

/** Seule une vente réelle, payée et confirmée sur Eventis Marketplace peut être annoncée. */
export function saleRejectionReason(sale: SaleData, feedEnabled: boolean): SaleRejection | null {
  if (!sale.livemode) return "sandbox_sale";
  if (sale.channel !== "marketplace") return "external_sale";
  if (sale.payment_status !== "succeeded") return "payment_not_succeeded";
  if (sale.status !== "confirmed") return "sale_not_confirmed";
  if (!feedEnabled) return "sales_feed_disabled";
  return null;
}
