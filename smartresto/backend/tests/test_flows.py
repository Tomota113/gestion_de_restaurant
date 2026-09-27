import os
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient

os.environ.update(SMARTRESTO_SECRET='test-secret-only-'*4,SMARTRESTO_CLIENT_PIN='client-test-123',
                  SMARTRESTO_CUISINE_PIN='cuisine-test-123',SMARTRESTO_GERANT_PIN='gerant-test-123')
from app.main import app, login_attempts
from app import db
from app import network_access

@pytest.fixture
def clients(tmp_path,monkeypatch):
    monkeypatch.setattr(db,'DB_PATH',tmp_path/'test.sqlite3')
    login_attempts.clear()
    with TestClient(app) as first:
        first.post('/api/auth/login',json={'role':'client','pin':'client-test-123'})
        # All devices share the one application loop, as with one Uvicorn worker.
        kitchen,manager=TestClient(app),TestClient(app)
        kitchen.portal=manager.portal=first.portal
        try:
            kitchen.post('/api/auth/login',json={'role':'cuisine','pin':'cuisine-test-123'})
            manager.post('/api/auth/login',json={'role':'gerant','pin':'gerant-test-123'})
            yield first,kitchen,manager
        finally:
            kitchen.close()
            manager.close()

def payload(**kwargs):
    return {'cle':str(uuid4()),'table_num':3,'items':[{'plat_id':3,'quantite':2,'cuisson':'À point','sans_piment':True,'allergies':'arachides'}],**kwargs}

def test_network_change_keeps_orders_and_qr_invitations(clients, monkeypatch):
    client, kitchen, manager = clients
    addresses = [{'address':'192.168.0.112','interface':'wlan0','default':True,'virtual':False}]
    monkeypatch.setattr(network_access, 'discover_addresses', lambda: addresses)
    headers = {'host':'localhost:8000'}
    assert client.get('/api/network').status_code == 403
    assert kitchen.put('/api/network',json={'mode':'auto'}).status_code == 403
    first = manager.get('/api/network',headers=headers).json()
    assert first['origin'] == 'http://192.168.0.112:8000'
    invitations = manager.get('/api/qr/tables').json()
    order = client.post('/api/commandes',json=payload()).json()
    addresses[0]['address'] = '192.168.1.45'
    second = manager.get('/api/network',headers=headers).json()
    assert second['origin'] == 'http://192.168.1.45:8000'
    assert manager.get('/api/qr/tables').json() == invitations
    assert manager.get('/api/commandes/'+str(order['id'])).json()['total'] == order['total']

def test_network_saved_choice_shared_and_can_return_to_auto(clients, monkeypatch):
    _, _, manager = clients
    monkeypatch.setattr(network_access, 'discover_addresses', lambda: [
        {'address':'10.0.0.8','interface':'wlan0','default':True,'virtual':False}])
    assert manager.put('/api/network',json={'mode':'manual','origin':'http://resto.local:8000/'}).status_code == 200
    with TestClient(app) as other:
        assert other.get('/api/network').status_code == 401
        other.post('/api/auth/login',json={'role':'gerant','pin':'gerant-test-123'})
        assert other.get('/api/network').json()['origin'] == 'http://resto.local:8000'
        assert other.put('/api/network',json={'mode':'auto'}).status_code == 200
    assert manager.get('/api/network',headers={'host':'localhost:8000'}).json()['origin'] == 'http://10.0.0.8:8000'

def test_network_invalid_addresses_and_https(clients, monkeypatch):
    _, _, manager = clients
    for origin in ('http://localhost:8000','http://127.0.0.2','http://0.0.0.0',
                   'http://[::1]','http://user:pass@resto','javascript:alert(1)',
                   'http://resto/#table=1','http://resto/path','http://resto:99999'):
        assert manager.put('/api/network',json={'mode':'manual','origin':origin}).status_code == 422
    monkeypatch.setattr(network_access, 'discover_addresses', lambda: [])
    assert manager.get('/api/network',headers={'host':'localhost:8000'}).json()['origin'] == ''
    secure = manager.get('https://smartresto.home.arpa/api/network')
    # Cookies are host-bound; test pure address policy separately.
    assert secure.status_code == 401
    choices = network_access.address_choices([{'address':'10.0.0.8'}], 'https', 443, 'https://smartresto.home.arpa')
    assert choices == [{'origin':'https://smartresto.home.arpa','interface':'Adresse HTTPS actuelle'}]

def test_discovery_without_gateway_filters_loopback_and_ranks_physical(monkeypatch):
    import json
    from types import SimpleNamespace
    def run(args, **kwargs):
        if 'route' in args:
            return SimpleNamespace(stdout='[]')
        return SimpleNamespace(stdout=json.dumps([
            {'ifname':'lo','addr_info':[{'local':'127.0.0.1'}]},
            {'ifname':'docker0','addr_info':[{'local':'172.17.0.1'}]},
            {'ifname':'wlan0','addr_info':[{'local':'192.168.7.4'},{'local':'169.254.1.2'}]}
        ]))
    monkeypatch.setattr(network_access.subprocess, 'run', run)
    rows = network_access.discover_addresses()
    assert [r['address'] for r in rows] == ['192.168.7.4','172.17.0.1']
    assert rows[0]['virtual'] is False

def test_order_websocket_payment_report(clients):
    client,kitchen,manager=clients
    with kitchen.websocket_connect('/ws/commandes',headers={'origin':'http://testserver'}) as ws:
        assert ws.receive_json()['type']=='sync'
        r=client.post('/api/commandes',json=payload())
        assert r.status_code==201,r.text
        order=r.json(); ident=order['id']
        assert order['total']==9000
        assert 'ALLERGIES : arachides' in order['items'][0]['instructions']
        assert ws.receive_json()['type']=='commande.created'
        assert ws.receive_json()['type']=='menu.changed'
    assert manager.get('/api/stats/jour').json()['ca_fcfa']==0
    assert kitchen.patch(f'/api/commandes/{ident}/statut',json={'statut':'pret'}).status_code==409
    for status in ('en_cuisson','pret'):
        assert kitchen.patch(f'/api/commandes/{ident}/statut',json={'statut':status}).status_code==200
    assert kitchen.patch(f'/api/commandes/{ident}/statut',json={'statut':'servi'}).status_code==403
    assert manager.patch(f'/api/commandes/{ident}/statut',json={'statut':'servi'}).status_code==200
    for _ in range(2):
        assert manager.post(f'/api/commandes/{ident}/paiement',json={'mode':'especes'}).status_code==200
    stats=manager.get('/api/stats/jour').json()
    assert stats['ca_fcfa']==9000 and stats['encaissements']==1 and stats['impayes_fcfa']==0
    assert manager.get('/api/commandes').json()==[]
    assert '9000' in manager.get('/api/rapports/jour.csv').text

def test_idempotency_and_changed_payload(clients):
    client,_,manager=clients
    p=payload()
    first=client.post('/api/commandes',json=p).json()
    again=client.post('/api/commandes',json=p).json()
    assert again['id']==first['id']
    assert next(d for d in manager.get('/api/menu').json()['plats'] if d['id']==3)['quantite']==48
    p['table_num']=4
    assert client.post('/api/commandes',json=p).status_code==409

def test_atomic_stock_rollback(clients):
    client,_,manager=clients
    manager.put('/api/stocks/3',json={'quantite':1})
    # Same dish twice; the whole transaction must roll back when second line fails.
    p=payload(items=[{'plat_id':3,'quantite':1},{'plat_id':3,'quantite':1}])
    assert client.post('/api/commandes',json=p).status_code==409
    assert manager.get('/api/commandes').json()==[]
    assert next(d for d in manager.get('/api/menu').json()['plats'] if d['id']==3)['quantite']==1

def test_concurrent_last_portion(clients):
    client,_,manager=clients
    manager.put('/api/stocks/3',json={'quantite':1})
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses=list(pool.map(lambda _:client.post('/api/commandes',json=payload(items=[{'plat_id':3,'quantite':1}])),range(2)))
    assert sorted(r.status_code for r in responses)==[201,409]
    assert next(d for d in manager.get('/api/menu').json()['plats'] if d['id']==3)['quantite']==0

def test_roles_origin_validation_and_price_tampering(clients):
    client,kitchen,manager=clients
    assert client.get('/api/commandes').status_code==403
    assert kitchen.get('/api/stats/jour').status_code==403
    assert client.put('/api/stocks/3',json={'quantite':999}).status_code==403
    p=payload();p['items'][0]['prix']=1
    assert client.post('/api/commandes',json=p).status_code==422
    assert client.post('/api/commandes',json=payload(),headers={'origin':'https://evil.invalid'}).status_code==403
    assert client.post('/api/commandes',json=payload(table_num=99)).status_code==422
    with TestClient(app) as other:
        other.post('/api/auth/login',json={'role':'client','pin':'client-test-123'})
        ident=client.post('/api/commandes',json=payload()).json()['id']
        assert other.get(f'/api/commandes/{ident}').status_code==404

def test_alert_crud_and_history(clients):
    client,kitchen,manager=clients
    body={'cle':str(uuid4()),'table_num':3,'motif':'Eau'}
    ident=client.post('/api/alertes',json=body).json()['id']
    assert client.post('/api/alertes',json=body).json()['id']==ident
    assert len(kitchen.get('/api/alertes').json())==1
    assert kitchen.patch(f'/api/alertes/{ident}/resoudre').status_code==200
    assert kitchen.get('/api/alertes').json()==[]
    cat=manager.post('/api/categories',json={'nom':'Desserts'}).json()['id']
    assert manager.put(f'/api/categories/{cat}',json={'nom':'Douceurs'}).status_code==200
    dish={'categorie_id':cat,'nom':'Mangue','prix':1500}
    ident=manager.post('/api/plats',json=dish).json()['id']
    manager.put(f'/api/stocks/{ident}',json={'quantite':5})
    order=client.post('/api/commandes',json=payload(items=[{'plat_id':ident,'quantite':1}])).json()
    dish['prix']=2000;dish['nom']='Mangue fraîche'
    assert manager.put(f'/api/plats/{ident}',json=dish).status_code==200
    assert manager.delete(f'/api/plats/{ident}').status_code==200
    history=manager.get('/api/commandes/'+str(order['id'])).json()
    assert history['items'][0]['prix_unitaire']==1500 and history['items'][0]['nom']=='Mangue'
    assert manager.delete(f'/api/categories/{cat}').status_code==409

def test_ws_client_does_not_receive_staff_events(clients):
    client,_,manager=clients
    with client.websocket_connect('/ws/commandes',headers={'origin':'http://testserver'}) as ws:
        assert ws.receive_json()['type']=='sync'
        client.post('/api/commandes',json=payload())
        assert ws.receive_json()['type']=='menu.changed'
    from starlette.websockets import WebSocketDisconnect
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect('/ws/commandes',headers={'origin':'https://evil.invalid'}):pass

def test_reconnect_snapshot(clients):
    client,kitchen,manager=clients
    created=client.post('/api/commandes',json=payload()).json()
    # A late subscriber receives sync and then recovers persisted orders via REST.
    with kitchen.websocket_connect('/ws/commandes',headers={'origin':'http://testserver'}) as ws:
        assert ws.receive_json()['type']=='sync'
        assert created['id'] in [o['id'] for o in kitchen.get('/api/commandes').json()]

def test_restart_retains_order(tmp_path,monkeypatch):
    monkeypatch.setattr(db,'DB_PATH',tmp_path/'restart.sqlite3')
    login_attempts.clear()
    with TestClient(app) as client:
        client.post('/api/auth/login',json={'role':'client','pin':'client-test-123'})
        created=client.post('/api/commandes',json=payload()).json()
    with TestClient(app) as manager:
        manager.post('/api/auth/login',json={'role':'gerant','pin':'gerant-test-123'})
        assert manager.get('/api/commandes/'+str(created['id'])).json()['total']==9000

def test_qr_invitation_scope_and_idempotent_rescan(clients):
    client,kitchen,manager=clients
    assert client.get('/api/qr/tables').status_code==403
    assert kitchen.get('/api/qr/tables').status_code==403
    row=manager.get('/api/qr/tables').json()[4]
    login={'table_num':row['table_num'],'token':row['token']}
    assert client.post('/api/auth/table',json=login).status_code==200
    original=client.get('/api/auth/me').json()
    assert original['role']=='client' and original['table_num']==5
    assert client.post('/api/commandes',json=payload(table_num=6)).status_code==403
    assert client.post('/api/alertes',json={'cle':str(uuid4()),'table_num':6,'motif':'Eau'}).status_code==403
    request=payload(table_num=5)
    order=client.post('/api/commandes',json=request).json()
    assert client.post('/api/auth/table',json=login).status_code==200
    assert client.get('/api/auth/me').json()['session_id']==original['session_id']
    assert client.post('/api/commandes',json=request).json()['id']==order['id']
    assert client.get('/api/stats/jour').status_code==403
    assert client.post('/api/auth/table',json={**login,'token':'x'*43}).status_code==403
    assert client.post('/api/auth/table',json={**login,'table_num':6}).status_code==403

def test_qr_rotation_revokes_existing_session_and_old_link(clients):
    client,_,manager=clients
    row=manager.get('/api/qr/tables').json()[0]
    body={'table_num':row['table_num'],'token':row['token']}
    client.post('/api/auth/table',json=body)
    changed=manager.post('/api/qr/tables/1/renouveler').json()
    assert changed['token']!=row['token'] and changed['version']==2
    assert client.get('/api/auth/me').status_code==401
    assert client.post('/api/commandes',json=payload(table_num=1)).status_code==401
    assert client.post('/api/auth/table',json=body).status_code==403
    from starlette.websockets import WebSocketDisconnect
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect('/ws/commandes',headers={'origin':'http://testserver'}):pass
    assert client.post('/api/auth/table',json={'table_num':1,'token':changed['token']}).status_code==200
    assert client.get('/api/auth/me').json()['table_num']==1

def test_qr_seed_not_reapplied_on_restart(tmp_path,monkeypatch):
    monkeypatch.setattr(db,'DB_PATH',tmp_path/'qr-restart.sqlite3')
    login_attempts.clear()
    with TestClient(app) as manager:
        manager.post('/api/auth/login',json={'role':'gerant','pin':'gerant-test-123'})
        changed=manager.post('/api/qr/tables/1/renouveler').json()
    with TestClient(app) as manager:
        manager.post('/api/auth/login',json={'role':'gerant','pin':'gerant-test-123'})
        row=manager.get('/api/qr/tables').json()[0]
        assert row==changed

def test_upgrade_v1_preserves_business_data(tmp_path,monkeypatch):
    import sqlite3
    path=tmp_path/'upgrade.sqlite3'
    monkeypatch.setattr(db,'DB_PATH',path)
    login_attempts.clear()
    with TestClient(app) as client:
        client.post('/api/auth/login',json={'role':'client','pin':'client-test-123'})
        ident=client.post('/api/commandes',json=payload()).json()['id']
    # Reproduce the original six-table v1 schema, with an existing order/stock decrement.
    with sqlite3.connect(path) as conn:
        conn.execute('DROP TABLE acces_tables')
        conn.execute('PRAGMA user_version=1')
    with TestClient(app) as manager:
        manager.post('/api/auth/login',json={'role':'gerant','pin':'gerant-test-123'})
        assert manager.get(f'/api/commandes/{ident}').json()['total']==9000
        assert next(d for d in manager.get('/api/menu').json()['plats'] if d['id']==3)['quantite']==48
        assert len(manager.get('/api/qr/tables').json())==20
    with sqlite3.connect(path) as conn:
        assert conn.execute('PRAGMA user_version').fetchone()[0]==2
