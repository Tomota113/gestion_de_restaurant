# SmartResto 0.2 — QR des tables et connexion Wi-Fi

> **Version 0.3 :** consultez d’abord `MISE_A_JOUR_ADRESSE.md`. Les QR sont désormais générés dans la caisse à partir de l’adresse détectée. Les indications ci-dessous concernant les images préfabriquées et l’ancienne adresse sont historiques.

## Ce qui est prêt

- Les 20 QR des tables sont dans `QR_CODES_TABLES/Table-01.png` à `Table-20.png`.
- `QR_CODES_TABLES/AFFICHES-TABLES.html` est une planche imprimable : une page A4 par table, avec QR de commande et consigne pour rejoindre le Wi-Fi.
- Leur adresse cible est **http://192.168.0.112:8000**, d’après le PC Linux utilisé pour cette installation.
- Ils donnent accès au menu et à une session client limitée à la table, sans saisie de code client.
- Le fichier `installation/table-qr-seed.json` contient les invitations correspondant exactement aux images fournies. Il doit être installé avec cette mise à jour. Il n’est jamais servi comme ressource web publique.
- Le QR Wi-Fi ne peut être finalisé sans connaître le nom exact du réseau et son mot de passe. La nouvelle page du gérant le génère dès que vous renseignez ces deux informations sur votre PC. Aucun identifiant Wi-Fi fictif n’est utilisé.

**Installez la version 0.2 avant de scanner ces QR** : la version 0.1 ne traite pas les invitations de table.

## Mise à jour du PC Linux existant

Le projet fourni conserve les codes et les données de votre installation. L’archive ne contient ni `.env` ni `data/`.

1. Télécharger et extraire l’archive dans un nouveau dossier temporaire, distinct du dossier utilisé par votre serveur.
2. Dans le dossier de l’ancien SmartResto, sauvegarder la base :

```bash
.venv/bin/python scripts/backup.py data/smartresto.sqlite3 ../smartresto-avant-qr.sqlite3
```

Choisir un autre nom si la sauvegarde existe déjà. Si `SMARTRESTO_DB` pointe vers un autre chemin, utiliser ce chemin comme source.

3. Arrêter le serveur dans son terminal avec Ctrl+C, ou arrêter son service systemd si vous avez installé le service.
4. Copier depuis le nouveau dossier vers l’ancien dossier SmartResto les dossiers **`backend`**, **`frontend`**, **`installation`**, **`QR_CODES_TABLES`**, **`scripts`** et les documents `.md`. Accepter le remplacement des fichiers de code. **Conserver le `.env`, le dossier `data` et le `.venv` de l’installation existante.** Ne pas remplacer l’ancien dossier complet par un dossier vide.
5. Dans le dossier conservé, mettre les dépendances à niveau si nécessaire :

```bash
.venv/bin/python -m pip install -r backend/requirements.txt
```

Les dépendances backend ne changent pas par rapport à la version 0.1; sur une machine hors ligne où elles sont déjà installées, cette étape n’est pas nécessaire. Le nouveau générateur QR JavaScript est inclus dans le frontend compilé; aucun `npm install` n’est nécessaire pour utiliser la mise à jour.

6. Relancer depuis le même dossier :

```bash
.venv/bin/python -m uvicorn app.main:app --app-dir backend --env-file .env --host 0.0.0.0 --port 8000 --workers 1 --ws-max-size 16384
```

La migration additive ajoute `acces_tables` et passe `PRAGMA user_version` à 2. Les tables métier, prix, stocks, commandes, règlements et codes d’accès existants sont conservés. Une base portant un numéro de version supérieur à 2 est refusée plutôt que rétrogradée.

7. Fermer les anciens onglets/PWA et rouvrir SmartResto. En cas d’ancien écran conservé, faire un rechargement complet du navigateur hors service. L’ancien service worker ne force pas une mise à jour au milieu du service.
8. Connecter le téléphone au même réseau, puis scanner `Table-01.png`. Le menu doit afficher « Table reconnue par QR » et le numéro 01. Aucune saisie du code client n’est nécessaire.

**N’exécutez pas `configure.py` pour remplacer votre configuration existante.** Les codes cuisine et gérant de votre `.env` restent les mêmes.

## Générer les deux QR sur chaque affiche

1. Se connecter à **Caisse & gestion** avec le code gérant habituel.
2. Ouvrir **QR codes & Wi-Fi**.
3. Vérifier l’adresse du serveur : `http://192.168.0.112:8000` pour votre réseau actuel.
4. Cocher **Ajouter le QR de connexion Wi-Fi**.
5. Saisir le nom exact du réseau, son type (WPA/WPA2 personnel ou réseau ouvert), son mot de passe et préciser s’il est masqué.
6. Choisir toutes les tables ou une table, puis **Aperçu**.
7. Cliquer sur **Imprimer les affiches**, ou **Télécharger les affiches** pour conserver un fichier HTML contenant les images et la mise en page. Ouvrir ce fichier permet aussi d’imprimer ou d’enregistrer en PDF depuis le navigateur.
8. Tester les deux scans sur un téléphone avant de distribuer les affiches.

Le nom Wi-Fi et le mot de passe restent uniquement dans la mémoire de cette page; ils ne sont pas envoyés à l’API, sauvegardés en SQLite ou enregistrés dans localStorage. Le mot de passe est nécessairement lisible dans le QR Wi-Fi et dans le fichier d’affiches téléchargé : l’affiche sert à partager l’accès au réseau prévu pour les clients.

Le navigateur n’ouvre pas automatiquement le menu juste après le premier scan Wi-Fi. Le client confirme la connexion, puis scanne le deuxième QR. Selon l’appareil, il peut devoir confirmer qu’il souhaite rester connecté à un Wi-Fi sans Internet.

## Adresses et routeur

Le réseau doit permettre aux téléphones d’atteindre le serveur sur le port 8000 (ou 443 avec HTTPS). Si vous utilisez un réseau invité isolé, autoriser l’accès au serveur SmartResto dans le routeur; l’isolation ne doit pas bloquer ce service.

Réserver `192.168.0.112` au PC par DHCP dans le routeur pour conserver la validité des affiches. Cette réservation dépend du modèle de routeur et n’est pas modifiée par le logiciel. Si vous changez l’adresse ou passez à HTTPS, renseignez la nouvelle origine dans l’écran du gérant et réimprimez les affiches. Les QR ne peuvent pas découvrir une nouvelle adresse du serveur tout seuls.

## Sessions et contrôle de table

Le QR de commande encode `/#table=N&key=JETON_ALEATOIRE`. La partie après `#` est traitée par le navigateur puis envoyée dans le corps d’un POST; elle n’est pas envoyée dans les logs de requête HTTP du chargement de page. Après connexion, le fragment est retiré de la barre d’adresse.

Le serveur transforme l’invitation en cookie HttpOnly signé, rôle `client`, table fixe et version de QR. Les commandes et appels serveur sont vérifiés par rapport à cette table. Modifier manuellement `table_num` dans une requête ne permet pas de commander pour une autre table. Chaque appareil reçoit une session distincte et ne voit que ses propres commandes.

Scanner à nouveau le même QR avec une session valide conserve son identifiant, donc une commande en attente de réponse peut être réessayée sans doublon. Passer à une autre table avec un panier demande confirmation. Un envoi incertain demande une vérification en caisse avant effacement; une session expirée ne permet pas de reprendre automatiquement la propriété d’anciennes commandes.

Le bouton « Remplacer ce QR » de la caisse invalide l’ancien lien et les sessions clients liées à son ancienne version. Réimprimer ensuite la table concernée et inviter les clients à rescanner. Cette opération est à faire hors service. Les jetons renouvelés restent en SQLite : un redémarrage ne réimporte pas les anciens jetons du fichier initial.

Les liens imprimés sont des invitations à la table, pas une preuve cryptographique de présence physique. Une personne disposant du lien et de l’accès réseau peut le réutiliser tant qu’il n’est pas remplacé. Pour un contrôle par service/occupation, prévoir des sessions de table activées et fermées par le personnel dans une prochaine évolution.

Les tablettes appartenant au restaurant peuvent toujours utiliser le code client historique et le sélecteur de table. Les QR ne donnent jamais accès aux rôles cuisine ou gérant.

## Sauvegardes et retours arrière

La nouvelle table `acces_tables` est incluse dans la sauvegarde SQLite existante. Conserver aussi `.env`, les photos, le logiciel et le fichier d’invitations initial. Pour restaurer, suivre la procédure du guide INSTALLATION_ET_MAINTENANCE.md. Un retour à 0.1 nécessite de remettre ensemble la sauvegarde d’avant mise à jour et le logiciel correspondant; les QR de cette version ne fonctionneront alors plus.

## Redistribution

Les invitations initiales sont propres à ce livrable. Pour installer SmartResto dans un **autre restaurant**, générer de nouveaux jetons (ou retirer le fichier d’invitations initial avant la première création de sa base), puis imprimer depuis sa propre caisse. Ne pas réutiliser les QR fournis pour plusieurs établissements.
