import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** Charge le fichier .env local (s'il existe) sans écraser les variables déjà définies. */
export function loadDotEnv(path = resolve(process.cwd(), ".env")): void {
  if (existsSync(path)) {
    process.loadEnvFile(path);
  }
}
