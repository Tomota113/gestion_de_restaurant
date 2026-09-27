"""Consistent SQLite online backup, including committed WAL data."""
import argparse
import sqlite3
from pathlib import Path
parser = argparse.ArgumentParser()
parser.add_argument('source')
parser.add_argument('destination')
args = parser.parse_args()
target = Path(args.destination)
if target.exists(): raise SystemExit('Destination existante : choisir un nouveau fichier.')
target.parent.mkdir(parents=True,exist_ok=True)
source = Path(args.source).resolve()
with sqlite3.connect(source.as_uri()+'?mode=ro',uri=True) as src, sqlite3.connect(target) as dst:
    src.backup(dst)
    assert dst.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
print('Sauvegarde vérifiée :',target)
