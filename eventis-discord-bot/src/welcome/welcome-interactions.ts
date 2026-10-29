import {
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { isAdministrator } from "../bot/access.js";
import { toDiscordPayload } from "../bot/publisher.js";
import { fetchAvatar, renderWelcomeBanner } from "./banner.js";
import { buildWelcomeMessage } from "./welcome-message.js";

export const welcomePreviewCommand = new SlashCommandBuilder()
  .setName("welcome-preview")
  .setDescription("Prévisualiser le message de bienvenue avec ton avatar (visible par toi seul)")
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function handleWelcomePreviewCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!isAdministrator(interaction.memberPermissions)) {
    await interaction.reply({ content: "Commande réservée aux administrateurs.", flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const avatar = await fetchAvatar(interaction.user.displayAvatarURL({ extension: "png", size: 256, forceStatic: true }));
  const message = buildWelcomeMessage(interaction.user.id, await renderWelcomeBanner(avatar));
  await interaction.editReply({ ...toDiscordPayload(message), allowedMentions: { parse: [] } });
}
