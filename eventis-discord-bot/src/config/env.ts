import { z } from "zod";

const snowflake = (label: string) =>
  z
    .string({ error: `${label} est manquant.` })
    .trim()
    .regex(/^\d{17,20}$/, `${label} doit être un identifiant Discord (17 à 20 chiffres).`);

const optionalSnowflake = (label: string) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), snowflake(label).optional());

const booleanFlag = (defaultValue: boolean) =>
  z
    .enum(["true", "false"], { error: "doit valoir true ou false." })
    .default(defaultValue ? "true" : "false")
    .transform((v) => v === "true");

const optionalHttpsUrl = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z
    .url({ protocol: /^https$/, error: "doit être une URL https." })
    .optional(),
);

export const envSchema = z
  .object({
    DISCORD_BOT_TOKEN: z
      .string({ error: "DISCORD_BOT_TOKEN est manquant." })
      .trim()
      .min(50, "DISCORD_BOT_TOKEN semble invalide."),
    DISCORD_CLIENT_ID: snowflake("DISCORD_CLIENT_ID"),
    DISCORD_GUILD_ID: snowflake("DISCORD_GUILD_ID"),
    DISCORD_TICKET_CHANNEL_ID: snowflake("DISCORD_TICKET_CHANNEL_ID"),
    DISCORD_OWNER_ROLE_ID: optionalSnowflake("DISCORD_OWNER_ROLE_ID"),
    DISCORD_OWNER_USER_ID: optionalSnowflake("DISCORD_OWNER_USER_ID"),
    DISCORD_SUPPORT_ROLE_ID: optionalSnowflake("DISCORD_SUPPORT_ROLE_ID"),
    DISCORD_UPDATES_CHANNEL_ID: snowflake("DISCORD_UPDATES_CHANNEL_ID"),
    DISCORD_SALES_CHANNEL_ID: snowflake("DISCORD_SALES_CHANNEL_ID"),
    DISCORD_WELCOME_CHANNEL_ID: snowflake("DISCORD_WELCOME_CHANNEL_ID"),

    EVENTIS_WEBHOOK_SECRET: z
      .string({ error: "EVENTIS_WEBHOOK_SECRET est manquant." })
      .min(32, "EVENTIS_WEBHOOK_SECRET doit contenir au moins 32 caractères."),
    EVENTIS_WEBHOOK_SECRET_PREVIOUS: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().min(32, "EVENTIS_WEBHOOK_SECRET_PREVIOUS doit contenir au moins 32 caractères.").optional(),
    ),
    WEBHOOK_HOST: z.string().default("127.0.0.1"),
    WEBHOOK_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
    WEBHOOK_TOLERANCE_SECONDS: z.coerce.number().int().min(30).max(900).default(300),
    WEBHOOK_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(10_000).default(60),
    WEBHOOK_TRUST_PROXY: booleanFlag(false),

    SALES_FEED_ENABLED: booleanFlag(false),
    EVENTIS_MARKETPLACE_URL: optionalHttpsUrl,
    UPDATES_SHOW_LOGO: booleanFlag(true),

    TICKET_COOLDOWN_SECONDS: z.coerce.number().int().min(0).max(86_400).default(60),
    TICKET_MAX_STAFF_ADDED: z.coerce.number().int().min(0).max(100).default(25),
    WELCOME_REJOIN_COOLDOWN_HOURS: z.coerce.number().min(0).max(720).default(24),

    DATABASE_PATH: z.string().min(1).default("./data/eventis-bot.sqlite"),
    TIMEZONE: z
      .string()
      .default("Europe/Paris")
      .refine((tz) => {
        try {
          new Intl.DateTimeFormat("fr-FR", { timeZone: tz });
          return true;
        } catch {
          return false;
        }
      }, "TIMEZONE n'est pas un fuseau horaire valide."),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  })
  .superRefine((env, ctx) => {
    const hasRole = env.DISCORD_OWNER_ROLE_ID !== undefined;
    const hasUser = env.DISCORD_OWNER_USER_ID !== undefined;
    if (hasRole === hasUser) {
      ctx.addIssue({
        code: "custom",
        path: ["DISCORD_OWNER_ROLE_ID"],
        message: "Renseigne exactement un des deux : DISCORD_OWNER_ROLE_ID ou DISCORD_OWNER_USER_ID.",
      });
    }
  });

export type Env = z.output<typeof envSchema>;

export type OwnerTarget = { kind: "role"; id: string } | { kind: "user"; id: string };

export interface AppConfig {
  discord: {
    token: string;
    clientId: string;
    guildId: string;
    ticketChannelId: string;
    owner: OwnerTarget;
    supportRoleId: string | undefined;
    updatesChannelId: string;
    salesChannelId: string;
    welcomeChannelId: string;
  };
  webhook: {
    host: string;
    port: number;
    secrets: string[];
    toleranceSeconds: number;
    rateLimitPerMinute: number;
    trustProxy: boolean;
  };
  sales: { enabled: boolean; marketplaceUrl: string | undefined };
  updates: { showLogo: boolean };
  tickets: { cooldownSeconds: number; maxStaffAdded: number };
  welcome: { rejoinCooldownHours: number };
  databasePath: string;
  timezone: string;
  logLevel: Env["LOG_LEVEL"];
}

export class ConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Configuration invalide :\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "ConfigError";
  }
}

export function parseConfig(source: NodeJS.ProcessEnv): AppConfig {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => {
      const key = issue.path.join(".");
      return issue.message.startsWith(key) ? issue.message : `${key} : ${issue.message}`;
    });
    throw new ConfigError(problems);
  }
  const env = result.data;
  const owner: OwnerTarget = env.DISCORD_OWNER_ROLE_ID
    ? { kind: "role", id: env.DISCORD_OWNER_ROLE_ID }
    : { kind: "user", id: env.DISCORD_OWNER_USER_ID ?? "" };

  return {
    discord: {
      token: env.DISCORD_BOT_TOKEN,
      clientId: env.DISCORD_CLIENT_ID,
      guildId: env.DISCORD_GUILD_ID,
      ticketChannelId: env.DISCORD_TICKET_CHANNEL_ID,
      owner,
      supportRoleId: env.DISCORD_SUPPORT_ROLE_ID,
      updatesChannelId: env.DISCORD_UPDATES_CHANNEL_ID,
      salesChannelId: env.DISCORD_SALES_CHANNEL_ID,
      welcomeChannelId: env.DISCORD_WELCOME_CHANNEL_ID,
    },
    webhook: {
      host: env.WEBHOOK_HOST,
      port: env.WEBHOOK_PORT,
      secrets: [env.EVENTIS_WEBHOOK_SECRET, env.EVENTIS_WEBHOOK_SECRET_PREVIOUS].filter(
        (s): s is string => s !== undefined,
      ),
      toleranceSeconds: env.WEBHOOK_TOLERANCE_SECONDS,
      rateLimitPerMinute: env.WEBHOOK_RATE_LIMIT_PER_MINUTE,
      trustProxy: env.WEBHOOK_TRUST_PROXY,
    },
    sales: { enabled: env.SALES_FEED_ENABLED, marketplaceUrl: env.EVENTIS_MARKETPLACE_URL },
    updates: { showLogo: env.UPDATES_SHOW_LOGO },
    tickets: { cooldownSeconds: env.TICKET_COOLDOWN_SECONDS, maxStaffAdded: env.TICKET_MAX_STAFF_ADDED },
    welcome: { rejoinCooldownHours: env.WELCOME_REJOIN_COOLDOWN_HOURS },
    databasePath: env.DATABASE_PATH,
    timezone: env.TIMEZONE,
    logLevel: env.LOG_LEVEL,
  };
}
