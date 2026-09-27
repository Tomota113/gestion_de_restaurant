import asyncio
import anyio
import csv
import hashlib
import hmac
import io
import json
import os
import sqlite3
import secrets
import time
from contextlib import asynccontextmanager
from datetime import datetime, date, timedelta, timezone
from pathlib import Path
from fastapi import FastAPI, Depends, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from .db import connect, initialize, one, all_rows
from .models import Login, Category, Dish, Stock, Availability, Order, Status, Payment, Alert, TableLogin
from .security import COOKIE, settings, issue, decode, require, valid_origin
from .realtime import hub
from .qr_access import initialize_qr, enforce_table, validate_qr_session
from .network_access import router as network_router, initialize_network

client_role = require('client')
staff_role = require('cuisine','gerant')
manager_role = require('gerant')
any_role = require('client','cuisine','gerant')
TABLE_COUNT = int(os.getenv('SMARTRESTO_TABLES', '20'))
DIST = Path(__file__).resolve().parents[2] / 'frontend' / 'dist'
login_attempts = {}

def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')

def check_table(n):
    if n > TABLE_COUNT:
        raise HTTPException(422, 'Table inexistante')

@asynccontextmanager
async def lifespan(app):
    settings()
    if not 1 <= TABLE_COUNT <= 200:
        raise RuntimeError('SMARTRESTO_TABLES doit être compris entre 1 et 200.')
    await initialize()
    await initialize_qr(TABLE_COUNT)
    await initialize_network()
    yield

app = FastAPI(title='SmartResto', version='0.3.0', lifespan=lifespan,
              docs_url=None, redoc_url=None)  # No Swagger CDN dependency; OpenAPI JSON remains available.
app.include_router(network_router)

@app.middleware('http')
async def same_origin(request: Request, call_next):
    if request.method not in ('GET','HEAD','OPTIONS'):
        origin = request.headers.get('origin')
        if origin and not valid_origin(origin, request.headers.get('host','')):
            return JSONResponse({'detail':'Origine interdite'}, status_code=403)
    response = await call_next(request)
    if request.url.path.startswith('/api/') or request.url.path in ('/','/sw.js'):
        response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Referrer-Policy'] = 'same-origin'
    return response

@app.exception_handler(sqlite3.IntegrityError)
async def integrity_error(request, exc):
    return JSONResponse({'detail':'Conflit : nom existant ou référence invalide.'}, status_code=409)

@app.exception_handler(sqlite3.OperationalError)
async def busy_error(request, exc):
    return JSONResponse({'detail':'Base temporairement indisponible. Réessayez avec la même demande.'}, status_code=503)

@app.get('/api/health')
async def health():
    async with connect() as db:
        await one(db, 'SELECT 1 AS ok')
    return {'ok':True, 'heure':now()}

@app.post('/api/auth/login')
async def login(body: Login, request: Request, response: Response):
    ip = request.client.host if request.client else 'local'
    current = time.monotonic()
    # Bound memory and apply a 10-attempt rolling minute window per source address.
    for key in list(login_attempts):
        login_attempts[key] = [t for t in login_attempts[key] if current-t < 60]
        if not login_attempts[key]:
            del login_attempts[key]
    attempts = login_attempts.setdefault(ip, [])
    if len(attempts) >= 10:
        raise HTTPException(429, 'Trop de tentatives. Réessayez dans une minute.')
    attempts.append(current)
    if not hmac.compare_digest(body.pin.encode(), settings()[1][body.role].encode()):
        raise HTTPException(401, 'Code incorrect')
    response.set_cookie(COOKIE, issue(body.role), httponly=True, samesite='strict',
                        secure=os.getenv('SMARTRESTO_SECURE_COOKIE','0')=='1', max_age=43200)
    return {'role':body.role}

@app.post('/api/auth/logout')
async def logout(response: Response):
    response.delete_cookie(COOKIE)
    return {'ok':True}

@app.get('/api/auth/me')
async def me(session=Depends(any_role)):
    return {'role':session['role'], 'tables':TABLE_COUNT, 'table_num':session.get('table_num'), 'session_id':session['sid']}


@app.post('/api/auth/table')
async def table_login(body:TableLogin, request:Request, response:Response):
    check_table(body.table_num)
    async with connect() as db:
        row = await one(db,'SELECT * FROM acces_tables WHERE table_num=?',(body.table_num,))
    if not row or not hmac.compare_digest(row['token'],body.token):
        raise HTTPException(403,'QR code invalide ou remplacé. Scannez celui présent sur votre table.')
    previous = decode(request.cookies.get(COOKIE))
    # A repeated scan must not change the owner of pending/idempotent orders.
    sid = None
    if (previous and previous['role']=='client' and previous.get('table_num')==body.table_num
            and previous.get('qr_version')==row['version']):
        sid = previous['sid']
    response.set_cookie(COOKIE, issue('client',table_num=body.table_num,qr_version=row['version'],sid=sid),
        httponly=True,samesite='strict',secure=os.getenv('SMARTRESTO_SECURE_COOKIE','0')=='1',max_age=43200)
    return {'ok':True, 'table_num':body.table_num}

@app.get('/api/qr/tables')
async def qr_tables(session=Depends(manager_role)):
    async with connect() as db:
        return await all_rows(db,'SELECT table_num,token,version FROM acces_tables WHERE table_num<=? ORDER BY table_num',(TABLE_COUNT,))

@app.post('/api/qr/tables/{table_num}/renouveler')
async def rotate_qr(table_num:int, session=Depends(manager_role)):
    check_table(table_num)
    async with connect(True) as db:
        row = await one(db,'SELECT * FROM acces_tables WHERE table_num=?',(table_num,))
        if not row: raise HTTPException(404,'Table inexistante')
        await db.execute('UPDATE acces_tables SET token=?,version=version+1 WHERE table_num=?',(secrets.token_urlsafe(32),table_num))
        result = await one(db,'SELECT * FROM acces_tables WHERE table_num=?',(table_num,))
    return result

@app.get('/api/menu')
async def menu(session=Depends(any_role)):
    async with connect() as db:
        return {'categories':await all_rows(db,'SELECT * FROM categories ORDER BY id'),
                'plats':await all_rows(db,'SELECT p.*,s.quantite FROM plats p JOIN stocks s ON s.plat_id=p.id WHERE p.actif=1 ORDER BY p.id')}

@app.post('/api/categories', status_code=201)
async def category_create(body: Category, session=Depends(manager_role)):
    async with connect(True) as db:
        c = await db.execute('INSERT INTO categories(nom) VALUES (?)', (body.nom,))
        result = {'id':c.lastrowid, 'nom':body.nom}
    await hub.publish('menu.changed')
    return result

@app.put('/api/categories/{ident}')
async def category_update(ident:int, body:Category, session=Depends(manager_role)):
    async with connect(True) as db:
        c = await db.execute('UPDATE categories SET nom=? WHERE id=?',(body.nom,ident))
        if not c.rowcount: raise HTTPException(404,'Catégorie introuvable')
    await hub.publish('menu.changed')
    return {'ok':True}

@app.delete('/api/categories/{ident}')
async def category_delete(ident:int, session=Depends(manager_role)):
    async with connect(True) as db:
        # Historical archived dishes retain their category: move them first if necessary.
        c = await db.execute('DELETE FROM categories WHERE id=?',(ident,))
        if not c.rowcount: raise HTTPException(404,'Catégorie introuvable')
    await hub.publish('menu.changed')
    return {'ok':True}

@app.post('/api/plats', status_code=201)
async def dish_create(body:Dish, session=Depends(manager_role)):
    async with connect(True) as db:
        c = await db.execute('INSERT INTO plats(categorie_id,nom,description,prix,photo,personnalisable,disponible) VALUES (?,?,?,?,?,?,?)', tuple(body.model_dump().values()))
        ident = c.lastrowid
        await db.execute('INSERT INTO stocks VALUES (?,0)',(ident,))
    await hub.publish('menu.changed')
    return {'id':ident}

@app.put('/api/plats/{ident}')
async def dish_update(ident:int, body:Dish, session=Depends(manager_role)):
    async with connect(True) as db:
        c = await db.execute('UPDATE plats SET categorie_id=?,nom=?,description=?,prix=?,photo=?,personnalisable=?,disponible=? WHERE id=? AND actif=1', (*body.model_dump().values(),ident))
        if not c.rowcount: raise HTTPException(404,'Plat introuvable')
    await hub.publish('menu.changed')
    return {'ok':True}

@app.delete('/api/plats/{ident}')
async def dish_delete(ident:int, session=Depends(manager_role)):
    async with connect(True) as db:
        c = await db.execute('UPDATE plats SET actif=0,disponible=0 WHERE id=? AND actif=1',(ident,))
        if not c.rowcount: raise HTTPException(404,'Plat introuvable')
    await hub.publish('menu.changed')
    return {'ok':True}

@app.patch('/api/plats/{ident}/disponibilite')
async def availability(ident:int, body:Availability, session=Depends(manager_role)):
    async with connect(True) as db:
        c = await db.execute('UPDATE plats SET disponible=? WHERE id=? AND actif=1',(body.disponible,ident))
        if not c.rowcount: raise HTTPException(404,'Plat introuvable')
    await hub.publish('menu.changed')
    return {'ok':True}

@app.put('/api/stocks/{ident}')
async def stock(ident:int, body:Stock, session=Depends(manager_role)):
    async with connect(True) as db:
        c = await db.execute('UPDATE stocks SET quantite=? WHERE plat_id=? AND EXISTS (SELECT 1 FROM plats WHERE id=? AND actif=1)',(body.quantite,ident,ident))
        if not c.rowcount: raise HTTPException(404,'Plat introuvable')
    await hub.publish('menu.changed')
    return {'ok':True}

async def order_detail(db, ident):
    result = await one(db,'SELECT id,table_num,statut,total,cree_le,paye_le,mode_paiement FROM commandes WHERE id=?',(ident,))
    if not result: raise HTTPException(404,'Commande introuvable')
    result['items'] = await all_rows(db,'SELECT id,plat_id,nom,prix_unitaire,quantite,instructions FROM items_commande WHERE commande_id=?',(ident,))
    return result

@app.post('/api/commandes', status_code=201)
async def order_create(body:Order, session=Depends(client_role)):
    check_table(body.table_num)
    enforce_table(session, body.table_num)
    fingerprint = hashlib.sha256(body.model_dump_json().encode()).hexdigest()
    async with connect(True) as db:
        previous = await one(db,'SELECT * FROM commandes WHERE cle=?',(str(body.cle),))
        if previous:
            if previous['empreinte'] != fingerprint or previous['session_id'] != session['sid']:
                raise HTTPException(409,'Clé déjà utilisée avec un autre contenu ou une autre session')
            return await order_detail(db, previous['id'])
        total, rows = 0, []
        for item in body.items:
            dish = await one(db,'SELECT * FROM plats WHERE id=? AND actif=1 AND disponible=1',(item.plat_id,))
            if not dish: raise HTTPException(409,'Un plat n’est plus disponible. Vérifiez le menu.')
            if item.cuisson and not dish['personnalisable']:
                raise HTTPException(422,'Cuisson non applicable à ce plat')
            c = await db.execute('UPDATE stocks SET quantite=quantite-? WHERE plat_id=? AND quantite>=?',(item.quantite,item.plat_id,item.quantite))
            if not c.rowcount: raise HTTPException(409,f"Stock insuffisant : {dish['nom']}")
            instructions = []
            if item.cuisson: instructions.append('Cuisson : '+item.cuisson)
            if item.sans_piment: instructions.append('SANS PIMENT')
            if item.sans_oignon: instructions.append('SANS OIGNON')
            if item.allergies: instructions.append('ALLERGIES : '+item.allergies)
            if item.note: instructions.append(item.note)
            rows.append((item.plat_id,dish['nom'],dish['prix'],item.quantite,' • '.join(instructions)))
            total += dish['prix']*item.quantite
        c = await db.execute('INSERT INTO commandes(cle,empreinte,session_id,table_num,total,cree_le) VALUES (?,?,?,?,?,?)',
                             (str(body.cle),fingerprint,session['sid'],body.table_num,total,now()))
        ident = c.lastrowid
        await db.executemany('INSERT INTO items_commande(commande_id,plat_id,nom,prix_unitaire,quantite,instructions) VALUES (?,?,?,?,?,?)',[(ident,*row) for row in rows])
        result = await order_detail(db, ident)
    await hub.publish('commande.created', staff_only=True)
    await hub.publish('menu.changed')
    return result

@app.get('/api/commandes')
async def orders(session=Depends(staff_role)):
    async with connect() as db:
        # Keep unfinished orders from previous days and unpaid orders visible.
        rows = await all_rows(db,"SELECT id FROM commandes WHERE statut!='servi' OR paye_le IS NULL ORDER BY id")
        return [await order_detail(db,r['id']) for r in rows]

@app.get('/api/commandes/{ident}')
async def get_order(ident:int, session=Depends(any_role)):
    async with connect() as db:
        owner = await one(db,'SELECT session_id FROM commandes WHERE id=?',(ident,))
        if not owner or (session['role']=='client' and owner['session_id']!=session['sid']):
            raise HTTPException(404,'Commande introuvable')
        return await order_detail(db,ident)

@app.patch('/api/commandes/{ident}/statut')
async def status(ident:int, body:Status, session=Depends(staff_role)):
    transitions = {'en_attente':'en_cuisson','en_cuisson':'pret','pret':'servi'}
    async with connect(True) as db:
        row = await one(db,'SELECT statut FROM commandes WHERE id=?',(ident,))
        if not row: raise HTTPException(404,'Commande introuvable')
        if body.statut == 'servi' and session['role'] != 'gerant':
            raise HTTPException(403,'Seule la caisse confirme le service')
        if row['statut'] != body.statut:
            if transitions.get(row['statut']) != body.statut:
                raise HTTPException(409,'Transition invalide. Actualisez la commande.')
            await db.execute('UPDATE commandes SET statut=? WHERE id=?',(body.statut,ident))
        result = await order_detail(db,ident)
    await hub.publish('commande.updated',staff_only=True)
    return result

@app.post('/api/commandes/{ident}/paiement')
async def pay(ident:int, body:Payment, session=Depends(manager_role)):
    async with connect(True) as db:
        row = await one(db,'SELECT * FROM commandes WHERE id=?',(ident,))
        if not row: raise HTTPException(404,'Commande introuvable')
        if row['paye_le'] and row['mode_paiement'] != body.mode:
            raise HTTPException(409,'Commande déjà encaissée avec un autre mode')
        if not row['paye_le']:
            await db.execute('UPDATE commandes SET paye_le=?,mode_paiement=? WHERE id=?',(now(),body.mode,ident))
        result = await order_detail(db,ident)
    await hub.publish('paiement.created',staff_only=True)
    return result

@app.post('/api/alertes', status_code=201)
async def alert(body:Alert, session=Depends(client_role)):
    check_table(body.table_num)
    enforce_table(session, body.table_num)
    async with connect(True) as db:
        previous = await one(db,'SELECT * FROM alertes_serveur WHERE cle=?',(str(body.cle),))
        if previous:
            if (previous['session_id'],previous['table_num'],previous['motif']) != (session['sid'],body.table_num,body.motif):
                raise HTTPException(409,'Clé d’alerte déjà utilisée')
            return {'id':previous['id']}
        c = await db.execute('INSERT INTO alertes_serveur(cle,session_id,table_num,motif,cree_le) VALUES (?,?,?,?,?)',(str(body.cle),session['sid'],body.table_num,body.motif,now()))
        ident = c.lastrowid
    await hub.publish('alerte.created',staff_only=True)
    return {'id':ident}

@app.get('/api/alertes')
async def alerts(session=Depends(staff_role)):
    async with connect() as db:
        return await all_rows(db,'SELECT id,table_num,motif,cree_le FROM alertes_serveur WHERE resolue_le IS NULL ORDER BY id')

@app.patch('/api/alertes/{ident}/resoudre')
async def resolve(ident:int, session=Depends(staff_role)):
    async with connect(True) as db:
        c = await db.execute('UPDATE alertes_serveur SET resolue_le=COALESCE(resolue_le,?) WHERE id=?',(now(),ident))
        if not c.rowcount: raise HTTPException(404,'Alerte introuvable')
    await hub.publish('alerte.updated',staff_only=True)
    return {'ok':True}

async def stats_for(jour):
    # Bamako is UTC+0; use a half-open UTC interval, never browser-local midnight.
    start = datetime.combine(jour,datetime.min.time(),tzinfo=timezone.utc).isoformat(timespec='seconds')
    end = datetime.combine(jour+timedelta(days=1),datetime.min.time(),tzinfo=timezone.utc).isoformat(timespec='seconds')
    async with connect() as db:
        paid = await all_rows(db,'SELECT id,table_num,total,mode_paiement,paye_le FROM commandes WHERE paye_le>=? AND paye_le<? ORDER BY id',(start,end))
        unpaid = await one(db,'SELECT COALESCE(SUM(total),0) AS montant FROM commandes WHERE paye_le IS NULL')
    return {'jour':str(jour),'ca_fcfa':sum(r['total'] for r in paid),'encaissements':len(paid), 'impayes_fcfa':unpaid['montant'],'paiements':paid}

@app.get('/api/stats/jour')
async def stats(jour:date|None=None, session=Depends(manager_role)):
    return await stats_for(jour or datetime.now(timezone.utc).date())

@app.get('/api/rapports/jour.csv')
async def report(jour:date|None=None, session=Depends(manager_role)):
    data = await stats_for(jour or datetime.now(timezone.utc).date())
    output = io.StringIO()
    writer = csv.writer(output,delimiter=';')
    writer.writerow(['Commande','Table','Montant FCFA','Mode','Encaisse le (UTC/Bamako)'])
    for r in data['paiements']:
        writer.writerow([r['id'],r['table_num'],r['total'],r['mode_paiement'],r['paye_le']])
    writer.writerow(['TOTAL','',data['ca_fcfa'],'',''])
    return Response('\ufeff'+output.getvalue(),media_type='text/csv; charset=utf-8',headers={'Content-Disposition':f'attachment; filename="smartresto-{data["jour"]}.csv"'})

@app.websocket('/ws/commandes')
async def websocket(ws:WebSocket):
    session = decode(ws.cookies.get(COOKIE))
    if not session or not await validate_qr_session(session) or not valid_origin(ws.headers.get('origin'),ws.headers.get('host','')):
        await ws.close(code=1008)
        return
    await ws.accept()
    queue = hub.subscribe(ws,session['role'])
    queue.put_nowait({'type':'sync'})
    async def sender():
        while True:
            if time.time() >= session['exp'] or not await validate_qr_session(session):
                await ws.close(code=1008)
                return
            try:
                event = await asyncio.wait_for(queue.get(),timeout=20)
            except asyncio.TimeoutError:
                event = {'type':'heartbeat'}
            await asyncio.wait_for(ws.send_json(event),timeout=5)
    async def receiver():
        while True:
            await ws.receive_text()  # Clients send no business mutations over the socket.
    tasks = [asyncio.create_task(sender()),asyncio.create_task(receiver())]
    try:
        await asyncio.wait(tasks,return_when=asyncio.FIRST_COMPLETED)
    except asyncio.CancelledError:
        pass  # ASGI shutdown: drain both tasks in a shielded cleanup scope.
    finally:
        hub.discard(ws)
        for task in tasks: task.cancel()
        with anyio.CancelScope(shield=True):
            await asyncio.gather(*tasks,return_exceptions=True)

# Register API routes before mounting the compiled application.
if DIST.exists():
    app.mount('/',StaticFiles(directory=DIST,html=True),name='frontend')
