import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectJevPendingClaims} from '../src/ubermind-jev-pending-doctor.mjs';

const NOW=Date.parse('2026-10-09T02:00:00Z');
const key='sha256:'+'a'.repeat(64);
const binding='sha256:'+'b'.repeat(64);
const callId='jev-shadow-call-'+'c'.repeat(24);
const state=()=>({schemaVersion:'uberbond.jev-public-answer-reuse.v1',
 items:{},pending:{[key]:{key,bindingDigest:binding,
  operationId:'jev-test-op',nativeCallId:callId,
  claimedAt:NOW-1000,status:'CLAIMED_BEFORE_PROVIDER_EFFECT'}}});
const native=status=>({ledger:{calls:[{callId,status}]}});
test('empty work cache reports zero verified unresolved calls with no provider effect',()=>{
 const x=inspectJevPendingClaims({now:NOW});
 assert.equal(x.ok,true);
 assert.equal(x.pendingClaimCount,0);
 assert.equal(x.providerCallsPerformed,0);
 assert.equal(x.actualSavingsUsd,null);
});
test('a fresh native reservation remains blocked but not falsely classified as paid',()=>{
 const x=inspectJevPendingClaims({reuseState:state(),nativeState:native('RESERVED'),now:NOW});
 assert.equal(x.ok,true);
 assert.equal(x.pendingClaimCount,1);
 assert.equal(x.claimsNeedingOwnerReconciliation,0);
 assert.equal(x.statusCounts.RESERVED,1);
 assert.equal(x.automaticRetryAuthorized,false);
 assert.equal(JSON.stringify(x).includes('jev-test-op'),false);
 assert.equal(JSON.stringify(x).includes(callId),false);
});
test('a dispatched call is flagged for reconciliation without clearing the hold',()=>{
 const x=inspectJevPendingClaims({reuseState:state(),nativeState:native('DISPATCHED'),now:NOW});
 assert.equal(x.ok,true);
 assert.equal(x.claimsNeedingOwnerReconciliation,1);
 assert.equal(x.status,'PROTECTED_CLAIMS_NEED_RECONCILIATION');
 assert.equal(x.automaticReleaseAuthorized,false);
 assert.equal(x.providerCallsPerformed,0);
});
test('a stale claim with no observed native reservation remains a manual blocker',()=>{
 const s=state();s.pending[key].claimedAt=NOW-700000;
 const x=inspectJevPendingClaims({reuseState:s,nativeState:{ledger:{calls:[]}},now:NOW});
 assert.equal(x.ok,true);
 assert.equal(x.staleClaimCount,1);
 assert.equal(x.statusCounts.NO_MATCHING_NATIVE_CALL,1);
 assert.equal(x.claimsNeedingOwnerReconciliation,1);
});
test('a settled native provider invoice with unreleased claim cannot silently disappear',()=>{
 const x=inspectJevPendingClaims({reuseState:state(),nativeState:native('SETTLED'),now:NOW});
 assert.equal(x.ok,true);
 assert.equal(x.statusCounts.SETTLED,1);
 assert.equal(x.claimsNeedingOwnerReconciliation,1);
 assert.equal(x.independentlyAuditedMultiplier,null);
});
test('poisoned replay identity, future claims and unknown native statuses fail closed',()=>{
 const s=state();s.pending[key].bindingDigest='bad';
 assert.equal(inspectJevPendingClaims({reuseState:s,nativeState:native('RESERVED'),now:NOW}).ok,false);
 const future=state();future.pending[key].claimedAt=NOW+1000;
 assert.equal(inspectJevPendingClaims({reuseState:future,now:NOW}).ok,false);
 assert.equal(inspectJevPendingClaims({reuseState:state(),nativeState:native('FAKE_SETTLED'),now:NOW}).ok,false);
});
