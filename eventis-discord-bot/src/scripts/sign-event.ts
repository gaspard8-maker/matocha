/* eslint-disable no-console -- outil de test destiné à l'utilisateur */
/**
 * Envoie un événement signé à l'API du bot (tests d'intégration en local).
 * Usage : npm run sign-event -- <fichier.json> [url]
 */
import { readFileSync } from "node:fs";
import { loadDotEnv } from "../config/load-env.js";
import { SIGNATURE_HEADER, signatureHeader, TIMESTAMP_HEADER } from "../security/signature.js";

loadDotEnv();
const [file, url = `http://127.0.0.1:${process.env.WEBHOOK_PORT ?? "8787"}/webhooks/eventis`] = process.argv.slice(2);
const secret = process.env.EVENTIS_WEBHOOK_SECRET;
if (!file || !secret) {
  console.error("Usage : npm run sign-event -- <fichier.json> [url]  (EVENTIS_WEBHOOK_SECRET doit être défini)");
  process.exit(1);
}
const body = readFileSync(file);
const timestamp = String(Math.floor(Date.now() / 1000));
const response = await fetch(url, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    [TIMESTAMP_HEADER]: timestamp,
    [SIGNATURE_HEADER]: signatureHeader(secret, timestamp, body),
  },
  body,
});
console.log(response.status, await response.text());
