import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from fastapi import HTTPException, Request

COOKIE = 'smartresto_session'

def settings():
    secret = os.getenv('SMARTRESTO_SECRET', '')
    pins = {r: os.getenv(f'SMARTRESTO_{r.upper()}_PIN', '') for r in ('client','cuisine','gerant')}
    if len(secret) < 32 or any(len(p) < 8 for p in pins.values()) or len(set(pins.values())) != 3:
        raise RuntimeError('Exécuter scripts/configure.py : secret >=32 caractères et trois codes distincts >=8 caractères requis.')
    return secret, pins

def issue(role, *, table_num=None, qr_version=None, sid=None):
    secret, _ = settings()
    payload = base64.urlsafe_b64encode(json.dumps({'role':role,'sid':sid or secrets.token_hex(16),'exp':int(time.time())+43200, 'table_num':table_num, 'qr_version':qr_version}).encode()).decode()
    signature = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return payload + '.' + signature

def decode(token):
    try:
        payload, signature = (token or '').split('.')
        expected = hmac.new(settings()[0].encode(), payload.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            return None
        data = json.loads(base64.urlsafe_b64decode(payload))
        if data['exp'] <= time.time() or data['role'] not in ('client','cuisine','gerant'):
            return None
        return data
    except (ValueError, KeyError, TypeError):
        return None

def require(*roles):
    async def dependency(request: Request):
        session = decode(request.cookies.get(COOKIE))
        from .qr_access import validate_qr_session
        if not session or not await validate_qr_session(session):
            raise HTTPException(401, 'Connexion requise')
        if session['role'] not in roles:
            raise HTTPException(403, 'Accès interdit pour ce rôle')
        return session
    return dependency

def valid_origin(origin, host):
    # Same-origin in production; explicit exceptions only for local Vite development.
    allowed = {f'http://{host}', f'https://{host}'}
    allowed.update(x.strip() for x in os.getenv('SMARTRESTO_ORIGINS','').split(',') if x.strip())
    return origin in allowed
