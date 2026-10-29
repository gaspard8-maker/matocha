import { MessageFlags, type Interaction } from "discord.js";
import type { AppConfig } from "../config/env.js";
import type { Logger } from "../logging/logger.js";
import { handleSalePreviewCommand } from "../sales/sale-interactions.js";
import {
  handleOpenTicketButton,
  handleTicketCommand,
  handleTicketPanelCommand,
} from "../tickets/ticket-interactions.js";
import { OPEN_TICKET_BUTTON_ID } from "../tickets/ticket-message.js";
import type { TicketService } from "../tickets/ticket-service.js";
import {
  handleUpdateAnnounceCommand,
  handleUpdateButton,
  handleUpdateModal,
  UPDATE_CANCEL_PREFIX,
  UPDATE_MODAL_ID,
  UPDATE_PUBLISH_PREFIX,
  type UpdateInteractionDeps,
} from "../updates/update-interactions.js";
import { handleWelcomePreviewCommand } from "../welcome/welcome-interactions.js";
import { handleBotCheckCommand } from "./commands.js";

export interface RouterDeps {
  config: AppConfig;
  logger: Logger;
  tickets: TicketService;
  updates: UpdateInteractionDeps;
  loadLogo: () => Promise<Buffer>;
}

async function dispatch(interaction: Interaction, deps: RouterDeps): Promise<void> {
  if (interaction.guildId !== deps.config.discord.guildId) return;

  if (interaction.isChatInputCommand()) {
    switch (interaction.commandName) {
      case "ticket":
        return handleTicketCommand(interaction, deps.tickets, deps.config);
      case "ticket-panel":
        return handleTicketPanelCommand(interaction, deps.config);
      case "update-announce":
        return handleUpdateAnnounceCommand(interaction);
      case "sale-preview":
        return handleSalePreviewCommand(interaction, {
          timeZone: deps.config.timezone,
          marketplaceUrl: deps.config.sales.marketplaceUrl,
          loadLogo: deps.loadLogo,
        });
      case "welcome-preview":
        return handleWelcomePreviewCommand(interaction);
      case "bot-check":
        return handleBotCheckCommand(interaction, deps.config);
    }
    return;
  }
  if (interaction.isButton()) {
    if (interaction.customId === OPEN_TICKET_BUTTON_ID) return handleOpenTicketButton(interaction, deps.tickets);
    if (interaction.customId.startsWith(UPDATE_PUBLISH_PREFIX) || interaction.customId.startsWith(UPDATE_CANCEL_PREFIX)) {
      return handleUpdateButton(interaction, deps.updates);
    }
    return;
  }
  if (interaction.isModalSubmit() && interaction.customId === UPDATE_MODAL_ID) {
    return handleUpdateModal(interaction, deps.updates);
  }
}

export async function routeInteraction(interaction: Interaction, deps: RouterDeps): Promise<void> {
  try {
    await dispatch(interaction, deps);
  } catch (error) {
    deps.logger.error({ err: error, interactionId: interaction.id }, "erreur lors d'une interaction");
    if (!interaction.isRepliable()) return;
    const content = "Une erreur est survenue. Réessaie dans un instant.";
    await (interaction.deferred || interaction.replied
      ? interaction.editReply({ content })
      : interaction.reply({ content, flags: MessageFlags.Ephemeral })
    ).catch(() => undefined);
  }
}
