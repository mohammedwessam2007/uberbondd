import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { planPaymentReconciliation } from '../src/payment-reconciliation-watchdog.mjs';
import { billingBacklogSummary, claimBillingEvents, finishBillingEvent } from '../src/billing-webhook-repository.mjs';

test('payment watchdog recovers stale claims but never unlocks from webhook presence',()=>{
  const p=planPaymentReconciliation({status:'CLAIMED',claimedAt:'2026-08-29T08:00:00Z',claimAttempts:1},{now:'2026-08-29T09:00:00Z'});
  assert.equal(p.action,'RECOVER_STALE_CLAIM');
  assert.equal(p.unlockAuthorized,false);
  const r=planPaymentReconciliation({status:'RECEIVED',claimAttempts:0},{now:'2026-08-29T09:00:00Z'});
  assert.equal(r.action,'CLAIM_FOR_RECONCILIATION');
  assert.equal(r.unlockAuthorized,false);
});

test('uncertain payment state blocks blind retry and escalates only after timeout',()=>{
  const p=planPaymentReconciliation({status:'UNCERTAIN',updatedAt:'2026-08-29T08:50:00Z'},{now:'2026-08-29T09:00:00Z'});
  assert.equal(p.action,'WAIT_FOR_RECONCILIATION');
  assert.equal(p.unlockAuthorized,false);
  const q=planPaymentReconciliation({status:'UNCERTAIN',updatedAt:'2026-08-29T08:00:00Z'},{now:'2026-08-29T09:00:00Z'});
  assert.equal(q.action,'ESCALATE_REVIEW');
  assert.equal(q.unlockAuthorized,false);
});

test('billing repository makes claims recoverable and caps stale retries',async()=>{
  const queries=[];
  const client={query:async(sql,args)=>{queries.push([sql,args]);if(/RETURNING b\.provider_event_key/.test(sql))return {rows:[]};return {rows:[]}},release:()=>{}};
  const pool={connect:async()=>client};
  await claimBillingEvents(pool,{workerRef:'w1',staleClaimMs:60000,maxAttempts:3});
  assert.match(queries[1][0],/claim-attempt-cap-reached/);
  assert.match(queries[2][0],/status IN \('RECEIVED','RETRYABLE'\)/);
  assert.match(queries[3][0],/claim_attempts<\$3/);
  assert.match(queries[3][0],/claim_attempts=b\.claim_attempts\+1/);
  assert.match(queries[3][0],/status='CLAIMED'/);
});

test('reconciled billing event requires canonical payment receipt',async()=>{
  const pool={query:async()=>({rowCount:1})};
  await assert.rejects(()=>finishBillingEvent(pool,{providerEventKey:'evt',status:'RECONCILED',workerRef:'w1'}),/canonical-receipt-ref-required/);
});

test('retryable billing event clears claim and schedules a bounded retry',async()=>{
  const calls=[];
  const pool={query:async(sql,args)=>{calls.push([sql,args]);return {rowCount:1}}};
  const out=await finishBillingEvent(pool,{providerEventKey:'evt',status:'RETRYABLE',errorCode:'provider-timeout',retryAfterMs:60000,workerRef:'w1'});
  assert.equal(out.status,'RETRYABLE');
  assert.ok(out.nextAttemptAt);
  assert.match(calls[0][0],/claimed_at=CASE WHEN \$2 IN \('RETRYABLE','UNCERTAIN'\) THEN NULL/);
  assert.match(calls[0][0],/next_attempt_at=\$5/);
  assert.match(calls[0][0],/status='CLAIMED' AND claimed_by=\$6/);
});

test('a stale or wrong worker cannot finish a reclaimed billing lease',async()=>{
  const pool={query:async()=>({rowCount:0})};
  await assert.rejects(
    ()=>finishBillingEvent(pool,{providerEventKey:'evt',status:'RECONCILED',canonicalReceiptRef:'receipt:1',workerRef:'old-worker'}),
    /billing-claim-not-owned-or-missing/
  );
});

test('a retry at the attempt cap is quarantined instead of being claimed again',async()=>{
  const queries=[];
  const client={query:async(sql,args)=>{queries.push([sql,args]);if(/RETURNING b\.provider_event_key/.test(sql))return {rows:[]};return {rows:[]}},release:()=>{}};
  await claimBillingEvents({connect:async()=>client},{workerRef:'w1',maxAttempts:2});
  assert.match(queries[2][0],/status IN \('RECEIVED','RETRYABLE'\)/);
  assert.match(queries[2][0],/status='UNCERTAIN'/);
  assert.match(queries[3][0],/claim_attempts<\$3/);
});

test('claims require an explicit worker identity',async()=>{
  await assert.rejects(
    ()=>claimBillingEvents({connect:async()=>{throw new Error('must-not-connect');}},{workerRef:'   '}),
    /billing-worker-required/
  );
});

test('Postgres migrations and lease transitions work against PGlite',async()=>{
  const db=new PGlite();
  try{
    await db.exec('CREATE TABLE schema_migrations(version text PRIMARY KEY);');
    await db.exec(await readFile(new URL('../migrations/101_autonomy_operations_hygiene.sql',import.meta.url),'utf8'));
    await db.exec(await readFile(new URL('../migrations/102_payment_reconciliation_leases.sql',import.meta.url),'utf8'));
    const query=async(...args)=>{
      const result=await db.query(...args);
      return {...result,rowCount:result.rowCount ?? result.affectedRows ?? result.rows?.length ?? 0};
    };
    const pool={query,connect:async()=>({query,release(){}})};
    const old=new Date(Date.now()-120000);
    await db.query(`INSERT INTO billing_webhook_inbox
      (provider_event_key,provider,event_name,object_type,object_id,payload_hash,custom_data,status,received_at,claimed_at,claimed_by,claim_attempts)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12)`,[
      'evt-stale','lemonsqueezy','order_created','orders','order-stale','hash-stale','{}','CLAIMED',old,old,'old-worker',0
    ]);
    await db.query(`INSERT INTO billing_webhook_inbox
      (provider_event_key,provider,event_name,object_type,object_id,payload_hash,custom_data,status,received_at,claim_attempts)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)`,[
      'evt-capped','lemonsqueezy','order_created','orders','order-capped','hash-capped','{}','RECEIVED',old,2
    ]);

    const claimed=await claimBillingEvents(pool,{workerRef:'real-worker',limit:10,staleClaimMs:60000,maxAttempts:2});
    assert.deepEqual(claimed.map(row=>row.provider_event_key),['evt-stale']);
    assert.equal(claimed[0].claimed_by,'real-worker');
    assert.equal(claimed[0].claim_attempts,1);

    const capped=await db.query(`SELECT status,error_code,claimed_by FROM billing_webhook_inbox WHERE provider_event_key='evt-capped'`);
    assert.deepEqual(capped.rows,[{status:'UNCERTAIN',error_code:'claim-attempt-cap-reached',claimed_by:null}]);

    await assert.rejects(
      ()=>finishBillingEvent(pool,{providerEventKey:'evt-stale',status:'RECONCILED',canonicalReceiptRef:'receipt:stale',workerRef:'wrong-worker'}),
      /billing-claim-not-owned-or-missing/
    );
    const retry=await finishBillingEvent(pool,{providerEventKey:'evt-stale',status:'RETRYABLE',errorCode:'provider-timeout',retryAfterMs:60000,workerRef:'real-worker'});
    assert.equal(retry.status,'RETRYABLE');
    const row=await db.query(`SELECT status,claimed_by,claim_attempts,error_code,next_attempt_at FROM billing_webhook_inbox WHERE provider_event_key='evt-stale'`);
    assert.equal(row.rows[0].status,'RETRYABLE');
    assert.equal(row.rows[0].claimed_by,null);
    assert.equal(row.rows[0].claim_attempts,1);
    assert.equal(row.rows[0].error_code,'provider-timeout');
    assert.ok(row.rows[0].next_attempt_at);

    await db.query(`UPDATE billing_webhook_inbox SET next_attempt_at=now()-interval '1 second' WHERE provider_event_key='evt-stale'`);
    const reclaimed=await claimBillingEvents(pool,{workerRef:'real-worker',limit:1,maxAttempts:2});
    assert.deepEqual(reclaimed.map(item=>item.provider_event_key),['evt-stale']);
    assert.equal(reclaimed[0].claim_attempts,2);
    await assert.rejects(
      ()=>finishBillingEvent(pool,{providerEventKey:'evt-stale',status:'RECONCILED',workerRef:'real-worker'}),
      /canonical-receipt-ref-required/
    );
    await finishBillingEvent(pool,{providerEventKey:'evt-stale',status:'RECONCILED',canonicalReceiptRef:'receipt:stale',workerRef:'real-worker'});
    const final=await db.query(`SELECT status,canonical_receipt_ref,completed_at FROM billing_webhook_inbox WHERE provider_event_key='evt-stale'`);
    assert.equal(final.rows[0].status,'RECONCILED');
    assert.equal(final.rows[0].canonical_receipt_ref,'receipt:stale');
    assert.ok(final.rows[0].completed_at);
    const summary=await billingBacklogSummary(pool);
    assert.equal(summary.states.RECONCILED.count,1);
    assert.equal(summary.states.UNCERTAIN.count,1);
  } finally {
    await db.close();
  }
});
