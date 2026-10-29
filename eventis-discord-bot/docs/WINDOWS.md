# Lancer Eventis Bot sur Windows

Le bot tourne directement sur ton PC, dans une fenêtre de terminal. Il n'est hébergé nulle part : il fonctionne tant que la fenêtre reste ouverte et que le PC est allumé (pas en veille).

## 1. Installer Node.js (une fois)
Télécharge la version **LTS** sur <https://nodejs.org> (22.13 ou plus récent) et installe-la avec les options par défaut.

## 2. Récupérer le bot
1. Télécharge le ZIP de la branche : <https://github.com/gaspard8-maker/matocha/archive/refs/heads/claude/confident-knuth-aehb9o.zip> (connecte-toi d'abord à GitHub si le dépôt est privé).
2. Fais clic droit → **Extraire tout**.
3. Ouvre le dossier `eventis-discord-bot` (inutile d'utiliser le reste du dépôt).

## 3. Premier lancement
Double-clique sur **`start-windows.bat`**.

1. Le script installe les dépendances (1 à 2 minutes, uniquement la première fois).
2. Il crée `.env` et l'ouvre dans le Bloc-notes : remplis le token et les identifiants (voir [DISCORD_SETUP.md](DISCORD_SETUP.md)), **enregistre**, ferme le Bloc-notes.
3. Relance `start-windows.bat`. Le script vérifie le `.env`, affiche le lien d'invitation du bot, enregistre les commandes slash, compile, puis démarre le bot.

Le bot est lancé quand la fenêtre affiche `"msg":"connecté à Discord"`.

## Au quotidien
- **Démarrer** : double-clic sur `start-windows.bat`.
- **Arrêter** : `Ctrl+C` dans la fenêtre, ou ferme-la.
- **Modifier la configuration** : ferme le bot, `notepad .env` (ou ouvre `.env` avec le Bloc-notes), relance.
- **Après une mise à jour du code** : supprime le dossier `node_modules`, puis relance `start-windows.bat`. Garde ton `.env` et le dossier `data` : ils contiennent ta configuration et l'historique.

## Depuis un terminal (PowerShell ou Invite de commandes)
```powershell
cd chemin\vers\eventis-discord-bot
.\start-windows.bat
```
Commandes utiles :
```powershell
npm run check-config -- --discord
npm start
```
La première vérifie la connexion et les permissions sur le serveur. La seconde lance le bot sans recompiler.

## Bon à savoir
- Les données (tickets, historique) sont dans `data\eventis-bot.sqlite` : sauvegarde ce fichier.
- Si Windows affiche « Windows a protégé votre ordinateur » au double-clic : **Informations complémentaires** → **Exécuter quand même** (le fichier vient d'Internet).
- Pare-feu : rien à ouvrir. Le bot se connecte lui-même à Discord. Laisse `WEBHOOK_HOST=127.0.0.1` dans `.env` : la réception des événements du site Eventis n'est pas utilisée en local.
