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
  verifyRuntimeTransitionObserverReceipt,
  verifyRuntimeTransitionReceiptIntegrity,
  runtimeTransitionIdentityEquivalent
} from '../src/runtime-transition-receipts.mjs';

const sha='a'.repeat(40), d='sha256:'+'b'.repeat(64);
const h=value=>`sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const common={sourceCommit:sha,runtimeIdentity:'runtime:host-alt',evidenceRef:'assertion:obs',observedAt:'2026-09-09T03:10:00Z'};
const durable=()=>compileDurableWorkloadAssertion({...common,workloadId:'job:1',beforeStateDigest:d,afterStateDigest:d,restartObserved:true,replacementWorkerObserved:true,persistedAcrossRestart:true,duplicateExternalEffects:0,uncertainEffectBlindReplayObserved:false});
const cut=()=>compileCutoverRollbackAssertion({...common,fromRuntimeIdentity:'runtime:host-primary',toRuntimeIdentity:'runtime:host-alt',cutoverSucceeded:true,boundedWorkloadSucceeded:true,rollbackExercised:true,rollbackSucceeded:true,rollbackRuntimeIdentity:'runtime:host-primary',duplicateExternalEffects:0,uncertainEffectBlindReplayObserved:false});
const loss=()=>compileProviderLossAssertion({...common,manifestDigest:d,failedProvider:'provider:primary',alternateProvider:'provider:alt',primaryUnavailable:true,alternateRestoreSucceeded:true,boundedWorkloadSucceeded:true,recoveryUsedPrimaryProvider:false,duplicateExternalEffects:0,uncertainEffectBlindReplayObserved:false});
function observed(assertion,kind){
  const observer={ok:true,schemaVersion:RUNTIME_TRANSITION_OBSERVER_VERSION,status:'RUNTIME_TRANSITION_OBSERVER_EXECUTED',producerRef:'scripts/real-observer.mjs',producerSourceCommit:sha,transitionKind:kind,subjectAssertionDigest:assertion.assertionDigest,runtimeIdentity:assertion.runtimeIdentity,observedAt:'2026-09-09T03:11:00Z',exitCode:0,independentlyVerified:true,evidenceRef:`runtime-evidence:${kind}`,independentVerifierRef:'verifier:auditor-independent',duplicateExternalEffects:0,uncertainEffectBlindReplayObserved:false,businessEffectAuthority:'NONE'};
  observer.receiptDigest=h(runtimeTransitionObserverReceiptPreimage(observer));
  const receipt={ok:true,schemaVersion:RUNTIME_TRANSITION_RECEIPTS_VERSION,status:`${kind}_OBSERVED`,evidenceClass:'OBSERVED_RUNTIME',originClass:'EXECUTING_OBSERVER_RECEIPT',receiptClass:kind,sourceCommit:assertion.sourceCommit,runtimeIdentity:assertion.runtimeIdentity,evidenceRef:observer.evidenceRef,independentVerifierRef:observer.independentVerifierRef,observedAt:observer.observedAt,assertionDigest:assertion.assertionDigest,observerReceiptDigest:observer.receiptDigest,assertion,observerReceipt:observer,businessEffectAuthority:'NONE'};
  if(kind==='DURABLE_WORKLOAD')Object.assign(receipt,{workloadId:assertion.workloadId,beforeStateDigest:assertion.beforeStateDigest,afterStateDigest:assertion.afterStateDigest,restartObserved:true,replacementWorkerObserved:true,persistedAcrossRestart:true,duplicateExternalEffects:0,uncertainEffectBlindReplayObserved:false});
  if(kind==='CUTOVER_ROLLBACK')Object.assign(receipt,{fromRuntimeIdentity:assertion.fromRuntimeIdentity,toRuntimeIdentity:assertion.toRuntimeIdentity,cutoverSucceeded:true,boundedWorkloadSucceeded:true,rollbackExercised:true,rollbackSucceeded:true,rollbackRuntimeIdentity:assertion.fromRuntimeIdentity,duplicateExternalEffects:0,uncertainEffectBlindReplayObserved:false});
  if(kind==='PROVIDER_LOSS')Object.assign(receipt,{manifestDigest:assertion.manifestDigest,failedProvider:assertion.failedProvider,alternateProvider:assertion.alternateProvider,primaryUnavailable:true,alternateRestoreSucceeded:true,boundedWorkloadSucceeded:true,recoveryUsedPrimaryProvider:false,duplicateExternalEffects:0,uncertainEffectBlindReplayObserved:false});
  receipt.receiptDigest=h(runtimeTransitionObservedReceiptPreimage(receipt,kind));
  return receipt;
}

test('source compiler can only create non-authoritative durable assertion',()=>{const a=durable();assert.equal(a.ok,true);assert.equal(a.evidenceClass,'UNVERIFIED_RUNTIME_ASSERTION');assert.equal(a.originClass,'SOURCE_ONLY_ASSERTION');assert.equal(a.maySatisfyRuntimeAcceptance,false);assert.match(a.assertionDigest,/^sha256:[0-9a-f]{64}$/);});
test('source assertion is not accepted as observed runtime',()=>{assert.equal(verifyRuntimeTransitionReceiptIntegrity(durable(),'DURABLE_WORKLOAD'),false);});
test('durable state drift is refused before assertion compilation',()=>{const a=compileDurableWorkloadAssertion({...common,workloadId:'job:1',beforeStateDigest:d,afterStateDigest:'sha256:'+'c'.repeat(64),restartObserved:true,replacementWorkerObserved:true,persistedAcrossRestart:true,duplicateExternalEffects:0});assert.equal(a.ok,false);assert.ok(a.reasonCodes.includes('workload-state-must-survive-restart'));});
test('cutover identity aliases cannot fake distinct runtimes',()=>{const a=compileCutoverRollbackAssertion({...common,runtimeIdentity:'RUNTIME:HOST-A',fromRuntimeIdentity:'runtime:host-a',toRuntimeIdentity:' HOST-A ',cutoverSucceeded:true,boundedWorkloadSucceeded:true,rollbackExercised:true,rollbackSucceeded:true,rollbackRuntimeIdentity:'runtime:host-a',duplicateExternalEffects:0});assert.equal(a.ok,false);assert.ok(a.reasonCodes.includes('distinct-cutover-runtime-identities-required'));});
test('provider case or prefix aliases cannot fake independence',()=>{const a=compileProviderLossAssertion({...common,manifestDigest:d,failedProvider:'provider:Acme',alternateProvider:' ACME ',primaryUnavailable:true,alternateRestoreSucceeded:true,boundedWorkloadSucceeded:true,recoveryUsedPrimaryProvider:false,duplicateExternalEffects:0});assert.equal(a.ok,false);assert.ok(a.reasonCodes.includes('distinct-provider-boundary-required'));});
test('identity equivalence canonicalizes case whitespace and role prefix',()=>{assert.equal(runtimeTransitionIdentityEquivalent('Verifier: Host-A',' runtime:host-a '),true);assert.equal(runtimeTransitionIdentityEquivalent('provider:A','provider:B'),false);});
test('executing observer plus source assertion can form integrity-valid durable observed receipt',()=>{const r=observed(durable(),'DURABLE_WORKLOAD');assert.equal(verifyRuntimeTransitionObserverReceipt(r.observerReceipt,r.assertion),true);assert.equal(verifyRuntimeTransitionReceiptIntegrity(r,'DURABLE_WORKLOAD'),true);});
test('observed cutover and provider-loss receipt shapes verify only when observer-bound',()=>{assert.equal(verifyRuntimeTransitionReceiptIntegrity(observed(cut(),'CUTOVER_ROLLBACK'),'CUTOVER_ROLLBACK'),true);assert.equal(verifyRuntimeTransitionReceiptIntegrity(observed(loss(),'PROVIDER_LOSS'),'PROVIDER_LOSS'),true);});
test('forged receipt digest is refused',()=>{const r=observed(durable(),'DURABLE_WORKLOAD');r.receiptDigest='sha256:'+'f'.repeat(64);assert.equal(verifyRuntimeTransitionReceiptIntegrity(r,'DURABLE_WORKLOAD'),false);});
test('assertion mutation behind old digest is refused',()=>{const r=observed(durable(),'DURABLE_WORKLOAD');r.assertion.workloadId='forged-job';assert.equal(verifyRuntimeTransitionReceiptIntegrity(r,'DURABLE_WORKLOAD'),false);});
test('observer digest mutation is refused',()=>{const r=observed(durable(),'DURABLE_WORKLOAD');r.observerReceipt.receiptDigest='sha256:'+'f'.repeat(64);assert.equal(verifyRuntimeTransitionReceiptIntegrity(r,'DURABLE_WORKLOAD'),false);});
test('runtime cannot self-verify through role-prefix alias',()=>{const r=observed(durable(),'DURABLE_WORKLOAD');r.observerReceipt.independentVerifierRef='verifier:host-alt';r.observerReceipt.receiptDigest=h(runtimeTransitionObserverReceiptPreimage(r.observerReceipt));assert.equal(verifyRuntimeTransitionObserverReceipt(r.observerReceipt,r.assertion),false);});
test('blind uncertain replay and duplicate effects cannot enter source assertion',()=>{let a=compileDurableWorkloadAssertion({...common,workloadId:'j',beforeStateDigest:d,afterStateDigest:d,restartObserved:true,replacementWorkerObserved:true,persistedAcrossRestart:true,duplicateExternalEffects:1});assert.equal(a.ok,false);a=compileDurableWorkloadAssertion({...common,workloadId:'j',beforeStateDigest:d,afterStateDigest:d,restartObserved:true,replacementWorkerObserved:true,persistedAcrossRestart:true,duplicateExternalEffects:0,uncertainEffectBlindReplayObserved:true});assert.equal(a.ok,false);});
