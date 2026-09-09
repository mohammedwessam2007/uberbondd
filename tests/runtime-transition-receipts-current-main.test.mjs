import test from 'node:test';
import assert from 'node:assert/strict';
import {compileDurableWorkloadReceipt,compileCutoverRollbackReceipt,compileProviderLossReceipt,verifyRuntimeTransitionReceiptIntegrity} from '../src/runtime-transition-receipts.mjs';
import {verifyProviderNeutralRuntimeAcceptance} from '../src/provider-neutral-runtime-acceptance.mjs';

const sha='a'.repeat(40);
const d='sha256:'+'b'.repeat(64);
const common={sourceCommit:sha,runtimeIdentity:'host:alternate',verifierIdentity:'auditor:1',evidenceRef:'receipt:obs',observedAt:'2026-09-09T04:20:00Z',evidenceClass:'OBSERVED_RUNTIME'};
const durable=()=>compileDurableWorkloadReceipt({...common,workloadId:'job:1',beforeStateDigest:d,afterStateDigest:d,restartObserved:true,replacementWorkerObserved:true,persistedAcrossRestart:true,duplicateExternalEffects:0,uncertainEffectBlindReplayObserved:false});
const cutover=()=>compileCutoverRollbackReceipt({...common,fromRuntimeIdentity:'host:primary',toRuntimeIdentity:'host:alternate',cutoverSucceeded:true,boundedWorkloadSucceeded:true,rollbackExercised:true,rollbackSucceeded:true,rollbackRuntimeIdentity:'host:primary',duplicateExternalEffects:0,uncertainEffectBlindReplayObserved:false});
const loss=()=>compileProviderLossReceipt({...common,manifestDigest:d,failedProvider:'provider-a',alternateProvider:'provider-b',primaryUnavailable:true,alternateRestoreSucceeded:true,boundedWorkloadSucceeded:true,recoveryUsedPrimaryProvider:false,duplicateExternalEffects:0,uncertainEffectBlindReplayObserved:false});

function acceptance(overrides={}){
  return verifyProviderNeutralRuntimeAcceptance({
    sourceCommit:sha,
    host:{runtimeIdentity:'host:alternate',provider:'provider-b',region:'r1',imageDigest:d,configDigest:d,dataSchemaDigest:d,sourceCommit:sha,authenticatedHealthObserved:true},
    postgresRestoreReceipt:{ok:true,independentlyVerified:true,status:'POSTGRES_BACKUP_RESTORE_REHEARSAL_INDEPENDENTLY_VERIFIED',sourceCommit:sha,evidenceRef:'pg:1'},
    restartRecoveryReceipt:{ok:true,status:'RESTART_RECOVERY_REHEARSAL_PASSED',sourceCommit:sha,noDuplicateEffectClaim:'QUEUE_REPLAY_SAFE_WORK_RECLAIMED_ONCE__UNCERTAIN_RECONCILE_WORK_NOT_REPLAYED',commands:['restart:1']},
    durableWorkloadReceipt:durable(),
    cutoverRollbackReceipt:cutover(),
    continuityRehearsal:{ok:true,status:'CONTINUITY_REHEARSAL_VERIFIED_WITHIN_DECLARED_SCOPE',manifestDigest:d},
    providerLossReceipt:loss(),
    controlPlaneReceipt:{evidenceClass:'OBSERVED_RUNTIME',sourceCommit:sha,runtimeIdentity:'host:alternate',authenticatedReadSucceeded:true,privateLifeStateExposed:false,writeAuthorityGranted:false,evidenceRef:'control:1',independentVerifierRef:'verifier:auditor:2'},
    ...overrides
  });
}

test('canonical durable receipt integrity is independently reproducible',()=>{const r=durable();assert.equal(r.ok,true);assert.equal(verifyRuntimeTransitionReceiptIntegrity(r,'DURABLE_WORKLOAD'),true);});
test('post-generation workload mutation invalidates the receipt digest',()=>{const r=durable();r.persistedAcrossRestart=false;assert.equal(verifyRuntimeTransitionReceiptIntegrity(r,'DURABLE_WORKLOAD'),false);});
test('provider loss rejects case and whitespace aliases of one provider',()=>{const r=compileProviderLossReceipt({...common,manifestDigest:d,failedProvider:' Vercel ',alternateProvider:'vercel',primaryUnavailable:true,alternateRestoreSucceeded:true,boundedWorkloadSucceeded:true,recoveryUsedPrimaryProvider:false,duplicateExternalEffects:0});assert.equal(r.ok,false);assert.ok(r.reasonCodes.includes('distinct-provider-boundary-required'));});
test('cutover rejects case-only alias of the same runtime',()=>{const r=compileCutoverRollbackReceipt({...common,runtimeIdentity:'HOST:A',fromRuntimeIdentity:'host:a',toRuntimeIdentity:' HOST:A ',cutoverSucceeded:true,boundedWorkloadSucceeded:true,rollbackExercised:true,rollbackSucceeded:true,rollbackRuntimeIdentity:'host:a',duplicateExternalEffects:0});assert.equal(r.ok,false);assert.ok(r.reasonCodes.includes('distinct-cutover-runtime-identities-required'));});
test('runtime cannot self-verify through casing aliases',()=>{const r=compileDurableWorkloadReceipt({...common,runtimeIdentity:'Host:A',verifierIdentity:' host:a ',workloadId:'job:1',beforeStateDigest:d,afterStateDigest:d,restartObserved:true,replacementWorkerObserved:true,persistedAcrossRestart:true,duplicateExternalEffects:0});assert.equal(r.ok,false);assert.ok(r.reasonCodes.includes('runtime-cannot-self-verify'));});
test('parent acceptance accepts intact canonical transition receipts within declared scope',()=>{const r=acceptance();assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.status,'NAMED_RUNTIME_VERIFIED_WITHIN_REHEARSED_SCOPE');});
test('parent acceptance refuses a forged durable receipt with a valid-looking digest',()=>{const forged=durable();forged.workloadId='job:forged';forged.receiptDigest='sha256:'+'c'.repeat(64);const r=acceptance({durableWorkloadReceipt:forged});assert.equal(r.ok,false);assert.ok(r.reasonCodes.includes('canonical-durable-workload-receipt-integrity-required'));});
test('parent acceptance refuses provider-loss formatting alias even if surrounding fields look valid',()=>{const forged=loss();forged.alternateProvider=' PROVIDER-A ';forged.receiptDigest='sha256:'+'d'.repeat(64);const r=acceptance({providerLossReceipt:forged});assert.equal(r.ok,false);assert.ok(r.reasonCodes.includes('canonical-provider-loss-receipt-integrity-required'));assert.ok(r.reasonCodes.includes('provider-loss-must-cross-provider-boundary'));});
