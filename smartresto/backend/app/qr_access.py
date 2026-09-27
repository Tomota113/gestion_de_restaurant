"""Persistent, revocable table invitations. Tokens grant client access only."""
import json
import os
import secrets
from pathlib import Path
from fastapi import HTTPException
from .db import connect, one

async def initialize_qr(table_count):
    seed_path = Path(__file__).resolve().parents[2] / 'installation' / 'table-qr-seed.json'
    seed = json.loads(seed_path.read_text()) if seed_path.exists() else {}
    async with connect(True) as db:
        await db.execute('''CREATE TABLE IF NOT EXISTS acces_tables (
            table_num INTEGER PRIMARY KEY CHECK(table_num>0),
            token TEXT NOT NULL UNIQUE, version INTEGER NOT NULL DEFAULT 1
        )''')
        for number in range(1, table_count + 1):
            # Import printed invitations once only. Never overwrite rotated tokens on restart.
            token = seed.get(str(number)) or secrets.token_urlsafe(32)
            await db.execute('INSERT OR IGNORE INTO acces_tables(table_num,token) VALUES (?,?)',(number,token))
        await db.execute('PRAGMA user_version=2')

async def validate_qr_session(session):
    if session and session.get('table_num') is not None:
        table = session['table_num']
        if not 1 <= table <= int(os.getenv('SMARTRESTO_TABLES','20')):
            return False
        async with connect() as db:
            row = await one(db,'SELECT version FROM acces_tables WHERE table_num=?',(table,))
        return bool(row and row['version']==session.get('qr_version'))
    return bool(session)

def enforce_table(session, table_num):
    if session.get('table_num') is not None and session['table_num'] != table_num:
        raise HTTPException(403,'Cette session est réservée à la table du QR code scanné.')
