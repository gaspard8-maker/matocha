import {
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { isAdministrator } from "../bot/access.js";
import { toDiscordPayload } from "../bot/publisher.js";
import { buildSaleMessage, SAMPLE_SALE } from "./sale-message.js";

export const salePreviewCommand = new SlashCommandBuilder()
  .setName("sale-preview")
  .setDescription("Prévisualiser une vente fictive (visible par toi seul, jamais publiée)")
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

/** Prévisualisation éphémère : rien n'est envoyé dans le salon public. */
export async function handleSalePreviewCommand(
  interaction: ChatInputCommandInteraction,
  options: { timeZone: string; marketplaceUrl?: string | undefined; loadLogo: () => Promise<Buffer> },
): Promise<void> {
  if (!isAdministrator(interaction.memberPermissions)) {
    await interaction.reply({ content: "Commande réservée aux administrateurs.", flags: MessageFlags.Ephemeral });
    return;
  }
  const message = buildSaleMessage(SAMPLE_SALE, {
    timeZone: options.timeZone,
    marketplaceUrl: options.marketplaceUrl,
    thumbnailAttachment: { name: "event.png", data: await options.loadLogo() },
  });
  await interaction.reply({ ...toDiscordPayload(message), flags: MessageFlags.Ephemeral });
}
