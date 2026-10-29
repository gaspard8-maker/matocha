import { PermissionFlagsBits, PermissionsBitField } from "discord.js";

export type ChannelRole = "tickets" | "updates" | "sales" | "welcome";

const P = PermissionFlagsBits;

/** Permissions indispensables au bot, salon par salon. */
export const REQUIRED_CHANNEL_PERMISSIONS: Record<ChannelRole, bigint[]> = {
  tickets: [
    P.ViewChannel,
    P.SendMessages,
    P.EmbedLinks,
    P.ReadMessageHistory,
    P.CreatePrivateThreads,
    P.SendMessagesInThreads,
    P.ManageThreads,
  ],
  updates: [P.ViewChannel, P.SendMessages, P.EmbedLinks, P.AttachFiles],
  sales: [P.ViewChannel, P.SendMessages, P.EmbedLinks],
  welcome: [P.ViewChannel, P.SendMessages, P.EmbedLinks, P.AttachFiles],
};

/** Permissions à cocher lors de l'invitation du bot (union de tous les salons). */
export const INVITE_PERMISSIONS = new PermissionsBitField(
  Object.values(REQUIRED_CHANNEL_PERMISSIONS).flat(),
);

const FRENCH_NAMES: Record<string, string> = {
  ViewChannel: "Voir le salon",
  SendMessages: "Envoyer des messages",
  EmbedLinks: "Intégrer des liens",
  AttachFiles: "Joindre des fichiers",
  ReadMessageHistory: "Voir les anciens messages",
  CreatePrivateThreads: "Créer des fils privés",
  SendMessagesInThreads: "Envoyer des messages dans les fils",
  ManageThreads: "Gérer les fils",
};

export function permissionLabel(flag: bigint): string {
  const name = new PermissionsBitField(flag).toArray()[0] ?? flag.toString();
  return FRENCH_NAMES[name] ?? name;
}

/** Retourne la liste (en français) des permissions manquantes. */
export function missingPermissions(granted: PermissionsBitField | null, required: bigint[]): string[] {
  if (!granted) return required.map(permissionLabel);
  return required.filter((flag) => !granted.has(flag, true)).map(permissionLabel);
}

export function inviteUrl(clientId: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    scope: "bot applications.commands",
    permissions: INVITE_PERMISSIONS.bitfield.toString(),
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}
