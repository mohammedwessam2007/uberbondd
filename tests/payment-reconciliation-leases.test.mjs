import assert from 'node:assert/strict';
import test from 'node:test';
import { planPaymentReconciliation } from '../src/payment-reconciliation-watchdog.mjs';
import { claimBillingEvents, finishBillingEvent } from '../src/billing-webhook-repository.mjs';

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
