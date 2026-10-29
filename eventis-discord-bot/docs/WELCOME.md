# Bienvenue (capture 4)

## Rendu
```
@membre
┃ 🎉 Welcome to **EventisPro**, @membre!
┃ Glad to have you here.
┃ [bannière WELCOME]
```
Exactement les deux lignes et la bannière, dans un seul message. La mention au-dessus de l'embed (présente sur la capture) est la seule qui notifie le membre.

## Bannière
1200 × 360 px (proportions de la capture) : fond sombre avec halo émeraude, avatar du membre dans un cercle `#10B981`, grand **WELCOME** en dégradé émeraude, logo EventisPro en haut à gauche, logo + « Eventis**Pro** » en bas à droite. Polices Archivo Black et Inter (licence OFL, incluses).

- Logo : `assets/eventispro-logo.webp` (celui que tu as fourni). Pour le remplacer, dépose `assets/eventispro-logo.png` (prioritaire), carré, idéalement 512 px ou plus, puis redémarre le bot.
- Avatar absent ou CDN indisponible : bannière avec un cercle vide (aucune erreur visible).
- Les avatars ne sont téléchargés que depuis le CDN Discord.

## Fiabilité
- Une arrivée = un message (clé serveur + membre + date d'arrivée en base) ; aucun envoi au redémarrage (Discord ne rejoue pas les arrivées).
- Bots ignorés ; un membre qui revient dans les `WELCOME_REJOIN_COOLDOWN_HOURS` (24 h) n'est pas re-salué.
- Échec Discord : journalisé et enregistré, sans planter le bot.

## Test
`/welcome-preview` (admin) affiche le message avec ton avatar, visible par toi seul. Pour un test réel : faire rejoindre un compte secondaire.
