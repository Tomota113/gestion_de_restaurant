import React,{useState,useEffect,useRef} from 'react'
import {UtensilsCrossed,ArrowRight} from 'lucide-react'
import {api,readStored} from './api'

export default function QrEntry({invitation,onDone,onCancel}){
 const [error,setError]=useState(''),[guard,setGuard]=useState(''),[busy,setBusy]=useState(true)
 const current=useRef(null),started=useRef(false)
 function clearDraft(){for(const key of ['sr-cart','sr-pending','sr-receipt'])localStorage.removeItem(key)}
 async function enter(clear=false){
  setBusy(true);setError('');setGuard('')
  try{
   // Do not erase any draft until the new invitation has been accepted.
   await api('/auth/table',{method:'POST',body:invitation})
   const session=await api('/auth/me')
   if(clear||!current.current||current.current.session_id!==session.session_id)clearDraft()
   localStorage.setItem('sr-table',String(session.table_num))
   onDone(session)
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 useEffect(()=>{if(started.current)return;started.current=true;(async()=>{
  try{current.current=await api('/auth/me')}catch{}
  const pending=readStored('sr-pending',null),cart=readStored('sr-cart',[])
  const same=current.current?.role==='client'&&current.current?.table_num===invitation.table_num
  if(pending&&!same){setGuard('pending');setBusy(false);return}
  if(current.current&&current.current.role!=='client'){setGuard('staff');setBusy(false);return}
  if(cart.length&&!same){setGuard('cart');setBusy(false);return}
  await enter()
 })()},[])
 return <main className="login qr-entry"><UtensilsCrossed size={36} className="text-gold"/><div className="eyebrow mt-6">BIENVENUE CHEZ VOUS</div><h1>Table {String(invitation.table_num||'—').padStart(2,'0')}</h1>{busy?<p className="muted">Ouverture de votre menu…</p>:<>{error&&<p role="alert" className="pending">{error}</p>}{guard==='pending'&&<p className="pending">Une commande attend encore confirmation. Faites vérifier son enregistrement par la caisse avant de changer de table ou de session.</p>}{guard==='staff'&&<p className="muted">Cette fenêtre est connectée au personnel. Ouvrir le menu de cette table remplacera cette session par un accès client.</p>}{guard==='cart'&&<p className="muted">Un panier d’une autre table ou session est présent. Voulez-vous l’effacer et ouvrir cette table ?</p>}<div className="grid gap-3 mt-6"><button className="primary" onClick={()=>{if(guard==='pending'&&!confirm('La caisse a-t-elle vérifié la commande ? Continuer efface ce panier, sans annuler une commande déjà enregistrée.'))return;enter(!!guard)}}>{guard==='pending'?'La caisse a vérifié : ouvrir cette table':guard?'Ouvrir cette table':'Réessayer'}<ArrowRight size={18}/></button><button className="secondary" onClick={()=>onCancel(current.current)}>Retour</button></div></>}</main>
}
