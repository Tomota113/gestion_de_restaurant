# SmartResto 0.3 — Connexion au téléphone et adresse automatique

## Ce qui change

Plus besoin de taper `hostname -I` ni de recopier l’adresse du PC sur le téléphone.

1. Sur le **PC qui fait fonctionner SmartResto**, ouvrez `OUVRIR_SMARTRESTO.html` avec votre navigateur. Vous pouvez mettre ce fichier sur le bureau. Il contient un bouton vers **http://localhost:8000** : cette adresse reste valable sur ce PC même quand son Wi-Fi change.
2. Connectez-vous à **Caisse & gestion** avec votre code habituel.
3. Ouvrez **QR codes & Wi-Fi**.
4. Connectez le téléphone au Wi-Fi du restaurant et **scannez le QR « Ouvrir SmartResto »** affiché sur le PC.

Le raccourci ouvre SmartResto ; il ne démarre pas le serveur. L’ordinateur principal, SmartResto et le routeur doivent rester allumés. Le fichier fourni vise le démarrage habituel sur le port 8000. Pour une installation HTTPS, utilisez le favori installé par votre technicien.

Le QR d’ouverture affiche l’accueil. Le personnel garde ses codes de connexion. Pour commander directement sans code, les clients scannent les **QR propres à leur table**, disponibles plus bas dans le même écran.

## Si l’adresse du PC change

Le mode **Adresse automatique** est activé au départ. Tant que l’écran reste ouvert sur le PC, il vérifie les adresses toutes les 15 secondes et à son retour au premier plan. Vous pouvez aussi toucher **Actualiser les adresses**.

- Le QR d’ouverture et l’aperçu du QR de table sont recalculés avec la nouvelle adresse.
- Les boutons **Imprimer les affiches**, **Télécharger les affiches** et **QR en SVG** relisent l’adresse actuelle avant de préparer leur fichier.
- Les numéros de table, les accès existants, les commandes et les codes du personnel sont conservés.
- L’ancien réglage d’adresse conservé dans le navigateur n’est plus utilisé.

**Une affiche imprimée ou un fichier déjà téléchargé ne peut pas changer tout seul.** Après un changement d’adresse, refaites les affiches et remplacez les anciennes. Les téléphones qui avaient encore l’ancienne page ouverte doivent scanner le nouveau QR. Si une commande attendait une confirmation, vérifiez-la à la caisse avant de la ressaisir.

Si vous changez aussi de Wi-Fi, saisissez son nouveau nom et son mot de passe pour refaire le QR Wi-Fi. SmartResto ne récupère pas le mot de passe automatiquement.

## Si plusieurs adresses sont proposées

Ouvrez **Choisir une autre adresse**, puis touchez **Utiliser cette adresse** à côté de celle qui fonctionne avec votre téléphone. Le choix est enregistré pour le restaurant et partagé avec les autres appareils de la caisse à leur prochaine actualisation.

Un choix manuel reste inchangé jusqu’à votre prochaine modification. Pour suivre à nouveau les changements du réseau, touchez **Utiliser l’adresse automatique**.

La détection liste les connexions du PC. Elle privilégie une connexion non virtuelle, puis la connexion par défaut. Elle ne peut pas garantir que le téléphone a accès à cette connexion. Un VPN, un réseau invité isolé, un pare-feu ou plusieurs cartes réseau peuvent nécessiter de choisir une autre adresse ou d’adapter le routeur.

Sans adresse détectée, aucun faux QR n’est généré. Vérifiez le réseau, actualisez ou renseignez une adresse personnalisée. En HTTPS, le nom actuel est conservé pour respecter le certificat ; les adresses IP ne sont pas substituées automatiquement.

## Garder les mêmes affiches dans la durée

Pour un restaurant installé à un endroit fixe, faites **réserver l’adresse du PC dans le routeur**. Cette opération garde la même adresse sur ce réseau et évite de réimprimer à chaque redémarrage.

Un nom local stable peut aussi être renseigné dans **Adresse personnalisée**, à condition que le réseau soit déjà configuré pour que tous les téléphones le reconnaissent. Écrire `smartresto.local` ne crée pas ce fonctionnement. Cette mise à jour ne modifie ni le routeur, ni le nom du PC, ni les certificats.

## Installer la mise à jour sous Linux

Faites la mise à jour hors service.

1. Téléchargez et extrayez la nouvelle archive dans un dossier différent du dossier actuellement utilisé.
2. Sauvegardez la base depuis le dossier SmartResto existant :

```bash
.venv/bin/python scripts/backup.py data/smartresto.sqlite3 ../smartresto-avant-adresse.sqlite3
```

Choisissez un nouveau nom de sauvegarde si ce fichier existe déjà. Si votre base est à un autre emplacement, utilisez cet emplacement comme source.

3. Arrêtez SmartResto dans son terminal avec **Ctrl+C**, ou arrêtez son service si vous utilisez le démarrage automatique.
4. Copiez les nouveaux dossiers **backend**, **frontend**, **scripts**, **installation**, ainsi que les documents `.md` et **OUVRIR_SMARTRESTO.html**, dans votre dossier SmartResto existant. Acceptez le remplacement des fichiers du logiciel.
5. **Conservez votre fichier `.env`, votre dossier `data` et votre dossier `.venv`. Ne relancez pas `configure.py`.** Les dépendances Python ne changent pas depuis la version 0.2 et l’interface compilée est incluse : pas besoin de reconstruire le logiciel.
6. Relancez depuis le dossier SmartResto conservé :

```bash
.venv/bin/python -m uvicorn app.main:app --app-dir backend --env-file .env --host 0.0.0.0 --port 8000 --workers 1 --ws-max-size 16384
```

Si vous utilisiez déjà un service et HTTPS, redémarrez ce service avec sa configuration habituelle.

7. Fermez les anciens onglets SmartResto, rouvrez l’application puis, si l’ancien écran reste affiché, rechargez complètement la page avec **Ctrl+Maj+R** sur le PC.
8. Ouvrez **Caisse & gestion → QR codes & Wi-Fi**, scannez le nouveau QR avec votre téléphone et refaites les affiches.

Les anciennes images du dossier `QR_CODES_TABLES` étaient prévues pour `192.168.0.112`. **Ne les réutilisez pas sur votre nouveau réseau.** Cette version fournit les QR à partir de l’application, avec l’adresse actuelle.

La mise à jour ajoute une petite table de réglages à la base existante. Elle ne change pas les commandes ni les invitations des tables. La sauvegarde habituelle inclut aussi ce nouveau réglage.
