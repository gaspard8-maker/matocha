import { describe, expect, it } from "vitest";
import { SaleHandler } from "../src/sales/sale-handler.js";
import { buildSaleMessage, formatPrice } from "../src/sales/sale-message.js";
import { saleDataSchema, type SaleData } from "../src/sales/sale-schema.js";
import { sampleSale } from "./fixtures.js";
import { IDS, visibleText } from "./helpers.js";


const handler = new SaleHandler({ channelId: IDS.salesChannel, enabled: true, timeZone: "Europe/Paris" });

describe("embed de vente (capture 3)", () => {
  it("reproduit la disposition en colonnes et n'affiche que le prix de vente", () => {
    const message = buildSaleMessage(handler.parse(sampleSale()), { timeZone: "Europe/Paris" });
    expect(message.content).toBeUndefined();
    const embed = message.embeds[0];
    expect(embed?.title).toBe("New Sale On Eventis");
    expect(embed?.url).toBe("https://eventis.example/events/123");
    expect(embed?.color).toBe(0x10b981);
    expect(embed?.fields).toEqual([
      { name: "Event", value: "Celine Dion Nanterre", inline: true },
      { name: "Start Date", value: "08/05/2027", inline: true },
      { name: "Venue", value: "Paris La Defense Arena", inline: true },
      { name: "Section", value: "105", inline: true },
      { name: "Row", value: "23", inline: true },
      { name: "Quantity", value: "2 tickets", inline: true },
      { name: "Sale Price", value: "1100.00€", inline: true },
    ]);
    expect(embed?.thumbnail?.url).toBe("https://cdn.eventis.example/events/123.jpg");
    expect(embed?.footer).toEqual({ text: "Eventis" });
    expect(embed?.timestamp).toBe("2026-10-29T12:36:00.000Z");
  });

  it("ne contient aucune donnée financière privée", () => {
    const text = visibleText(buildSaleMessage(handler.parse(sampleSale()), { timeZone: "Europe/Paris" }));
    for (const word of ["Payout", "Face Value", "Profit", "ROI", "Marge", "Cost", "Buyer", "Seller"]) {
      expect(text).not.toContain(word);
    }
  });

  it("rejette toute donnée privée envoyée par erreur (contrat strict)", () => {
    expect(() => handler.parse(sampleSale({ buyer_email: "a@b.c" }))).toThrow();
    expect(() => handler.parse(sampleSale({ seller_id: "u1" }))).toThrow();
    expect(() => handler.parse(sampleSale({ tickets: { section: "1", quantity: 1, barcode: "X" } }))).toThrow();
    expect(() => handler.parse(sampleSale({ price: { amount_minor: 1, currency: "EUR", face_value_minor: 1 } }))).toThrow();
    expect(() => handler.parse(sampleSale({ event: { name: "a", starts_at: "2027-01-01T00:00:00Z", venue: "b", image_url: "http://x.y/z.png" } }))).toThrow();
  });

  it("gère l'absence de rang, d'image et d'URL, et le singulier", () => {
    const sale = handler.parse(sampleSale({
      event: { name: "A", starts_at: "2027-01-01T19:00:00Z", venue: "B" },
      tickets: { section: "Fosse", row: null, quantity: 1 },
    }));
    const embed = buildSaleMessage(sale, { timeZone: "Europe/Paris" }).embeds[0];
    expect(embed?.fields?.[4]?.value).toBe("—");
    expect(embed?.fields?.[5]?.value).toBe("1 ticket");
    expect(embed?.thumbnail).toBeUndefined();
    expect(embed?.url).toBeUndefined();
  });

  it("neutralise la mise en forme Discord dans les noms", () => {
    const sale = handler.parse(sampleSale({ event: { name: "**Gros** _show_", starts_at: "2027-01-01T19:00:00Z", venue: "B" } }));
    expect(buildSaleMessage(sale, { timeZone: "Europe/Paris" }).embeds[0]?.fields?.[0]?.value).toBe("\\*\\*Gros\\*\\* \\_show\\_");
  });

  it("formate les devises", () => {
    expect(formatPrice(49000, "EUR")).toBe("490.00€");
    expect(formatPrice(1999, "GBP")).toBe("£19.99");
  });
});

describe("éligibilité des ventes", () => {
  const parse = (o: Record<string, unknown>): SaleData => saleDataSchema.parse(sampleSale(o));

  it("accepte uniquement une vente réelle confirmée et payée", () => {
    expect(handler.rejectionReason(parse({}))).toBeNull();
    expect(handler.dedupeKey(parse({}))).toBe("sale:sale_123");
  });

  it("rejette sandbox, paiements en attente/échoués, ventes non confirmées et externes", () => {
    expect(handler.rejectionReason(parse({ livemode: false }))).toBe("sandbox_sale");
    expect(handler.rejectionReason(parse({ payment_status: "pending" }))).toBe("payment_not_succeeded");
    expect(handler.rejectionReason(parse({ payment_status: "failed" }))).toBe("payment_not_succeeded");
    expect(handler.rejectionReason(parse({ status: "pending" }))).toBe("sale_not_confirmed");
    expect(handler.rejectionReason(parse({ channel: "external_manual" }))).toBe("external_sale");
  });

  it("ne publie rien tant que la fonction est désactivée", async () => {
    const disabled = new SaleHandler({ channelId: IDS.salesChannel, enabled: false, timeZone: "Europe/Paris" });
    expect(disabled.rejectionReason(parse({}))).toBe("sales_feed_disabled");
    expect(await disabled.prepare(parse({}))).toEqual({ ignore: "sales_feed_disabled" });
  });
});
