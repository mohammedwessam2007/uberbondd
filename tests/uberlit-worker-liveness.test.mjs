import test from 'node:test';
import assert from 'node:assert/strict';
import {assessUberLitWorkerLiveness,buildUberLitWorkerLivenessReceipt} from '../src/uberlit-worker-liveness.mjs';

test('fresh wealth receipt proves live advancing worker after startup grace',()=>{
  const x=assessUberLitWorkerLiveness({nowMs:1_000_000,startedAtMs:100_000,childAlive:true,wealthReceiptMtimeMs:990_000,startupGraceMs:120_000,wealthStaleMs:300_000});
  assert.equal(x.status,'LIVE_WEALTH_ADVANCING');
  assert.equal(x.wealthReceiptFresh,true);
  assert.equal(x.shouldRestart,false);
});

test('missing wealth receipt after grace forces restart instead of silent false health',()=>{
  const x=assessUberLitWorkerLiveness({nowMs:1_000_000,startedAtMs:100_000,childAlive:true,wealthReceiptMtimeMs:null,startupGraceMs:120_000,wealthStaleMs:300_000});
  assert.equal(x.status,'DEGRADED_NO_WEALTH_RECEIPT');
  assert.equal(x.shouldRestart,true);
});

test('stale wealth receipt forces restart even when child process still exists',()=>{
  const x=assessUberLitWorkerLiveness({nowMs:1_000_000,startedAtMs:100_000,childAlive:true,wealthReceiptMtimeMs:600_000,startupGraceMs:120_000,wealthStaleMs:300_000});
  assert.equal(x.status,'DEGRADED_STALE_WEALTH_RECEIPT');
  assert.equal(x.shouldRestart,true);
});

test('startup grace prevents restart loops before first wealth receipt',()=>{
  const x=assessUberLitWorkerLiveness({nowMs:150_000,startedAtMs:100_000,childAlive:true,wealthReceiptMtimeMs:null,startupGraceMs:120_000,wealthStaleMs:300_000});
  assert.equal(x.status,'STARTING');
  assert.equal(x.shouldRestart,false);
});

test('receipt is privacy-safe and cannot claim business effects',()=>{
  const r=buildUberLitWorkerLivenessReceipt({nowMs:1_000_000,startedAtMs:100_000,sourceCommit:'ABC',releaseId:'r1',supervisorPid:10,childPid:11,childAlive:true,wealthReceiptMtimeMs:990_000});
  assert.equal(r.sourceCommit,'abc');
  assert.equal(r.autopilotEnabled,true);
  assert.equal(r.businessEffectAuthority,'LOCAL_RUNTIME_LIVENESS_ONLY');
  assert.match(r.truthBoundary,/DOES_NOT_PROVE_REVENUE/);
});
