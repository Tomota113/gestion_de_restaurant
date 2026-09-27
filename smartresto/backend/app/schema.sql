PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS categories (
 id INTEGER PRIMARY KEY, nom TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS plats (
 id INTEGER PRIMARY KEY, categorie_id INTEGER NOT NULL REFERENCES categories(id),
 nom TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', prix INTEGER NOT NULL CHECK(prix>=0),
 photo TEXT NOT NULL DEFAULT '/photos/plat.svg', personnalisable INTEGER NOT NULL DEFAULT 0,
 disponible INTEGER NOT NULL DEFAULT 1, actif INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS stocks (
 plat_id INTEGER PRIMARY KEY REFERENCES plats(id), quantite INTEGER NOT NULL CHECK(quantite>=0)
);
CREATE TABLE IF NOT EXISTS commandes (
 id INTEGER PRIMARY KEY, cle TEXT NOT NULL UNIQUE, empreinte TEXT NOT NULL, session_id TEXT NOT NULL,
 table_num INTEGER NOT NULL CHECK(table_num>0), statut TEXT NOT NULL DEFAULT 'en_attente'
 CHECK(statut IN ('en_attente','en_cuisson','pret','servi')),
 total INTEGER NOT NULL CHECK(total>=0), cree_le TEXT NOT NULL,
 paye_le TEXT, mode_paiement TEXT CHECK(mode_paiement IN ('especes','mobile_money','carte'))
);
CREATE TABLE IF NOT EXISTS items_commande (
 id INTEGER PRIMARY KEY, commande_id INTEGER NOT NULL REFERENCES commandes(id),
 plat_id INTEGER NOT NULL REFERENCES plats(id), nom TEXT NOT NULL, prix_unitaire INTEGER NOT NULL,
 quantite INTEGER NOT NULL CHECK(quantite>0), instructions TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS alertes_serveur (
 id INTEGER PRIMARY KEY, cle TEXT NOT NULL UNIQUE, session_id TEXT NOT NULL,
 table_num INTEGER NOT NULL, motif TEXT NOT NULL CHECK(motif IN ('Eau','Addition','Question')),
 cree_le TEXT NOT NULL, resolue_le TEXT
);
CREATE INDEX IF NOT EXISTS commandes_date ON commandes(cree_le);
CREATE INDEX IF NOT EXISTS commandes_paiement ON commandes(paye_le);
CREATE INDEX IF NOT EXISTS items_parent ON items_commande(commande_id);
-- Schema upgrades are applied by initialize_qr after the base schema.
