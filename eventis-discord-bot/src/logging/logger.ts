import { pino, type Logger } from "pino";

/** Chemins jamais écrits dans les logs (secrets, signatures, en-têtes d'authentification). */
export const REDACTED_PATHS = [
  "token",
  "secret",
  "secrets",
  "signature",
  "authorization",
  "*.token",
  "*.secret",
  "*.secrets",
  "*.signature",
  "*.authorization",
  'headers["x-eventis-signature"]',
  'headers["authorization"]',
  "config.discord.token",
  "config.webhook.secrets",
];

export function createLogger(level: string = process.env.LOG_LEVEL ?? "info"): Logger {
  return pino({
    level,
    base: { service: "eventis-bot" },
    redact: { paths: REDACTED_PATHS, censor: "[redacted]" },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

export type { Logger };
