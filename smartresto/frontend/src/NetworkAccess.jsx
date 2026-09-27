import React,{useEffect,useState,useRef} from 'react'
import QRCode from 'qrcode'
import {api} from './api'
import {normalizeBase} from './qr-utils'

export default function NetworkAccess({onOrigin,fail,notify}){
 const [info,setInfo]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const [image,setImage]=useState(''),[custom,setCustom]=useState(''),[changed,setChanged]=useState(false)
 const previous=useRef(''),requestId=useRef(0)
 async function refresh(){
  const id=++requestId.current
  try{
   const data=await api('/network')
   if(id!==requestId.current)return
   if(previous.current&&data.origin&&previous.current!==data.origin)setChanged(true)
   previous.current=data.origin;setInfo(data);onOrigin(data.origin);setError('')
  }catch(e){if(id===requestId.current){setError(e.message);onOrigin('')}}
 }
 useEffect(()=>{refresh();const timer=setInterval(refresh,15000);window.addEventListener('focus',refresh)
  return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);requestId.current++}
 },[])
 useEffect(()=>{
  let cancelled=false;setImage('')
  if(info?.origin&&!error)QRCode.toString(info.origin,{type:'svg',width:300,margin:4,errorCorrectionLevel:'M'})
   .then(svg=>{if(!cancelled)setImage('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg))})
   .catch(()=>{if(!cancelled)setError('Impossible de préparer le QR. Actualisez les adresses.')})
  return()=>{cancelled=true}
 },[info?.origin,error])
 async function save(mode,origin=''){
  setBusy(true)
  try{if(mode==='manual')origin=normalizeBase(origin)
   await api('/network',{method:'PUT',body:{mode,origin}});await refresh()
   notify('Adresse enregistrée pour les QR du restaurant.')
  }catch(e){fail(e)}finally{setBusy(false)}
 }
 const stale=info?.mode==='manual'&&/^http:\/\/\d+\.\d+\.\d+\.\d+/.test(info.origin)&&!info.choices.some(c=>c.origin===info.origin)
 return <div className="network-access panel">
  <div><div className="eyebrow">ACCÈS AU TÉLÉPHONE</div><h2>Scannez, c’est ouvert.</h2>
   <p>Connectez le téléphone au Wi-Fi du restaurant, puis scannez ce QR pour ouvrir SmartResto. Les clients utilisent ensuite le QR de leur table ; les espaces du personnel gardent leur code.</p>
   {error&&<p role="alert" className="pending">{error}</p>}
   {!info&&!error&&<p role="status">Recherche des adresses du PC…</p>}
   {info&&!info.origin&&!error&&<p className="pending">Aucune adresse accessible détectée. Connectez le PC au réseau du restaurant, puis actualisez. Vous pouvez aussi renseigner une adresse ci-dessous.</p>}
   {info?.origin&&!error&&<p className="access-url"><a href={info.origin}>{info.origin}</a></p>}
   <div className="flex gap-3 flex-wrap"><button className="secondary" disabled={busy} onClick={refresh}>Actualiser les adresses</button>
   <button className="primary" disabled={busy||info?.mode==='auto'} onClick={()=>save('auto')}>{info?.mode==='auto'?'Adresse automatique activée':'Utiliser l’adresse automatique'}</button></div>
   <p className="muted text-sm">Vérification toutes les 15 secondes. Le réglage est partagé avec les autres appareils de la caisse. Sur ce PC, ouvrez toujours http://localhost:8000, même après un changement de Wi-Fi.</p>
  </div>
  {image&&!error&&<figure className="phone-qr"><img src={image} alt="QR pour ouvrir SmartResto sur un téléphone"/><figcaption>Ouvrir SmartResto</figcaption></figure>}
  <div className="network-options">
   {(changed||stale)&&<p className="pending" role="status">{stale?'L’adresse choisie n’apparaît plus parmi les adresses détectées. Repassez en mode automatique ou choisissez une adresse actuelle.':'L’adresse a changé : les nouveaux QR utilisent maintenant cette adresse.'} Réimprimez les affiches déjà distribuées et remplacez les anciennes.</p>}
   <details><summary>Choisir une autre adresse</summary><p className="muted">Si le PC a plusieurs connexions (Wi-Fi, câble ou VPN), testez l’adresse accessible depuis le Wi-Fi du téléphone. La détection ne peut pas vérifier le téléphone ni les règles du routeur.</p>
   {info?.choices.map(c=><div className="address-choice" key={c.origin}><span><strong>{c.interface}</strong><small>{c.origin}</small></span><button className="secondary" disabled={busy} onClick={()=>save('manual',c.origin)}>Utiliser cette adresse</button></div>)}
   <form onSubmit={e=>{e.preventDefault();save('manual',custom)}}><label>Adresse personnalisée<input value={custom} onChange={e=>setCustom(e.target.value)} placeholder="http://smartresto.local:8000" required/></label><button className="secondary" disabled={busy}>Enregistrer cette adresse</button></form>
   {info?.https&&<p className="muted text-sm">En HTTPS, conservez un nom couvert par le certificat installé sur les appareils. Les adresses IP ne sont pas substituées automatiquement.</p>}
   </details>
  </div>
 </div>
}
