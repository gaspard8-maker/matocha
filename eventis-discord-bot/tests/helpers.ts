import { openDatabase, type Database } from "../src/persistence/database.js";
import type { AppConfig } from "../src/config/env.js";
import { parseConfig } from "../src/config/env.js";
import type { MessagePublisher, OutboundMessage } from "../src/bot/outbound-message.js";
import { createLogger } from "../src/logging/logger.js";

export const IDS = {
  guild: "100000000000000001",
  client: "100000000000000002",
  ticketChannel: "100000000000000003",
  updatesChannel: "100000000000000004",
  salesChannel: "100000000000000005",
  welcomeChannel: "100000000000000006",
  ownerRole: "100000000000000007",
  supportRole: "100000000000000008",
  member: "200000000000000001",
  otherMember: "200000000000000002",
  staff: "200000000000000003",
};

export const TEST_SECRET = "test-secret-0123456789abcdef0123456789abcdef";
export const FAKE_TOKEN = "MTAwMDAwMDAwMDAwMDAwMDAy.fake-token.for-tests-only-xxxxxxxxxxxxxxxxxxxx";

export function testEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    DISCORD_BOT_TOKEN: FAKE_TOKEN,
    DISCORD_CLIENT_ID: IDS.client,
    DISCORD_GUILD_ID: IDS.guild,
    DISCORD_TICKET_CHANNEL_ID: IDS.ticketChannel,
    DISCORD_OWNER_ROLE_ID: IDS.ownerRole,
    DISCORD_SUPPORT_ROLE_ID: IDS.supportRole,
    DISCORD_UPDATES_CHANNEL_ID: IDS.updatesChannel,
    DISCORD_SALES_CHANNEL_ID: IDS.salesChannel,
    DISCORD_WELCOME_CHANNEL_ID: IDS.welcomeChannel,
    EVENTIS_WEBHOOK_SECRET: TEST_SECRET,
    ...overrides,
  };
}

export function testConfig(overrides: Record<string, string> = {}): AppConfig {
  return parseConfig(testEnv(overrides));
}

export function memoryDb(): Database {
  return openDatabase(":memory:");
}

export const silentLogger = createLogger("silent");

export class FakePublisher implements MessagePublisher {
  sent: { channelId: string; message: OutboundMessage; nonce?: string }[] = [];
  failures: Error[] = [];

  send(channelId: string, message: OutboundMessage, options?: { nonce?: string }): Promise<string> {
    const failure = this.failures.shift();
    if (failure) return Promise.reject(failure);
    this.sent.push({ channelId, message, ...(options?.nonce ? { nonce: options.nonce } : {}) });
    return Promise.resolve(`9000000000000000${String(this.sent.length).padStart(2, "0")}`);
  }
}

/** Tout le texte visible d'un message (contenu + embeds), pour vérifier l'absence de texte ajouté. */
export function visibleText(message: OutboundMessage): string {
  const parts: string[] = [];
  if (message.content) parts.push(message.content);
  for (const e of message.embeds) {
    if (e.author?.name) parts.push(e.author.name);
    if (e.title) parts.push(e.title);
    if (e.description) parts.push(e.description);
    for (const f of e.fields ?? []) parts.push(f.name, f.value);
    if (e.footer?.text) parts.push(e.footer.text);
  }
  return parts.join("\n");
}
