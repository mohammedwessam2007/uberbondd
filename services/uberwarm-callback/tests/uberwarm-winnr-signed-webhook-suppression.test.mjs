import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createFetchHandler} from '../api/webhooks/winnr.mjs';
import {parseAuthenticatedWinnrEvent,persistAuthenticatedWinnrEvent} from '../src/uberwarm-winnr-webhook-suppression.mjs';
const at=Date.parse('2026-10-19T18:15:00.000Z');
const secret='whsec_test_source_only_secret_no_live_control';
const payload=(type='email.bounced',id='evt_0001',recipient='prospect@agency.example')=>({
 object:'event',id,type,created:new Date(at-10_000).toISOString(),
 data:{recipient,bounce_type:'hard',sender:'sender@uberbond.site',diagnostic:'private-credential-in-error'}
});
const signed=(data,options={})=>{
 const raw=options.raw??JSON.stringify(data),timestamp=options.timestamp??String(at/1000);
 const sig=createHmac('sha256',secret).update(`${timestamp}.`).update(raw).digest('hex');
 return new Request('https://testing.example/api/webhooks/winnr',{method:'POST',headers:{
 'Content-Type':'application/json','X-Winnr-Timestamp':timestamp,
 'X-Winnr-Signature':`v1=${options.badSignature?'a'.repeat(64):sig}`},body:raw});
};
function fakeDatabase({failSuppression=false}={}){
 const events=new Map(),suppressions=new Map(),sqls=[],queries=[],state={tx:false};
 const client={async query(sql,values=[]){sqls.push(sql);queries.push(values);
  if(sql==='BEGIN'){state.tx=true;return {rows:[],rowCount:0};}
  if(sql==='COMMIT'){state.tx=false;return {rows:[],rowCount:0};}
  if(sql==='ROLLBACK'){state.tx=false;return {rows:[],rowCount:0};}
  if(sql.startsWith('SELECT pg_advisory'))return {rows:[],rowCount:1};
  if(sql.startsWith('INSERT INTO winnr_webhook_events')){
   if(events.has(values[0]))return {rows:[],rowCount:0};
   events.set(values[0],{digest:values[2]});return {rows:[{event_id:values[0]}],rowCount:1};
  }
  if(sql.startsWith('SELECT payload_digest'))return {rows:[{payload_digest:events.get(values[0])?.digest}],rowCount:1};
  if(sql.startsWith('INSERT INTO suppressions')){
   if(failSuppression)throw Error('secret value hidden');
   suppressions.set(values[1],JSON.parse(values[2]));return {rows:[{}],rowCount:1};
  }
  if(sql.startsWith('SELECT value FROM suppressions'))return {rows:suppressions.has(values[0])?[{value:values[0]}]:[],rowCount:suppressions.has(values[0])?1:0};
  throw Error('unrecognized SQL '+sql);
 },release(){}};
 return {events,suppressions,sqls,queries,state,pool:{async connect(){return client;}}};
}
const handler=(db,overrides={})=>createFetchHandler({env:{DATABASE_URL:'postgres://fixture/winnr',WINNR_WEBHOOK_SECRET:secret},
 clock:()=>at,poolFactory:()=>db.pool,...overrides});

test('real HMAC SHA256 webhook, single suppression, canonical stop survives duplicate',async()=>{
 const db=fakeDatabase();const f=handler(db);const data=payload();
 const a=await f(signed(data));assert.equal(a.status,200);
 const b=await a.json();assert.equal(b.suppressionHeld,true);assert.equal(b.sendAuthority,'NONE');
 assert.equal(db.suppressions.get('prospect@agency.example').reason,'winnr-provider-signed-adverse-event');
 const second=await f(signed(data));assert.equal(second.status,200);
 assert.equal((await second.json()).duplicate,true);assert.equal(db.suppressions.size,1);
 assert.equal(db.events.size,1);
 assert.equal(db.sqls.filter(x=>x.startsWith('INSERT INTO suppressions')).length,1);
});

test('both complaints and bounces stop future traffic; non-adverse events never grant clearance',async()=>{
 const db=fakeDatabase();const f=handler(db);
 assert.equal((await f(signed(payload('email.complained','evt_2','customer@agency.example')))).status,200);
 assert.ok(db.suppressions.has('customer@agency.example'));
 const ok=await f(signed(payload('domain.ready','evt_3')));
 assert.equal(ok.status,200);assert.equal((await ok.json()).suppressionHeld,false);
 assert.equal(db.suppressions.size,1);
 const reply=await f(signed(payload('email.received','evt_4')));
 assert.equal((await reply.json()).status,'REPLY_REQUIRES_REVIEW');
 assert.equal(db.suppressions.size,1);
});

test('unsigned, mutated, stale, malformed and huge bodies refuse before DB access',async()=>{
 const db=fakeDatabase();const f=handler(db);const d=payload();
 for(const req of [signed(d,{badSignature:true}),signed(d,{timestamp:String(at/1000-3600)}),
   signed(d,{raw:'not-json'}),
   signed(d,{raw:' '.repeat(65537)})]){
  const r=await f(req);assert.notEqual(r.status,200);
 }
 const noSecret=createFetchHandler({env:{DATABASE_URL:'x'},poolFactory:()=>{throw Error('should-not-reach-DB');}});
 assert.equal((await noSecret(signed(d))).status,503);
 assert.equal(db.events.size,0);assert.equal(db.suppressions.size,0);
 assert.equal(db.sqls.length,0);
});

test('signed invalid adverse recipient never ACKs or writes; provider error data never returned',async()=>{
 const db=fakeDatabase();const f=handler(db);
 const data=payload('email.bounced','evt_5','NOT-AN-EMAIL');
 const response=await f(signed(data));assert.equal(response.status,422);
 assert.equal(db.events.size,0);assert.equal(db.suppressions.size,0);
 assert.doesNotMatch(await response.text(),/private|NOT-AN-EMAIL|sender@/);
});

test('provider ID collisions with altered payload fail closed, never reinterpret evidence',async()=>{
 const db=fakeDatabase();const f=handler(db);
 assert.equal((await f(signed(payload('email.bounced','evt_same','first@agency.example')))).status,200);
 const res=await f(signed(payload('email.bounced','evt_same','second@agency.example')));
 assert.equal(res.status,503);assert.equal(db.suppressions.size,1);
 assert.ok(db.sqls.some(x=>x==='ROLLBACK'));
});

test('suppression DB failure triggers rollback and HTTP 503, no success claim',async()=>{
 const db=fakeDatabase({failSuppression:true});const r=await handler(db)(signed(payload()));
 assert.equal(r.status,503);assert.ok(db.sqls.includes('ROLLBACK'));
 assert.doesNotMatch(await r.text(),/secret|prospect@/);
});

test('parser never allows arbitrary JSON to trigger unsanctioned actions',()=>{
 for(const v of [{id:'evt_x',type:'email.bounced',data:{}},
   {object:'event',id:'\npoison',type:'email.bounced',data:{recipient:'evil@domain.example'}}]){
  assert.equal(parseAuthenticatedWinnrEvent(Buffer.from(JSON.stringify(v))).ok,false);
 }
});

test('both migration and receiver do not contain send/campaign authorization operations',async()=>{
 const {readFileSync}=await import('node:fs');
 const migration=readFileSync(new URL('../migrations/20261019_winnr_webhook_suppression.sql',import.meta.url),'utf8');
 const code=readFileSync(new URL('../src/uberwarm-winnr-webhook-suppression.mjs',import.meta.url),'utf8');
 assert.match(migration,/CREATE TABLE IF NOT EXISTS winnr_webhook_events/);
 assert.match(code,/ON CONFLICT \(value\) DO NOTHING/);
 assert.doesNotMatch(code,/\.send\(|sendOwnerSeedViaHttps|authorizeCampaign|enableWarmup/);
});

test('real isolated PostgreSQL commits only authenticated recipient suppression with replay idempotency',
 {skip:process.env.UBERWARM_RUN_DISPOSABLE_PG_INTEGRATION!=='1'},async()=>{
 const {default:pg}=await import('pg');
 const {readFileSync}=await import('node:fs');
 const {withDisposablePostgres}=await import('../scripts/disposable-postgres.mjs');
 await withDisposablePostgres(async url=>{
  const pool=new pg.Pool({connectionString:url,max:2});
  try{
   await pool.query(`CREATE TABLE suppressions(id text PRIMARY KEY,value text NOT NULL UNIQUE,
     created_at timestamptz,updated_at timestamptz,data jsonb NOT NULL)`);
   const sql=readFileSync(new URL('../migrations/20261019_winnr_webhook_suppression.sql',import.meta.url),'utf8');
   await pool.query(sql);await pool.query(sql);
   const app=handler({pool});
   for(const req of [signed(payload()),signed(payload())]){
    const result=await app(req);assert.equal(result.status,200);
   }
   const recorded=await pool.query('SELECT event_id,action FROM winnr_webhook_events');
   const suppressed=await pool.query('SELECT value FROM suppressions');
   assert.equal(recorded.rows.length,1);assert.equal(recorded.rows[0].action,'SUPPRESSED_RECIPIENT');
   assert.deepEqual(suppressed.rows.map(x=>x.value),['prospect@agency.example']);
   const unsigned=await app(signed(payload('email.complained','evt_attack','victim@agency.example'),{badSignature:true}));
   assert.equal(unsigned.status,401);
   const after=await pool.query('SELECT count(*)::int AS n FROM suppressions');
   assert.equal(after.rows[0].n,1);
  } finally{await pool.end();}
 });
});
