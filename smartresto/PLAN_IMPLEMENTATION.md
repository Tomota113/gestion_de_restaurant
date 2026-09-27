# Plan d’implémentation SmartResto

## Décision d’architecture

**Le serveur local est la source de vérité de chaque restaurant.** Le modèle commercial peut être un abonnement SaaS incluant logiciel, maintenance et mises à jour, mais le service en salle ne doit dépendre ni d’un cloud ni d’une validation de licence en ligne. Le code livré est le noyau on-premise mono-établissement. L’administration multi-établissement et la synchronisation distante sont des extensions explicitement séparées.

| Composant | Responsabilité | Technologie |
|---|---|---|
| Tablette salle | Table, carte, personnalisation, panier, demande serveur | React PWA |
| KDS | Kanban, instructions, minuterie, son, changement de statut | Même application React, rôle cuisine |
| Caisse | Règlements, service, carte, portions, alertes et rapports | Même application React, rôle gérant |
| Proxy local | HTTPS reconnu sur tablettes, relais WS | Caddy avec autorité locale |
| Serveur applicatif | Validation, sessions, transactions et événements | FastAPI, un worker Uvicorn |
| Stockage | État durable du restaurant | SQLite sur SSD local, WAL, foreign keys, synchronous FULL |

Pas de Redis ni PostgreSQL nécessaires au MVP. SQLite autorise un écrivain à la fois : les transactions d’écriture sont courtes, utilisent `BEGIN IMMEDIATE`, attendent au plus 10 secondes pour le verrou et ne contiennent aucun envoi réseau. Les connexions aiosqlite délèguent les opérations SQLite à des threads pour ne pas bloquer la boucle asynchrone de FastAPI.

## Lots, dépendances et critères de sortie

| Ordre | Lot | Livrables concrets | Critère d’acceptation | État dans cette archive |
|---|---|---|---|---|
| 1 | Contrats métier | Cycle de commande, rôles, prix FCFA, notion d’encaissement, tables autorisées | Aucun prix accepté du navigateur; statut et rôle vérifiés serveur | Réalisé |
| 2 | Persistance | Six tables métier, FK, index, stock atomique, prix historiques, clé idempotente | Deux clients ne peuvent consommer la dernière portion; répétition sans doublon | Réalisé et testé |
| 3 | API REST | Connexion, carte, commandes, alertes, stock, paiements, stats, CSV | Routes interdites aux mauvais rôles; données invalides rejetées | Réalisé et testé |
| 4 | Transport temps réel | WS authentifié, file bornée, heartbeat, reconnexion, lecture de rattrapage | Nouvelle commande visible sans rechargement; retour après coupure | Réalisé; essais Wi-Fi physiques à conduire |
| 5 | Salle | Sélection table, filtres, modale, panier persistant, appel serveur | Commande personnalisée reçue intacte en cuisine; erreur réseau explicite | Réalisé |
| 6 | Cuisine | Trois colonnes, transitions, bip activable, attente rouge après 15 min | Instructions visibles, transitions atomiques et conflits gérés | Réalisé |
| 7 | Caisse | Menu éditable, stock, encaissement, CA, alertes, rapport | Un paiement ne compte qu’une fois; CA par date de règlement Bamako | Réalisé |
| 8 | PWA et installation | Build local, manifest, icônes, SW sans cache API, HTTPS local, service OS | Test sur Android et iPad avec Internet débranché | Configuration réalisée; qualification appareils requise |
| 9 | Exploitation pilote | DNS/réseau, onduleur, sauvegarde, procédure de restauration, formation | Service simulé complet puis restauration sur machine de secours | Scripts et procédures livrés; essais sur site à faire |
| 10 | Industrialisation | Comptes nominatifs, audit, migrations, annulations, supervision et packaging | Recette et exigences métier commerciales validées | À développer après retour pilote |
| 11 | Offre SaaS optionnelle | Portail central, gestion abonnements, catalogue de versions, synchronisation différée | Restaurant opérationnel sans cloud; conflits et reprise couverts | À développer |

Les lots 1–4 précèdent la recette des interfaces. La livraison commerciale dépend des lots 8–10; un résultat de test sur poste de développement ne les remplace pas.

## Données et invariants

| Table | Données clés | Règle métier |
|---|---|---|
| `categories` | id, nom unique | Une catégorie référencée ne peut être supprimée. |
| `plats` | catégorie, nom, description, prix entier, photo locale, options, disponibilité, actif | Archivage logique; prix >=0; photos locales uniquement. |
| `stocks` | plat_id, quantité | Une ligne par plat, portions >=0; décrément conditionnel atomique. |
| `commandes` | clé UUID unique, empreinte, propriétaire session, table, statut, total, création, paiement | Création et réservation de stock indissociables; identifiant client réutilisé uniquement pour le même contenu et la même session. |
| `items_commande` | commande, plat, nom figé, prix figé, quantité, instructions | Historique stable même après changement du menu. |
| `alertes_serveur` | clé UUID unique, session, table, motif, création/résolution | Demande idempotente; résolution conservée. |

### Validation d’une commande

1. Authentifier la tablette et vérifier sa table et les champs.
2. Ouvrir `BEGIN IMMEDIATE`.
3. Si la clé UUID existe, vérifier propriétaire et empreinte, puis retourner la commande existante.
4. Relire chaque plat actif et disponible. Valider les options de cuisson.
5. Réserver ses portions avec `UPDATE ... WHERE quantite >= ?`. Toute insuffisance annule toute la transaction.
6. Calculer le total à partir des prix en base. Copier noms/prix/instructions dans les lignes.
7. Insérer la commande et ses lignes; `COMMIT`.
8. Diffuser `commande.created` au personnel et `menu.changed` aux clients connectés.
9. Répondre avec la commande persistée; la tablette peut alors annoncer sa réception.

Si le processus s’arrête entre 7 et 8, la commande existe malgré une notification perdue : reconnexion et lecture REST périodique récupèrent l’état. Ce MVP utilise une resynchronisation de l’état courant, pas une garantie de livraison de chaque événement. Une outbox durable serait nécessaire pour des intégrations externes avec accusés de réception événement par événement.

### Cycle de préparation et règlement

`en_attente → en_cuisson → pret → servi`. Cuisine et gérant font les deux premières transitions; seul le gérant confirme `servi`. Une transition demandée vers le statut déjà courant est idempotente; un saut ou retour arbitraire renvoie 409.

Le règlement est indépendant de la préparation : le restaurant peut encaisser avant ou après le service. Une commande quitte la liste active seulement si elle est **servie et payée**. Les commandes non terminées et les impayés d’hier restent visibles. Le CA du jour se calcule par `paye_le`, jamais par `cree_le` ni par statut cuisine.

## Choix d’interface

- Style Bistro Chic : fond vert-noir, accents dorés, typographie système, cartes aérées et contrôles tactiles.
- Aucune police externe. Les icônes Lucide sont empaquetées dans le JavaScript.
- Images issues du répertoire local; illustrations remplacées par les photos réelles pendant l’installation.
- Boutons généralement de 48 px minimum, grille adaptée mobile/tablette, focus clavier et modales.
- Cuisine : minuterie depuis la création, surlignage fort des instructions, alarme visuelle après 15 min tant que non prêt. Le timer continue à afficher l’âge pour les commandes prêtes.
- Son autorisé par une action explicite du cuisinier; application au premier plan, volume et veille configurés sur site.
- Erreurs visibles, conservation de la demande après réponse incertaine, aucune animation qui puisse faire croire à une confirmation sans serveur.

## Recette sur site, dans l’ordre

1. **Installation à froid** : démarrer le serveur et le routeur sans accès WAN; ouvrir les trois rôles sur des appareils distincts.
2. **Droits** : vérifier que le code client ne peut accéder au CA, modifier le stock ou voir d’autres sessions.
3. **Service complet** : deux tables, plusieurs options/allergies, une alerte serveur, préparation, service et règlement.
4. **Concurrence** : mettre une portion sur un plat; valider simultanément sur deux tablettes; une seule commande est acceptée.
5. **Réponse perdue** : couper le Wi-Fi de la tablette lors de l’envoi, reconnecter et réessayer avec le même UUID; vérifier une seule commande et un seul décrément.
6. **Reconnexion KDS** : déconnecter l’écran cuisine, créer des commandes, reconnecter; toutes doivent apparaître sans perte persistante.
7. **Redémarrage** : arrêter et relancer le processus; commandes, stocks, alertes et encaissements restent corrects.
8. **PWA** : vérifier le certificat, l’installation, le cache, l’orientation et les réveils sur Android et iPad réels.
9. **Temps** : régler et vérifier l’horloge serveur; tester le seuil 15 min et le passage de date Bamako.
10. **Rapport** : comparer CA/CSV avec les paiements saisis, puis imprimer sur le matériel prévu.
11. **Sauvegarde et restauration** : créer une sauvegarde pendant un service simulé, restaurer sur une installation de secours et comparer les commandes/règlements.
12. **Charge** : simuler le nombre cible de tablettes et de commandes du restaurant; mesurer latence API, délai KDS et conflits SQLite avant de fixer des objectifs contractuels.

## Suite professionnelle recommandée

Avant déploiement commercial : authentification nominative avec hachage de mots de passe et révocation, audit des modifications et paiements, migrations versionnées avec sauvegarde et rollback, fermeture journalière immutable, annulations/remboursements autorisés et traçables, gestion de session de table par le personnel, rétention des données, supervision locale, packaging de mises à jour, maintenance et restauration documentées.

Ajouter ensuite, selon besoin : recettes/ingrédients et mouvements de stock; tickets thermiques via service d’impression local; additions regroupées et partagées; promotions; imprimantes de secours; terminaux et opérateurs de paiement. Chaque ajout doit conserver les invariants prix/stock/paiement et l’indépendance à Internet.

Pour l’offre SaaS, garder une base par établissement et un identifiant de restaurant stable. Définir des UUID globaux, une outbox transactionnelle locale, des accusés de réception, des versions d’événements et une politique de conflits avant toute réplication. Ne jamais copier bidirectionnellement les fichiers SQLite ni conditionner les commandes locales au succès d’une synchronisation cloud. Un cloud central pourra utiliser PostgreSQL pour ses besoins propres sans remplacer SQLite sur le site.

## Évolution livrée : 0.2 QR et Wi-Fi

Accès client par invitation de table, table contrôlée côté serveur, révocation des liens/sessions, migration additive SQLite, générateur QR Wi-Fi local, affiches HTML imprimables et export SVG : réalisés. Vingt QR sont fournis pour le serveur indiqué. La saisie du réseau et le test physique des scans restent à faire sur place. Les sessions d’occupation ouvertes/fermées par le personnel restent une évolution distincte.
