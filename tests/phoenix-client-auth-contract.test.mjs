import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../public/phoenix.js',import.meta.url),'utf8');
function client(fakeFetch){
 const start=source.indexOf('async function vaultApi(path,options={}){');
 const end=source.indexOf('async function saveToUberBond()',start);
 assert.ok(start>=0&&end>start,'Expected PHOENIX vault API function must exist');
 const fn=source.slice(start,end);
 return new Function('fetch',fn+'\nreturn vaultApi;')(fakeFetch);
}
test('cookie-authenticated POST carries owner CSRF header and the original payload',async()=>{
 const calls=[];
 const api=client(async(path,options)=>{calls.push({path,options});return {ok:true,json:async()=>({ok:true})};});
 await api('/api/phoenix/capsules',{method:'POST',body:'{"hello":1}',headers:{'content-type':'application/json'}});
 assert.equal(calls.length,1);
 assert.equal(calls[0].path,'/api/phoenix/capsules');
 assert.equal(calls[0].options.method,'POST');
 assert.equal(calls[0].options.body,'{"hello":1}');
 assert.equal(calls[0].options.credentials,'same-origin');
 assert.equal(calls[0].options.headers['content-type'],'application/json');
 assert.equal(calls[0].options.headers['x-uberbond-owner-csrf'],'1');
});
test('protected read stays same-origin and supplies guarded cookie request',async()=>{
 const calls=[];
 const api=client(async(path,options)=>{calls.push(options);return {ok:true,json:async()=>({ok:true})};});
 await api('/api/phoenix/capsules');
 assert.equal(calls[0].credentials,'same-origin');
 assert.equal(calls[0].cache,'no-store');
 assert.equal(calls[0].headers['x-uberbond-owner-csrf'],'1');
});
test('server rejection never appears as success',async()=>{
 const api=client(async()=>({ok:false,status:403,json:async()=>({status:'PHOENIX_OWNER_ONLY'})}));
 await assert.rejects(api('/api/phoenix/capsules',{method:'POST'}),/PHOENIX_OWNER_ONLY/);
});
