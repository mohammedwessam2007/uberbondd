import crypto from 'node:crypto';

export const RUNTIME_TRANSITION_RECEIPTS_VERSION='uberbond.runtime-transition-receipts.v1';
const SHA40=/^[0-9a-f]{40}$/;
const SHA256=/^sha256:[0-9a-f]{64}$/;
const ZERO=Object.freeze({customerMessages:0,providerCalls:0,spendCents:0,deployments:0,dnsChanges:0,credentialChanges:0,paymentMutations:0,productionMutations:0});
const text=(v,max=500)=>{const s=String(v??'').trim();return s&&s.length<=max?s:null;};
const uniq=a=>[...new Set(a.filter(Boolean))];
const digest=v=>`sha256:${crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex')}`;
const fail=(kind,reasons,extra={})=>({ok:false,schemaVersion:RUNTIME_TRANSITION_RECEIPTS_VERSION,status:`${kind}_RECEIPT_REFUSED`,reasonCodes:uniq(reasons),businessEffectAuthority:'NONE',externalEffectLedger:{...ZERO},...extra});
function common(input,kind){
  const reasons=[];
  const sourceCommit=text(input.sourceCommit,40)?.toLowerCase()||null;
  const runtimeIdentity=text(input.runtimeIdentity);
  const verifierIdentity=text(input.verifierIdentity);
  const evidenceRef=text(input.evidenceRef);
  const observedAt=text(input.observedAt,80);
  if(!sourceCommit||!SHA40.test(sourceCommit)) reasons.push('exact-source-commit-required');
  if(!runtimeIdentity) reasons.push('runtime-identity-required');
  if(!verifierIdentity) reasons.push('independent-verifier-identity-required');
  if(runtimeIdentity&&verifierIdentity&&runtimeIdentity===verifierIdentity) reasons.push('runtime-cannot-self-verify');
  if(!evidenceRef) reasons.push('evidence-ref-required');
  if(!observedAt||Number.isNaN(Date.parse(observedAt))) reasons.push('valid-observed-at-required');
  if(input.evidenceClass!=='OBSERVED_RUNTIME') reasons.push('observed-runtime-evidence-class-required');
  return {reasons,sourceCommit,runtimeIdentity,verifierIdentity,evidenceRef,observedAt,kind};
}
function safeBase(c,status){return{ok:true,schemaVersion:RUNTIME_TRANSITION_RECEIPTS_VERSION,status,evidenceClass:'OBSERVED_RUNTIME',sourceCommit:c.sourceCommit,runtimeIdentity:c.runtimeIdentity,evidenceRef:c.evidenceRef,independentVerifierRef:`verifier:${c.verifierIdentity}`,observedAt:c.observedAt};}
function finalize(receipt){return{...receipt,receiptDigest:digest(receipt)};}

export function runtimeTransitionReceiptPreimage(receipt={},kind){
  const base={ok:true,schemaVersion:RUNTIME_TRANSITION_RECEIPTS_VERSION,status:`${kind}_OBSERVED`,evidenceClass:'OBSERVED_RUNTIME',sourceCommit:receipt.sourceCommit,runtimeIdentity:receipt.runtimeIdentity,evidenceRef:receipt.evidenceRef,independentVerifierRef:receipt.independentVerifierRef,observedAt:receipt.observedAt};
  if(kind==='DURABLE_WORKLOAD') return {...base,workloadId:receipt.workloadId,beforeStateDigest:receipt.beforeStateDigest,afterStateDigest:receipt.afterStateDigest,restartObserved:true,replacementWorkerObserved:true,persistedAcrossRestart:true,duplicateExternalEffects:0,uncertainEffectBlindReplayObserved:false,businessEffectAuthority:'NONE'};
  if(kind==='CUTOVER_ROLLBACK') return {...base,fromRuntimeIdentity:receipt.fromRuntimeIdentity,toRuntimeIdentity:receipt.toRuntimeIdentity,cutoverSucceeded:true,boundedWorkloadSucceeded:true,rollbackExercised:true,rollbackSucceeded:true,rollbackRuntimeIdentity:receipt.fromRuntimeIdentity,duplicateExternalEffects:0,uncertainEffectBlindReplayObserved:false,businessEffectAuthority:'NONE'};
  if(kind==='PROVIDER_LOSS') return {...base,receiptClass:'PROVIDER_LOSS',manifestDigest:receipt.manifestDigest,failedProvider:receipt.failedProvider,alternateProvider:receipt.alternateProvider,primaryUnavailable:true,alternateRestoreSucceeded:true,boundedWorkloadSucceeded:true,recoveryUsedPrimaryProvider:false,duplicateExternalEffects:0,uncertainEffectBlindReplayObserved:false,businessEffectAuthority:'NONE'};
  return null;
}
export function verifyRuntimeTransitionReceiptIntegrity(receipt={},kind){
  const preimage=runtimeTransitionReceiptPreimage(receipt,kind);
  return Boolean(preimage&&receipt.ok===true&&receipt.schemaVersion===RUNTIME_TRANSITION_RECEIPTS_VERSION&&receipt.status===`${kind}_OBSERVED`&&text(receipt.receiptDigest,80)?.toLowerCase()===digest(preimage));
}

export function compileDurableWorkloadReceipt(input={}){
  const c=common(input,'DURABLE_WORKLOAD');
  const r=[...c.reasons];
  const workloadId=text(input.workloadId,300);
  const before=text(input.beforeStateDigest,80)?.toLowerCase();
  const after=text(input.afterStateDigest,80)?.toLowerCase();
  if(!workloadId) r.push('workload-id-required');
  if(!before||!SHA256.test(before)||!after||!SHA256.test(after)) r.push('sha256-state-digests-required');
  if(before&&after&&before!==after) r.push('workload-state-must-survive-restart');
  if(input.restartObserved!==true) r.push('restart-must-be-observed');
  if(input.replacementWorkerObserved!==true) r.push('replacement-worker-must-be-observed');
  if(input.persistedAcrossRestart!==true) r.push('persisted-across-restart-required');
  if(input.duplicateExternalEffects!==0) r.push('zero-duplicate-external-effects-required');
  if(input.uncertainEffectBlindReplayObserved===true) r.push('uncertain-effect-blind-replay-prohibited');
  if(r.length) return fail('DURABLE_WORKLOAD',r,{sourceCommit:c.sourceCommit});
  return finalize({...safeBase(c,'DURABLE_WORKLOAD_OBSERVED'),workloadId,beforeStateDigest:before,afterStateDigest:after,restartObserved:true,replacementWorkerObserved:true,persistedAcrossRestart:true,duplicateExternalEffects:0,uncertainEffectBlindReplayObserved:false,businessEffectAuthority:'NONE'});
}

export function compileCutoverRollbackReceipt(input={}){
  const c=common(input,'CUTOVER_ROLLBACK');
  const r=[...c.reasons];
  const fromRuntimeIdentity=text(input.fromRuntimeIdentity);
  const toRuntimeIdentity=text(input.toRuntimeIdentity);
  if(!fromRuntimeIdentity||!toRuntimeIdentity||fromRuntimeIdentity===toRuntimeIdentity) r.push('distinct-cutover-runtime-identities-required');
  if(c.runtimeIdentity&&toRuntimeIdentity&&c.runtimeIdentity!==toRuntimeIdentity) r.push('observed-runtime-must-be-cutover-target');
  if(input.cutoverSucceeded!==true) r.push('successful-cutover-required');
  if(input.boundedWorkloadSucceeded!==true) r.push('bounded-workload-on-target-required');
  if(input.rollbackExercised!==true||input.rollbackSucceeded!==true) r.push('successful-rollback-rehearsal-required');
  if(input.rollbackRuntimeIdentity!==fromRuntimeIdentity) r.push('rollback-must-return-to-source-runtime');
  if(input.duplicateExternalEffects!==0) r.push('zero-duplicate-external-effects-required');
  if(input.uncertainEffectBlindReplayObserved===true) r.push('uncertain-effect-blind-replay-prohibited');
  if(r.length) return fail('CUTOVER_ROLLBACK',r,{sourceCommit:c.sourceCommit});
  return finalize({...safeBase(c,'CUTOVER_ROLLBACK_OBSERVED'),fromRuntimeIdentity,toRuntimeIdentity,cutoverSucceeded:true,boundedWorkloadSucceeded:true,rollbackExercised:true,rollbackSucceeded:true,rollbackRuntimeIdentity:fromRuntimeIdentity,duplicateExternalEffects:0,uncertainEffectBlindReplayObserved:false,businessEffectAuthority:'NONE'});
}

export function compileProviderLossReceipt(input={}){
  const c=common(input,'PROVIDER_LOSS');
  const r=[...c.reasons];
  const failedProvider=text(input.failedProvider,160);
  const alternateProvider=text(input.alternateProvider,160);
  const manifestDigest=text(input.manifestDigest,80)?.toLowerCase();
  if(!failedProvider||!alternateProvider||failedProvider===alternateProvider) r.push('distinct-provider-boundary-required');
  if(!manifestDigest||!SHA256.test(manifestDigest)) r.push('continuity-manifest-digest-required');
  if(input.primaryUnavailable!==true) r.push('primary-provider-unavailability-must-be-observed');
  if(input.alternateRestoreSucceeded!==true) r.push('alternate-provider-restore-required');
  if(input.boundedWorkloadSucceeded!==true) r.push('bounded-workload-on-alternate-required');
  if(input.recoveryUsedPrimaryProvider===true) r.push('recovery-must-not-use-failed-provider');
  if(input.duplicateExternalEffects!==0) r.push('zero-duplicate-external-effects-required');
  if(input.uncertainEffectBlindReplayObserved===true) r.push('uncertain-effect-blind-replay-prohibited');
  if(r.length) return fail('PROVIDER_LOSS',r,{sourceCommit:c.sourceCommit});
  return finalize({...safeBase(c,'PROVIDER_LOSS_OBSERVED'),receiptClass:'PROVIDER_LOSS',manifestDigest,failedProvider,alternateProvider,primaryUnavailable:true,alternateRestoreSucceeded:true,boundedWorkloadSucceeded:true,recoveryUsedPrimaryProvider:false,duplicateExternalEffects:0,uncertainEffectBlindReplayObserved:false,businessEffectAuthority:'NONE'});
}
