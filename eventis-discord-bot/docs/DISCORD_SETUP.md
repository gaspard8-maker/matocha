# Configuration Discord

## 1. Créer l'application
1. Va sur <https://discord.com/developers/applications> → **New Application** → nom : `Eventis Bot`.
2. **General Information** : ajoute l'icône (`assets/eventispro-logo.webp`, exportée en PNG si besoin) et copie l'**Application ID** → `DISCORD_CLIENT_ID`.
3. **Bot** :
   - **Reset Token** → copie le token **directement dans le fichier `.env` de ta VM** (`DISCORD_BOT_TOKEN=`). Ne le colle jamais dans une conversation, un ticket ou un commit. S'il fuit : Reset Token immédiatement.
   - Désactive **Public Bot** (seul toi peux l'inviter).
   - **Privileged Gateway Intents** : active **Server Members Intent** (nécessaire à la bienvenue). *Presence* et *Message Content* restent désactivés.

## 2. Récupérer les identifiants
Discord → Paramètres utilisateur → Avancés → **Mode développeur** activé. Ensuite clic droit → **Copier l'identifiant** :

| Variable | Où |
| --- | --- |
| `DISCORD_GUILD_ID` | Clic droit sur le serveur EventisPro |
| `DISCORD_TICKET_CHANNEL_ID` | `🎫・ouvrir-un-ticket` |
| `DISCORD_UPDATES_CHANNEL_ID` | `🔄・updates` |
| `DISCORD_SALES_CHANNEL_ID` | `📈・sales-feed` |
| `DISCORD_WELCOME_CHANNEL_ID` | `arrivant` |
| `DISCORD_OWNER_ROLE_ID` **ou** `DISCORD_OWNER_USER_ID` | Rôle `@Owner` (Paramètres du serveur → Rôles) ou ton profil |
| `DISCORD_SUPPORT_ROLE_ID` | Rôle support (facultatif) |

Le bot refuse de démarrer si un identifiant est absent ou mal formé : rien n'est deviné.

## 3. Inviter le bot
`npm run check-config` affiche le lien d'invitation avec exactement les permissions nécessaires (sans Administrateur) :

- Voir les salons, Envoyer des messages, Intégrer des liens, Joindre des fichiers, Voir les anciens messages
- Créer des fils privés, Envoyer des messages dans les fils, Gérer les fils
- Scope `applications.commands` (commandes slash)

## 4. Permissions par salon
Si un salon restreint les permissions, ajoute une dérogation pour le rôle du bot :

| Salon | Permissions du bot |
| --- | --- |
| Tickets | Voir, Envoyer, Intégrer des liens, Voir les anciens messages, **Créer des fils privés**, **Envoyer dans les fils**, **Gérer les fils** |
| Updates | Voir, Envoyer, Intégrer des liens, Joindre des fichiers |
| Sales-feed | Voir, Envoyer, Intégrer des liens |
| Arrivant | Voir, Envoyer, Intégrer des liens, Joindre des fichiers |

Dans le salon des tickets, retire aux membres la permission **Créer des fils publics/privés** et **Envoyer des messages** si tu veux qu'ils passent uniquement par le bouton.

## 5. Rôles Owner et Support
- `@Owner` est mentionné dans l'embed du ticket (sans notification). Le rôle (ou l'utilisateur) et le rôle Support sont **ajoutés au fil** à chaque création (jusqu'à `TICKET_MAX_STAFF_ADDED` personnes).
- Discord : toute personne ayant **Gérer les fils** sur le salon (et les administrateurs) peut voir tous les fils privés. Donne cette permission au rôle Support sur le salon des tickets pour qu'il voie aussi les anciens tickets.

## 6. Vérifier
```bash
npm run check-config -- --discord
```
Puis, une fois le bot lancé : `/bot-check` sur le serveur.
