import React,{useState,useEffect} from 'react'
import QRCode from 'qrcode'
import {Printer,Download,RefreshCw} from 'lucide-react'
import {api} from './api'
import {wifiPayload,normalizeBase,tableUrl,postersHtml} from './qr-utils'
import NetworkAccess from './NetworkAccess'

function download(content,name,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000)}
async function qrImage(text,options){const svg=await QRCode.toString(text,{...options,type:'svg'});return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)}
export default function QrManager({fail,notify}){
 const [rows,setRows]=useState([]),[base,setBase]=useState('')
 const [ssid,setSsid]=useState(''),[password,setPassword]=useState(''),[security,setSecurity]=useState('WPA'),[hidden,setHidden]=useState(false),[withWifi,setWithWifi]=useState(false)
 const [selection,setSelection]=useState('all'),[busy,setBusy]=useState(false),[preview,setPreview]=useState(null)
 useEffect(()=>{api('/qr/tables').then(setRows).catch(fail)},[fail])
 useEffect(()=>{
  let cancelled=false;setPreview(null)
  if(base&&rows.length)buildPosters(base).then(data=>{if(!cancelled)setPreview(data)}).catch(()=>{})
  return()=>{cancelled=true}
 },[rows,base,ssid,password,security,hidden,withWifi,selection])
 async function buildPosters(address){
  const origin=normalizeBase(address)
  const selected=rows.filter(r=>selection==='all'||r.table_num===Number(selection))
  if(!selected.length)throw new Error('Aucune table disponible.')
  const options={width:512,margin:4,errorCorrectionLevel:'M',color:{dark:'#000000',light:'#ffffff'}}
  const wifiImage=withWifi?await qrImage(wifiPayload({ssid,password,security,hidden}),options):''
  const posters=await Promise.all(selected.map(async r=>({...r,url:tableUrl(origin,r),image:await qrImage(tableUrl(origin,r),options)})))
  const output={posters,ssid,wifiImage,base:origin}
  return output
 }
 async function currentOrigin(){
  const data=await api('/network');setBase(data.origin)
  if(!data.origin)throw new Error('Aucune adresse disponible. Actualisez les adresses du PC.')
  return data.origin
 }
 async function produce(mode){setBusy(true);try{const data=await buildPosters(await currentOrigin());const html=postersHtml(data)
  if(mode==='download'){download(html,'SmartResto-affiches-QR.html','text/html;charset=utf-8');notify('Affiches téléchargées. Ouvrez le fichier pour imprimer ou enregistrer en PDF.')}
  else if(mode==='print'){
   const frame=document.createElement('iframe');frame.style.cssText='position:fixed;width:1px;height:1px;right:0;bottom:0;border:0';document.body.appendChild(frame)
   frame.onload=async()=>{try{await Promise.all([...frame.contentDocument.images].map(img=>img.decode().catch(()=>{})));frame.contentWindow.focus();frame.contentWindow.print()}catch(e){fail(e)}finally{setTimeout(()=>frame.remove(),60000)}}
   frame.srcdoc=html
  }
 }catch(e){fail(e)}finally{setBusy(false)}}
 async function rotate(row){if(!confirm(`Remplacer le QR de la table ${row.table_num} ? L’ancien QR et ses sessions clients seront désactivés. Faites-le hors service, puis réimprimez l’affiche.`))return;setBusy(true);try{const result=await api(`/qr/tables/${row.table_num}/renouveler`,{method:'POST'});setRows(old=>old.map(r=>r.table_num===row.table_num?result:r));notify('QR remplacé. Réimprimez celui de cette table.')}catch(e){fail(e)}finally{setBusy(false)}}
 async function svg(row){setBusy(true);try{const url=tableUrl(await currentOrigin(),row);const data=await QRCode.toString(url,{type:'svg',width:1024,margin:4,errorCorrectionLevel:'M'});download(data,`SmartResto-table-${String(row.table_num).padStart(2,'0')}.svg`,'image/svg+xml')}catch(e){fail(e)}finally{setBusy(false)}}
 return <section className="qr-manager"><div className="qr-intro"><h2>Les QR de votre restaurant</h2><p className="muted">Le client rejoint le Wi-Fi, scanne sa table et commande sans code d’accès.</p></div><NetworkAccess onOrigin={setBase} fail={fail} notify={notify}/><div className="qr-settings"><h3>Affiches des tables</h3><p className="muted text-sm">Les QR à l’écran et les prochains téléchargements suivent l’adresse ci-dessus. Les affiches imprimées et les fichiers déjà téléchargés restent inchangés : refaites-les après un changement d’adresse. Pour garder les mêmes affiches, faites réserver l’adresse du PC dans le routeur.</p><label className="checkbox"><input type="checkbox" checked={withWifi} onChange={e=>setWithWifi(e.target.checked)}/> Ajouter le QR de connexion Wi-Fi</label>{withWifi&&<><label>Nom exact du réseau Wi-Fi<input value={ssid} onChange={e=>setSsid(e.target.value)} autoComplete="off"/></label><label>Protection du Wi-Fi<select value={security} onChange={e=>setSecurity(e.target.value)}><option value="WPA">WPA / WPA2 personnel</option><option value="nopass">Réseau ouvert, sans mot de passe</option></select></label>{security!=='nopass'&&<label>Mot de passe Wi-Fi<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password"/></label>}<label className="checkbox"><input type="checkbox" checked={hidden} onChange={e=>setHidden(e.target.checked)}/> Réseau masqué</label><p className="muted text-sm">Le mot de passe reste dans cette page, sans envoi au serveur. Il est encodé dans le QR imprimé et n’est pas mémorisé après fermeture.</p></>}<label>Affiches à préparer<select value={selection} onChange={e=>setSelection(e.target.value)}><option value="all">Toutes les tables ({rows.length})</option>{rows.map(r=><option key={r.table_num} value={r.table_num}>Table {r.table_num}</option>)}</select></label><div className="flex gap-3 flex-wrap mt-5"><button className="primary" disabled={busy||!base} onClick={()=>produce('print')}><Printer size={18}/> Imprimer les affiches</button><button className="secondary" disabled={busy||!base} onClick={()=>produce('download')}><Download size={18}/> Télécharger les affiches</button></div></div>
 {preview&&<div className="qr-preview"><h3>Aperçu · Table {preview.posters[0].table_num}</h3><div className="qr-preview-images">{preview.wifiImage?<figure><img src={preview.wifiImage} alt="QR Wi-Fi"/><figcaption>1. Se connecter au Wi-Fi</figcaption></figure>:<p>Wi-Fi à demander au personnel.</p>}<figure><img src={preview.posters[0].image} alt={'QR menu table '+preview.posters[0].table_num}/><figcaption>2. Voir le menu et commander</figcaption></figure></div></div>}
 <div className="stock-list mt-6">{rows.map(row=><div className="stock-row" key={row.table_num}><div><h3>Table {String(row.table_num).padStart(2,'0')}</h3><p className="muted">Accès client uniquement · QR version {row.version}</p></div><button className="secondary" disabled={busy||!base} onClick={()=>svg(row)}><Download size={16}/> QR en SVG</button><button className="icon" title="Remplacer ce QR" aria-label={'Remplacer le QR table '+row.table_num} disabled={busy} onClick={()=>rotate(row)}><RefreshCw size={18}/></button></div>)}</div></section>
}
