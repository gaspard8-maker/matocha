import {
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { AppConfig } from "../config/env.js";
import { salePreviewCommand } from "../sales/sale-interactions.js";
import { ticketCommand, ticketPanelCommand } from "../tickets/ticket-interactions.js";
import { updateAnnounceCommand } from "../updates/update-interactions.js";
import { welcomePreviewCommand } from "../welcome/welcome-interactions.js";
import { isAdministrator } from "./access.js";
import { checkChannels, formatChannelChecks } from "./health-check.js";

export const botCheckCommand = new SlashCommandBuilder()
  .setName("bot-check")
  .setDescription("Vérifier les salons et permissions du bot")
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export const ALL_COMMANDS = [
  ticketCommand,
  ticketPanelCommand,
  updateAnnounceCommand,
  salePreviewCommand,
  welcomePreviewCommand,
  botCheckCommand,
];

export async function handleBotCheckCommand(interaction: ChatInputCommandInteraction, config: AppConfig): Promise<void> {
  if (!isAdministrator(interaction.memberPermissions)) {
    await interaction.reply({ content: "Commande réservée aux administrateurs.", flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const checks = await checkChannels(interaction.client, config);
  await interaction.editReply(
    `${formatChannelChecks(checks)}\nAnnonces de ventes automatiques : ${config.sales.enabled ? "activées" : "désactivées"}`,
  );
}
