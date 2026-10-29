import { randomUUID } from "node:crypto";
import { Events } from "discord.js";
import { ConfigError, parseConfig, type AppConfig } from "./config/env.js";
import { loadDotEnv } from "./config/load-env.js";
import { createLogger } from "./logging/logger.js";
import { logoPng } from "./branding/logo.js";
import { createDiscordClient } from "./bot/client.js";
import { checkChannels } from "./bot/health-check.js";
import { routeInteraction } from "./bot/interaction-router.js";
import { DiscordPublisher } from "./bot/publisher.js";
import { openDatabase } from "./persistence/database.js";
import { EventRepository } from "./persistence/event-repository.js";
import { TicketRepository } from "./persistence/ticket-repository.js";
import { WelcomeRepository } from "./persistence/welcome-repository.js";
import { EventProcessor } from "./integration/event-processor.js";
import type { EventHandler } from "./integration/handler.js";
import { createWebhookServer } from "./integration/webhook-server.js";
import { RateLimiter } from "./security/rate-limiter.js";
import { SaleHandler } from "./sales/sale-handler.js";
import { DiscordTicketGateway } from "./tickets/ticket-gateway.js";
import { TicketService } from "./tickets/ticket-service.js";
import { RELEASE_EVENT_TYPE, ReleaseHandler } from "./updates/release-handler.js";
import { UpdateDrafts } from "./updates/update-interactions.js";
import { fetchAvatar, renderWelcomeBanner } from "./welcome/banner.js";
import { WelcomeService } from "./welcome/welcome-service.js";

loadDotEnv();

let config: AppConfig;
try {
  config = parseConfig(process.env);
} catch (error) {
  if (error instanceof ConfigError) {
    process.stderr.write(`${error.message}\nLance « npm run check-config » pour plus de détails.\n`);
    process.exit(1);
  }
  throw error;
}

const logger = createLogger(config.logLevel);
const db = openDatabase(config.databasePath);
const eventsRepo = new EventRepository(db);
const client = createDiscordClient();
const publisher = new DiscordPublisher(client);
const loadLogo = () => logoPng(256);

const processor = new EventProcessor(
  eventsRepo,
  [
    new ReleaseHandler({ channelId: config.discord.updatesChannelId, showLogo: config.updates.showLogo }, eventsRepo, loadLogo),
    new SaleHandler({
      channelId: config.discord.salesChannelId,
      enabled: config.sales.enabled,
      timeZone: config.timezone,
      marketplaceUrl: config.sales.marketplaceUrl,
    }),
  ] as EventHandler<unknown>[],
  publisher,
  logger,
);

const tickets = new TicketService(
  new TicketRepository(db),
  new DiscordTicketGateway(client, config, logger),
  { guildId: config.discord.guildId, owner: config.discord.owner, cooldownSeconds: config.tickets.cooldownSeconds },
  logger,
);

const welcome = new WelcomeService({
  repo: new WelcomeRepository(db),
  publisher,
  channelId: config.discord.welcomeChannelId,
  rejoinCooldownHours: config.welcome.rejoinCooldownHours,
  fetchAvatar: (url) => fetchAvatar(url),
  renderBanner: renderWelcomeBanner,
  logger,
});

const updateDeps = {
  drafts: new UpdateDrafts(),
  showLogo: config.updates.showLogo,
  loadLogo,
  updatesChannelId: config.discord.updatesChannelId,
  publishRelease: (release: unknown) => processor.publishNow(`manual-${randomUUID()}`, RELEASE_EVENT_TYPE, release),
};

client.once(Events.ClientReady, (ready) => {
  void (async () => {
    logger.info({ user: ready.user.tag }, "connecté à Discord");
    try {
      const guild = await client.guilds.fetch(config.discord.guildId);
      await guild.members.fetch(); // rôles Support/Owner à jour
      for (const check of await checkChannels(client, config)) {
        if (!check.ok) logger.warn({ salon: check.role, problemes: check.problems }, "configuration Discord incomplète");
      }
      await tickets.reconcile();
    } catch (error) {
      logger.error({ err: error }, "vérifications de démarrage incomplètes");
    }
    processor.start();
  })();
});

client.on(Events.InteractionCreate, (interaction) => {
  void routeInteraction(interaction, { config, logger, tickets, updates: updateDeps, loadLogo });
});

client.on(Events.GuildMemberAdd, (member) => {
  if (member.guild.id !== config.discord.guildId) return;
  void welcome.handleMemberJoin({
    guildId: member.guild.id,
    userId: member.id,
    isBot: member.user.bot,
    joinedAt: member.joinedAt,
    avatarUrl: member.displayAvatarURL({ extension: "png", size: 256, forceStatic: true }),
  });
});

client.on(Events.ThreadDelete, (thread) => {
  if (thread.parentId === config.discord.ticketChannelId) tickets.handleThreadDeleted(thread.id);
});

client.on(Events.Error, (error) => {
  logger.error({ err: error }, "erreur du client Discord");
});

const server = createWebhookServer({
  processor,
  secrets: config.webhook.secrets,
  toleranceSeconds: config.webhook.toleranceSeconds,
  rateLimiter: new RateLimiter(config.webhook.rateLimitPerMinute),
  trustProxy: config.webhook.trustProxy,
  logger,
});
server.listen(config.webhook.port, config.webhook.host, () => {
  logger.info({ host: config.webhook.host, port: config.webhook.port }, "API d'intégration Eventis à l'écoute");
});

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, "arrêt en cours");
  processor.stop();
  server.close();
  await client.destroy();
  db.close();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("unhandledRejection", (error) => {
  logger.error({ err: error }, "promesse rejetée non gérée");
});

client.login(config.discord.token).catch((error: unknown) => {
  logger.fatal({ err: error }, "connexion à Discord impossible (token ou intents)");
  process.exit(1);
});
