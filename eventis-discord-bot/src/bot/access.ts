import { PermissionFlagsBits, type GuildMember, type PermissionsBitField } from "discord.js";
import type { OwnerTarget } from "../config/env.js";

export interface StaffConfig {
  owner: OwnerTarget;
  supportRoleId: string | undefined;
}

export function isAdministrator(permissions: Readonly<PermissionsBitField> | null): boolean {
  return permissions?.has(PermissionFlagsBits.Administrator) ?? false;
}

/** Équipe autorisée à gérer les tickets : Owner, rôle Support ou permission native « Gérer les fils ». */
export function isTicketStaff(member: GuildMember | null, permissions: Readonly<PermissionsBitField> | null, config: StaffConfig): boolean {
  if (permissions?.has(PermissionFlagsBits.ManageThreads)) return true;
  if (!member) return false;
  if (config.owner.kind === "user" && member.id === config.owner.id) return true;
  if (config.owner.kind === "role" && member.roles.cache.has(config.owner.id)) return true;
  if (config.supportRoleId && member.roles.cache.has(config.supportRoleId)) return true;
  return false;
}
