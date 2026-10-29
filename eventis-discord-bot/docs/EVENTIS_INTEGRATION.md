# Intégration Eventis → Eventis Bot

> **État : non connecté.** L'API de réception du bot est développée et testée (tests automatisés), mais le site Eventis n'envoie encore aucun événement : son code n'était pas accessible depuis ce projet. Les annonces automatiques ne fonctionneront qu'après la modification du site décrite ci-dessous **et** un test de bout en bout.

## Principe
Le site envoie une requête HTTPS signée au bot à deux moments précis. Le bot n'a aucun accès à la base de données du site ; il ne reçoit que les champs listés ici.

```
Eventis (Next.js) ──POST signé──▶ https://<ta-vm>/webhooks/eventis ──▶ Eventis Bot ──▶ Discord
```

## Requête
```
POST /webhooks/eventis
Content-Type: application/json
X-Eventis-Timestamp: <secondes Unix>
X-Eventis-Signature: v1=<hex HMAC-SHA256(EVENTIS_WEBHOOK_SECRET, "<timestamp>.<corps brut>")>
```
- Horodatage accepté à ± 300 s (protection contre le rejeu).
- Corps ≤ 64 Ko. 60 requêtes/minute par IP.
- Rotation du secret : mettre l'ancien dans `EVENTIS_WEBHOOK_SECRET_PREVIOUS` le temps de la bascule.

### Enveloppe
```json
{ "id": "evt_01JB…", "type": "<type>", "created_at": "2026-10-29T12:38:00Z", "data": { … } }
```
`id` : identifiant unique de l'envoi (lettres, chiffres, `_ . : -`, 128 max).

### `site.release.published`
Envoyé **une fois**, quand une version est effectivement en ligne en production (fin du déploiement), jamais sur un commit ou un build de prévisualisation.
```json
{
  "release_id": "rel_2026_10_29_01",
  "version": "6.4.2",
  "environment": "production",
  "published_at": "2026-10-29T12:38:00Z",
  "changes": [
    { "category": "tickets", "description": "Ajout de la recherche dans les dossiers du stock." },
    { "category": "api", "description": "Fix et améliorations générales de l'API." }
  ]
}
```
`category` ∈ `tickets`, `api`. 1 à 25 modifications, 300 caractères max chacune. Aucun autre champ accepté.

### `marketplace.sale.confirmed`
Envoyé quand une vente Eventis Marketplace est confirmée et le paiement capturé.
```json
{
  "sale_id": "sale_8f2c…",
  "livemode": true,
  "status": "confirmed",
  "payment_status": "succeeded",
  "channel": "marketplace",
  "confirmed_at": "2026-10-29T13:36:00+01:00",
  "event": {
    "name": "Nom de l'événement",
    "starts_at": "2027-05-08T20:00:00+02:00",
    "venue": "Paris La Défense Arena",
    "image_url": "https://…/image-officielle.jpg",
    "url": "https://…/evenements/…"
  },
  "tickets": { "section": "105", "row": "23", "quantity": 2 },
  "price": { "amount_minor": 110000, "currency": "EUR" }
}
```
- `image_url`, `url`, `row` facultatifs (https obligatoire pour les URL).
- `price.amount_minor` : prix de vente total de l'annonce en centimes (prix unitaire × quantité), hors frais.
- **Interdit** (rejet 422) : toute donnée acheteur/vendeur, prix d'achat, valeur faciale, marge, ROI, données de paiement, numéros de billets, QR codes.

## Réponses du bot
| Code | Corps | Signification |
| --- | --- | --- |
| 202 | `{"status":"accepted"}` | Enregistré, publication en cours |
| 202 | `{"status":"ignored","reason":"…"}` | Valide mais non publiable (sandbox, désactivé, staging…) |
| 200 | `{"status":"duplicate"}` | Déjà reçu : ne rien faire |
| 401 | `{"error":"invalid_signature" \| "stale_timestamp" \| "missing_headers"}` | Authentification refusée |
| 422 | `{"error":"invalid_payload","issues":[…]}` | Contrat non respecté (ne pas réessayer) |
| 429 / 5xx | | Réessayer plus tard (délai croissant) |

Côté site : réessayer sur 429/5xx/erreur réseau avec **le même `sale_id` / `release_id`** — le bot dédoublonne.

## Test local
```bash
echo '{"id":"evt_test_1","type":"site.release.published","created_at":"2026-10-29T12:00:00Z","data":{"release_id":"test-1","version":"0.0.1","environment":"staging","published_at":"2026-10-29T12:00:00Z","changes":[{"category":"tickets","description":"Test"}]}}' > /tmp/event.json
npm run sign-event -- /tmp/event.json
```
`environment: "staging"` → réponse `ignored`, rien n'est publié (test sans risque).

## Instructions à donner à Claude Code dans Cursor (dépôt du site Eventis)

> Ajoute au site Eventis l'envoi d'événements signés vers Eventis Bot, selon le contrat de `docs/EVENTIS_INTEGRATION.md` du projet eventis-discord-bot (copié ci-dessous).
>
> 1. Crée un module serveur uniquement (jamais importé côté client) `lib/eventis-bot.ts` exposant `sendEventisBotEvent(type, data)` : corps JSON `{ id, type, created_at, data }` avec `id = crypto.randomUUID()`, en-têtes `X-Eventis-Timestamp` (secondes) et `X-Eventis-Signature: v1=<HMAC-SHA256 hex de "<timestamp>.<corps>">` avec `EVENTIS_BOT_WEBHOOK_SECRET`, URL `EVENTIS_BOT_WEBHOOK_URL`. Timeout 5 s. Réessais (3 max, délai croissant) seulement sur réseau/429/5xx. Ne jamais journaliser le secret ni le corps complet. Si les variables sont absentes, ne rien envoyer.
> 2. Ventes : appelle `marketplace.sale.confirmed` uniquement après confirmation définitive d'une vente Marketplace avec paiement capturé (webhook du prestataire de paiement, après mise à jour de la base, de façon idempotente). `livemode` = vrai uniquement en mode de paiement réel. N'envoie que les champs du contrat ; aucune donnée personnelle ni financière privée. Les ventes externes déclarées manuellement ont `channel: "external_manual"` ou ne sont pas envoyées.
> 3. Mises à jour : appelle `site.release.published` une seule fois quand une version est réellement en production (étape de fin de déploiement ou action admin « Publier la version »), avec un `release_id` stable, la version X.Y.Z et la liste des modifications publiques (`tickets` / `api`). Jamais sur un commit, un build preview ou en local.
> 4. Ajoute les variables à `.env.example` sans valeur. Ajoute des tests : signature correcte, aucune donnée privée dans le corps, pas d'envoi en sandbox.
> 5. Ne modifie rien d'autre.

Exemple de signature (Node.js) :
```ts
import { createHmac, randomUUID } from "node:crypto";

export async function sendEventisBotEvent(type: string, data: unknown): Promise<void> {
  const url = process.env.EVENTIS_BOT_WEBHOOK_URL;
  const secret = process.env.EVENTIS_BOT_WEBHOOK_SECRET;
  if (!url || !secret) return;
  const body = JSON.stringify({ id: randomUUID(), type, created_at: new Date().toISOString(), data });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-eventis-timestamp": timestamp, "x-eventis-signature": `v1=${signature}` },
    body,
    signal: AbortSignal.timeout(5000),
  });
  if (res.status === 429 || res.status >= 500) throw new Error(`Eventis Bot indisponible (${res.status})`);
}
```

## Exposer l'API depuis ta VM
Le site doit pouvoir joindre la VM en HTTPS : voir [DEPLOYMENT.md](DEPLOYMENT.md#5-recevoir-les-événements-du-site-facultatif). Tant que ce n'est pas fait, garde `WEBHOOK_HOST=127.0.0.1` : tickets, bienvenue et `/update-announce` fonctionnent sans rien exposer.
