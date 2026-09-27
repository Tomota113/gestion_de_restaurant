"""Generate private, unique installation credentials; never overwrite an existing .env."""
from pathlib import Path
import secrets
root = Path(__file__).resolve().parents[1]
path = root / '.env'
if path.exists():
    raise SystemExit('.env existe déjà : conservé. Modifiez-le manuellement si nécessaire.')
with path.open('x') as f:
    f.write('SMARTRESTO_SECRET='+secrets.token_hex(32)+'\n')
    for role in ('CLIENT','CUISINE','GERANT'):
        f.write(f'SMARTRESTO_{role}_PIN={secrets.token_hex(5)}\n')
    f.write('SMARTRESTO_TABLES=20\nSMARTRESTO_SECURE_COOKIE=0\n')
path.chmod(0o600)
print('Configuration créée dans .env. Les trois codes servent à connecter les tablettes.')
