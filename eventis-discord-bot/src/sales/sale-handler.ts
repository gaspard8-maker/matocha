import type { EventHandler, PreparedPublication } from "../integration/handler.js";
import { saleDataSchema, saleRejectionReason, type SaleData } from "./sale-schema.js";
import { buildSaleMessage } from "./sale-message.js";

export const SALE_EVENT_TYPE = "marketplace.sale.confirmed";

export interface SaleHandlerOptions {
  channelId: string;
  enabled: boolean;
  timeZone: string;
  marketplaceUrl?: string | undefined;
}

export class SaleHandler implements EventHandler<SaleData> {
  readonly type = SALE_EVENT_TYPE;

  constructor(private readonly options: SaleHandlerOptions) {}

  parse(data: unknown): SaleData {
    return saleDataSchema.parse(data);
  }

  dedupeKey(sale: SaleData): string {
    return `sale:${sale.sale_id}`;
  }

  rejectionReason(sale: SaleData): string | null {
    return saleRejectionReason(sale, this.options.enabled);
  }

  prepare(sale: SaleData): Promise<PreparedPublication> {
    // Revérifié au moment de l'envoi : la fonction peut avoir été désactivée entre-temps.
    const reason = this.rejectionReason(sale);
    if (reason) return Promise.resolve({ ignore: reason });
    return Promise.resolve({
      channelId: this.options.channelId,
      message: buildSaleMessage(sale, { timeZone: this.options.timeZone, marketplaceUrl: this.options.marketplaceUrl }),
    });
  }
}
