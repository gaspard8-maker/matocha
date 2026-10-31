# Eventis Bot

Bot Discord officiel de la communauté **EventisPro**. Projet indépendant du site Eventis : il ne lit pas sa base de données et ne reçoit que des événements signés.

| Module | Salon | Déclenchement |
| --- | --- | --- |
| Tickets (capture 1) | `🎫・ouvrir-un-ticket` | Bouton → fil **privé** dans le salon existant |
| Updates (capture 2) | `🔄・updates` | Événement `site.release.published` ou `/update-announce` (prévisualisation + confirmation) |
| Sales-feed (capture 3) | `📈・sales-feed` | Événement `marketplace.sale.confirmed` — **désactivé par défaut** |
| Bienvenue (capture 4) | `arrivant` | Arrivée d'un membre |

Aperçus (générés depuis le code, sans publication) : [`docs/previews/`](docs/previews/) — régénérables avec `npm run previews` (ouvre ensuite `previews/index.html`).

## Windows

Double-clique sur **`start-windows.bat`** : il installe, configure et lance le bot dans une fenêtre de terminal. Détails : [`docs/WINDOWS.md`](docs/WINDOWS.md).

## Démarrage rapide (Linux / ta VM)

Prérequis : Node.js 22.13 ou plus récent (LTS 22 ou 24).

```bash
cd eventis-discord-bot
npm ci
cp .env.example .env
nano .env                      # renseigne les identifiants (voir docs/DISCORD_SETUP.md)
npm run check-config           # vérifie le .env et affiche le lien d'invitation du bot
npm run check-config -- --discord   # vérifie la connexion et les permissions sur le serveur
npm run register-commands      # enregistre les commandes slash sur ton serveur
npm run build
npm start
```

Pour le faire tourner en continu sur la VM (redémarrage automatique) : [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Commandes Discord

| Commande | Qui | Effet |
| --- | --- | --- |
| `/ticket-panel` | Admin | Republie le message d'ouverture de ticket (publié automatiquement au démarrage) |
| `/ticket close [raison]` | Auteur du ticket ou support | Ferme, verrouille et archive le fil (rien n'est supprimé) |
| `/ticket claim` | Support | Prend le ticket en charge (historique interne) |
| `/update-announce` | Admin | Formulaire → aperçu privé → bouton Publier/Annuler |
| `/sale-preview` | Admin | Aperçu privé d'une vente **fictive** (jamais publiée) |
| `/welcome-preview` | Admin | Aperçu privé du message de bienvenue avec ton avatar |
| `/bot-check` | Admin | Vérifie salons et permissions |

Les réponses de ces commandes sont éphémères (visibles uniquement par la personne qui les utilise).

## Scripts

| Script | Rôle |
| --- | --- |
| `npm run verify` | TypeScript + ESLint + tests + build |
| `npm run previews` | Génère les aperçus dans `previews/` |
| `npm run sign-event -- fichier.json` | Envoie un événement signé à l'API locale (tests) |

## Architecture

```
src/
  config/        variables d'environnement (Zod), chargement du .env
  logging/       logs JSON structurés (pino) avec masquage des secrets
  persistence/   SQLite (node:sqlite) : tickets, historique, événements reçus, bienvenues
  bot/           client Discord, permissions, publication, commandes, routage des interactions
  tickets/       fil privé, message capture 1, service, commandes
  updates/       contrat release, embed capture 2, publication manuelle
  sales/         contrat vente, éligibilité, embed capture 3
  welcome/       bannière (canvas), message capture 4, service
  integration/   API HTTP signée, boîte de réception idempotente, réessais
  security/      HMAC, limitation de débit
  scripts/       check-config, register-commands, previews, sign-event
tests/           Vitest (66 tests)
assets/          logo EventisPro, polices (OFL)
deploy/          service systemd, exemple Caddy
docs/            documentation
```

## Documentation

- [Configuration Discord](docs/DISCORD_SETUP.md)
- [Tickets](docs/TICKETS.md) · [Updates](docs/UPDATES.md) · [Sales-feed](docs/SALES_FEED.md) · [Bienvenue](docs/WELCOME.md)
- [Intégration Eventis](docs/EVENTIS_INTEGRATION.md)
- [Lancer sur Windows](docs/WINDOWS.md)
- [Déploiement sur ta VM Linux](docs/DEPLOYMENT.md)
