import React,{useState,useEffect,useRef,useCallback} from 'react'
import {createRoot} from 'react-dom/client'
import {UtensilsCrossed,ChefHat,LayoutDashboard,Bell,ShoppingBag,Plus,Minus,X,Check,ArrowRight,Wifi,WifiOff,LogOut,Volume2,Printer,Download,Pencil,Trash2,Clock,Leaf} from 'lucide-react'
import {api,money,uid,readStored} from './api'
import './styles.css'
import QrManager from './QrManager'
import QrEntry from './QrEntry'

const labels={client:'À votre table',cuisine:'Cuisine',gerant:'Caisse & gestion'}
const statusLabels={en_attente:'En attente',en_cuisson:'En cuisson',pret:'Prêt',servi:'Servi'}
const emptyMenu={categories:[],plats:[]}
let audioContext
function beep(){
 if(!audioContext||audioContext.state!=='running')return
 const oscillator=audioContext.createOscillator(), gain=audioContext.createGain()
 oscillator.connect(gain);gain.connect(audioContext.destination);oscillator.frequency.value=880
 gain.gain.setValueAtTime(.15,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+.35)
 oscillator.start();oscillator.stop(audioContext.currentTime+.35)
}
function Modal({title,children,onClose}){
 const ref=useRef(null)
 useEffect(()=>{const previous=document.activeElement; const el=ref.current; el?.focus(); const key=e=>{
  if(e.key==='Escape'&&onClose)onClose()
  if(e.key==='Tab'){const nodes=el.querySelectorAll('button:not(:disabled),input,select,textarea,[tabindex="0"]');const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}
 };el?.addEventListener('keydown',key);return()=>{el?.removeEventListener('keydown',key);previous?.focus()}},[])
 return <div className="overlay"><section ref={ref} tabIndex={-1} className="modal" role="dialog" aria-modal="true" aria-label={title}><div className="flex justify-between items-center gap-3"><h2>{title}</h2>{onClose&&<button className="icon" aria-label="Fermer" onClick={onClose}><X/></button>}</div>{children}</section></div>
}
function App(){
 const [session,setSession]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [connected,setConnected]=useState(false),[revision,setRevision]=useState(0),[menu,setMenu]=useState(emptyMenu)
 const [page,setPage]=useState('client')
 const [invitation,setInvitation]=useState(()=>{const params=new URLSearchParams(location.hash.slice(1));return params.has('table')||params.has('key')?{table_num:Number(params.get('table')),token:params.get('key')||''}:null})
 useEffect(()=>{const scan=()=>{const p=new URLSearchParams(location.hash.slice(1));if(p.has('table')||p.has('key'))setInvitation({table_num:Number(p.get('table')),token:p.get('key')||''})};window.addEventListener('hashchange',scan);return()=>window.removeEventListener('hashchange',scan)},[])
 const notify=useCallback(message=>setNotice(message),[])
 const fail=useCallback(e=>setError(e.message||'Connexion impossible'),[])
 const refresh=useCallback(()=>setRevision(v=>v+1),[])
 useEffect(()=>{if(!invitation)api('/auth/me').then(s=>{setSession(s);setPage(s.role)}).catch(()=>{}).finally(()=>setLoading(false));else setLoading(false);const expire=()=>{setSession(null);setConnected(false)};window.addEventListener('session-expired',expire);return()=>window.removeEventListener('session-expired',expire)},[])
 useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),6000);return()=>clearTimeout(t)},[notice])
 useEffect(()=>{if(!session)return;let active=true;api('/menu').then(m=>active&&setMenu(m)).catch(fail);return()=>{active=false}},[session,revision,fail])
 useEffect(()=>{
  if(!session)return
  let socket,timer,heartbeat,stopped=false,tries=0,last=Date.now()
  function connect(){
   socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws/commandes`)
   socket.onopen=()=>{last=Date.now();tries=0;setConnected(true);refresh()}
   socket.onmessage=e=>{last=Date.now();const event=JSON.parse(e.data);if(event.type==='heartbeat')return;if(event.type==='commande.created'&&session.role!=='client')beep();refresh()}
   socket.onerror=()=>socket.close()
   socket.onclose=()=>{setConnected(false);if(!stopped)timer=setTimeout(connect,Math.min(1000*2**tries++,15000)+Math.random()*500)}
  }
  connect()
  heartbeat=setInterval(()=>{if(Date.now()-last>45000)socket?.close()},5000)
  const fallback=setInterval(refresh,15000) // Repairs missed notifications, including crash after COMMIT.
  const focus=()=>refresh();window.addEventListener('focus',focus)
  return()=>{stopped=true;clearTimeout(timer);clearInterval(heartbeat);clearInterval(fallback);socket?.close();window.removeEventListener('focus',focus)}
 },[session,refresh])
 async function logout(){if(readStored('sr-pending',null)){fail(new Error('Un envoi reste à confirmer. Vérifiez la commande auprès de la caisse avant de déconnecter cette tablette.'));return}try{await api('/auth/logout',{method:'POST'});setSession(null);setMenu(emptyMenu);localStorage.removeItem('sr-cart');localStorage.removeItem('sr-pending');localStorage.removeItem('sr-receipt')}catch(e){fail(e)}}
 function finishQr(s){history.replaceState(null,'',location.pathname);setInvitation(null);setSession(s);setPage(s?.role||'client');setError('')}
 if(invitation)return <QrEntry key={invitation.token+invitation.table_num} invitation={invitation} onDone={finishQr} onCancel={finishQr}/>
 if(loading)return <div className="welcome"><UtensilsCrossed size={40}/><h1>SmartResto</h1><p>Ouverture de votre table…</p></div>
 return <><header className="topbar"><a href="/" className="brand"><span className="brand-icon"><UtensilsCrossed size={23}/></span><span>SmartResto<small>BAMAKO · LE GOÛT DU PARTAGE</small></span></a>{session&&<><nav>{session.role==='gerant'?<><button className={page==='gerant'?'selected':''} onClick={()=>setPage('gerant')}><LayoutDashboard size={18}/> Caisse</button><button className={page==='cuisine'?'selected':''} onClick={()=>setPage('cuisine')}><ChefHat size={18}/> Cuisine</button></>:<span>{labels[session.role]}</span>}</nav><span className={'network '+(connected?'':'offline')}>{connected?<Wifi size={16}/>:<WifiOff size={16}/>}<span>{connected?'Serveur connecté':'Reconnexion…'}</span></span><button className="icon" title="Déconnexion" aria-label="Déconnexion" onClick={logout}><LogOut size={19}/></button></>}</header>
 {error&&<div className="message error" role="alert">{error}<button className="icon" aria-label="Fermer le message" onClick={()=>setError('')}><X size={18}/></button></div>}
 {notice&&<div className="message notice" role="status"><Check size={18}/>{notice}</div>}
 {!session?<Login onLogin={s=>{setSession(s);setPage(s.role);setError('')}} fail={fail}/>:page==='client'?<Client key={session.session_id||session.role} fixedTable={session.table_num} menu={menu} tables={session.tables} fail={fail} notify={notify} revision={revision}/>:page==='cuisine'?<Kitchen revision={revision} refresh={refresh} fail={fail}/>:<Manager menu={menu} revision={revision} refresh={refresh} fail={fail} notify={notify}/>}
 <footer>SmartResto <span>Un moment à savourer.</span></footer></>
}
function Login({onLogin,fail}){
 const [role,setRole]=useState('client'),[pin,setPin]=useState(''),[busy,setBusy]=useState(false)
 async function submit(e){e.preventDefault();setBusy(true);try{await api('/auth/login',{method:'POST',body:{role,pin}});onLogin(await api('/auth/me'))}catch(e){fail(e)}finally{setBusy(false)}}
 return <main className="login"><div className="eyebrow">BIENVENUE CHEZ VOUS</div><h1>La bonne table.<br/><em>Tout simplement.</em></h1><p className="muted">Une cuisine généreuse, un service attentionné.<br/>Votre expérience commence ici.</p><p className="pending">Pour commander avec votre téléphone, scannez le QR présent sur votre table. Les codes ci-dessous sont réservés au personnel et aux tablettes du restaurant.</p><form onSubmit={submit} className="panel"><label>Espace<select value={role} onChange={e=>setRole(e.target.value)}>{Object.entries(labels).map(([key,value])=><option key={key} value={key}>{value}</option>)}</select></label><label>Code de connexion<input autoComplete="current-password" type="password" required value={pin} onChange={e=>setPin(e.target.value)}/></label><button className="primary w-full" disabled={busy}>{busy?'Connexion…':'Entrer'}<ArrowRight size={18}/></button><p className="muted text-sm">Le personnel connecte cette tablette avec son code d’installation.</p></form></main>
}
function Client({menu,tables,fixedTable,fail,notify,revision}){
 const [table,setTable]=useState(()=>fixedTable||Number(localStorage.getItem('sr-table'))||0)
 const [category,setCategory]=useState(0),[dish,setDish]=useState(null),[cart,setCart]=useState(()=>readStored('sr-cart',[]))
 const [pending,setPending]=useState(()=>readStored('sr-pending',null)),[receipt,setReceipt]=useState(()=>readStored('sr-receipt',null))
 const [busy,setBusy]=useState(false),[showCart,setShowCart]=useState(false),[call,setCall]=useState(false),[alertBusy,setAlertBusy]=useState(false)
 const pendingRef=useRef(pending),busyRef=useRef(false),alertRef=useRef(null)
 useEffect(()=>{localStorage.setItem('sr-cart',JSON.stringify(cart))},[cart])
 useEffect(()=>{localStorage.setItem('sr-table',String(table))},[table])
 useEffect(()=>{localStorage.setItem('sr-pending',JSON.stringify(pending));pendingRef.current=pending},[pending])
 useEffect(()=>{localStorage.setItem('sr-receipt',JSON.stringify(receipt))},[receipt])
 useEffect(()=>{if(!receipt)return;let active=true;api('/commandes/'+receipt.id).then(r=>active&&setReceipt(r)).catch(()=>{});return()=>{active=false}},[revision,receipt?.id])
 const total=cart.reduce((sum,row)=>sum+row.prix*row.quantite,0), count=cart.reduce((sum,row)=>sum+row.quantite,0)
 function update(key,delta){if(pending)return;setCart(rows=>rows.map(r=>r.key===key?{...r,quantite:Math.min(50,r.quantite+delta)}:r).filter(r=>r.quantite>0))}
 async function submit(){
  if(busyRef.current)return;busyRef.current=true;setBusy(true)
  const body=pendingRef.current||{cle:uid(),table_num:table,items:cart.map(({plat_id,quantite,cuisson,sans_piment,sans_oignon,allergies,note})=>({plat_id,quantite,cuisson,sans_piment,sans_oignon,allergies,note}))}
  pendingRef.current=body;setPending(body);localStorage.setItem('sr-pending',JSON.stringify(body))
  try{const result=await api('/commandes',{method:'POST',body});setReceipt(result);setCart([]);pendingRef.current=null;setPending(null);setShowCart(false);notify(`Commande n°${result.id} reçue en cuisine — ${money(result.total)}`)}
  catch(e){if(e.status===422||(e.status===409&&!e.message.startsWith('Clé déjà'))){pendingRef.current=null;setPending(null)}fail(e)}finally{setBusy(false);busyRef.current=false}
 }
 async function callServer(motif){
  if(alertBusy)return;setAlertBusy(true)
  const body=alertRef.current||{cle:uid(),table_num:table,motif};alertRef.current=body
  try{await api('/alertes',{method:'POST',body});notify(`Votre demande « ${body.motif} » a été transmise.`);alertRef.current=null;setCall(false)}catch(e){fail(e)}finally{setAlertBusy(false)}
 }
 const filtered=menu.plats.filter(p=>!category||p.categorie_id===category)
 return <main className="client-main"><section className="hero"><div><div className="eyebrow"><span className="gold-line"/> FRAIS. GÉNÉREUX. FAIT MAISON.</div><h1>Installez-vous.<br/><em>On s’occupe de vous.</em></h1><p>Les saveurs d’ici, le plaisir d’être ensemble.</p><div className="hero-meta"><Leaf size={16}/> Préparé à la commande <span>•</span> Prix en FCFA</div></div><div className="table-tile"><span>VOTRE TABLE</span><strong>{String(table||'—').padStart(2,'0')}</strong>{fixedTable?<span className="table-confirmed">Table reconnue par QR</span>:<button disabled={!!pending||cart.length>0} onClick={()=>setTable(0)}>Changer de table</button>}</div></section>
 {receipt&&<div className="receipt"><Check size={21}/><div><strong>Commande n°{receipt.id} · {statusLabels[receipt.statut]}</strong><p>Table {receipt.table_num} · {money(receipt.total)}</p></div><button className="icon" aria-label="Masquer le suivi" onClick={()=>setReceipt(null)}><X size={18}/></button></div>}
 <section className="menu-heading"><div><div className="eyebrow">À LA CARTE</div><h2>Qu’est-ce qui vous fait envie ?</h2></div><span className="muted">{menu.plats.length} créations à découvrir</span></section>
 <div className="categories"><button className={!category?'active':''} onClick={()=>setCategory(0)}>Toute la carte</button>{menu.categories.map(c=><button key={c.id} className={category===c.id?'active':''} onClick={()=>setCategory(c.id)}>{c.nom}</button>)}</div>
 <div className="menu-grid">{filtered.map(p=><article className="dish-card" key={p.id}><div className="dish-image"><img src={p.photo} alt={p.nom} onError={e=>{e.currentTarget.onerror=null;e.currentTarget.src='/photos/plat.svg'}}/>{(!p.disponible||p.quantite===0)&&<span className="sold-out">Momentanément indisponible</span>}</div><div className="dish-body"><span className="eyebrow">{menu.categories.find(c=>c.id===p.categorie_id)?.nom}</span><h3>{p.nom}</h3><p>{p.description}</p><div className="flex justify-between items-center gap-3"><strong className="price">{money(p.prix)}</strong><button className="add" aria-label={'Ajouter '+p.nom} disabled={!p.disponible||p.quantite===0||!!pending} onClick={()=>setDish(p)}><Plus size={21}/></button></div></div></article>)}</div>
 {!filtered.length&&<p className="empty">La carte est en cours de préparation.</p>}
 <div className="client-dock"><button className="server-call" onClick={()=>setCall(true)} disabled={!table}><Bell size={20}/> Appel serveur</button><button className="primary basket" onClick={()=>setShowCart(true)}><ShoppingBag size={20}/><span>Mon panier <b>{count}</b></span><strong>{money(total)}</strong><ArrowRight size={18}/></button></div>
 {(!table||table>tables)&&<Modal title="Bienvenue à votre table"><p className="muted">Choisissez le numéro indiqué sur votre table.</p><div className="table-grid">{Array.from({length:tables},(_,i)=>i+1).map(n=><button key={n} onClick={()=>setTable(n)}>{String(n).padStart(2,'0')}</button>)}</div></Modal>}
 {dish&&<Customize dish={dish} onClose={()=>setDish(null)} onAdd={row=>{setCart(items=>[...items,row]);setDish(null);notify('Ajouté à votre panier')}}/>}
 {call&&<Modal title="Comment vous aider ?" onClose={()=>setCall(false)}><p className="muted">Un membre de l’équipe viendra à votre table.</p><div className="grid gap-3">{['Eau','Addition','Question'].map(m=><button className="secondary" key={m} disabled={alertBusy} onClick={()=>callServer(m)}><Bell size={18}/>{m}</button>)}</div></Modal>}
 {showCart&&<Modal title={`Votre panier · Table ${table}`} onClose={()=>!busy&&setShowCart(false)}>{cart.length?cart.map(r=><div className="cart-row" key={r.key}><div><h3>{r.nom}</h3><p className="muted text-sm">{[r.cuisson,r.sans_piment&&'Sans piment',r.sans_oignon&&'Sans oignon',r.allergies&&'Allergies : '+r.allergies,r.note].filter(Boolean).join(' · ')}</p><strong>{money(r.prix*r.quantite)}</strong></div><div className="stepper"><button aria-label="Diminuer" disabled={!!pending} onClick={()=>update(r.key,-1)}><Minus size={16}/></button><b>{r.quantite}</b><button aria-label="Augmenter" disabled={!!pending} onClick={()=>update(r.key,1)}><Plus size={16}/></button></div></div>):<p className="empty">Votre panier attend ses premières saveurs.</p>}{pending&&<div className="pending"><p>Envoi à confirmer. Réessayez pour retrouver la même commande sans la doubler. Si votre session a expiré, demandez à la caisse de vérifier avant de recommander.</p><button className="secondary mt-3" disabled={busy} onClick={()=>{if(confirm('La caisse a-t-elle vérifié si cette commande existe ? Ceci efface le panier de cette tablette, sans annuler une commande déjà reçue.')){pendingRef.current=null;setPending(null);setCart([]);setShowCart(false)}}}>Fermer cet envoi après vérification en caisse</button></div>}<div className="cart-total"><span>Total estimé</span><strong>{money(total)}</strong></div><p className="muted text-sm">Les prix et les disponibilités sont confirmés par le serveur à la validation.</p><button className="primary w-full" disabled={busy||(!cart.length&&!pending)} onClick={submit}>{busy?'Envoi en cuisine…':pending?'Vérifier / réessayer l’envoi':'Valider ma commande'}<ArrowRight size={18}/></button></Modal>}
 </main>
}
function Customize({dish,onAdd,onClose}){
 const [quantity,setQuantity]=useState(1),[options,setOptions]=useState({cuisson:'',sans_piment:false,sans_oignon:false,allergies:'',note:''})
 const change=(k,v)=>setOptions(o=>({...o,[k]:v}))
 return <Modal title={dish.nom} onClose={onClose}><p className="muted">À votre goût, tout simplement.</p>{dish.personnalisable===1&&<label>Cuisson<select value={options.cuisson} onChange={e=>change('cuisson',e.target.value)}><option value="">Cuisson de la maison</option>{['Saignant','À point','Bien cuit'].map(v=><option key={v}>{v}</option>)}</select></label>}<div className="flex gap-4 flex-wrap">{[['sans_piment','Sans piment'],['sans_oignon','Sans oignon']].map(([k,v])=><label key={k} className="checkbox"><input type="checkbox" checked={options[k]} onChange={e=>change(k,e.target.checked)}/>{v}</label>)}</div><label>Allergies à signaler<input maxLength={250} placeholder="Ex. : arachides, lait…" value={options.allergies} onChange={e=>change('allergies',e.target.value)}/></label><p className="muted text-sm">En cas d’allergie, échangez également avec votre serveur.</p><label>Une attention particulière ?<textarea maxLength={250} placeholder="Votre demande…" value={options.note} onChange={e=>change('note',e.target.value)}/></label><div className="flex justify-between items-center my-5"><div className="stepper"><button aria-label="Diminuer" onClick={()=>setQuantity(q=>Math.max(1,q-1))}><Minus size={18}/></button><b>{quantity}</b><button aria-label="Augmenter" onClick={()=>setQuantity(q=>Math.min(dish.quantite,50,q+1))}><Plus size={18}/></button></div><strong className="price">{money(dish.prix*quantity)}</strong></div><button className="primary w-full" onClick={()=>onAdd({key:uid(),plat_id:dish.id,nom:dish.nom,prix:dish.prix,quantite:quantity,...options})}>Ajouter au panier<Plus size={18}/></button></Modal>
}
function useStaff(revision,fail){
 const [orders,setOrders]=useState([]),[alerts,setAlerts]=useState([])
 useEffect(()=>{let active=true;Promise.all([api('/commandes'),api('/alertes')]).then(([o,a])=>{if(active){setOrders(o);setAlerts(a)}}).catch(fail);return()=>{active=false}},[revision,fail])
 return {orders,alerts}
}
function Alerts({alerts,refresh,fail}){
 const [busy,setBusy]=useState(null)
 async function resolve(id){setBusy(id);try{await api(`/alertes/${id}/resoudre`,{method:'PATCH'});refresh()}catch(e){fail(e)}finally{setBusy(null)}}
 return alerts.length>0&&<section className="alerts"><Bell size={20}/>{alerts.map(a=><button key={a.id} disabled={busy===a.id} onClick={()=>resolve(a.id)}>Table {a.table_num} · {a.motif}<Check size={16}/></button>)}</section>
}
function Kitchen({revision,refresh,fail}){
 const {orders,alerts}=useStaff(revision,fail),[now,setNow]=useState(Date.now()),[sound,setSound]=useState(false),[busy,setBusy]=useState(null)
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[])
 async function enable(){try{audioContext=audioContext||new (window.AudioContext||window.webkitAudioContext)();await audioContext.resume();setSound(true);beep()}catch(e){fail(e)}}
 async function next(order){setBusy(order.id);try{await api(`/commandes/${order.id}/statut`,{method:'PATCH',body:{statut:order.statut==='en_attente'?'en_cuisson':'pret'}});refresh()}catch(e){fail(e)}finally{setBusy(null)}}
 return <main className="staff-main"><div className="page-heading"><div><div className="eyebrow">LE SERVICE EN DIRECT</div><h1>En cuisine</h1><p className="muted">{orders.filter(o=>o.statut!=='servi').length} commandes en cours</p></div><button className="secondary" onClick={enable}><Volume2 size={18}/>{sound?'Son activé':'Activer le bip'}</button></div><Alerts alerts={alerts} refresh={refresh} fail={fail}/><div className="kanban">{['en_attente','en_cuisson','pret'].map(status=><section key={status} className={'lane '+status}><h2><span className="dot"/>{statusLabels[status]}<b>{orders.filter(o=>o.statut===status).length}</b></h2>{orders.filter(o=>o.statut===status).map(o=>{const seconds=Math.max(0,Math.floor((now-new Date(o.cree_le).getTime())/1000));return <article key={o.id} className={'ticket '+(seconds>=900&&status!=='pret'?'late':'')}><div className="flex justify-between items-start"><div><span className="eyebrow">COMMANDE #{o.id}</span><h3>Table {String(o.table_num).padStart(2,'0')}</h3></div><span className="timer"><Clock size={15}/>{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</span></div><div className="ticket-items">{o.items.map(i=><div key={i.id}><h4><b>{i.quantite}×</b> {i.nom}</h4>{i.instructions&&<strong className="instructions">{i.instructions}</strong>}</div>)}</div>{status!=='pret'?<button className="primary w-full" disabled={busy===o.id} onClick={()=>next(o)}>{status==='en_attente'?'Lancer la préparation':'Marquer prêt'}<ArrowRight size={18}/></button>:<p className="ready"><Check size={18}/> À emporter en salle</p>}</article>})}{!orders.some(o=>o.statut===status)&&<div className="empty">Tout est à jour.</div>}</section>)}</div></main>
}
function Manager({menu,revision,refresh,fail,notify}){
 const {orders,alerts}=useStaff(revision,fail),[stats,setStats]=useState(null),[tab,setTab]=useState('service'),[editing,setEditing]=useState(null),[busy,setBusy]=useState(null)
 const [payment,setPayment]=useState(null),[method,setMethod]=useState('especes')
 useEffect(()=>{let active=true;api('/stats/jour').then(s=>active&&setStats(s)).catch(fail);return()=>{active=false}},[revision,fail])
 async function act(key,path,method,body){setBusy(key);try{await api(path,{method,body});refresh();return true}catch(e){fail(e);return false}finally{setBusy(null)}}
 async function categoryAction(c,action){if(action==='delete'){if(confirm(`Supprimer la catégorie « ${c.nom} » ? Elle doit être vide, y compris les plats archivés.`))await act('cat'+c.id,'/categories/'+c.id,'DELETE')}else{const nom=prompt('Nom de la catégorie',c?.nom||'');if(nom?.trim())await act('cat','/categories'+(c?'/'+c.id:''),c?'PUT':'POST',{nom:nom.trim()})}}
 return <main className="staff-main"><div className="page-heading"><div><div className="eyebrow">VOTRE RESTAURANT, EN UN REGARD</div><h1>Le tableau de bord</h1><p className="muted">Journée du {stats?.jour} · Bamako</p></div><div className="flex gap-2 no-print"><a className="secondary" href="/api/rapports/jour.csv" download><Download size={18}/> CSV</a><button className="secondary" onClick={()=>window.print()}><Printer size={18}/> Imprimer</button></div></div>
 <div className="stats-grid"><article><span>CHIFFRE D’AFFAIRES ENCAISSÉ</span><strong>{money(stats?.ca_fcfa||0)}</strong><small>Paiements enregistrés aujourd’hui</small></article><article><span>ENCAISSEMENTS</span><strong>{stats?.encaissements||0}</strong><small>Commandes réglées aujourd’hui</small></article><article><span>À ENCAISSER</span><strong>{money(stats?.impayes_fcfa||0)}</strong><small>Toutes les commandes non réglées</small></article></div>
 <div className="no-print"><Alerts alerts={alerts} refresh={refresh} fail={fail}/><div className="categories"><button className={tab==='service'?'active':''} onClick={()=>setTab('service')}>Service & encaissement</button><button className={tab==='menu'?'active':''} onClick={()=>setTab('menu')}>Carte & stocks</button><button className={tab==='qr'?'active':''} onClick={()=>setTab('qr')}>QR codes & Wi-Fi</button></div>
 {tab==='qr'?<QrManager fail={fail} notify={notify}/>:tab==='service'?<div className="service-list">{orders.map(o=><article className="service-row" key={o.id}><div><span className="eyebrow">#{o.id} · {statusLabels[o.statut]}</span><h3>Table {o.table_num}</h3><p className="muted">{o.items.map(i=>`${i.quantite}× ${i.nom}`).join(' · ')}</p></div><strong>{money(o.total)}</strong><div className="flex gap-2 flex-wrap">{o.statut==='pret'&&<button className="secondary" disabled={busy===o.id} onClick={()=>act(o.id,`/commandes/${o.id}/statut`,'PATCH',{statut:'servi'})}>Marquer servi</button>}{o.paye_le?<span className="ready"><Check size={18}/> Payée</span>:<button className="primary" onClick={()=>{setPayment(o);setMethod('especes')}}>Encaisser</button>}</div></article>)}{!orders.length&&<p className="empty">Aucune commande en cours.</p>}</div>:<><div className="flex gap-3 flex-wrap mb-5"><button className="primary" onClick={()=>setEditing({categorie_id:menu.categories[0]?.id||1,nom:'',description:'',prix:0,photo:'/photos/plat.svg',personnalisable:false,disponible:true})}><Plus size={18}/> Nouveau plat</button><button className="secondary" onClick={()=>categoryAction(null,'add')}>Nouvelle catégorie</button></div><div className="category-editor">{menu.categories.map(c=><div key={c.id}><span>{c.nom}</span><button className="icon" aria-label={'Renommer '+c.nom} onClick={()=>categoryAction(c,'edit')}><Pencil size={16}/></button><button className="icon" aria-label={'Supprimer '+c.nom} onClick={()=>categoryAction(c,'delete')}><Trash2 size={16}/></button></div>)}</div><div className="stock-list">{menu.plats.map(p=><article key={p.id} className="stock-row"><img src={p.photo} alt=""/><div><h3>{p.nom}</h3><p className="muted">{money(p.prix)} · {p.quantite} portions</p></div><button className={'availability '+(p.disponible?'on':'')} aria-pressed={!!p.disponible} disabled={busy===p.id} onClick={()=>act(p.id,`/plats/${p.id}/disponibilite`,'PATCH',{disponible:!p.disponible})}>{p.disponible?'À la carte':'En rupture'}</button><button className="secondary" onClick={()=>{const value=prompt('Nombre de portions disponibles',String(p.quantite));if(value!==null&&/^\d+$/.test(value))act(p.id,'/stocks/'+p.id,'PUT',{quantite:Number(value)})}}>Stock</button><button className="icon" aria-label={'Modifier '+p.nom} onClick={()=>setEditing({...p,personnalisable:!!p.personnalisable,disponible:!!p.disponible})}><Pencil size={18}/></button><button className="icon" aria-label={'Archiver '+p.nom} onClick={()=>{if(confirm(`Archiver « ${p.nom} » ?`))act(p.id,'/plats/'+p.id,'DELETE')}}><Trash2 size={18}/></button></article>)}</div></>}
 </div><section className="print-report"><h2>Rapport des encaissements · {stats?.jour}</h2><table><thead><tr><th>Commande</th><th>Table</th><th>Mode</th><th>FCFA</th></tr></thead><tbody>{stats?.paiements.map(p=><tr key={p.id}><td>#{p.id}</td><td>{p.table_num}</td><td>{p.mode_paiement}</td><td>{p.total}</td></tr>)}</tbody></table><p>Total : {money(stats?.ca_fcfa||0)}</p></section>
 {editing&&<DishEditor dish={editing} categories={menu.categories} onClose={()=>setEditing(null)} onSave={async body=>{if(await act('edit','/plats'+(editing.id?'/'+editing.id:''),editing.id?'PUT':'POST',body)){setEditing(null);notify('Plat enregistré. Vérifiez ses portions en stock.')}}} busy={busy==='edit'}/>}
 {payment&&<Modal title={`Encaisser la commande #${payment.id}`} onClose={()=>!busy&&setPayment(null)}><p className="price my-5">{money(payment.total)}</p><label>Mode de paiement<select value={method} onChange={e=>setMethod(e.target.value)}><option value="especes">Espèces</option><option value="mobile_money">Mobile Money</option><option value="carte">Carte</option></select></label><p className="muted">Confirmez uniquement après réception effective du paiement. Cette action enregistre le règlement.</p><button className="primary w-full" disabled={!!busy} onClick={async()=>{if(await act('pay',`/commandes/${payment.id}/paiement`,'POST',{mode:method})){setPayment(null);notify('Encaissement enregistré')}}}>Confirmer le règlement<Check size={18}/></button></Modal>}
 </main>
}
function DishEditor({dish,categories,onClose,onSave,busy}){
 const [form,setForm]=useState(dish);const update=(key,value)=>setForm(f=>({...f,[key]:value}))
 function submit(e){e.preventDefault();const {categorie_id,nom,description,prix,photo,personnalisable,disponible}=form;onSave({categorie_id,nom,description,prix,photo,personnalisable,disponible})}
 return <Modal title={dish.id?'Modifier le plat':'Nouveau plat'} onClose={onClose}><form onSubmit={submit}><label>Nom<input required maxLength={100} value={form.nom} onChange={e=>update('nom',e.target.value)}/></label><label>Catégorie<select value={form.categorie_id} onChange={e=>update('categorie_id',Number(e.target.value))}>{categories.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}</select></label><label>Description<textarea maxLength={500} value={form.description} onChange={e=>update('description',e.target.value)}/></label><label>Prix FCFA<input type="number" min="0" max="1000000" step="1" required value={form.prix} onChange={e=>update('prix',Number(e.target.value))}/></label><label>Photo locale<input required pattern="/photos/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|svg)" value={form.photo} onChange={e=>update('photo',e.target.value)}/></label><p className="muted text-sm">Le fichier doit être installé dans le dossier photos du serveur.</p><label className="checkbox"><input type="checkbox" checked={form.personnalisable} onChange={e=>update('personnalisable',e.target.checked)}/> Proposer le choix de cuisson</label><button className="primary w-full" disabled={busy}>Enregistrer<Check size={18}/></button></form></Modal>
}

createRoot(document.getElementById('root')).render(<App/> )
if(import.meta.env.PROD&&'serviceWorker' in navigator&&window.isSecureContext){
 window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(console.error))
}
