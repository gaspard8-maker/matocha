import { PermissionFlagsBits, PermissionsBitField, type GuildMember } from "discord.js";
import { describe, expect, it } from "vitest";
import { isAdministrator, isTicketStaff } from "../src/bot/access.js";
import { missingPermissions, REQUIRED_CHANNEL_PERMISSIONS } from "../src/bot/permissions.js";
import { ALL_COMMANDS } from "../src/bot/commands.js";
import { IDS } from "./helpers.js";

const member = (roles: string[], id = IDS.member) =>
  ({ id, roles: { cache: new Map(roles.map((r) => [r, {}])) } }) as unknown as GuildMember;
const perms = (...flags: bigint[]) => new PermissionsBitField(flags);
const staffConfig = { owner: { kind: "role" as const, id: IDS.ownerRole }, supportRoleId: IDS.supportRole };

describe("autorisations", () => {
  it("commandes d'administration réservées aux administrateurs", () => {
    expect(isAdministrator(perms(PermissionFlagsBits.ManageMessages))).toBe(false);
    expect(isAdministrator(null)).toBe(false);
    expect(isAdministrator(perms(PermissionFlagsBits.Administrator))).toBe(true);
    const admin = ALL_COMMANDS.filter((c) => c.name !== "ticket").map((c) => c.toJSON());
    for (const command of admin) {
      expect(command.default_member_permissions).toBe(PermissionFlagsBits.Administrator.toString());
    }
  });

  it("équipe des tickets : Owner, Support ou « Gérer les fils » ; pas un simple membre", () => {
    expect(isTicketStaff(member([]), perms(), staffConfig)).toBe(false);
    expect(isTicketStaff(member([IDS.supportRole]), perms(), staffConfig)).toBe(true);
    expect(isTicketStaff(member([IDS.ownerRole]), perms(), staffConfig)).toBe(true);
    expect(isTicketStaff(member([]), perms(PermissionFlagsBits.ManageThreads), staffConfig)).toBe(true);
    expect(isTicketStaff(member([], IDS.staff), perms(), { owner: { kind: "user", id: IDS.staff }, supportRoleId: undefined })).toBe(true);
  });

  it("détecte les permissions insuffisantes du bot", () => {
    const granted = perms(PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages);
    expect(missingPermissions(granted, REQUIRED_CHANNEL_PERMISSIONS.tickets)).toEqual(
      expect.arrayContaining(["Créer des fils privés", "Envoyer des messages dans les fils", "Gérer les fils"]),
    );
    expect(missingPermissions(null, REQUIRED_CHANNEL_PERMISSIONS.sales)).toHaveLength(3);
  });
});
