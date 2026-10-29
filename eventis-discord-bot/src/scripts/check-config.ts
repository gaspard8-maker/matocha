/* eslint-disable no-console -- script interactif destiné à l'utilisateur */
import { Events } from "discord.js";
import { ConfigError, parseConfig } from "../config/env.js";
import { loadDotEnv } from "../config/load-env.js";
import { createDiscordClient } from "../bot/client.js";
import { checkChannels, formatChannelChecks } from "../bot/health-check.js";
import { inviteUrl } from "../bot/permissions.js";

loadDotEnv();

let config;
try {
  config = parseConfig(process.env);
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(error.message);
    console.error("\nCorrige le fichier .env puis relance : npm run check-config");
    process.exit(1);
  }
  throw error;
}

console.log("✅ Fichier .env valide.");
console.log(`   Annonces de ventes automatiques : ${config.sales.enabled ? "ACTIVÉES" : "désactivées"}`);
console.log(`\nLien d'invitation du bot (avec les permissions nécessaires) :\n${inviteUrl(config.discord.clientId)}\n`);

if (!process.argv.includes("--discord")) {
  console.log("Pour vérifier aussi la connexion et les permissions sur le serveur : npm run check-config -- --discord");
  process.exit(0);
}

const client = createDiscordClient();
client.once(Events.ClientReady, (ready) => {
  void (async () => {
  try {
    console.log(`✅ Connecté en tant que ${ready.user.tag}.`);
    const checks = await checkChannels(client, config);
    console.log(formatChannelChecks(checks));
    process.exitCode = checks.every((c) => c.ok) ? 0 : 1;
  } catch (error) {
    console.error("❌ Vérification impossible :", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await client.destroy();
  }
  })();
});
client.login(config.discord.token).catch((error: unknown) => {
  console.error("❌ Connexion à Discord impossible :", error instanceof Error ? error.message : error);
  console.error("   Vérifie DISCORD_BOT_TOKEN et l'intent « Server Members » dans le portail développeur.");
  process.exit(1);
});
