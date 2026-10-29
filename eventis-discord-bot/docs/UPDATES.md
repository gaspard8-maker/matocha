# Updates (capture 2)

## Rendu
```
┃ UPDATE 6.4.2                         [logo]
┃ 🎟️ Tickets
┃ • Première modification
┃ • Deuxième modification
┃
┃ 🔌 API
┃ • Correction de l'API
```
Un seul embed, bordure `#10B981`, titre blanc, puces, ligne vide entre sections. La section API n'apparaît que si elle contient des modifications. Pas de mention, lien, bouton, intro ni conclusion. La miniature du logo (présente sur la capture) se désactive avec `UPDATES_SHOW_LOGO=false`.

## Déclenchement automatique
Le site envoie `site.release.published` **au moment où une version est mise en ligne en production** (pas à chaque commit) — voir [EVENTIS_INTEGRATION.md](EVENTIS_INTEGRATION.md). Le bot :
- ignore tout environnement autre que `production` ;
- ne publie qu'une fois par `release_id` **et** par numéro de version ;
- réessaie en cas d'indisponibilité de Discord.

## Publication manuelle
`/update-announce` (admin) ouvre un formulaire : version, modifications Tickets (une par ligne), modifications API (facultatif). Le bot affiche un **aperçu privé** avec **Publier** / **Annuler**. Rien n'est publié sans clic sur Publier. Le brouillon expire après 15 minutes.

## Limites
- Catégories prises en charge : `tickets`, `api` (celles de la capture). En ajouter une : `src/updates/release-schema.ts`.
- 25 modifications et ~4000 caractères maximum (un seul embed).
