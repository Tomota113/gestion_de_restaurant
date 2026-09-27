# Validation SmartResto 0.3 — 21 septembre 2026

## Vérifications de cette mise à jour

- **17 tests Python réussis**, dont les 13 tests existants et 4 scénarios supplémentaires pour le réseau : changement d’IP sans modification des invitations ou commandes, réglage partagé et persistant, permissions et adresses refusées, détection sans passerelle avec tri des interfaces.
- **4 tests JavaScript réussis**, dont la conservation de la table et du jeton lors d’un changement d’origine.
- **Compilation React et cache d’application réussis** ; le dossier `frontend/dist` est inclus dans cette archive.
- **Parcours Chromium automatisé réussi** : connexion gérant, mise à jour automatique après un changement d’adresse simulé (intervalle de 15 secondes, sans clic), changement du QR de table, téléchargement des 20 affiches avec la nouvelle adresse, adresse personnalisée conservée après rechargement, retour au mode automatique.
- **Contrôle visuel** du bloc de connexion sur écran large et sur 390 pixels de largeur. Aucun débordement horizontal ni erreur JavaScript détecté pendant ce parcours.

L’environnement de test ne possède aucune interface Wi-Fi de restaurant. Les changements d’adresse du parcours navigateur ont été simulés ; la détection et son tri ont été testés avec des interfaces simulées. Le scan avec un téléphone réel, les règles du routeur, la détection sur le PC Linux du restaurant et l’impression physique restent à vérifier sur place. L’installation HTTPS conserve les contraintes de certificats de la version précédente.

Les données de tests et les captures ne sont pas incluses dans l’archive destinée à l’installation. Aucun mot de passe Wi-Fi réel n’a été fourni ou utilisé.

---

## Historique de validation de la version précédente

# Validation SmartResto 0.2

> **Version 0.3 :** consultez d’abord `MISE_A_JOUR_ADRESSE.md`. Les QR sont désormais générés dans la caisse à partir de l’adresse détectée. Les indications ci-dessous concernant les images préfabriquées et l’ancienne adresse sont historiques.

Vérifications effectuées le 19 septembre 2026. Cette validation logicielle prépare un pilote; les essais sur le réseau et les appareils du restaurant restent nécessaires.

## Résultats

- **13 tests backend réussis** : commande et événements WebSocket, transitions cuisine, paiement unique, CSV, idempotence, concurrence sur la dernière portion, rollback stock, droits/origine, CRUD et conservation de l’historique, alertes, rattrapage/reconnexion et redémarrage.
- Les tests ajoutés pour les QR vérifient la table imposée côté serveur, l’interdiction d’accès aux fonctions du personnel, la conservation de session lors d’un nouveau scan, l’invalidation de l’ancien QR et des sessions après remplacement, la persistance de cette invalidation au redémarrage et la migration v1 → v2 avec conservation des commandes et stocks existants.
- **3 tests JavaScript réussis** : échappement des caractères spéciaux du Wi-Fi, validation des adresses accessibles aux téléphones, construction des liens et échappement HTML des affiches. En l’absence d’informations Wi-Fi, aucun faux QR Wi-Fi n’est ajouté.
- **20 images QR décodées avec un lecteur indépendant (ZXing-C++)** : chaque image renvoie exactement vers `http://192.168.0.112:8000`, le bon numéro de table et son invitation.
- **Compilation React/Vite/PWA réussie**, avec bibliothèque QR incluse localement.
- **Parcours navigateur Chromium automatisé réussi** : ouverture du menu par invitation sans saisie de code, table fixe, personnalisation et création d’une commande, nouveau scan conservant le suivi, connexion gérant, aperçu des QR Wi-Fi/menu et téléchargement des affiches HTML.
- Captures contrôlées : interface client mobile, écran QR du gérant et affiche imprimable. Aucun débordement horizontal sur la largeur mobile de 390 px testée, aucune erreur JavaScript non interceptée pendant ce parcours.
- La version précédente avait également validé le démarrage Uvicorn et le script de sauvegarde SQLite avec `integrity_check`; ce script n’a pas été modifié.

Le rendu des QR dans l’interface utilise SVG, pour une impression nette et sans dépendance au canvas. Les 20 QR préfabriqués inclus sont également disponibles en PNG 1024 × 1024.

## Reproduire les tests inclus

```bash
python -m pip install -r backend/requirements-dev.txt
cd backend
python -m pytest -q
```

```bash
cd frontend
npm ci
npm test
npm run build
```

Python 3.12, Node 24, versions verrouillées dans les fichiers du projet. Un avertissement de dépréciation de l’adaptateur TestClient/AnyIO est présent; il n’affecte pas le résultat des 13 tests.

## À vérifier sur place

- Nom exact du Wi-Fi, mot de passe, confirmation de connexion par scan sur Android et iPhone; réseau joignable même sans Internet.
- Réservation DHCP de l’adresse du PC et absence d’isolation empêchant d’atteindre SmartResto.
- Scan des affiches après impression sur le matériel choisi, taille physique et qualité du papier.
- Installation PWA, certificats HTTPS et veille/réveil sur les tablettes réelles; ces points ne sont pas couverts par le navigateur de développement.
- Bip et volume du KDS, charge cible, coupure électrique, reprise et exercice de restauration sur serveur de secours.

Le mot de passe réel du Wi-Fi n’a pas été communiqué; les affiches fournies contiennent les QR de menu et une instruction de connexion auprès du personnel. L’écran gérant permet de remplacer cette instruction par le véritable QR Wi-Fi après saisie locale.

La réussite du parcours Chromium ne remplace pas la recette iPad/Android ni un test d’impression physique. Les fonctionnalités SaaS multi-établissement, annulations/remboursements et intégrations de paiement ne font pas partie de cette version.
