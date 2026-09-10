import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  compileSovereignRuntimeRehearsalReceipt,
  verifySovereignRuntimeRehearsalReceipt
} from '../ops/sovereign/sovereign-runtime-rehearsal-receipt.mjs';

const A='a'.repeat(40);
const B='b'.repeat(40);
const IDA=`sha256:${'1'.repeat(64)}`;
const IDB=`sha256:${'2'.repeat(64)}`;
const RESTART=`sha256:${'3'.repeat(64)}`;
const commands=['status','backup','restore-drill','durable-postgres-crash-recovery','kill-web+reconcile','kill-worker+reconcile','deploy-valid-signed-failing-candidate','failed-promotion-rollback','explicit-rollback-out','explicit-rollback-return'];
const good=()=>compileSovereignRuntimeRehearsalReceipt({
  sourceCommit:A,
  previousSourceCommit:B,
  finalCurrentReleaseId:IDA,
  finalPreviousReleaseId:IDB,
  durableRestartRecoveryReceiptDigest:RESTART,
  backupObserved:true,
  restoreDrillObserved:true,
  webReconciledToExactImage:true,
  workerReconciledToExactImage:true,
  failedPromotionRollbackObserved:true,
  explicitRollbackRoundTripObserved:true,
  commands
});

test('complete bounded rehearsal compiles to a self-consistent zero-authority receipt',()=>{
  const receipt=good();
  assert.equal(receipt.ok,true);
  assert.equal(receipt.rehearsalObserved,true);
  assert.equal(receipt.sourceCommit,A);
  assert.equal(receipt.businessEffectAuthority,'NONE');
  assert.equal(receipt.externalEffectAuthority,'NONE');
  assert.equal(verifySovereignRuntimeRehearsalReceipt(receipt),true);
});

test('every required physical observation fails closed when absent',()=>{
  for(const field of ['backupObserved','restoreDrillObserved','webReconciledToExactImage','workerReconciledToExactImage','failedPromotionRollbackObserved','explicitRollbackRoundTripObserved']){
    const input={
      sourceCommit:A,previousSourceCommit:B,finalCurrentReleaseId:IDA,finalPreviousReleaseId:IDB,
      durableRestartRecoveryReceiptDigest:RESTART,backupObserved:true,restoreDrillObserved:true,
      webReconciledToExactImage:true,workerReconciledToExactImage:true,
      failedPromotionRollbackObserved:true,explicitRollbackRoundTripObserved:true,commands
    };
    input[field]=false;
    const receipt=compileSovereignRuntimeRehearsalReceipt(input);
    assert.equal(receipt.ok,false,field);
    assert.equal(receipt.rehearsalObserved,false,field);
    assert.equal(verifySovereignRuntimeRehearsalReceipt(receipt),false,field);
  }
});

test('stale or malformed source/release/restart identities cannot become rehearsal evidence',()=>{
  for(const patch of [
    {sourceCommit:'not-a-sha'},
    {previousSourceCommit:'not-a-sha'},
    {finalCurrentReleaseId:'sha256:bad'},
    {finalPreviousReleaseId:'sha256:bad'},
    {durableRestartRecoveryReceiptDigest:'sha256:bad'}
  ]){
    const receipt=compileSovereignRuntimeRehearsalReceipt({
      sourceCommit:A,previousSourceCommit:B,finalCurrentReleaseId:IDA,finalPreviousReleaseId:IDB,
      durableRestartRecoveryReceiptDigest:RESTART,backupObserved:true,restoreDrillObserved:true,
      webReconciledToExactImage:true,workerReconciledToExactImage:true,
      failedPromotionRollbackObserved:true,explicitRollbackRoundTripObserved:true,commands,...patch
    });
    assert.equal(receipt.ok,false,JSON.stringify(patch));
    assert.equal(verifySovereignRuntimeRehearsalReceipt(receipt),false,JSON.stringify(patch));
  }
});

test('receipt mutation is detected unless the full preimage digest is recomputed',()=>{
  const receipt=good();
  receipt.observed.restoreDrillObserved=false;
  assert.equal(verifySovereignRuntimeRehearsalReceipt(receipt),false);
});

test('authority widening invalidates otherwise complete evidence',()=>{
  for(const field of ['businessEffectAuthority','externalEffectAuthority']){
    const receipt=good();
    receipt[field]='FULL';
    assert.equal(verifySovereignRuntimeRehearsalReceipt(receipt),false,field);
  }
});

test('narrative booleans without the executed command chain cannot compile success',()=>{
  const receipt=compileSovereignRuntimeRehearsalReceipt({
    sourceCommit:A,previousSourceCommit:B,finalCurrentReleaseId:IDA,finalPreviousReleaseId:IDB,
    durableRestartRecoveryReceiptDigest:RESTART,backupObserved:true,restoreDrillObserved:true,
    webReconciledToExactImage:true,workerReconciledToExactImage:true,
    failedPromotionRollbackObserved:true,explicitRollbackRoundTripObserved:true,commands:['status']
  });
  assert.equal(receipt.ok,false);
  assert.match(receipt.reasonCodes.join(','),/executed-command-chain-required/);
});

test('runtime witness preserves fail-closed posture and recovery chain',()=>{
  const script=readFileSync(new URL('../ops/sovereign/sovereign-runtime-rehearsal.sh',import.meta.url),'utf8');
  for(const invariant of ['AUTOPILOT_ENABLED false','OUTBOUND_ENABLED false','OUTBOUND_DRY_RUN true','restore-drill','deploy-restart-recovery-drill.mjs','docker kill uberbond-web','docker kill uberbond-worker','promotion refused and rollback attempted','explicit-rollback-roundtrip-did-not-restore-starting-state']) assert.match(script,new RegExp(invariant.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.doesNotMatch(script,/curl|wget|git clone|release-private\.pem|PAYPAL_LIVE|OUTBOUND_ENABLED true/i);
});

test('runtime witness does not label its unkeyed digest as cryptographic host attestation',()=>{
  const receiptSource=readFileSync(new URL('../ops/sovereign/sovereign-runtime-rehearsal-receipt.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(receiptSource,/cryptographic host attestation|signed host attestation|unforgeable/i);
});
