import os
from contextlib import asynccontextmanager
from pathlib import Path
import aiosqlite

DB_PATH = Path(os.getenv('SMARTRESTO_DB', 'data/smartresto.sqlite3'))

@asynccontextmanager
async def connect(write=False):
    db = await aiosqlite.connect(DB_PATH, timeout=10)
    db.row_factory = aiosqlite.Row
    await db.execute('PRAGMA foreign_keys=ON')
    await db.execute('PRAGMA synchronous=FULL')
    await db.execute('PRAGMA busy_timeout=10000')
    try:
        if write:
            await db.execute('BEGIN IMMEDIATE')
        yield db
        if write:
            await db.commit()
    except BaseException:
        if write:
            await db.rollback()
        raise
    finally:
        await db.close()

async def one(db, sql, args=()):
    async with db.execute(sql, args) as cursor:
        row = await cursor.fetchone()
        return dict(row) if row else None

async def all_rows(db, sql, args=()):
    async with db.execute(sql, args) as cursor:
        return [dict(r) for r in await cursor.fetchall()]

async def initialize():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    async with connect() as db:
        version = await one(db,'PRAGMA user_version')
        if version['user_version'] > 2:
            raise RuntimeError('Base créée par une version plus récente. Ne pas rétrograder.')
        await db.executescript(Path(__file__).with_name('schema.sql').read_text())
    async with connect(True) as db:
        if not await one(db, 'SELECT id FROM categories LIMIT 1'):
            await db.executemany('INSERT INTO categories(id,nom) VALUES (?,?)',
                                [(1,'Signatures'), (2,'Grillades'), (3,'Boissons')])
            await db.executemany('INSERT INTO plats(id,categorie_id,nom,description,prix,personnalisable) VALUES (?,?,?,?,?,?)', [
                (1,1,'Poulet yassa','Poulet mariné au citron, oignons fondants et riz parfumé.',3500,0),
                (2,1,'Mafé de bœuf','Sauce onctueuse aux arachides, légumes et riz blanc.',4000,0),
                (3,2,'Brochettes de bœuf','Bœuf grillé, frites maison et légumes de saison.',4500,1),
                (4,2,'Capitaine braisé','Poisson braisé, citron et accompagnement du jour.',6500,0),
                (5,3,'Bissap maison','Infusion fraîche de fleurs d’hibiscus.',1000,0),
                (6,3,'Jus de gingembre','Gingembre frais, citron et une touche de sucre.',1000,0)])
            await db.executemany('INSERT INTO stocks VALUES (?,?)', [(i,50) for i in range(1,7)])
