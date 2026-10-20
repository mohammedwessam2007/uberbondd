import assert from 'node:assert/strict';
import pg from 'pg';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {withDisposablePostgres} from './disposable-postgres.mjs';
import {createUberWarmUnsubscribeToken} from '../services/uberwarm-callback/src/uberwarm-unsubscribe.mjs';
await withDisposablePostgres(async url=>{
 const admin=new pg.Pool({connectionString:url});await admin.query('CREATE DATABASE railway');await admin.end();
 const u=new URL(url);u.pathname='/railway';const pool=new pg.Pool({connectionString:u.href});
 let app;
 try{
  await pool.query('CREATE TABLE public.suppressions(id text PRIMARY KEY,value text NOT NULL UNIQUE,created_at timestamptz,updated_at timestamptz,data jsonb NOT NULL)');
  await pool.query(readFileSync(new URL('../migrations/20261019_winnr_webhook_suppression.sql',import.meta.url),'utf8'));
  Object.assign(process.env,{DATABASE_URL:u.href,UBERWARM_EXPECTED_CANONICAL_DATABASE:'railway',WINNR_WEBHOOK_SECRET:'whsec_disposable_fixture_only',UBERWARM_UNSUBSCRIBE_SECRET:'fixture_unsubscribe_secret_01234567890123456789'});
  let code=readFileSync(new URL('../services/uberwarm-callback/railway/index.tsx',import.meta.url),'utf8');
  code=code.replaceAll('from "pg@8.22.0"','from '+JSON.stringify(import.meta.resolve('pg')));
  app=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
  let r=await app.fetch(new Request('https://fixture.invalid/api/health'));
  assert.equal(r.status,200);const health=await r.json();assert.equal(health.canonicalDatabaseVerified,true);assert.equal(health.sendAuthority,'NONE');
  const raw=JSON.stringify({object:'event',id:'fixture_disposable_only',type:'email.bounced',data:{recipient:'bounce@fixture.invalid'}});
  const stamp=String(Math.floor(Date.now()/1000));
  const sig=createHmac('sha256',process.env.WINNR_WEBHOOK_SECRET).update(stamp+'.'+raw).digest('hex');
  const request=()=>new Request('https://fixture.invalid/api/webhooks/winnr',{method:'POST',headers:{'x-winnr-timestamp':stamp,'x-winnr-signature':'v1='+sig},body:raw});
  assert.equal((await app.fetch(new Request('https://fixture.invalid/api/webhooks/winnr',{method:'POST',body:raw}))).status,401);
  assert.equal((await app.fetch(request())).status,200);assert.equal((await app.fetch(request())).status,200);
  process.env.UBERWARM_EXPECTED_CANONICAL_DATABASE='wrong';
  assert.equal((await app.fetch(request())).status,503);
  process.env.UBERWARM_EXPECTED_CANONICAL_DATABASE='railway';
  const token=createUberWarmUnsubscribeToken({recipientEmail:'unsubscribe@fixture.invalid',secret:process.env.UBERWARM_UNSUBSCRIBE_SECRET});
  const target='https://fixture.invalid/api/unsubscribe?token='+token;
  assert.equal((await app.fetch(new Request(target))).status,200);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM public.suppressions')).rows[0].n,1);
  assert.equal((await app.fetch(new Request(target,{method:'POST'}))).status,200);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM public.suppressions')).rows[0].n,2);
  assert.equal((await app.fetch(new Request('https://fixture.invalid/other'))).status,404);
  console.log(JSON.stringify({receipt:'EXACT_BUNDLED_CALLBACK_DISPOSABLE_POSTGRES_VERIFIED',canonicalBinding:true,badSignature401:true,signedReplayIdempotent:true,wrongDatabase503:true,unsubscribeGetNonMutating:true,unsubscribePostDurable:true,sends:0}));
 }finally{await app?.close();await pool.end();}
});