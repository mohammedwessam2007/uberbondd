#!/usr/bin/env node
import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
if(process.argv[2]!=='--apply'||process.env.UBERWARM_RECEIVER_AUTH_PROBE_AUTHORIZED!=='1'){
  console.error('receiver-binding-migration-not-authorized');process.exit(1);
}
const c=new pg.Client({connectionString:process.env.DATABASE_URL,
  connectionTimeoutMillis:10000,statement_timeout:10000,options:'-c default_transaction_read_only=off'});
try{
  await c.connect();await c.query('BEGIN');
  await c.query("SELECT pg_advisory_xact_lock(hashtext('uberwarm2-receiver-binding-migration'))");
  const state=(await c.query(`SELECT current_database() AS database,pg_is_in_recovery() AS recovery,
    to_regclass('public.uberwarm2_seed_probe_claims') IS NOT NULL AS ledger_present`)).rows[0];
  if(state.database!=='railway'||state.recovery||!state.ledger_present)throw Error('primary');
  const sql=await readFile(new URL('../docs/migrations-pending/20261017_uberwarm2_receiver_binding.sql',import.meta.url),'utf8');
  await c.query(sql);
  const cols=(await c.query(`SELECT column_name,data_type,is_nullable FROM information_schema.columns
    WHERE table_schema='public' AND table_name='uberwarm2_receiver_bindings' ORDER BY ordinal_position`)).rows;
  const expected=[['receiver_email','text'],['provider_user_id','text'],['credential_json','jsonb'],
    ['authorization_ref','text'],['enabled','boolean'],['created_at','timestamp with time zone']];
  if(cols.length!==6||cols.some((v,i)=>v.column_name!==expected[i][0]||v.data_type!==expected[i][1]||v.is_nullable!=='NO'))throw Error('schema');
  const keys=(await c.query(`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
    WHERE conrelid='public.uberwarm2_receiver_bindings'::regclass AND contype='p'`)).rows;
  if(keys.length!==1||keys[0].definition!=='PRIMARY KEY (receiver_email)')throw Error('primary-key');
  await c.query('COMMIT');
  console.log(JSON.stringify({receipt:'UBERWARM_RECEIVER_BINDING_MIGRATION',database:'railway',primary:true,
    migrationDigest:'sha256:'+createHash('sha256').update(sql).digest('hex'),sends:0}));
}catch{await c.query('ROLLBACK').catch(()=>{});process.exitCode=1;console.error('receiver-binding-migration-failed-closed');}
finally{await c.end().catch(()=>{});}
