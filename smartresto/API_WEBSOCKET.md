# Contrat API et WebSocket

Origine unique : `https://smartresto.home.arpa` en exploitation; `http://localhost:8000` pour l’essai serveur. Toutes les routes métier sont sous `/api`. Les montants sont des entiers FCFA, les dates des chaînes ISO 8601 UTC. Bamako est UTC+0.

## Authentification

`POST /api/auth/login` avec `{"role":"client","pin":"CODE_INSTALLATION"}` pose un cookie de session HttpOnly. Rôles : `client`, `cuisine`, `gerant`. La session est utilisée automatiquement par `fetch` et par l’ouverture WebSocket sur la même origine. Aucun jeton n’est inséré dans l’URL du socket.

`GET /api/auth/me` → `{"role":"client","tables":20}`.
`POST /api/auth/logout` supprime le cookie.

Les exemples suivants supposent une session valide. En CLI, conserver les cookies avec `curl -c cookies.txt ...` puis les envoyer avec `curl -b cookies.txt ...`; ne pas inclure un vrai code dans un script publié ou un historique partagé.

## Routes métier

| Méthode | Route relative à `/api` | Rôle | Effet |
|---|---|---|---|
| GET | `/health` | Sans session | Test API/base et heure serveur |
| GET | `/menu` | Tous | Catégories, plats actifs et portions |
| POST | `/categories` | Gérant | Créer une catégorie |
| PUT / DELETE | `/categories/{id}` | Gérant | Renommer / supprimer si non référencée |
| POST | `/plats` | Gérant | Créer un plat avec stock initial zéro |
| PUT / DELETE | `/plats/{id}` | Gérant | Modifier / archiver |
| PATCH | `/plats/{id}/disponibilite` | Gérant | `{"disponible":false}` |
| PUT | `/stocks/{id_plat}` | Gérant | Définir `{"quantite":25}` portions |
| POST | `/commandes` | Client | Création atomique et idempotente |
| GET | `/commandes` | Cuisine, gérant | Commandes non servies ou non payées, toutes dates |
| GET | `/commandes/{id}` | Propriétaire ou personnel | Détail et suivi |
| PATCH | `/commandes/{id}/statut` | Personnel | Transition de préparation/service autorisée |
| POST | `/commandes/{id}/paiement` | Gérant | Enregistrer un règlement reçu |
| POST | `/alertes` | Client | Eau, Addition ou Question |
| GET | `/alertes` | Personnel | Alertes ouvertes |
| PATCH | `/alertes/{id}/resoudre` | Personnel | Marquer traitée |
| GET | `/stats/jour?jour=YYYY-MM-DD` | Gérant | CA payé à cette date, compteur, impayés globaux, détail |
| GET | `/rapports/jour.csv?jour=YYYY-MM-DD` | Gérant | Rapport CSV téléchargeable |

Omettre `jour` pour la date actuelle à Bamako. Le schéma complet des entrées et réponses de validation est accessible sous `/openapi.json`. Les modèles de réponse sont dynamiques dans ce MVP; les exemples ci-dessous précisent leur forme.

### Plat

```json
{
  "categorie_id": 2,
  "nom": "Brochettes de bœuf",
  "description": "Bœuf grillé et frites maison",
  "prix": 4500,
  "photo": "/photos/brochettes.jpg",
  "personnalisable": true,
  "disponible": true
}
```

POST renvoie `{"id":7}`. PUT exige au moins `categorie_id`, `nom`, `prix`; les champs facultatifs omis reprennent leurs valeurs par défaut (remplacement, pas patch partiel).

### Commande

```json
{
  "cle": "d7b0e911-5e23-4a97-b5dc-6cf5df881a47",
  "table_num": 4,
  "items": [
    {
      "plat_id": 3,
      "quantite": 2,
      "cuisson": "À point",
      "sans_piment": true,
      "sans_oignon": false,
      "allergies": "arachides",
      "note": "Sauce à part"
    }
  ]
}
```

Ne pas envoyer de prix, total ou nom : les champs inconnus sont rejetés. `cuisson` vaut `""`, `Saignant`, `À point` ou `Bien cuit`; les choix de cuisson non vides sont autorisés seulement sur les plats personnalisables. Maximum 50 lignes et 50 portions par ligne; toute disponibilité est revérifiée côté serveur.

Réponse 201, également lors d’une répétition valide :

```json
{
  "id": 42,
  "table_num": 4,
  "statut": "en_attente",
  "total": 9000,
  "cree_le": "2026-09-19T12:20:00+00:00",
  "paye_le": null,
  "mode_paiement": null,
  "items": [
    {
      "id": 87,
      "plat_id": 3,
      "nom": "Brochettes de bœuf",
      "prix_unitaire": 4500,
      "quantite": 2,
      "instructions": "Cuisson : À point • SANS PIMENT • ALLERGIES : arachides • Sauce à part"
    }
  ]
}
```

Conserver la même clé ET le même corps pour les nouvelles tentatives après timeout/erreur réseau/503. Une erreur métier de stock 409 ou une validation 422 permet de corriger le panier et de générer une nouvelle clé. Une 409 pour clé déjà utilisée par une autre session ou un autre contenu demande une vérification humaine : ne pas créer automatiquement une nouvelle commande. Une session expirée pendant un envoi incertain impose une vérification à la caisse avant toute nouvelle commande.

### Statut, paiement et alerte

```json
{"statut":"en_cuisson"}
```

Statut suivant uniquement, sauf répétition du statut actuel. `servi` est réservé au gérant.

```json
{"mode":"especes"}
```

Modes possibles : `especes`, `mobile_money`, `carte`. L’API enregistre la réception réelle du paiement; elle ne traite aucune opération bancaire. Appeler deux fois avec le même mode est idempotent; un mode différent après paiement retourne 409.

```json
{"cle":"e7ec0a39-22f4-4db9-9f17-b82de72fe343","table_num":4,"motif":"Eau"}
```

L’alerte renvoie son `id`. Réutiliser la même clé lors d’une répétition incertaine de cette même demande.

## Configuration WebSocket exacte

Endpoint : `/ws/commandes`. URL en HTTP local : `ws://192.168.10.10:8000/ws/commandes`. En HTTPS avec Caddy : `wss://smartresto.home.arpa/ws/commandes`.

Le client doit avoir un cookie valide et envoyer une origine autorisée (automatique dans un navigateur). Une session absente ou une origine incorrecte est refusée. Aucun abonnement anonyme n’est disponible.

```js
const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
const socket = new WebSocket(`${scheme}://${location.host}/ws/commandes`);
socket.onmessage = ({ data }) => {
  const event = JSON.parse(data);
  if (event.type === 'heartbeat') return;
  // Invalider les données concernées et relire l’API avec la session existante.
  refreshFromApi();
};
```

Cet extrait illustre le contrat; l’implémentation complète avec reconnexion se trouve dans `frontend/src/main.jsx`.

| Message JSON `type` | Destinataires | Action client |
|---|---|---|
| `sync` | À chaque ouverture de socket | Relire l’état actuel |
| `heartbeat` | Chaque socket sans événement pendant 20 s | Confirmer la connexion vivante |
| `commande.created` | Cuisine et gérant | Relire commandes; bip si activé |
| `commande.updated` | Cuisine et gérant | Relire commandes |
| `paiement.created` | Cuisine et gérant | Relire commandes/statistiques selon rôle |
| `alerte.created` | Cuisine et gérant | Relire alertes |
| `alerte.updated` | Cuisine et gérant | Relire alertes |
| `menu.changed` | Tous | Relire carte/disponibilités |

Les événements ne contiennent ni détails de commande ni données financières. Les réponses REST appliquent les autorisations. Le client en salle suit sa propre dernière commande par GET authentifié, lors d’une resynchronisation et toutes les 15 secondes; le statut cuisine n’est pas diffusé à toutes les tables.

### Paramètres de fiabilité

- Un seul processus Uvicorn, `--workers 1`; pas de `--reload` en exploitation.
- File de sortie de 64 messages par socket et un seul émetteur asynchrone pour éviter les envois concurrents sur la même connexion.
- Écriture socket limitée à 5 secondes. Client trop lent : fermeture avec code 1013 si la file déborde, puis reconnexion et rattrapage REST.
- Heartbeat applicatif à 20 secondes d’inactivité; fermeture côté navigateur si aucun message reçu pendant plus de 45 secondes.
- Reconnexion exponentielle de 1 à 15 secondes, avec petite variation aléatoire.
- Lecture complète au retour du socket, au focus et toutes les 15 secondes. Aucun historique d’événements en mémoire requis pour réparer l’affichage.
- Événements publiés **après COMMIT**, jamais pendant le verrou d’écriture SQLite.
- La session expire après 12 h; le socket est fermé lors du prochain contrôle de l’émetteur. Une lecture REST 401 fait revenir l’interface à la connexion.
- Les mutations passent exclusivement par REST, avec validation et idempotence. Envoyer un message au socket ne crée aucune commande.

### Proxy et démarrage

```bash
python -m uvicorn app.main:app --app-dir backend --env-file .env \
  --host 127.0.0.1 --port 8000 --workers 1 \
  --proxy-headers --forwarded-allow-ips=127.0.0.1 --ws-max-size 16384
```

Caddy :

```caddyfile
smartresto.home.arpa {
    tls internal
    encode gzip
    reverse_proxy 127.0.0.1:8000
}
```

Caddy relaie automatiquement l’upgrade WebSocket; aucun réglage CORS ni URL cloud à ajouter. Le certificat racine local doit être reconnu par les appareils. Sans proxy, écouter `0.0.0.0` pour un essai LAN HTTP et conserver `SMARTRESTO_SECURE_COOKIE=0`.

## Erreurs à gérer

| Code | Interprétation |
|---|---|
| 401 | Session absente/expirée ou mauvais code de connexion |
| 403 | Rôle ou origine interdit |
| 404 | Ressource absente ou commande non accessible à la session |
| 409 | Stock indisponible, transition incompatible, conflit de clé ou référence |
| 422 | Données invalides, option ou table non autorisée |
| 429 | Limite de tentatives de connexion atteinte |
| 503 | Base momentanément indisponible; réessayer sans changer la clé de commande |

Le succès HTTP d’une création constitue la confirmation utilisateur. Une simple ouverture WebSocket ou l’affichage du panier ne prouve jamais qu’une commande a été enregistrée.

## Ajouts version 0.2 : invitations QR

- `POST /api/auth/table` : corps `{ "table_num": 5, "token": "jeton_du_QR" }`; valide l’invitation et crée une session client attachée à cette table. Aucun code client à saisir.
- `GET /api/auth/me` inclut `table_num` (null pour un accès classique) et `session_id` (identifiant non secret, sans autorité d’authentification).
- `GET /api/qr/tables` : réservé au gérant, liste `{ table_num, token, version }`.
- `POST /api/qr/tables/{numero}/renouveler` : réservé au gérant; remplace le jeton et incrémente sa version. Ancien lien et anciennes sessions QR invalidés.
- Toute commande ou alerte d’une session QR visant une autre table renvoie 403. La révocation est vérifiée sur les routes protégées et à l’ouverture/au contrôle périodique du socket.
- Les QR sont rendus dans le navigateur avec la bibliothèque qrcode empaquetée localement; aucune API QR tierce. Le mot de passe Wi-Fi ne transite pas dans l’API.

Voir `MISE_A_JOUR_QR.md` pour le format des liens, l’impression et les limites des invitations physiques.

## Ajouts version 0.3 : adresse du restaurant

- `GET /api/network` (gérant uniquement) : détecte les IPv4 locales actives sans requête Internet. Renvoie `mode`, `saved_origin`, `origin`, `suggested_origin`, `choices`, `https`. Aucun code de connexion ni mot de passe Wi-Fi n’est retourné.
- `PUT /api/network` (gérant uniquement) : `{ "mode": "auto" }` ou `{ "mode": "manual", "origin": "http://192.168.1.45:8000" }`. Le mode et l’adresse manuelle sont enregistrés en SQLite dans `network_settings`, table additive compatible avec le schéma métier version 2.
- L’écran gérant relit les adresses toutes les 15 secondes, au retour au premier plan et avant un export. Un changement d’adresse ne renouvelle pas les invitations des tables.
- La détection s’exécute hors de la boucle asynchrone. Elle utilise iproute2, avec repli ioctl Linux sans nouvelle dépendance. Aucune configuration système n’est modifiée. HTTPS conserve l’origine du navigateur ; aucune substitution d’IP non couverte par le certificat.
