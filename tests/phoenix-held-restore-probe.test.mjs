import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptJson } from '../src/crypto.mjs';
import { assertHeldRestoreConfig, heldRestoreRequestAllowed, verifyHeldRestoreReadOnly } from '../src/phoenix-held-restore-probe.mjs';

const goodUrl = 'postgresql://readonly:password@ep-soft-cake-baiahh8q.c-8.eu-central-1.aws.neon.tech:5432/uberbond_phoenix_rehearsal_20261014_v2';
const env = Object.freeze({ PHOENIX_HELD_RESTORE_PROBE:'1', OUTBOUND_EMERGENCY_STOP:'true' });
const cfg = Object.freeze({ nodeEnv:'production', processRole:'web', storeBackend:'postgres',
  databaseUrl:goodUrl, adminToken:'t'.repeat(32), encryptionKey:'a'.repeat(64),
  databaseSsl:true, autopilot:false, outbound:{enabled:false,dryRun:true} });

test('only exact held read-only GET API routes survive both HTTP layers', () => {
  assert.equal(heldRestoreRequestAllowed('GET','/api/health'),true);
  assert.equal(heldRestoreRequestAllowed('GET','/api/summary'),true);
  for (const path of ['/api/health?token=abc','/api/admin/winnr/import','/api/outreach/100k/start',
                      '/api/public/unsubscribe','/api/owner-session/status','/api/prospects'])
    assert.equal(heldRestoreRequestAllowed('GET',path),false,path);
  assert.equal(heldRestoreRequestAllowed('POST','/api/health'),false);
});

test('explicit protected probe gate, original Render and Neon pooler all fail closed', () => {
  assert.throws(()=>assertHeldRestoreConfig({},cfg),/EXPLICIT_PROBE_GATE/);
  assert.throws(()=>assertHeldRestoreConfig(env,{...cfg,databaseUrl:goodUrl.replace('ep-soft-cake-baiahh8q','dpg-dali9dbl550s73bcf520-a')}),/ISOLATED_DATABASE_IDENTITY/);
  assert.throws(()=>assertHeldRestoreConfig(env,{...cfg,databaseUrl:goodUrl.replace('.c-8.','-pooler.c-8.')}),/ISOLATED_DATABASE_IDENTITY/);
});

test('workers, provider effects, missing kill switch and paid background flags refuse', () => {
  for (const bad of [{...cfg,processRole:'all'}, {...cfg,autopilot:true}, {...cfg,outbound:{enabled:true,dryRun:true}},
                     {...cfg,outbound:{enabled:false,dryRun:false}}])
    assert.throws(()=>assertHeldRestoreConfig(env,bad),/PHOENIX_HELD_RESTORE_REFUSED/);
  assert.throws(()=>assertHeldRestoreConfig({...env,OUTBOUND_EMERGENCY_STOP:'false'},cfg),/SIDE_EFFECT_GATES/);
  assert.throws(()=>assertHeldRestoreConfig({...env,INFINITE_OPUS_AUTOFINISH_STARTUP_ONCE:'1'},cfg),/UNRELATED_RUNTIME_GATE/);
});

test('malformed original key, weak admin and URL target rewriting refuse', () => {
  assert.throws(()=>assertHeldRestoreConfig(env,{...cfg,encryptionKey:'invalid'}),/PROTECTED_KEYS_REQUIRED/);
  assert.throws(()=>assertHeldRestoreConfig(env,{...cfg,adminToken:'short'}),/PROTECTED_KEYS_REQUIRED/);
  assert.deepEqual(assertHeldRestoreConfig(env,{...cfg,databaseUrl:goodUrl+'?sslmode=require&channel_binding=require'}),
    {host:'ep-soft-cake-baiahh8q.c-8.eu-central-1.aws.neon.tech',database:'uberbond_phoenix_rehearsal_20261014_v2',onlyLoopback:true});
  assert.throws(()=>assertHeldRestoreConfig(env,{...cfg,databaseUrl:goodUrl+'?host=attacker.example'}),/ISOLATED_DATABASE_IDENTITY/);
});

function fakeClient({writable=false,migrations=20,tables=57,tokens=6,wrongKey=false}={}){
  let rolledBack=false, accountRead=false;
  const client = {
    async connect(){},
    async query(sql){
      if (sql==='BEGIN READ ONLY')return {rows:[],rowCount:0};
      if (sql==='ROLLBACK'){rolledBack=true;return {rows:[],rowCount:0};}
      if (sql.includes('pg_roles'))return {rows:[{db:'uberbond_phoenix_rehearsal_20261014_v2',
        read_only:'on',privileged:writable,database_create:false,schema_create:false,writable_tables:0}],rowCount:1};
      if (sql.includes('pg_tables'))return {rows:[{tables}],rowCount:1};
      if (sql.includes('schema_migrations'))return {rows:[{count:migrations}],rowCount:1};
      if (sql.includes("data->'tokens'")){
        accountRead=true;
        let rows=Array.from({length:tokens},()=>({tokens:encryptJson({smtp:'synthetic'},wrongKey?'b'.repeat(64):cfg.encryptionKey)}));
        return {rows,rowCount:rows.length};
      }
      throw new Error('unexpected SQL in held probe');
    },
    async end(){}
  };
  return {client,get rolledBack(){return rolledBack;},get accountRead(){return accountRead;}};
}

test('writable database role is refused before reading token data', async () => {
  const f=fakeClient({writable:true});
  await assert.rejects(()=>verifyHeldRestoreReadOnly({env,cfg,clientFactory:async()=>f.client}),/DB_ROLE_HAS_WRITE_AUTHORITY/);
  assert.equal(f.accountRead,false); assert.equal(f.rolledBack,true);
});

test('schema/migration mismatch refuses and rolls back', async () => {
  const f=fakeClient({migrations:19});
  await assert.rejects(()=>verifyHeldRestoreReadOnly({env,cfg,clientFactory:async()=>f.client}),/RESTORED_SCHEMA_MISMATCH/);
  assert.equal(f.accountRead,false);assert.equal(f.rolledBack,true);
});

test('wrong protected key refuses after authenticating all six token envelopes', async () => {
  const f=fakeClient({wrongKey:true});
  await assert.rejects(()=>verifyHeldRestoreReadOnly({env,cfg,clientFactory:async()=>f.client}),/ORIGINAL_KEY_INCOMPATIBLE/);
  assert.equal(f.rolledBack,true);
});

test('read-only verified restored app probe passes with zero provider calls or database writes', async () => {
  const f=fakeClient();
  const result=await verifyHeldRestoreReadOnly({env,cfg,clientFactory:async()=>f.client});
  assert.equal(result.ok,true);assert.equal(result.tokenAccountCount,6);
  assert.equal(result.workerStarted,false);assert.equal(result.outboundAuthority,false);
  assert.equal(result.dataWritten,0);assert.equal(result.providerCalls,0);assert.equal(f.rolledBack,true);
});
