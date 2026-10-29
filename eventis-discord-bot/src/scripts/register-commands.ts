/* eslint-disable no-console -- script interactif destiné à l'utilisateur */
import { REST, Routes } from "discord.js";
import { ALL_COMMANDS } from "../bot/commands.js";
import { ConfigError, parseConfig } from "../config/env.js";
import { loadDotEnv } from "../config/load-env.js";

loadDotEnv();
try {
  const config = parseConfig(process.env);
  const rest = new REST().setToken(config.discord.token);
  await rest.put(Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId), {
    body: ALL_COMMANDS.map((c) => c.toJSON()),
  });
  console.log(`✅ ${ALL_COMMANDS.length} commandes enregistrées sur le serveur : ${ALL_COMMANDS.map((c) => `/${c.name}`).join(", ")}`);
} catch (error) {
  console.error(error instanceof ConfigError ? error.message : `❌ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
