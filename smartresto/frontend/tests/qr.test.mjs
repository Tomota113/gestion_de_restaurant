import {test} from 'node:test'
import assert from 'node:assert/strict'
import {wifiPayload,normalizeBase,tableUrl,postersHtml} from '../src/qr-utils.js'
test('Wi-Fi special characters and open network',()=>{
 assert.equal(wifiPayload({ssid:'Resto;A:B\\C,"',password:'pass;word',hidden:true}),'WIFI:T:WPA;S:Resto\\;A\\:B\\\\C\\,\\";P:pass\\;word;H:true;;')
 assert.equal(wifiPayload({ssid:'Resto',password:'',security:'nopass'}),'WIFI:T:nopass;S:Resto;P:;H:false;;')
 assert.throws(()=>wifiPayload({ssid:'Resto',password:'short'}))
 assert.throws(()=>wifiPayload({ssid:'é'.repeat(17),password:'12345678'}))
})
test('LAN URL validation and table invitation fragment',()=>{
 assert.equal(normalizeBase('http://192.168.0.112:8000/'),'http://192.168.0.112:8000')
 for(const url of ['javascript:alert(1)','http://localhost:8000','http://u:p@resto','http://resto/foo','http://0.0.0.0:8000'])assert.throws(()=>normalizeBase(url))
 assert.equal(tableUrl('http://192.168.0.112:8000',{table_num:5,token:'abc_xyz'}),'http://192.168.0.112:8000/#table=5&key=abc_xyz')
})
test('Printable HTML escapes Wi-Fi names; missing Wi-Fi has no fake QR',()=>{
 const html=postersHtml({posters:[{table_num:5,image:'data:image/png;base64,AA'}],ssid:'<script>alert(1)</script>',wifiImage:'data:image/png;base64,AA',base:'http://resto'})
 assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'))
 const missing=postersHtml({posters:[{table_num:1,image:'data:image/png;base64,AA'}],base:'http://resto'})
 assert.ok(missing.includes('QR Wi-Fi non renseigné'));assert.equal((missing.match(/<img /g)||[]).length,1)
})

test('Changing address preserves the table invitation and updates all exported links',()=>{
 const row={table_num:5,token:'kept-token'}
 const oldLink=tableUrl('http://192.168.0.112:8000',row)
 const newLink=tableUrl('http://192.168.1.45:8000',row)
 assert.equal(new URL(oldLink).hash,new URL(newLink).hash)
 assert.equal(new URL(newLink).origin,'http://192.168.1.45:8000')
 for(const url of ['http://127.1:8000','http://127.0.0.2','http://x.localhost','http://[::]'])assert.throws(()=>normalizeBase(url))
})
