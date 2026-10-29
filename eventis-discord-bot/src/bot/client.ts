import { Client, GatewayIntentBits, Options } from "discord.js";

/**
 * Intents nécessaires :
 * - Guilds : salons, fils, commandes.
 * - GuildMembers (privilégié) : arrivée des membres (bienvenue) et membres des rôles Support/Owner.
 * Aucun accès au contenu des messages n'est demandé.
 */
export function createDiscordClient(): Client {
  return new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    makeCache: Options.cacheWithLimits({
      ...Options.DefaultMakeCacheSettings,
      MessageManager: 50,
    }),
  });
}
