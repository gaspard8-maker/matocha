import {
  ChannelType,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type GuildMember,
} from "discord.js";
import type { AppConfig } from "../config/env.js";
import { isTicketStaff } from "../bot/access.js";
import { missingPermissions, REQUIRED_CHANNEL_PERMISSIONS } from "../bot/permissions.js";
import { buildTicketPanelComponents } from "./ticket-message.js";
import type { OpenTicketResult, TicketService } from "./ticket-service.js";

export const ticketCommand = new SlashCommandBuilder()
  .setName("ticket")
  .setDescription("Gestion des tickets")
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((sub) =>
    sub
      .setName("close")
      .setDescription("Fermer ce ticket")
      .addStringOption((opt) => opt.setName("raison").setDescription("Raison (historique interne)").setMaxLength(200)),
  )
  .addSubcommand((sub) => sub.setName("claim").setDescription("Prendre ce ticket en charge"));

export const ticketPanelCommand = new SlashCommandBuilder()
  .setName("ticket-panel")
  .setDescription("Publier le bouton d'ouverture de ticket dans le salon des tickets")
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export function openResultReply(result: OpenTicketResult): string {
  switch (result.kind) {
    case "created":
      return `Ton ticket est ouvert : <#${result.threadId}>`;
    case "existing":
      return `Tu as déjà un ticket ouvert : <#${result.threadId}>`;
    case "cooldown":
      return `Merci de patienter ${result.retryAfterSeconds} s avant d'ouvrir un nouveau ticket.`;
    case "busy":
      return "Ton ticket est en cours de création.";
    case "missing_permissions":
      return `Impossible de créer un fil privé : permissions manquantes (${result.missing.join(", ")}). Préviens un administrateur.`;
    case "error":
      return "Le ticket n'a pas pu être créé. Réessaie dans un instant.";
  }
}

export async function handleOpenTicketButton(interaction: ButtonInteraction, service: TicketService): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const result = await service.open(interaction.user.id);
  await interaction.editReply({ content: openResultReply(result), allowedMentions: { parse: [] } });
}

export async function handleTicketCommand(
  interaction: ChatInputCommandInteraction,
  service: TicketService,
  config: AppConfig,
): Promise<void> {
  const channel = interaction.channel;
  if (!channel?.isThread()) {
    await interaction.reply({ content: "Cette commande s'utilise dans un ticket.", flags: MessageFlags.Ephemeral });
    return;
  }
  const member = (interaction.member ?? null) as GuildMember | null;
  const actor = {
    id: interaction.user.id,
    isStaff: isTicketStaff(member, interaction.memberPermissions, {
      owner: config.discord.owner,
      supportRoleId: config.discord.supportRoleId,
    }),
  };

  const sub = interaction.options.getSubcommand();
  if (sub === "claim") {
    const result = service.claim(channel.id, actor);
    const replies = {
      claimed: "Ticket pris en charge.",
      not_a_ticket: "Ce fil n'est pas un ticket.",
      already_closed: "Ce ticket est déjà fermé.",
      forbidden: "Seule l'équipe support peut prendre un ticket en charge.",
    } as const;
    await interaction.reply({ content: replies[result.kind], flags: MessageFlags.Ephemeral });
    return;
  }

  // Répondre avant l'archivage : un fil archivé n'accepte plus de réponse.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const result = await service.close(channel.id, actor, interaction.options.getString("raison") ?? undefined);
  const replies = {
    closed: "Ticket fermé.",
    not_a_ticket: "Ce fil n'est pas un ticket.",
    already_closed: "Ce ticket est déjà fermé.",
    forbidden: "Seul l'auteur du ticket ou l'équipe support peut le fermer.",
  } as const;
  let content: string = replies[result.kind];
  if (result.kind === "closed" && !result.threadArchived) {
    content += " Le fil n'a pas pu être verrouillé (permission « Gérer les fils » manquante ?).";
  }
  await interaction.editReply({ content }).catch(() => undefined);
}

export async function handleTicketPanelCommand(interaction: ChatInputCommandInteraction, config: AppConfig): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const channel = await interaction.client.channels.fetch(config.discord.ticketChannelId).catch(() => null);
  if (channel?.type !== ChannelType.GuildText) {
    await interaction.editReply("Salon des tickets introuvable : vérifie DISCORD_TICKET_CHANNEL_ID.");
    return;
  }
  const me = await channel.guild.members.fetchMe();
  const missing = missingPermissions(channel.permissionsFor(me), REQUIRED_CHANNEL_PERMISSIONS.tickets);
  if (missing.length > 0) {
    await interaction.editReply(`Permissions manquantes dans <#${channel.id}> : ${missing.join(", ")}.`);
    return;
  }
  await channel.send({ components: buildTicketPanelComponents() });
  await interaction.editReply(`Bouton publié dans <#${channel.id}>.`);
}
