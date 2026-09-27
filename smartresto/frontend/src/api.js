export async function api(path, options={}) {
  const controller = new AbortController()
  const timer = setTimeout(()=>controller.abort(),12000)
  try {
    const response = await fetch('/api'+path,{
      credentials:'same-origin', cache:'no-store', ...options,
      headers:{'Content-Type':'application/json', ...options.headers}, signal:controller.signal,
      body:options.body===undefined?undefined:JSON.stringify(options.body),
    })
    const data = await response.json()
    if(!response.ok){
      const error = new Error(typeof data.detail==='string'?data.detail:'Données invalides. Vérifiez les champs.')
      error.status = response.status
      if(response.status===401)window.dispatchEvent(new Event('session-expired'))
      throw error
    }
    return data
  } catch(error) {
    if(error.name==='AbortError')throw new Error('Le serveur ne répond pas. Vérifiez le Wi-Fi local.')
    throw error
  } finally {clearTimeout(timer)}
}
export const money=n=>new Intl.NumberFormat('fr-FR').format(n)+' FCFA'
export function uid(){
  // getRandomValues remains available on HTTP LAN, unlike randomUUID on some browsers.
  const a=crypto.getRandomValues(new Uint8Array(16)); a[6]=(a[6]&15)|64; a[8]=(a[8]&63)|128;
  const h=Array.from(a,x=>x.toString(16).padStart(2,'0')).join('')
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`
}
export function readStored(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
