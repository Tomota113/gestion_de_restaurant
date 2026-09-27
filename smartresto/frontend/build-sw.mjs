import {readdir, readFile, writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
async function walk(dir){const out=[]; for(const e of await readdir(dir,{withFileTypes:true})){const p=dir+'/'+e.name; if(e.isDirectory()) out.push(...await walk(p)); else if(e.name!=='sw.js')out.push(p)}return out}
const files=await walk('dist'); const hash=createHash('sha256'); for(const p of files)hash.update(await readFile(p));
const name='smartresto-'+hash.digest('hex').slice(0,12);
const urls=files.map(p=>'/'+p.slice(5));
await writeFile('dist/sw.js',`
const CACHE=${JSON.stringify(name)}, FILES=${JSON.stringify(urls)};
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));
// A new release activates only after all old tabs close: no mid-service forced refresh.
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('smartresto-')&&k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url);
 if(e.request.method!=='GET'||u.origin!==location.origin||u.pathname.startsWith('/api/')||u.pathname.startsWith('/ws/'))return;
 if(e.request.mode==='navigate'){
   e.respondWith(fetch(e.request).catch(()=>caches.match('/index.html'))); return;
 }
 if(FILES.includes(u.pathname))e.respondWith(caches.open(CACHE).then(c=>c.match(e.request).then(r=>r||fetch(e.request))));
});
`)
console.log('Service worker generated:', name, files.length, 'local assets')
