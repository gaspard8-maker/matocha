# Lancer Eventis Bot sur ta VM

Le bot tourne sur **ta propre VM** (Linux, Ubuntu/Debian conseillé). Aucun hébergeur tiers : il se connecte lui-même à Discord, en sortie. Il ne demande aucun port entrant tant que tu n'actives pas la réception des événements du site (étape 5).

Rien n'est déployé tant que tu ne le fais pas toi-même.

## 1. Installer Node.js 22 (une fois)
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git
node -v    # doit afficher v22.13 ou plus
```

## 2. Récupérer le projet
```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin eventis
sudo git clone https://github.com/gaspard8-maker/matocha.git /opt/matocha-src
sudo cp -r /opt/matocha-src/eventis-discord-bot /opt/eventis-discord-bot
sudo chown -R eventis:eventis /opt/eventis-discord-bot
cd /opt/eventis-discord-bot
sudo -u eventis npm ci
sudo -u eventis npm run build
```
(Si le dépôt est privé, clone-le avec ton compte GitHub ou copie le dossier `eventis-discord-bot` avec `scp`.)

## 3. Configurer
```bash
sudo -u eventis cp .env.example .env
sudo -u eventis nano .env            # identifiants : voir DISCORD_SETUP.md
sudo chmod 600 .env                  # lisible uniquement par l'utilisateur eventis
sudo -u eventis npm run check-config -- --discord
sudo -u eventis npm run register-commands
```
Tant que tu n'exposes pas l'API : `WEBHOOK_HOST=127.0.0.1`.

## 4. Lancer en continu (systemd)
```bash
sudo cp deploy/eventis-bot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now eventis-bot
systemctl status eventis-bot         # doit afficher « active (running) »
journalctl -u eventis-bot -f         # logs en direct (Ctrl+C pour quitter)
```
Le service redémarre automatiquement en cas de crash et au redémarrage de la VM. Commandes utiles :
```bash
sudo systemctl restart eventis-bot
sudo systemctl stop eventis-bot
```

Lancement manuel ponctuel (sans systemd) : `npm start` dans le dossier.

### Mettre à jour le bot
```bash
cd /opt/matocha-src && sudo git pull
sudo rsync -a --exclude .env --exclude data --exclude node_modules /opt/matocha-src/eventis-discord-bot/ /opt/eventis-discord-bot/
cd /opt/eventis-discord-bot && sudo chown -R eventis:eventis . && sudo -u eventis npm ci && sudo -u eventis npm run build
sudo -u eventis npm run register-commands
sudo systemctl restart eventis-bot
```

### Sauvegarde
Toutes les données (tickets, historique, événements) sont dans `data/eventis-bot.sqlite`. Sauvegarde :
```bash
sudo -u eventis sqlite3 /opt/eventis-discord-bot/data/eventis-bot.sqlite ".backup '/opt/eventis-discord-bot/data/backup.sqlite'"
```
(ou copie le fichier après `systemctl stop`).

## 5. Recevoir les événements du site (facultatif)
Nécessaire uniquement pour les annonces **automatiques** (updates et ventes). Le site Eventis doit joindre la VM en HTTPS :

1. Un sous-domaine (ex. `bot.tondomaine.fr`) pointant vers l'IP publique de la VM.
2. Ports 80 et 443 ouverts (pare-feu de la VM et du fournisseur).
3. Caddy en reverse proxy (HTTPS automatique) :
   ```bash
   sudo apt-get install -y caddy
   sudo cp deploy/Caddyfile.example /etc/caddy/Caddyfile   # remplace bot.example.com
   sudo systemctl reload caddy
   ```
4. Dans `.env` : `WEBHOOK_HOST=127.0.0.1` (seul Caddy accède au bot) et `WEBHOOK_TRUST_PROXY=true`.
5. Côté site : `EVENTIS_BOT_WEBHOOK_URL=https://bot.tondomaine.fr/webhooks/eventis` et le même secret que `EVENTIS_WEBHOOK_SECRET`.

Si la VM n'a pas d'IP publique, un tunnel (ex. Cloudflare Tunnel) peut remplacer les étapes 1 à 3.

## Recette sur Discord
1. `systemctl status eventis-bot` → actif ; le bot apparaît en ligne.
2. `/bot-check` → tout en ✅.
3. `/ticket-panel` → un bouton seul dans `🎫・ouvrir-un-ticket`.
4. Clique avec un compte de test → un **fil privé** apparaît sous le salon (icône cadenas), pas de nouveau salon ; message conforme à la capture 1.
5. `/ticket close` → fil verrouillé et archivé.
6. `/update-announce` → aperçu privé conforme à la capture 2 ; **Annuler** (ne publie rien sans ton accord).
7. `/sale-preview` → aperçu privé conforme à la capture 3.
8. `/welcome-preview`, puis arrivée d'un compte secondaire → capture 4.
9. `sudo systemctl restart eventis-bot` → aucun message renvoyé, le ticket ouvert reste reconnu.
