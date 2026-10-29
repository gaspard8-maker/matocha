import { ChannelType, type Client } from "discord.js";
import type { AppConfig } from "../config/env.js";
import { missingPermissions, REQUIRED_CHANNEL_PERMISSIONS, type ChannelRole } from "./permissions.js";

export interface ChannelCheck {
  role: ChannelRole;
  channelId: string;
  channelName: string | null;
  ok: boolean;
  problems: string[];
}

const ROLE_LABELS: Record<ChannelRole, string> = {
  tickets: "Tickets",
  updates: "Updates",
  sales: "Sales-feed",
  welcome: "Bienvenue",
};

/** Vérifie l'accès du bot aux salons configurés et ses permissions, sans rien modifier. */
export async function checkChannels(client: Client, config: AppConfig): Promise<ChannelCheck[]> {
  const guild = await client.guilds.fetch(config.discord.guildId);
  const me = await guild.members.fetchMe();
  const targets: [ChannelRole, string][] = [
    ["tickets", config.discord.ticketChannelId],
    ["updates", config.discord.updatesChannelId],
    ["sales", config.discord.salesChannelId],
    ["welcome", config.discord.welcomeChannelId],
  ];

  const results: ChannelCheck[] = [];
  for (const [role, channelId] of targets) {
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      results.push({ role, channelId, channelName: null, ok: false, problems: ["Salon introuvable sur le serveur."] });
      continue;
    }
    const problems = missingPermissions(channel.permissionsFor(me), REQUIRED_CHANNEL_PERMISSIONS[role]).map(
      (p) => `Permission manquante : ${p}`,
    );
    if (role === "tickets" && channel.type !== ChannelType.GuildText) {
      problems.push("Le salon des tickets doit être un salon textuel (les fils privés n'existent que là).");
    }
    if (role !== "tickets" && !channel.isTextBased()) {
      problems.push("Le salon doit être textuel.");
    }
    results.push({ role, channelId, channelName: channel.name, ok: problems.length === 0, problems });
  }

  if (config.discord.owner.kind === "role" && !(await guild.roles.fetch(config.discord.owner.id).catch(() => null))) {
    results.push({ role: "tickets", channelId: "-", channelName: "Rôle Owner", ok: false, problems: ["Rôle Owner introuvable."] });
  }
  if (config.discord.supportRoleId && !(await guild.roles.fetch(config.discord.supportRoleId).catch(() => null))) {
    results.push({ role: "tickets", channelId: "-", channelName: "Rôle Support", ok: false, problems: ["Rôle Support introuvable."] });
  }
  return results;
}

export function formatChannelChecks(checks: ChannelCheck[]): string {
  return checks
    .map((c) => {
      const head = `${c.ok ? "✅" : "❌"} ${ROLE_LABELS[c.role]} — ${c.channelName ? `#${c.channelName}` : c.channelId}`;
      return c.ok ? head : [head, ...c.problems.map((p) => `   • ${p}`)].join("\n");
    })
    .join("\n");
}
