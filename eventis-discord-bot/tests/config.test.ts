import { describe, expect, it } from "vitest";
import { ConfigError, parseConfig } from "../src/config/env.js";
import { inviteUrl, INVITE_PERMISSIONS } from "../src/bot/permissions.js";
import { IDS, testEnv } from "./helpers.js";

describe("configuration", () => {
  it("accepte une configuration complète et désactive les ventes par défaut", () => {
    const config = parseConfig(testEnv());
    expect(config.discord.owner).toEqual({ kind: "role", id: IDS.ownerRole });
    expect(config.sales.enabled).toBe(false);
    expect(config.webhook.port).toBe(8787);
  });

  it("refuse un identifiant Discord deviné ou mal formé", () => {
    expect(() => parseConfig(testEnv({ DISCORD_TICKET_CHANNEL_ID: "ouvrir-un-ticket" }))).toThrow(ConfigError);
  });

  it("exige exactement un Owner (rôle ou utilisateur)", () => {
    expect(() => parseConfig(testEnv({ DISCORD_OWNER_ROLE_ID: "" }))).toThrow(/exactement un/);
    expect(() => parseConfig(testEnv({ DISCORD_OWNER_USER_ID: IDS.staff }))).toThrow(/exactement un/);
    const config = parseConfig(testEnv({ DISCORD_OWNER_ROLE_ID: "", DISCORD_OWNER_USER_ID: IDS.staff }));
    expect(config.discord.owner).toEqual({ kind: "user", id: IDS.staff });
  });

  it("exige un secret webhook suffisamment long, mais permet de le laisser vide", () => {
    expect(() => parseConfig(testEnv({ EVENTIS_WEBHOOK_SECRET: "court" }))).toThrow(/32 caractères/);
    expect(parseConfig(testEnv({ EVENTIS_WEBHOOK_SECRET: "" })).webhook.secrets).toEqual([]);
  });

  it("ne révèle jamais la valeur du token dans les erreurs", () => {
    try {
      parseConfig(testEnv({ DISCORD_BOT_TOKEN: "secret-trop-court", DISCORD_GUILD_ID: "x" }));
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).not.toContain("secret-trop-court");
    }
  });

  it("génère un lien d'invitation avec les permissions nécessaires, sans Administrateur", () => {
    const url = new URL(inviteUrl(IDS.client));
    expect(url.searchParams.get("scope")).toBe("bot applications.commands");
    const perms = INVITE_PERMISSIONS.toArray();
    expect(perms).toEqual(
      expect.arrayContaining([
        "SendMessages",
        "EmbedLinks",
        "AttachFiles",
        "CreatePrivateThreads",
        "SendMessagesInThreads",
        "ManageThreads",
      ]),
    );
    expect(perms).not.toContain("Administrator");
  });
});
