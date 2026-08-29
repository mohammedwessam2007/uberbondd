import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { BrowserRuntimePool, getSharedBrowserRuntime, closeSharedBrowserRuntimes } from '../src/browser-runtime-pool.mjs';
import { fetchOverpassWithPolicy } from '../src/overpass-throttle.mjs';
import { compileArtifactStorageWrite, normalizeArtifactObjectReceipt } from '../src/artifact-storage-contract.mjs';
import { planPaymentReconciliation } from '../src/payment-reconciliation-watchdog.mjs';
import { claimBillingEvents, finishBillingEvent } from '../src/billing-webhook-repository.mjs';

test('browser runtime shares process but isolates contexts and closes each lease', async () => {
  let launches=0, contexts=0, closes=0;
  const browser={isConnected:()=>true,newContext:async()=>({id:++contexts,close:async()=>{closes++}}),close:async()=>{},on:()=>{}};
  const pool=new BrowserRuntimePool({launchBrowser:async()=>{launches++;return browser},maxConcurrentContexts:2,recycleAfterContexts:10});
  const a=await pool.acquire(), b=await pool.acquire();
  assert.equal(launches,1); assert.notEqual(a.context.id,b.context.id);
  await a.release(); await b.release(); assert.equal(closes,2); await pool.close();
});

test('browser runtime concurrency gate blocks a third context until release', async () => {
  let contexts=0;
  const browser={isConnected:()=>true,newContext:async()=>({id:++contexts,close:async()=>{}}),close:async()=>{},on:()=>{}};
  const pool=new BrowserRuntimePool({launchBrowser:async()=>browser,maxConcurrentContexts:2,recycleAfterContexts:10});
  const a=await pool.acquire(), b=await pool.acquire(); let acquired=false;
  const cPromise=pool.acquire().then(x=>{acquired=true;return x});
  await new Promise(r=>setTimeout(r,10)); assert.equal(acquired,false);
  await a.release(); const c=await cPromise; assert.equal(acquired,true);
  await b.release(); await c.release(); await pool.close();
});

test('browser runtime recycles shared process after bounded contexts', async () => {
  let launches=0, browserCloses=0;
  const make=()=>({isConnected:()=>true,newContext:async()=>({close:async()=>{}}),close:async()=>{browserCloses++},on:()=>{}});
  const pool=new BrowserRuntimePool({launchBrowser:async()=>{launches++;return make()},maxConcurrentContexts:1,recycleAfterContexts:2});
  const a=await pool.acquire(); await a.release(); const b=await pool.acquire(); await b.release();
  const c=await pool.acquire(); assert.equal(launches,2); assert.equal(browserCloses,1); await c.release(); await pool.close();
});

test('browser runtime stress never exceeds configured context cap',async()=>{
  const browser={isConnected:()=>true,newContext:async()=>({close:async()=>{}}),close:async()=>{},on:()=>{}};
  const pool=new BrowserRuntimePool({launchBrowser:async()=>browser,maxConcurrentContexts:3,recycleAfterContexts:100});
  let maxActive=0;
  await Promise.all(Array.from({length:50},async()=>{const lease=await pool.acquire();maxActive=Math.max(maxActive,pool.active);await new Promise(r=>setTimeout(r,1));await lease.release();}));
  assert.equal(maxActive,3); await pool.close();
});

test('non-worker shared-runtime request auto-closes after its crawl lease',async()=>{
  const previous=process.env.PROCESS_ROLE; delete process.env.PROCESS_ROLE;
  let browserCloses=0;
  const browser={isConnected:()=>true,newContext:async()=>({close:async()=>{}}),close:async()=>{browserCloses++},on:()=>{}};
  try {
    const runtime=getSharedBrowserRuntime({key:'test-non-worker',launchBrowser:async()=>browser});
    const lease=await runtime.acquire(); await lease.release();
    assert.equal(runtime.closed,true); assert.equal(browserCloses,1);
  } finally { if(previous===undefined) delete process.env.PROCESS_ROLE; else process.env.PROCESS_ROLE=previous; }
});

test('worker role keeps browser process reusable until explicit shutdown',async()=>{
  const previous=process.env.PROCESS_ROLE; process.env.PROCESS_ROLE='worker';
  let browserCloses=0;
  const browser={isConnected:()=>true,newContext:async()=>({close:async()=>{}}),close:async()=>{browserCloses++},on:()=>{}};
  try {
    const runtime=getSharedBrowserRuntime({key:'test-worker-persistent',launchBrowser:async()=>browser,recycleAfterContexts:100});
    const lease=await runtime.acquire(); await lease.release();
    assert.equal(runtime.closed,false); assert.equal(browserCloses,0);
    await closeSharedBrowserRuntimes(); assert.equal(browserCloses,1);
  } finally { if(previous===undefined) delete process.env.PROCESS_ROLE; else process.env.PROCESS_ROLE=previous; }
});

test('crawler source uses pooled context lease rather than per-crawl browser close', async()=>{
  const source=await fs.readFile(new URL('../src/browser-crawler.mjs',import.meta.url),'utf8');
  assert.match(source,/getSharedBrowserRuntime/);
  assert.match(source,/runtime\.acquire/);
  assert.doesNotMatch(source,/const browser=await chromium\.launch/);
  assert.match(source,/lease\.release/);
});

test('worker drains shared browser runtime during shutdown',async()=>{
  const source=await fs.readFile(new URL('../worker.mjs',import.meta.url),'utf8');
  assert.match(source,/closeSharedBrowserRuntimes/);
});

test('Overpass 429 honors Retry-After and retries', async()=>{
  const sleeps=[]; let calls=0; const gate={tail:Promise.resolve(),nextAllowedAt:0};
  const responses=[{ok:false,status:429,headers:{get:k=>k==='retry-after'?'2':null}},{ok:true,status:200,headers:{get:()=>null}}];
  const r=await fetchOverpassWithPolicy(async()=>responses[calls++],'x',{}, {gate,now:()=>0,sleep:async ms=>sleeps.push(ms),maxAttempts:3,minIntervalMs:0,timeoutMs:5000});
  assert.equal(r.status,200); assert.deepEqual(sleeps,[2000]);
});

test('Overpass gate serializes simultaneous provider calls',async()=>{
  let inflight=0,maxInflight=0,calls=0; const gate={tail:Promise.resolve(),nextAllowedAt:0};
  const fetcher=async()=>{calls++;inflight++;maxInflight=Math.max(maxInflight,inflight);await new Promise(r=>setTimeout(r,2));inflight--;return {ok:true,status:200,headers:{get:()=>null}};};
  await Promise.all(Array.from({length:20},()=>fetchOverpassWithPolicy(fetcher,'x',{}, {gate,minIntervalMs:0,timeoutMs:5000,maxAttempts:1,sleep:async()=>{}})));
  assert.equal(calls,20); assert.equal(maxInflight,1);
});

test('Overpass permanent 400 does not retry', async()=>{
  let calls=0; await assert.rejects(()=>fetchOverpassWithPolicy(async()=>{calls++;return {ok:false,status:400,headers:{get:()=>null}}},'x',{}, {gate:{tail:Promise.resolve(),nextAllowedAt:0},sleep:async()=>{},maxAttempts:3}),/HTTP 400/); assert.equal(calls,1);
});

test('discovery source routes Overpass through the provider throttle',async()=>{
  const source=await fs.readFile(new URL('../src/discovery.mjs',import.meta.url),'utf8');
  assert.match(source,/fetchOverpassWithPolicy/);
});

test('object storage plan never silently falls back to Postgres bytes',()=>{
  const base={backend:'object',artifactId:'a1',contentType:'image/png',sha256:'a'.repeat(64),byteSize:1024};
  assert.equal(compileArtifactStorageWrite(base).ok,false);
  const plan=compileArtifactStorageWrite({...base,adapterConfigured:true}); assert.equal(plan.ok,true); assert.equal(plan.plan.persistPostgresBytes,false); assert.equal(plan.plan.visibility,'PRIVATE');
});

test('object receipt refuses public-by-default objects',()=>{
  assert.equal(normalizeArtifactObjectReceipt({storageKey:'k',etag:'e',sha256:'a'.repeat(64),public:true}).ok,false);
});

test('payment watchdog recovers stale claims but never unlocks from webhook presence',()=>{
  const p=planPaymentReconciliation({status:'CLAIMED',claimedAt:'2026-08-29T08:00:00Z',claimAttempts:1},{now:'2026-08-29T09:00:00Z'});
  assert.equal(p.action,'RECOVER_STALE_CLAIM'); assert.equal(p.unlockAuthorized,false);
  const r=planPaymentReconciliation({status:'RECEIVED',claimAttempts:0},{now:'2026-08-29T09:00:00Z'}); assert.equal(r.action,'CLAIM_FOR_RECONCILIATION'); assert.equal(r.unlockAuthorized,false);
});

test('uncertain payment state blocks blind retry and escalates only after timeout',()=>{
  const p=planPaymentReconciliation({status:'UNCERTAIN',updatedAt:'2026-08-29T08:50:00Z'},{now:'2026-08-29T09:00:00Z'}); assert.equal(p.action,'WAIT_FOR_RECONCILIATION');
  const q=planPaymentReconciliation({status:'UNCERTAIN',updatedAt:'2026-08-29T08:00:00Z'},{now:'2026-08-29T09:00:00Z'}); assert.equal(q.action,'ESCALATE_REVIEW');
});

test('billing repository makes claims recoverable and caps stale retries',async()=>{
  const queries=[];
  const client={query:async(sql,args)=>{queries.push([sql,args]);if(/RETURNING b\.provider_event_key/.test(sql))return {rows:[]};return {rows:[]}},release:()=>{}};
  const pool={connect:async()=>client};
  await claimBillingEvents(pool,{workerRef:'w1',staleClaimMs:60000,maxAttempts:3});
  assert.match(queries[1][0],/claim-attempt-cap-reached/);
  assert.match(queries[2][0],/claim_attempts=b\.claim_attempts\+1/);
  assert.match(queries[2][0],/status='CLAIMED'/);
});

test('reconciled billing event requires canonical payment receipt',async()=>{
  const pool={query:async()=>({rowCount:1})};
  await assert.rejects(()=>finishBillingEvent(pool,{providerEventKey:'evt',status:'RECONCILED'}),/canonical-receipt-ref-required/);
});