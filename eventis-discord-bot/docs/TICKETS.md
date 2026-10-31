# Tickets (capture 1)

## Fonctionnement
1. **Au démarrage**, le bot publie automatiquement dans `🎫・ouvrir-un-ticket` le message d'ouverture (modèle fourni) :
   ```
   ┃ Ouvrir un ticket privé
   ┃ Une question ou besoin d’aide ? Ouvre un ticket pour échanger avec @Owner. Si tu as déjà
   ┃ un ticket ouvert, tu y seras redirigé. Les paniers que tu réserves seront ajoutés à ce même ticket.
   [ Ouvrir un ticket ]
   ```
   S'il existe déjà, il est mis à jour (jamais en double) ; s'il a été supprimé, il est republié au prochain démarrage. `/ticket-panel` (admin) le republie immédiatement.
2. Un membre clique. Le bot :
   - vérifie qu'il n'a pas déjà un ticket ouvert (sinon il reçoit, en privé, le lien du ticket existant, rouvert s'il était archivé) ;
   - applique un délai anti-spam (`TICKET_COOLDOWN_SECONDS`, 60 s par défaut) et ignore les doubles clics ;
   - vérifie ses permissions **avant** de créer quoi que ce soit (sinon : message d'erreur, aucun fil) ;
   - crée un **fil privé** non invitable dans le salon existant — jamais un salon, jamais un fil public (si Discord renvoyait un autre type, le fil est supprimé et le ticket refusé) ;
   - envoie le message de la capture 1, ajoute le membre puis l'équipe (Owner + Support) ;
   - enregistre le ticket en base.

## Message envoyé dans le fil
```
@membre
┃ Ton ticket privé
┃ Explique ta demande ici pour échanger avec @Owner.
```
Bordure `#10B981`. Aucun bouton, aucun autre texte. Seul le membre est notifié.

> Écarts volontaires avec la capture, conformes à ta demande écrite : la mention du haut est celle du **membre** (la capture montrait `@Owner`), la phrase sur les paniers et le bouton gris « Ticket ouvert » ne sont pas repris. Les ajouter = une ligne chacun.

## Fermeture et suivi
- `/ticket close [raison]` (auteur ou support) : ticket marqué fermé, fil verrouillé et archivé. **Rien n'est supprimé** (pas de règle de conservation définie).
- `/ticket claim` (support) : enregistre le responsable.
- Données conservées : numéro, auteur, fil, dates de création/fermeture, statut, responsable, historique des actions (`ticket_actions`).
- Redémarrage : au démarrage, les créations interrompues sont clôturées et les tickets dont le fil a été supprimé sont marqués fermés.

## Limites Discord
Les administrateurs et les personnes ayant « Gérer les fils » voient tous les fils privés : c'est natif et non contournable.
