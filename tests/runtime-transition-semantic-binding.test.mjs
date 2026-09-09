import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  RUNTIME_TRANSITION_RECEIPTS_VERSION,
  RUNTIME_TRANSITION_OBSERVER_VERSION,
  compileDurableWorkloadAssertion,
  compileCutoverRollbackAssertion,
  compileProviderLossAssertion,
  runtimeTransitionObserverReceiptPreimage,
  runtimeTransitionObservedReceiptPreimage,
  verifyRuntimeTransitionReceiptIntegrity
} from '../src/runtime-transition-receipts.mjs';

const sha='a'.repeat(40), d='sha256:'+'b'.repeat(64);
const hash=value=>`sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
function observed(assertion,kind){
  const observer={ok:true,schemaVersion:RUNTIME_TRANSITION_OBSERVER_VERSION,status:'RUNTIME_TRANSITION_OBSERVER_EXECUTED',producerRef:'scripts/executing-observer.mjs',producerSourceCommit:sha,transitionKind:kind,subjectAssertionDigest:assertion.assertionDigest,runtimeIdentity:assertion.runtimeIdentity,observedAt:'2026-09-09T03:11:00Z',exitCode:0,independentlyVerified:true,evidenceRef:`runtime-evidence:${kind}`,independentVerifierRef:'verifier:independent-auditor',duplicateExternalEffects:0,uncertainEffectBlindReplayObserved:false,businessEffectAuthority:'NONE'};
  observer.receiptDigest=hash(runtimeTransitionObserverReceiptPreimage(observer));
  const receipt={ok:true,schemaVersion:RUNTIME_TRANSITION_RECEIPTS_VERSION,status:`${kind}_OBSERVED`,evidenceClass:'OBSERVED_RUNTIME',originClass:'EXECUTING_OBSERVER_RECEIPT',receiptClass:kind,sourceCommit:assertion.sourceCommit,runtimeIdentity:assertion.runtimeIdentity,evidenceRef:observer.evidenceRef,independentVerifierRef:observer.independentVerifierRef,observedAt:observer.observedAt,assertionDigest:assertion.assertionDigest,observerReceiptDigest:observer.receiptDigest,assertion,observerReceipt:observer,businessEffectAuthority:'NONE'};
  if(kind==='DURABLE_WORKLOAD')Object.assign(receipt,{workloadId:assertion.workloadId,beforeStateDigest:assertion.beforeStateDigest,afterStateDigest:assertion.afterStateDigest,restartObserved:true,replacementWorkerObserved:true,persistedAcrossRestart:true,duplicateExternalEffects:0,uncertainEffectBlindReplayObserved:false});
  if(kind==='CUTOVER_ROLLBACK')Object.assign(receipt,{fromRuntimeIdentity:assertion.fromRuntimeIdentity,toRuntimeIdentity:assertion.toRuntimeIdentity,cutoverSucceeded:true,boundedWorkloadSucceeded:true,rollbackExercised:true,rollbackSucceeded:true,rollbackRuntimeIdentity:assertion.fromRuntimeIdentity,duplicateExternalEffects:0,uncertainEffectBlindReplayObserved:false});
  if(kind==='PROVIDER_LOSS')Object.assign(receipt,{manifestDigest:assertion.manifestDigest,failedProvider:assertion.failedProvider,alternateProvider:assertion.alternateProvider,primaryUnavailable:true,alternateRestoreSucceeded:true,boundedWorkloadSucceeded:true,recoveryUsedPrimaryProvider:false,duplicateExternalEffects:0,uncertainEffectBlindReplayObserved:false});
  receipt.receiptDigest=hash(runtimeTransitionObservedReceiptPreimage(receipt,kind));
  return receipt;
}
const durable=()=>compileDurableWorkloadAssertion({sourceCommit:sha,runtimeIdentity:'runtime:host-alt',evidenceRef:'assertion:workload',observedAt:'2026-09-09T03:10:00Z',workloadId:'job:1',beforeStateDigest:d,afterStateDigest:d,restartObserved:true,replacementWorkerObserved:true,persistedAcrossRestart:true,duplicateExternalEffects:0,uncertainEffectBlindReplayObserved:false});
const cutover=()=>compileCutoverRollbackAssertion({sourceCommit:sha,runtimeIdentity:'runtime:host-alt',evidenceRef:'assertion:cutover',observedAt:'2026-09-09T03:10:00Z',fromRuntimeIdentity:'runtime:host-primary',toRuntimeIdentity:'runtime:host-alt',cutoverSucceeded:true,boundedWorkloadSucceeded:true,rollbackExercised:true,rollbackSucceeded:true,rollbackRuntimeIdentity:'runtime:host-primary',duplicateExternalEffects:0,uncertainEffectBlindReplayObserved:false});
const loss=()=>compileProviderLossAssertion({sourceCommit:sha,runtimeIdentity:'runtime:host-alt',evidenceRef:'assertion:loss',observedAt:'2026-09-09T03:10:00Z',manifestDigest:d,failedProvider:'provider:primary',alternateProvider:'provider:alt',primaryUnavailable:true,alternateRestoreSucceeded:true,boundedWorkloadSucceeded:true,recoveryUsedPrimaryProvider:false,duplicateExternalEffects:0,uncertainEffectBlindReplayObserved:false});

test('outer durable workload identity cannot drift from nested assertion behind fresh digest',()=>{const r=observed(durable(),'DURABLE_WORKLOAD');r.workloadId='job:forged';r.receiptDigest=hash(runtimeTransitionObservedReceiptPreimage(r,'DURABLE_WORKLOAD'));assert.equal(verifyRuntimeTransitionReceiptIntegrity(r,'DURABLE_WORKLOAD'),false);});
test('outer cutover source runtime cannot drift from nested assertion behind fresh digest',()=>{const r=observed(cutover(),'CUTOVER_ROLLBACK');r.fromRuntimeIdentity='runtime:host-third';r.rollbackRuntimeIdentity='runtime:host-third';r.receiptDigest=hash(runtimeTransitionObservedReceiptPreimage(r,'CUTOVER_ROLLBACK'));assert.equal(verifyRuntimeTransitionReceiptIntegrity(r,'CUTOVER_ROLLBACK'),false);});
test('outer provider-loss provider identities cannot drift from nested assertion behind fresh digest',()=>{const r=observed(loss(),'PROVIDER_LOSS');r.failedProvider='provider:third';r.receiptDigest=hash(runtimeTransitionObservedReceiptPreimage(r,'PROVIDER_LOSS'));assert.equal(verifyRuntimeTransitionReceiptIntegrity(r,'PROVIDER_LOSS'),false);});
