import type { Logger } from "../logging/logger.js";
import type { OwnerTarget } from "../config/env.js";
import type { StateRepository } from "../persistence/state-repository.js";
import { buildTicketPanel, OPEN_TICKET_BUTTON_ID } from "./ticket-message.js";

export const PANEL_STATE_KEY = "ticket_panel_message_id";

type PanelPayload = ReturnType<typeof buildTicketPanel>;

/** Sous-ensemble d'un message Discord utile au panneau (testable sans Discord). */
export interface PanelMessage {
  id: string;
  authorId: string;
  hasOpenTicketButton: boolean;
  edit(payload: PanelPayload): Promise<unknown>;
}

export interface PanelChannel {
  fetchMessage(id: string): Promise<PanelMessage | null>;
  recentMessages(limit: number): Promise<PanelMessage[]>;
  send(payload: PanelPayload): Promise<{ id: string }>;
}

export type PanelResult = "created" | "updated";

/**
 * Garantit la présence du panneau dans le salon des tickets :
 * met à jour le panneau existant (aucun doublon), sinon le publie.
 */
export async function ensureTicketPanel(
  channel: PanelChannel,
  botUserId: string,
  owner: OwnerTarget,
  state: StateRepository,
  logger: Logger,
  options: { forceNew?: boolean } = {},
): Promise<PanelResult> {
  const payload = buildTicketPanel(owner);

  if (!options.forceNew) {
    const storedId = state.get(PANEL_STATE_KEY);
    let existing = storedId ? await channel.fetchMessage(storedId) : null;
    // Base perdue ou panneau publié avant cette version : on retrouve le message du bot.
    existing ??= (await channel.recentMessages(50)).find((m) => m.authorId === botUserId && m.hasOpenTicketButton) ?? null;
    if (existing) {
      await existing.edit(payload);
      state.set(PANEL_STATE_KEY, existing.id);
      logger.info({ messageId: existing.id }, "panneau de tickets à jour");
      return "updated";
    }
  }

  const sent = await channel.send(payload);
  state.set(PANEL_STATE_KEY, sent.id);
  logger.info({ messageId: sent.id }, "panneau de tickets publié");
  return "created";
}

export { OPEN_TICKET_BUTTON_ID };
