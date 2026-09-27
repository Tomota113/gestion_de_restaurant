# Bienvenue sur SmartResto

## Le guide du restaurant

SmartResto permet à vos clients de consulter le menu et de commander depuis leur téléphone. Votre équipe reçoit les commandes en cuisine et suit les règlements à la caisse.

**Le restaurant peut utiliser SmartResto sans Internet.** Le Wi-Fi du restaurant et l’ordinateur principal doivent toutefois rester allumés. Les téléphones et tablettes doivent pouvoir se connecter à ce Wi-Fi.

Ce guide explique comment utiliser SmartResto une fois son installation terminée.

## 1. Préparer le restaurant avant le service

1. Allumez l’ordinateur principal et le Wi-Fi du restaurant.
2. Vérifiez que SmartResto est démarré sur cet ordinateur. Si vous ne connaissez pas la marche à suivre, demandez-la à la personne qui l’a installé.
3. Connectez les appareils de la cuisine et de la caisse au Wi-Fi du restaurant.
4. Ouvrez SmartResto dans le navigateur, par exemple Chrome ou Safari.
5. Connectez-vous à l’espace qui vous concerne avec le code remis lors de l’installation.

| Qui utilise l’appareil ? | Espace à choisir |
|---|---|
| L’équipe en cuisine | **Cuisine** |
| Le responsable ou la personne à la caisse | **Caisse & gestion** |
| Un client avec son téléphone | Il scanne le QR de sa table. Il n’a pas de code à saisir. |

**Sur le PC principal :** ouvrez le fichier **OUVRIR_SMARTRESTO.html**, ou [SmartResto sur ce PC](http://localhost:8000). Dans **Caisse & gestion → QR codes & Wi-Fi**, un QR permet d’ouvrir SmartResto sur le téléphone, sans recopier d’adresse. Le serveur doit être démarré.

**Nouvelle version 0.3 :** voir [MISE_A_JOUR_ADRESSE.md](MISE_A_JOUR_ADRESSE.md) pour installer la mise à jour et conserver vos données.

Gardez les codes de la cuisine et de la caisse pour le personnel. Si vous les avez oubliés, demandez-les au responsable de l’installation.

Avant d’accueillir les premiers clients, vérifiez vos plats, vos prix et les portions disponibles dans **Carte & stocks**. Les plats et images fournis au départ sont des exemples à adapter à votre restaurant.

## 2. Accueillir un client à sa table

Un QR code est le carré que le client scanne avec l’appareil photo de son téléphone. Chaque affiche de table peut en présenter deux :

| Sur l’affiche | Ce que fait le client |
|---|---|
| **1. Se connecter au Wi-Fi** | Il scanne et accepte de rejoindre le Wi-Fi du restaurant. |
| **2. Découvrir le menu** | Il scanne pour ouvrir le menu de sa table. |

Le numéro de table est déjà renseigné. Le client n’a pas besoin de créer un compte ou d’installer une application.

Pour commander, il choisit ses plats, indique ses préférences, puis ouvre **Mon panier** et touche **Valider ma commande**. Il doit attendre le message confirmant que la commande a été reçue en cuisine.

Le bouton **Appel serveur** lui permet de demander de l’eau, l’addition ou de poser une question. La demande apparaît sur les écrans du personnel. Une fois la demande prise en charge, touchez-la pour la retirer de la liste.

Si le téléphone indique que le Wi-Fi n’a pas Internet, le client peut choisir de rester connecté pour utiliser SmartResto.

## 3. Préparer les commandes en cuisine

Ouvrez l’espace **Cuisine**, puis touchez **Activer le bip** pour entendre l’arrivée des nouvelles commandes. Vérifiez aussi le volume de l’appareil.

Les commandes sont réparties en trois colonnes :

| Colonne | Action de l’équipe |
|---|---|
| **En attente** | Lire la commande, puis toucher **Lancer la préparation**. |
| **En cuisson** | Préparer les plats, puis toucher **Marquer prêt**. |
| **Prêt** | Prévenir le personnel en salle pour apporter les plats. |

Les précisions comme « Sans piment », la cuisson et les allergies sont mises en évidence. L’équipe doit les lire avant de commencer. En cas d’allergie, échangez également avec le client pour vérifier ce qui peut lui être servi.

Le temps d’attente s’affiche sur chaque commande. Après 15 minutes, il devient rouge et clignote si la commande n’est pas encore prête.

Lorsque les plats sont servis, la personne à la caisse touche **Marquer servi** sur la commande concernée.

## 4. Encaisser et consulter les recettes

Dans **Caisse & gestion**, ouvrez **Service & encaissement**.

1. Retrouvez la bonne table et vérifiez le montant.
2. Touchez **Encaisser**.
3. Choisissez le moyen de paiement.
4. Touchez **Confirmer le règlement** uniquement après avoir reçu le paiement.

**SmartResto enregistre le règlement : il ne prélève pas d’argent.** Pour Mobile Money ou la carte bancaire, vérifiez d’abord que le paiement a bien été reçu sur votre moyen habituel.

Le tableau de bord affiche :

- **Chiffre d’affaires encaissé** : l’argent enregistré comme reçu aujourd’hui.
- **Encaissements** : le nombre de commandes réglées aujourd’hui.
- **À encaisser** : le montant de toutes les commandes qui ne sont pas encore réglées, même si elles datent d’un jour précédent.

Une commande quitte la liste en cours lorsqu’elle est à la fois servie et payée.

En fin de journée, touchez **Imprimer** pour obtenir le rapport. Le bouton **CSV** permet aussi de télécharger un tableau des règlements, à ouvrir par exemple avec Excel.

## 5. Modifier la carte et les portions

Dans **Caisse & gestion**, ouvrez **Carte & stocks**.

- **Nouveau plat** : ajouter un plat, sa description et son prix.
- **Le crayon** : modifier un plat existant.
- **Stock** : indiquer le nombre de portions encore disponibles.
- **À la carte / En rupture** : rendre un plat commandable ou le signaler comme indisponible.

**Exemple :** s’il vous reste 12 portions de poulet yassa, indiquez 12. Une commande de 2 portions fera passer le nombre disponible à 10.

Un nouveau plat commence avec zéro portion. Pensez donc à renseigner sa quantité. Pour remettre un plat en vente, vérifiez qu’il est **À la carte** et qu’il reste au moins une portion.

Pour ajouter vos propres photos de plats, faites-vous accompagner par la personne qui a installé SmartResto.

## 6. Préparer les affiches avec les QR codes

Dans **Caisse & gestion**, ouvrez **QR codes & Wi-Fi**.

1. Vérifiez l’adresse détectée dans le bloc **Accès au téléphone**. Le mode automatique actualise cette adresse lorsque le réseau change.
2. Cochez **Ajouter le QR de connexion Wi-Fi**.
3. Saisissez le nom exact du Wi-Fi et son mot de passe. Si vous ne savez pas quel type de protection choisir, demandez au responsable du Wi-Fi.
4. Choisissez une table ou toutes les tables.
5. Vérifiez l’aperçu affiché automatiquement, puis touchez **Imprimer les affiches**.

Vous pouvez aussi choisir **Télécharger les affiches** pour les conserver et les imprimer plus tard.

**Testez les deux QR avec un téléphone avant de poser les affiches.** Vérifiez que le numéro affiché sur le téléphone correspond bien à la table. Ne déplacez pas l’affiche d’une table vers une autre.

Les QR des tables sont préparés dans cet écran avec l’adresse actuelle. Pour obtenir aussi le QR Wi-Fi du restaurant, renseignez les informations du réseau dans l’espace gérant.

En mode automatique, les QR à l’écran suivent les changements d’adresse du PC. Les affiches imprimées et les fichiers déjà téléchargés restent inchangés. Si vous changez le mot de passe Wi-Fi ou le lien du restaurant, préparez de nouvelles affiches. Demandez à l’installateur de faire en sorte que le lien du restaurant reste le même.

## 7. Si quelque chose ne fonctionne pas

| Problème | Que faire ? |
|---|---|
| Le menu ne s’ouvre pas sur le téléphone. | Vérifiez que le téléphone utilise le Wi-Fi du restaurant, puis que l’ordinateur principal et SmartResto sont allumés. Scannez à nouveau le QR. |
| Le mauvais numéro de table apparaît. | Vérifiez l’affiche et scannez celle de la bonne table avant de commander. |
| Une commande n’a pas reçu de confirmation. | Demandez à la caisse de vérifier si elle est arrivée. Utilisez **Vérifier / réessayer l’envoi** si le bouton apparaît, plutôt que de créer une deuxième commande. |
| Aucun bip ne se fait entendre en cuisine. | Touchez **Activer le bip**, augmentez le volume et gardez SmartResto affiché à l’écran. |
| Un plat reste indisponible. | Vérifiez qu’il est **À la carte** et que son nombre de portions est supérieur à zéro. |
| Un code du personnel est oublié. | Contactez le responsable de l’installation. |

Si le problème persiste, notez le numéro de table et, si possible, celui de la commande. Prenez une photo du message affiché pour la personne qui vous aide.

## 8. Terminer la journée

Vérifiez les commandes restant à servir ou à encaisser, puis imprimez ou téléchargez votre rapport.

Demandez au responsable de l’installation de prévoir une copie régulière des informations du restaurant. Cette copie permettra de les récupérer si l’ordinateur tombe en panne.

Ne coupez pas l’ordinateur principal pendant le service. Pour une mise à jour ou un changement d’ordinateur, faites-vous accompagner afin de conserver les commandes et les codes du personnel.

**À savoir pour cette version :** il n’y a pas encore de bouton pour annuler une commande validée, enregistrer un remboursement ou partager une addition. En cas d’erreur, prévenez le responsable avant de saisir une nouvelle opération.
