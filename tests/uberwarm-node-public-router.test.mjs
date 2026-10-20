import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createUberWarmNodePublicRouter} from '../src/uberwarm-node-public-router.mjs';
import {createUberWarmNodeBridge} from '../src/uberwarm-vercel-node-bridge.mjs';
import {createFetchHandler} from '../api/webhooks/winnr.mjs';
import {createHandlers} from '../api/unsubscribe.mjs';
import {createUberWarmUnsubscribeToken} from '../src/uberwarm-unsubscribe.mjs';

const secret='whsec_synthetic_local_router_test_only_123456789';
const optout='synthetic-local-optout-key-12345678901234567890';
async function fixture(run){
 const writes=[];
 const env={WINNR_WEBHOOK_SECRET:secret,UBERWARM_UNSUBSCRIBE_SECRET:optout,DATABASE_URL:'fixture-only'};
 const webhook=createUberWarmNodeBridge(createFetchHandler({env,poolFactory:()=>({}),persist:async(_,p)=>{writes.push(p);return {status:p.action,duplicate:false,suppressionHeld:p.action==='SUPPRESSED_RECIPIENT'};}}));
 const u=createHandlers({env,poolFactory:()=>({}),persist:async(_,p)=>{writes.push(p);}});
 const router=createUberWarmNodePublicRouter({webhook,unsubscribe:createUberWarmNodeBridge(r=>r.method==='POST'?u.POST(r):u.GET(r))});
 const server=http.createServer(async(req,res)=>{if(await router(req,res))return;res.writeHead(418);res.end('protected-core');});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 try{await run('http://127.0.0.1:'+server.address().port,writes);}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}
test('Node preset receives the exact raw signed callback without an admin bearer',()=>fixture(async(base,writes)=>{
 const body='{ "id":"evt_local_ping", "object":"event", "type":"test.ping", "data":{} }';
 const ts=String(Math.floor(Date.now()/1000));const sig=createHmac('sha256',secret).update(ts+'.'+body).digest('hex');
 const r=await fetch(base+'/api/webhooks/winnr',{method:'POST',headers:{'x-winnr-timestamp':ts,'x-winnr-signature':'v1='+sig},body});
 assert.equal(r.status,200);assert.equal((await r.json()).sendAuthority,'NONE');assert.equal(writes.length,1);
}));
test('bad webhook signature and lookalike routes never persist or enter public routing',()=>fixture(async(base,writes)=>{
 assert.equal((await fetch(base+'/api/webhooks/winnr',{method:'POST',body:'{}'})).status,401);
 for(const p of ['/api/webhooks/winnr/extra','/api/admin/health?token=bogus','/api/unsubscribe/extra'])assert.equal((await fetch(base+p)).status,418);
 assert.equal(writes.length,0);
}));
test('valid unsubscribe GET is public but does not mutate; POST retains signed capability',()=>fixture(async(base,writes)=>{
 const token=createUberWarmUnsubscribeToken({recipientEmail:'fixture@example.invalid',secret:optout});
 const url=base+'/api/unsubscribe?token='+encodeURIComponent(token);
 assert.equal((await fetch(url)).status,200);assert.equal(writes.length,0);
 assert.equal((await fetch(url,{method:'POST'})).status,200);assert.equal(writes.length,1);
 assert.equal((await fetch(base+'/api/unsubscribe?token=forged',{method:'POST'})).status,400);assert.equal(writes.length,1);
}));
test('shared Node entrypoint routes capabilities before privileged query-token rejection',()=>{
 const s=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
 assert.ok(s.indexOf('await routeUberWarmNodePublicCapability(req,res)')<s.indexOf("url.searchParams.has('token')"));
 assert.ok(s.includes("import './src/provider-receipt-redaction.mjs'"));
});
