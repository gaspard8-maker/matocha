# Sales-feed (capture 3)

## Rendu
```
┃ New Sale On Eventis                          [image]
┃ Event            Start Date   Venue
┃ Nom              08/05/2027   Salle
┃ Section          Row          Quantity
┃ 105              23           2 tickets
┃ Sale Price
┃ 1100.00€
┃ Eventis • <date et heure>
```
- Titre coloré : Discord ne colore un titre que s'il porte un lien. Le lien utilisé est l'URL publique de l'événement (`event.url`), sinon `EVENTIS_MARKETPLACE_URL`. Sans URL, le titre s'affiche en blanc.
- Miniature : `event.image_url` (image officielle de l'événement) si fournie.
- Date/heure du footer : affichées par Discord dans le fuseau du lecteur.

## Confidentialité
Le contrat est **strict** : tout champ non prévu (acheteur, vendeur, prix d'achat, valeur faciale, marge, ROI, paiement, numéros de billets, QR…) fait **rejeter** l'événement. Le champ *Sale Price* est le prix de vente total de l'annonce (prix unitaire × quantité, hors frais de service) — à confirmer côté site.

## Ventes publiées
Uniquement si **toutes** les conditions sont vraies :
`livemode = true`, `channel = marketplace`, `payment_status = succeeded`, `status = confirmed`, **et** `SALES_FEED_ENABLED=true`.

Sinon l'événement est enregistré comme ignoré (`sandbox_sale`, `external_sale`, `payment_not_succeeded`, `sale_not_confirmed`, `sales_feed_disabled`) et rien n'est publié.

**État actuel : désactivé.** Ne passe `SALES_FEED_ENABLED=true` qu'une fois les paiements réels actifs sur Eventis et ton accord donné.

## Fiabilité
Une vente = un message : clé `sale:<sale_id>` en base, nonce Discord, réessais avec délai croissant (8 essais max), erreurs définitives (salon introuvable, permissions) non réessayées.

## Prévisualisation
`/sale-preview` (admin) : vente fictive, visible uniquement par toi, jamais publiée dans le salon.
