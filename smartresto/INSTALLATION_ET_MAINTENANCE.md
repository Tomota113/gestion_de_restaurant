# SmartResto — installation et maintenance

> **Version 0.3 :** consultez d’abord `MISE_A_JOUR_ADRESSE.md`. Les QR sont désormais générés dans la caisse à partir de l’adresse détectée. Les indications ci-dessous concernant les images préfabriquées et l’ancienne adresse sont historiques.

Application locale de prise de commandes pour un restaurant à Bamako : FastAPI asynchrone, SQLite, React/Vite, Tailwind, Lucide, PWA et WebSockets. Version 0.3.0, livrée avec sources, frontend compilé, tests et configuration de déploiement.

**Fonctionne sans Internet en exploitation.** Le serveur et les tablettes doivent rester reliés au réseau local. La préparation initiale des dépendances nécessite Internet sur une machine de préparation, ou un kit d’installation constitué à l’avance. Aucun CDN, police distante, service de paiement, licence en ligne ou API externe n’est appelé par l’application.

Ce livrable est un MVP exécutable à qualifier sur place avant exploitation professionnelle. Le plan d’industrialisation se trouve dans `PLAN_IMPLEMENTATION.md`; les limites concrètes sont listées plus bas.

## Mise à jour QR et Wi-Fi

**Déjà installé ? Lire `MISE_A_JOUR_QR.md` avant de remplacer les fichiers.** Les codes et les données existants doivent être conservés. Vingt QR de tables et leurs affiches sont prêts dans `QR_CODES_TABLES/`, pour `http://192.168.0.112:8000` après installation de cette version.

Les nouveaux clients scannent le QR de leur table et accèdent directement au menu. Le gérant dispose de **QR codes & Wi-Fi** pour renseigner son réseau, générer les deux QR sur chaque affiche, télécharger les QR en SVG et remplacer un lien. Le code client historique est conservé pour les tablettes du restaurant uniquement.

## 1. Démarrage rapide

Prérequis : Python 3.12 recommandé; Node 22.12+ si vous reconstruisez le frontend. Le dossier `frontend/dist` est déjà fourni : **Node n’est pas nécessaire pour démarrer le serveur avec cette version compilée**.

Depuis le dossier `smartresto` extrait de l’archive, sous Linux/macOS :

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
python scripts/configure.py
python -m uvicorn app.main:app --app-dir backend --env-file .env --host 0.0.0.0 --port 8000 --workers 1 --ws-max-size 16384
```

Sous Windows PowerShell :

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
.\.venv\Scripts\python.exe scripts\configure.py
.\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --env-file .env --host 0.0.0.0 --port 8000 --workers 1 --ws-max-size 16384
```

1. Lire les trois codes générés dans `.env` sur le serveur, sans les publier.
2. Sur le serveur, ouvrir `http://localhost:8000`.
3. Sur une tablette connectée au Wi-Fi du restaurant, ouvrir par exemple `http://192.168.10.10:8000`, en remplaçant l’adresse par celle du serveur.
4. Choisir l’espace « À votre table », « Cuisine » ou « Caisse & gestion » et saisir son code correspondant. La caisse peut aussi afficher la cuisine.
5. Sur la tablette client, sélectionner une table et commander. Sur le KDS, toucher **Activer le bip** une fois pour autoriser le son.
6. La caisse confirme le service et enregistre le règlement après réception réelle des espèces ou confirmation sur le terminal de paiement externe.

Le premier démarrage crée `data/smartresto.sqlite3`, 3 catégories et 6 plats de démonstration avec 50 portions chacun. Les visuels fournis sont des **illustrations de remplacement**, pas des photographies de plats réels.

Le HTTP convient à un essai sur un LAN de confiance. Pour installer la PWA sur tablette et protéger les codes/sessions, suivre la configuration HTTPS ci-dessous. `localhost` bénéficie d’une exception de contexte sécurisé sur la machine serveur; une adresse IP distante en HTTP n’en bénéficie pas.

## 2. Organisation

```text
smartresto/
  README.md
  PLAN_IMPLEMENTATION.md
  API_WEBSOCKET.md
  VALIDATION.md
  backend/
    requirements.txt
    requirements-dev.txt
    requirements-tested-linux-py312.txt
    app/
      main.py       # Routes REST, WebSocket, autorisations, rapports
      db.py         # Connexions async, transactions, données de démonstration
      schema.sql    # Tables, contraintes, index, version initiale
      models.py     # Validation des entrées et limites
      security.py   # Sessions signées, rôles, contrôle Origin
      realtime.py   # File bornée par socket, diffusion par rôle
    tests/test_flows.py
  frontend/
    src/main.jsx    # Client, cuisine, caisse et éditeur de carte
    src/api.js      # Appels REST avec délai et identifiants de requête
    src/styles.css
    public/        # Manifest, icônes, illustrations et photos locales
    dist/          # Application compilée et service worker
    build-sw.mjs   # Précache versionné des ressources locales
    package.json
    package-lock.json
  deploy/          # Caddy, systemd, sauvegarde quotidienne
  scripts/         # Configuration et sauvegarde SQLite cohérente
```

## 3. Configuration

| Variable | Utilisation |
|---|---|
| `SMARTRESTO_SECRET` | Secret de signature, au moins 32 caractères; généré aléatoirement. |
| `SMARTRESTO_CLIENT_PIN` | Code de connexion pour tablettes en salle; au moins 8 caractères. |
| `SMARTRESTO_CUISINE_PIN` | Code distinct pour le KDS. |
| `SMARTRESTO_GERANT_PIN` | Code distinct pour caisse et gestion. |
| `SMARTRESTO_TABLES` | Nombre de tables, 20 par défaut; conserver une valeur entre 1 et 200. |
| `SMARTRESTO_DB` | Chemin de la base, `data/smartresto.sqlite3` par défaut, relatif au répertoire de lancement. |
| `SMARTRESTO_SECURE_COOKIE` | `1` en HTTPS, `0` uniquement pour les essais HTTP locaux. |
| `SMARTRESTO_ORIGINS` | Exceptions d’origine séparées par des virgules, réservées au développement; vide en exploitation. |

Les codes d’installation sont partagés par rôle dans ce MVP. Les sessions ont une durée de 12 heures, avec cookie HttpOnly, SameSite Strict et signature HMAC-SHA256. Un client ne peut ni lire les commandes d’autres sessions, ni modifier les prix, ni accéder au CA. Le code gérant doit rester réservé au personnel autorisé. La connexion est limitée à 10 tentatives/minute/adresse source, réussies comprises.

Changer le secret et redémarrer invalide toutes les sessions. Changer uniquement un code n’invalide pas les sessions déjà émises. La déconnexion supprime le cookie du navigateur; il n’y a pas encore de registre de révocation centralisée. Avant commercialisation : comptes individuels, révocation, permissions affinées et journal d’audit, conformément au plan.

## 4. Réseau local et HTTPS/PWA

Architecture conseillée : mini-PC Linux avec SSD relié en Ethernet à un routeur Wi-Fi dédié. Réserver son adresse par DHCP, par exemple `192.168.10.10`. Les tablettes, le KDS et la caisse accèdent au même serveur. Éviter l’isolation Wi-Fi qui empêche les appareils d’atteindre le serveur. Sur un réseau public partagé, séparer le réseau du restaurant et le réseau des visiteurs.

Le serveur peut fonctionner sur batterie/onduleur avec le routeur. Internet peut être débranché; couper l’alimentation du serveur ou le Wi-Fi interrompt les commandes. Aucun système logiciel ne remplace cette disponibilité matérielle.

### Déploiement Linux avec Caddy

Installer Python et Caddy sur la machine de préparation ou fournir leurs paquets hors ligne. Les commandes ci-dessous sont à adapter avec un compte administrateur de la machine cible.

1. Copier le projet dans `/opt/smartresto`.
2. Créer un compte système `smartresto`, le dossier `data` et `/var/backups/smartresto`; donner leur propriété à ce compte.
3. Créer `/opt/smartresto/.venv`, installer les dépendances et générer `.env`. Protéger `.env` en mode `600`, propriétaire `smartresto`.
4. Configurer le DNS du routeur : `smartresto.home.arpa` → adresse IP LAN du serveur. Un fichier hosts sur le serveur seul ne suffit pas pour les tablettes.
5. Utiliser `deploy/Caddyfile`. Caddy écoute le port 443, fournit un certificat signé par sa propre autorité locale et relaie HTTP ainsi que les WebSockets vers `127.0.0.1:8000`. Il ne demande aucun certificat public.
6. Copier `deploy/smartresto.service` dans `/etc/systemd/system/`; le service doit fonctionner avec **un seul worker**.
7. Mettre `SMARTRESTO_SECURE_COOKIE=1` dans `.env` pour cohérence avec le service.
8. Recharger systemd et activer le service :

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now smartresto
sudo systemctl status smartresto
```

9. Installer sur chaque tablette le **certificat racine public** de l’autorité Caddy de cette installation. Son emplacement dépend du répertoire de données et du compte système de Caddy; avec son service Linux habituel, chercher dans son répertoire de données `pki/authorities/local/root.crt`. Ne jamais distribuer les clés privées.
10. Sur iPad : installer le profil de certificat puis activer la confiance complète pour cette racine dans les réglages des certificats. Sur Android : installer la CA utilisateur dans les paramètres de sécurité; vérifier le navigateur et les éventuelles restrictions de gestion de l’appareil.
11. Vérifier `https://smartresto.home.arpa` sans avertissement de certificat sur chaque tablette, puis installer depuis le navigateur : « Ajouter à l’écran d’accueil » sur iPad ou « Installer l’application » sur Android selon le navigateur.
12. Ouvrir chaque écran et charger la carte une première fois. Vérifier le son avec l’application au premier plan; les restrictions du système mobile restent applicables.

Le serveur HTTP n’est alors exposé que sur la boucle locale. Autoriser le port 443 sur le pare-feu LAN. Ne pas exposer cette version directement à Internet. Lancer Caddy et le service une première fois avant la livraison du système hors ligne pour créer les certificats et vérifier leur confiance. Ne pas contourner les avertissements de certificat pour prétendre que la PWA est installable.

### Stratégie de cache

Le service worker précache HTML, JS, CSS, icônes et visuels présents dans `dist`. Les ressources sont servies localement; les appels `/api/*`, les écritures et les WebSockets ne sont **jamais** mis en cache. Une nouvelle version de cache s’active après fermeture des anciens onglets, pour éviter un rechargement forcé pendant le service.

Le panier est conservé dans localStorage. Une commande n’est présentée comme reçue qu’après réponse de l’API. Si la réponse est perdue, le contenu envoyé et sa clé UUID restent figés; « Vérifier / réessayer l’envoi » utilise la même clé. Aucune commande n’est expédiée automatiquement après une coupure. Si le serveur lui-même est inaccessible, le shell PWA peut s’ouvrir après un premier chargement, mais l’authentification et le menu nécessitent le serveur; aucun mode autonome de prise de commandes sans serveur n’est promis.

## 5. Carte, photos et stocks

Dans la caisse, « Carte & stocks » permet d’ajouter/modifier/archiver des plats, créer/renommer/supprimer des catégories, changer un prix, définir des portions et basculer une rupture en un geste. Les suppressions de plats sont des archivages : les anciennes lignes de commandes gardent leurs prix et noms. Une catégorie référencée, même par un plat archivé, ne peut pas être supprimée.

Le stock est exprimé en **portions vendables par plat**. Il diminue à la validation, dans la même transaction que la commande. Le bouton « À la carte / En rupture » est indépendant du compteur : remettre un plat à la carte avec zéro portion ne le rend pas commandable. Un nouveau plat commence avec zéro portion.

Pour des photos réelles, copier par exemple `yassa.jpg` dans `frontend/public/photos/`, renseigner `/photos/yassa.jpg` dans l’éditeur du plat, puis reconstruire. Les chemins distants sont refusés pour garantir l’autonomie. Ce MVP ne propose pas d’upload par l’interface. Une modification directe de `dist/photos` seule ne régénère pas le précache; toujours refaire le build.

La gestion d’ingrédients, recettes, unités, pertes et mouvements d’inventaire est prévue dans la phase suivante. Signaler une allergie ne garantit pas automatiquement qu’une recette convient : les informations sont surlignées pour traitement par le personnel.

## 6. Développement et reconstruction

```bash
cd frontend
npm ci
npm run build
```

Redémarrer FastAPI après une nouvelle compilation, puis fermer/réouvrir les PWA au moment choisi pour la mise à jour. Le frontend est servi par FastAPI sur la même origine : aucun CORS permissif n’est nécessaire.

Développement avec rafraîchissement Vite : démarrer FastAPI comme précédemment et, dans un autre terminal, exécuter `npm run dev` depuis `frontend`. Le proxy Vite relaie `/api` et `/ws`. Ouvrir `http://localhost:5173`; utiliser HTTP et `SMARTRESTO_SECURE_COOKIE=0` pour ce seul environnement. Le service worker n’est enregistré qu’en build de production.

Les versions directes sont fixées; `package-lock.json` fige npm. `requirements-tested-linux-py312.txt` décrit l’environnement Python exact utilisé pour validation, y compris les outils de test et uvloop; il est destiné à Linux/Python 3.12. Pour Windows utiliser `requirements.txt` ou générer un verrou propre à cette plateforme. Une revue des mises à jour et des dépendances reste nécessaire avant déploiement commercial.

### Préparer une installation sans Internet

Sur une machine connectée **avec le même OS, la même architecture et la même version Python que le serveur cible** :

```bash
python -m pip download --only-binary=:all: --dest wheelhouse -r backend/requirements.txt
```

Emporter `wheelhouse/`, le projet compilé, l’installateur Python adapté, les paquets Caddy et leurs dépendances système. Sur la machine cible, après création du venv :

```bash
python -m pip install --no-index --find-links wheelhouse -r backend/requirements.txt
```

Le wheelhouse et les installateurs ne sont pas inclus dans cette archive : leur préparation dépend du matériel cible. Le frontend compilé, lui, est inclus.

## 7. Rapports, encaissements et sauvegardes

Le CA représente la somme des commandes encaissées à la date de paiement, de 00:00 inclus à 00:00 exclus le lendemain, heure UTC/Bamako. Les montants sont des entiers FCFA. Les impayés incluent les commandes de toutes les dates. Un second clic de règlement avec le même mode ne double pas le CA; un mode différent est refusé.

« Mobile Money » signifie ici **enregistrer un règlement confirmé manuellement**. Aucune transaction opérateur n’est déclenchée. L’impression utilise la boîte de dialogue du navigateur, avec une feuille de style dédiée; le CSV utilise un séparateur point-virgule et un BOM UTF-8. Il s’agit d’un rapport de gestion, sans certification fiscale ni clôture comptable immuable.

Sauvegarde cohérente à chaud, depuis la racine du projet :

```bash
python scripts/backup.py data/smartresto.sqlite3 backups/service-2026-09-19.sqlite3
```

Ne pas copier simplement le fichier principal pendant le service : des transactions validées peuvent encore se trouver dans le WAL. Le script utilise l’API de sauvegarde SQLite et vérifie l’intégrité. Les fichiers de sauvegarde doivent être transférés régulièrement sur un support distinct; les modèles `deploy/smartresto-backup.*` permettent une exécution chaque jour à 04:00 UTC après configuration du répertoire cible. La rétention et le transfert USB sont à organiser sur site.

Restauration : arrêter SmartResto, conserver la base actuelle et ses fichiers `-wal`/`-shm` ensemble dans un dossier d’archive, placer la sauvegarde vérifiée sous `data/smartresto.sqlite3` sans anciens fichiers WAL/SHM à côté, rétablir les droits puis redémarrer. Faire un exercice de restauration avant mise en service. Sauvegarder aussi les photos, la configuration et la version applicative; le script ne sauvegarde que la base.

## 8. Tests

```bash
python -m pip install -r backend/requirements-dev.txt
cd backend
python -m pytest -q
```

Voir `VALIDATION.md` pour les vérifications réalisées et les essais matériels à conduire. L’API OpenAPI est disponible en JSON sous `/openapi.json`; les interfaces Swagger/ReDoc utilisant des CDN ont été désactivées.

## 9. Limites de cette version

- Un établissement et un serveur; pas encore de portail SaaS multi-tenant, abonnement, synchronisation cloud ou mises à jour signées.
- Un worker Uvicorn; le hub WebSocket est en mémoire. Les commandes, stocks et règlements restent persistants dans SQLite.
- Authentification initiale par codes partagés, sans comptes individuels ni audit exhaustif.
- Pas d’annulation, remboursement, paiement fractionné, regroupement d’additions ou modification d’une commande validée; ne pas bricoler ces opérations directement en base en exploitation.
- Stocks en portions; pas de suivi des ingrédients ou d’historique des ajustements.
- Pas d’intégration de paiement ou d’impression thermique silencieuse/ESC-POS.
- Illustrations de démonstration; les photos du restaurant doivent être ajoutées localement.
- Migration additive 1 → 2 fournie pour les invitations QR; versions futures non prises en charge. Sauvegarder avant chaque évolution.
- PWA et son testés dans l’environnement décrit dans `VALIDATION.md`; qualification Android/iPad, veille, réseau et panne électrique à effectuer sur le matériel réel.

## Références techniques

- [FastAPI — WebSockets](https://fastapi.tiangolo.com/advanced/websockets/) : endpoint, gestion des connexions et limites d’un gestionnaire en mémoire.
- [SQLite — WAL](https://www.sqlite.org/wal.html) : lectures concurrentes, sérialisation des écritures et contraintes de sauvegarde.
- [MDN — Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API) : contexte sécurisé et cache d’application.
