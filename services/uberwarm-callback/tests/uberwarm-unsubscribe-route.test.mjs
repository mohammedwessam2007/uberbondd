import test from 'node:test';
import assert from 'node:assert/strict';
import {createUberWarmUnsubscribeToken,verifyUberWarmUnsubscribeToken,persistUberWarmUnsubscribe} from '../src/uberwarm-unsubscribe.mjs';
import {createHandlers} from '../api/unsubscribe.mjs';
const secret='secret_1234567890123456789012345678901234567890';
const email='recipient@agency.example';
const token=createUberWarmUnsubscribeToken({recipientEmail:email,secret});
const url='https://example.com/api/unsubscribe?token='+encodeURIComponent(token);
function fake(){const calls=[],map=new Map();return {calls,map,pool:{async query(sql,vals){calls.push({sql,vals});if(sql.startsWith('INSERT INTO suppressions')){if(!map.has(vals[1]))map.set(vals[1],JSON.parse(vals[2]));return {rows:[]};}
 if(sql.startsWith('SELECT value'))return {rows:map.has(vals[0])?[{value:vals[0]}]:[]};throw Error('invalid fixture SQL');}}};}
const fixture=db=>createHandlers({env:{UBERWARM_UNSUBSCRIBE_SECRET:secret,DATABASE_URL:'fixture:pg'},poolFactory:()=>db.pool});

test('all-commercial unsubscribe token is exact, tamper-resistant and not expiring',()=>{
 assert.deepEqual(verifyUberWarmUnsubscribeToken({token,secret}),{recipientEmail:email,scope:'ALL_COMMERCIAL'});
 assert.equal(verifyUberWarmUnsubscribeToken({token:token.slice(0,-2)+'zz',secret}),null);
 assert.equal(verifyUberWarmUnsubscribeToken({token,secret:'other-secret_12345678901234567890123456789012'}),null);
 assert.equal(verifyUberWarmUnsubscribeToken({token:'',secret}),null);
 assert.throws(()=>createUberWarmUnsubscribeToken({recipientEmail:'bad\r\n@mail.example',secret}));
});

test('GET only displays confirmation; no scanner-prefetch side effects or recipient leaks',async()=>{
 const db=fake(),h=fixture(db);const r=await h.GET(new Request(url));
 assert.equal(r.status,200);assert.match(await r.text(),/Unsubscribe/);
 assert.equal(db.calls.length,0);assert.equal(db.map.size,0);
 const bad=await h.GET(new Request('https://example.com/api/unsubscribe?token=fake'));
 assert.equal(bad.status,400);assert.equal(db.calls.length,0);
});

test('POST handles one-click and form submit immediately, idempotently in canonical suppressions',async()=>{
 const db=fake(),h=fixture(db);
 for(let i=0;i<2;i++){
  const r=await h.POST(new Request(url,{method:'POST',body:'List-Unsubscribe=One-Click',headers:{'content-type':'application/x-www-form-urlencoded'}}));
  assert.equal(r.status,200);assert.match(await r.text(),/You have been unsubscribed/);
 }
 assert.equal(db.map.size,1);assert.equal(db.map.get(email).scope,'ALL_COMMERCIAL');
 assert.equal(db.calls.filter(c=>c.sql.startsWith('INSERT')).length,2);
});

test('invalid/absent secret and DB failure refuse instead of claiming processed opt-out',async()=>{
 const db=fake(),h=fixture(db);
 assert.equal((await h.POST(new Request('https://example.com/api/unsubscribe?token=fake',{method:'POST'}))).status,400);
 const missing=createHandlers({env:{DATABASE_URL:'example'},poolFactory:()=>{throw Error('not-run');}});
 assert.equal((await missing.POST(new Request(url,{method:'POST'}))).status,503);
 const broken=createHandlers({env:{UBERWARM_UNSUBSCRIBE_SECRET:secret,DATABASE_URL:'example'},poolFactory:()=>({query:()=>{throw Error('private-error');}})});
 const res=await broken.POST(new Request(url,{method:'POST'}));
 assert.equal(res.status,503);assert.doesNotMatch(await res.text(),/private-error|recipient@agency/);
 assert.equal(db.map.size,0);
});

test('suppression write cannot silently acknowledge lost readback',async()=>{
 const pool={async query(sql){return sql.startsWith('SELECT')?{rows:[]}:{rows:[]};}};
 await assert.rejects(persistUberWarmUnsubscribe(pool,{recipientEmail:email}),/readback/);
});

test('standalone live PostgreSQL suppression persistence preserves prior bounce hold',
 {skip:process.env.UBERWARM_RUN_DISPOSABLE_PG_INTEGRATION!=='1'},async()=>{
 const {default:pg}=await import('pg');
 const {withDisposablePostgres}=await import('../scripts/disposable-postgres.mjs');
 await withDisposablePostgres(async url=>{
  const pool=new pg.Pool({connectionString:url});try{
   await pool.query(`CREATE TABLE suppressions(id text PRIMARY KEY,value text NOT NULL UNIQUE,created_at timestamptz,updated_at timestamptz,data jsonb NOT NULL)`);
   await persistUberWarmUnsubscribe(pool,{recipientEmail:email});
   await persistUberWarmUnsubscribe(pool,{recipientEmail:email});
   const found=await pool.query('SELECT value FROM suppressions');
   assert.deepEqual(found.rows.map(x=>x.value),[email]);
  }finally{await pool.end();}
 });
});
