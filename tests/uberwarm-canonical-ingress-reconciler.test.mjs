import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {reconcileCanonicalIngress} from '../src/uberwarm-canonical-ingress-reconciler.mjs';
import {DEFAULT_INGRESS_URL} from '../src/uberwarm-ingress-fence.mjs';
const now=()=>new Date('2026-10-20T00:00:00Z');
const sha=x=>'sha256:'+createHash('sha256').update(x).digest('hex');
const event=(eventId='evt_1',recipient='fixture@example.invalid',eventType='email.bounced')=>({
 eventId,recipient,eventType,payloadDigest:sha(eventId),recipientDigest:sha(recipient)});
const snapshot=(events=[event()])=>({sourceUrl:DEFAULT_INGRESS_URL,complete:true,
 observedAt:now().toISOString(),adverseEventCount:events.length,events});
function fake({database='canonical',ready=true,failReadback=false,failCommit=false}={}){
 let events=new Map(),stops=new Map(),backup;const calls=[];
 const client={async query(sql,v=[]){calls.push(sql);
  if(sql==='BEGIN'){backup=[new Map(events),new Map(stops)];return {rows:[]};}
  if(sql==='ROLLBACK'){[events,stops]=backup;return {rows:[]};}
  if(sql==='COMMIT'){if(failCommit)throw Error('commit failed');return {rows:[]};}
  if(sql.startsWith('SELECT current_database'))return {rows:[{database,recovery:false,suppressions_ready:ready,events_ready:ready}]};
  if(sql.startsWith('SELECT pg_advisory'))return {rows:[]};
  if(sql.startsWith('INSERT INTO public.winnr')){if(!events.has(v[0]))events.set(v[0],{
   event_type:v[1],payload_digest:v[2],recipient_digest:v[3],action:'SUPPRESSED_RECIPIENT'});return {rows:[]};}
  if(sql.startsWith('SELECT event_type'))return {rows:events.has(v[0])?[events.get(v[0])]:[]};
  if(sql.startsWith('INSERT INTO public.suppressions')){if(!stops.has(v[1]))stops.set(v[1],JSON.parse(v[2]));return {rows:[]};}
  if(sql.startsWith('SELECT value'))return {rows:!failReadback&&stops.has(v[0])?[{value:v[0]}]:[]};
  throw Error('unexpected query');
 },release(){calls.push('RELEASE');}};
 return {pool:{connect:async()=>client},calls,events:()=>events,stops:()=>stops};
}
const run=(db,s=snapshot())=>reconcileCanonicalIngress({pool:db.pool,expectedDatabase:'canonical',
 readAuthenticatedSnapshot:async()=>s,now});
test('bounce and complaint reconcile atomically, replay stays idempotent, no authority',async()=>{
 const db=fake(),s=snapshot([event(),event('evt_2','second@example.invalid','email.complained')]);
 for(let i=0;i<2;i++){const r=await run(db,s);assert.equal(r.reconciledAdverseEventCount,2);assert.equal(r.sendAuthority,'NONE');}
 assert.equal(db.events().size,2);assert.equal(db.stops().size,2);
});
test('zero count cannot clear an empty or wrongly bound database',async()=>{
 for(const db of [fake({ready:false}),fake({database:'shadow'})]){
  await assert.rejects(run(db,snapshot([])),/canonical-database-not-ready/);
  assert.ok(db.calls.includes('ROLLBACK'));assert.ok(!db.calls.includes('COMMIT'));
 }
});
test('health-only, incomplete, stale, future, oversized and wrong-source snapshots refuse before DB',async()=>{
 for(const s of [{adverseEventCount:0},{...snapshot(),complete:false},
 {...snapshot(),observedAt:'2026-10-19T22:00:00Z'},
 {...snapshot(),observedAt:'2026-10-20T00:02:00Z'},
 {...snapshot(),sourceUrl:'https://attacker.example/'},
 {...snapshot(),adverseEventCount:0},
 snapshot(Array.from({length:1001},(_,i)=>event('evt_'+i)))]){
  const db=fake();await assert.rejects(run(db,s));assert.equal(db.calls.length,0);
 }
});
test('nonadverse, invalid recipient/digest and duplicate event identity refuse before DB',async()=>{
 for(const events of [[event('evt_1','fixture@example.invalid','test.ping')],
 [event('evt_1','UPPER@example.invalid')],[{...event(),recipientDigest:sha('other@example.invalid')}],
 [{...event(),payloadDigest:'bad'}],[event(),event()]]){
  const db=fake();await assert.rejects(run(db,snapshot(events)));assert.equal(db.calls.length,0);
 }
});
test('changed identity rolls back entire batch; no reinterpretation or unsuppression',async()=>{
 const db=fake();await run(db);
 await assert.rejects(run(db,snapshot([event('evt_new'),event('evt_1','changed@example.invalid')])),/identity-conflict/);
 assert.equal(db.events().size,1);assert.equal(db.stops().size,1);
});
test('missing suppression on replay is repaired and read back',async()=>{
 const db=fake();await run(db);db.stops().clear();await run(db);assert.equal(db.stops().size,1);
});
test('failed readback or commit never produces success and always releases',async()=>{
 for(const db of [fake({failReadback:true}),fake({failCommit:true})]){
  await assert.rejects(run(db));assert.equal(db.events().size,0);assert.equal(db.stops().size,0);
  assert.equal(db.calls.at(-1),'RELEASE');assert.ok(db.calls.includes('ROLLBACK'));
 }
});
test('reader errors are not treated as empty ingress',async()=>{
 const db=fake();await assert.rejects(reconcileCanonicalIngress({pool:db.pool,expectedDatabase:'canonical',
  readAuthenticatedSnapshot:async()=>{throw Error('unreachable');},now}),/unreachable/);
 assert.equal(db.calls.length,0);
});
test('existing stronger suppression reason survives',async()=>{
 const db=fake();db.stops().set(event().recipient,{reason:'recipient-self-service-unsubscribe'});
 await run(db);assert.equal(db.stops().get(event().recipient).reason,'recipient-self-service-unsubscribe');
});
test('real disposable Postgres: atomic canonical replay and missing-table refusal',
 {skip:process.env.UBERWARM_RUN_DISPOSABLE_PG_INTEGRATION!=='1'},async()=>{
 const {default:pg}=await import('pg');
 const {readFileSync}=await import('node:fs');
 const {withDisposablePostgres}=await import('../scripts/disposable-postgres.mjs');
 await withDisposablePostgres(async url=>{
  const pool=new pg.Pool({connectionString:url,max:2});
  try{
   const db=(await pool.query('SELECT current_database() AS name')).rows[0].name;
   const go=s=>reconcileCanonicalIngress({pool,expectedDatabase:db,readAuthenticatedSnapshot:async()=>s,now});
   await assert.rejects(go(snapshot([])),/canonical-database-not-ready/);
   await pool.query('CREATE TABLE public.suppressions(id text PRIMARY KEY,value text UNIQUE NOT NULL,created_at timestamptz,updated_at timestamptz,data jsonb NOT NULL)');
   await pool.query(readFileSync(new URL('../migrations/20261019_winnr_webhook_suppression.sql',import.meta.url),'utf8'));
   const s=snapshot([event(),event('evt_2','second@example.invalid','email.complained')]);
   await go(s);await go(s);
   assert.equal((await pool.query('SELECT count(*)::int AS n FROM public.suppressions')).rows[0].n,2);
   await assert.rejects(go(snapshot([event('evt_1','changed@example.invalid')])) ,/identity-conflict/);
   assert.equal((await pool.query('SELECT count(*)::int AS n FROM public.winnr_webhook_events')).rows[0].n,2);
  }finally{await pool.end();}
 });
});
