import crypto from 'node:crypto';

export const RUNTIME_TRANSITION_RECEIPTS_VERSION='uberbond.runtime-transition-receipts.v2';
export const RUNTIME_TRANSITION_OBSERVER_VERSION='uberbond.runtime-transition-observer-receipt.v1';

const SHA40=/^[0-9a-f]{40}$/;
const SHA256=/^sha256:[0-9a-f]{64}$/;
const ZERO=Object.freeze({customerMessages:0,providerCalls:0,spendCents:0,deployments:0,dnsChanges:0,credentialChanges:0,paymentMutations:0,productionMutations:0});
const text=(v,max=500)=>{const s=String(v??'').trim();return s&&s.length<=max?s:null;};
const uniq=a=>[...new Set((Array.isArray(a)?a:[]).filter(Boolean))];
const digest=v=>`sha256:${crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex')}`;
const fail=(kind,reasons,extra={})=>({ok:false,schemaVersion:RUNTIME_TRANSITION_RECEIPTS_VERSION,status:`${kind}_ASSERTION_REFUSED`,reasonCodes:uniq(reasons),businessEffectAuthority:'NONE',externalEffectLedger:{...ZERO},...extra});

function identityKey(value){
  let out=String(value??'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
  while(/^(?:verifier|runtime|provider|observer):/.test(out)) out=out.replace(/^(?:verifier|runtime|provider|observer):/,'');
  return out;
}
function distinctIdentity(a,b){const x=identityKey(a),y=identityKey(b);return Boolean(x&&y&&x!==y);}
function validDate(v){const s=text(v,80);return Boolean(s&&!Number.isNaN(Date.parse(s)));}

function commonAssertion(input,kind){
  const reasons=[];
  const sourceCommit=text(input.sourceCommit,40)?.toLowerCase()||null;
  const runtimeIdentity=text(input.runtimeIdentity);
  const evidenceRef=text(input.evidenceRef);
  const observedAt=text(input.observedAt,80);
  if(!sourceCommit||!SHA40.test(sourceCommit)) reasons.push('exact-source-commit-required');
  if(!runtimeIdentity) reasons.push('runtime-identity-required');
  if(!evidenceRef) reasons.push('evidence-ref-required');
  if(!validDate(observedAt)) reasons.push('valid-observed-at-required');
  return {reasons,sourceCommit,runtimeIdentity,evidenceRef,observedAt,kind};
}
function assertionBase(c,status){return{
  ok:true,
  schemaVersion:RUNTIME_TRANSITION_RECEIPTS_VERSION,
  status,
  evidenceClass:'UNVERIFIED_RUNTIME_ASSERTION',
  originClass:'SOURCE_ONLY_ASSERTION',
  maySatisfyRuntimeAcceptance:false,
  sourceCommit:c.sourceCommit,
  runtimeIdentity:c.runtimeIdentity,
  evidenceRef:c.evidenceRef,
  observedAt:c.observedAt,
  businessEffectAuthority:'NONE'
};}
function finalizeAssertion(assertion){return{...assertion,assertionDigest:digest(assertion)};}

export function compileDurableWorkloadAssertion(input={}){
  const c=commonAssertion(input,'DURABLE_WORKLOAD');
  const r=[...c.reasons];
  const workloadId=text(input.workloadId,300);
  const before=text(input.beforeStateDigest,80)?.toLowerCase();
  const after=text(input.afterStateDigest,80)?.toLowerCase();
  if(!workloadId) r.push('workload-id-required');
  if(!before||!SHA256.test(before)||!after||!SHA256.test(after)) r.push('sha256-state-digests-required');
  if(before&&after&&before!==after) r.push('workload-state-must-survive-restart');
  if(input.restartObserved!==true) r.push('restart-must-be-asserted');
  if(input.replacementWorkerObserved!==true) r.push('replacement-worker-must-be-asserted');
  if(input.persistedAcrossRestart!==true) r.push('persisted-across-restart-required');
  if(input.duplicateExternalEffects!==0) r.push('zero-duplicate-external-effects-required');
  if(input.uncertainEffectBlindReplayObserved===true) r.push('uncertain-effect-blind-replay-prohibited');
  if(r.length) return fail('DURABLE_WORKLOAD',r,{sourceCommit:c.sourceCommit});
  return finalizeAssertion({...assertionBase(c,'DURABLE_WORKLOAD_OBSERVATION_ASSERTION_COMPILED'),receiptClass:'DURABLE_WORKLOAD',workloadId,beforeStateDigest:before,afterStateDigest:after,restartObserved:true,replacementWorkerObserved:true,persistedAcrossRestart:true,duplicateExternalEffects:0,uncertainEffectBlindReplayObserved:false});
}

export function compileCutoverRollbackAssertion(input={}){
  const c=commonAssertion(input,'CUTOVER_ROLLBACK');
  const r=[...c.reasons];
  const fromRuntimeIdentity=text(input.fromRuntimeIdentity);
  const toRuntimeIdentity=text(input.toRuntimeIdentity);
  if(!fromRuntimeIdentity||!toRuntimeIdentity||!distinctIdentity(fromRuntimeIdentity,toRuntimeIdentity)) r.push('distinct-cutover-runtime-identities-required');
  if(c.runtimeIdentity&&toRuntimeIdentity&&identityKey(c.runtimeIdentity)!==identityKey(toRuntimeIdentity)) r.push('asserted-runtime-must-be-cutover-target');
  if(input.cutoverSucceeded!==true) r.push('successful-cutover-must-be-asserted');
  if(input.boundedWorkloadSucceeded!==true) r.push('bounded-workload-on-target-required');
  if(input.rollbackExercised!==true||input.rollbackSucceeded!==true) r.push('successful-rollback-rehearsal-required');
  if(identityKey(input.rollbackRuntimeIdentity)!==identityKey(fromRuntimeIdentity)) r.push('rollback-must-return-to-source-runtime');
  if(input.duplicateExternalEffects!==0) r.push('zero-duplicate-external-effects-required');
  if(input.uncertainEffectBlindReplayObserved===true) r.push('uncertain-effect-blind-replay-prohibited');
  if(r.length) return fail('CUTOVER_ROLLBACK',r,{sourceCommit:c.sourceCommit});
  return finalizeAssertion({...assertionBase(c,'CUTOVER_ROLLBACK_OBSERVATION_ASSERTION_COMPILED'),receiptClass:'CUTOVER_ROLLBACK',fromRuntimeIdentity,toRuntimeIdentity,cutoverSucceeded:true,boundedWorkloadSucceeded:true,rollbackExercised:true,rollbackSucceeded:true,rollbackRuntimeIdentity:fromRuntimeIdentity,duplicateExternalEffects:0,uncertainEffectBlindReplayObserved:false});
}

export function compileProviderLossAssertion(input={}){
  const c=commonAssertion(input,'PROVIDER_LOSS');
  const r=[...c.reasons];
  const failedProvider=text(input.failedProvider,160);
  const alternateProvider=text(input.alternateProvider,160);
  const manifestDigest=text(input.manifestDigest,80)?.toLowerCase();
  if(!failedProvider||!alternateProvider||!distinctIdentity(failedProvider,alternateProvider)) r.push('distinct-provider-boundary-required');
  if(!manifestDigest||!SHA256.test(manifestDigest)) r.push('continuity-manifest-digest-required');
  if(input.primaryUnavailable!==true) r.push('primary-provider-unavailability-must-be-asserted');
  if(input.alternateRestoreSucceeded!==true) r.push('alternate-provider-restore-required');
  if(input.boundedWorkloadSucceeded!==true) r.push('bounded-workload-on-alternate-required');
  if(input.recoveryUsedPrimaryProvider===true) r.push('recovery-must-not-use-failed-provider');
  if(input.duplicateExternalEffects!==0) r.push('zero-duplicate-external-effects-required');
  if(input.uncertainEffectBlindReplayObserved===true) r.push('uncertain-effect-blind-replay-prohibited');
  if(r.length) return fail('PROVIDER_LOSS',r,{sourceCommit:c.sourceCommit});
  return finalizeAssertion({...assertionBase(c,'PROVIDER_LOSS_OBSERVATION_ASSERTION_COMPILED'),receiptClass:'PROVIDER_LOSS',manifestDigest,failedProvider,alternateProvider,primaryUnavailable:true,alternateRestoreSucceeded:true,boundedWorkloadSucceeded:true,recoveryUsedPrimaryProvider:false,duplicateExternalEffects:0,uncertainEffectBlindReplayObserved:false});
}

export function runtimeTransitionObserverReceiptPreimage(receipt={}){
  return {
    ok:true,
    schemaVersion:RUNTIME_TRANSITION_OBSERVER_VERSION,
    status:'RUNTIME_TRANSITION_OBSERVER_EXECUTED',
    producerRef:receipt.producerRef,
    producerSourceCommit:receipt.producerSourceCommit,
    transitionKind:receipt.transitionKind,
    subjectAssertionDigest:receipt.subjectAssertionDigest,
    runtimeIdentity:receipt.runtimeIdentity,
    observedAt:receipt.observedAt,
    exitCode:0,
    independentlyVerified:true,
    evidenceRef:receipt.evidenceRef,
    independentVerifierRef:receipt.independentVerifierRef,
    duplicateExternalEffects:0,
    uncertainEffectBlindReplayObserved:false,
    businessEffectAuthority:'NONE'
  };
}
export function verifyRuntimeTransitionObserverReceipt(receipt={},assertion={}){
  if(!receipt||receipt.ok!==true||receipt.schemaVersion!==RUNTIME_TRANSITION_OBSERVER_VERSION||receipt.status!=='RUNTIME_TRANSITION_OBSERVER_EXECUTED') return false;
  if(!text(receipt.producerRef)||!SHA40.test(String(receipt.producerSourceCommit||'').toLowerCase())) return false;
  if(!['DURABLE_WORKLOAD','CUTOVER_ROLLBACK','PROVIDER_LOSS'].includes(receipt.transitionKind)||receipt.transitionKind!==assertion?.receiptClass) return false;
  if(String(receipt.producerSourceCommit||'').toLowerCase()!==String(assertion?.sourceCommit||'').toLowerCase()) return false;
  if(!SHA256.test(String(receipt.subjectAssertionDigest||'').toLowerCase())||receipt.subjectAssertionDigest!==assertion?.assertionDigest) return false;
  if(identityKey(receipt.runtimeIdentity)!==identityKey(assertion?.runtimeIdentity)) return false;
  if(!validDate(receipt.observedAt)||receipt.exitCode!==0||receipt.independentlyVerified!==true) return false;
  if(!text(receipt.evidenceRef)||!text(receipt.independentVerifierRef)||!distinctIdentity(receipt.runtimeIdentity,receipt.independentVerifierRef)) return false;
  if(receipt.duplicateExternalEffects!==0||receipt.uncertainEffectBlindReplayObserved===true||receipt.businessEffectAuthority!=='NONE') return false;
  return text(receipt.receiptDigest,80)?.toLowerCase()===digest(runtimeTransitionObserverReceiptPreimage(receipt));
}

function observedCore(receipt,kind){
  return {
    ok:true,
    schemaVersion:RUNTIME_TRANSITION_RECEIPTS_VERSION,
    status:`${kind}_OBSERVED`,
    evidenceClass:'OBSERVED_RUNTIME',
    originClass:'EXECUTING_OBSERVER_RECEIPT',
    receiptClass:kind,
    sourceCommit:receipt.sourceCommit,
    runtimeIdentity:receipt.runtimeIdentity,
    evidenceRef:receipt.evidenceRef,
    independentVerifierRef:receipt.independentVerifierRef,
    observedAt:receipt.observedAt,
    assertionDigest:receipt.assertionDigest,
    observerReceiptDigest:receipt.observerReceiptDigest,
    businessEffectAuthority:'NONE'
  };
}
export function runtimeTransitionObservedReceiptPreimage(receipt={},kind){
  const base=observedCore(receipt,kind);
  if(kind==='DURABLE_WORKLOAD') return {...base,workloadId:receipt.workloadId,beforeStateDigest:receipt.beforeStateDigest,afterStateDigest:receipt.afterStateDigest,restartObserved:true,replacementWorkerObserved:true,persistedAcrossRestart:true,duplicateExternalEffects:0,uncertainEffectBlindReplayObserved:false};
  if(kind==='CUTOVER_ROLLBACK') return {...base,fromRuntimeIdentity:receipt.fromRuntimeIdentity,toRuntimeIdentity:receipt.toRuntimeIdentity,cutoverSucceeded:true,boundedWorkloadSucceeded:true,rollbackExercised:true,rollbackSucceeded:true,rollbackRuntimeIdentity:receipt.fromRuntimeIdentity,duplicateExternalEffects:0,uncertainEffectBlindReplayObserved:false};
  if(kind==='PROVIDER_LOSS') return {...base,manifestDigest:receipt.manifestDigest,failedProvider:receipt.failedProvider,alternateProvider:receipt.alternateProvider,primaryUnavailable:true,alternateRestoreSucceeded:true,boundedWorkloadSucceeded:true,recoveryUsedPrimaryProvider:false,duplicateExternalEffects:0,uncertainEffectBlindReplayObserved:false};
  return null;
}

export function verifyRuntimeTransitionReceiptIntegrity(receipt={},kind){
  if(!['DURABLE_WORKLOAD','CUTOVER_ROLLBACK','PROVIDER_LOSS'].includes(kind)) return false;
  if(receipt?.ok!==true||receipt.schemaVersion!==RUNTIME_TRANSITION_RECEIPTS_VERSION||receipt.status!==`${kind}_OBSERVED`||receipt.evidenceClass!=='OBSERVED_RUNTIME'||receipt.originClass!=='EXECUTING_OBSERVER_RECEIPT'||receipt.receiptClass!==kind) return false;
  const assertion=receipt.assertion;
  if(!assertion||assertion.ok!==true||assertion.evidenceClass!=='UNVERIFIED_RUNTIME_ASSERTION'||assertion.originClass!=='SOURCE_ONLY_ASSERTION'||assertion.maySatisfyRuntimeAcceptance!==false||assertion.receiptClass!==kind) return false;
  if(!SHA256.test(String(assertion.assertionDigest||'').toLowerCase())||digest(Object.fromEntries(Object.entries(assertion).filter(([key])=>key!=='assertionDigest')))!==assertion.assertionDigest) return false;
  if(receipt.assertionDigest!==assertion.assertionDigest) return false;
  if(String(receipt.sourceCommit||'').toLowerCase()!==String(assertion.sourceCommit||'').toLowerCase()||identityKey(receipt.runtimeIdentity)!==identityKey(assertion.runtimeIdentity)) return false;
  const observer=receipt.observerReceipt;
  if(!verifyRuntimeTransitionObserverReceipt(observer,assertion)||receipt.observerReceiptDigest!==observer.receiptDigest) return false;
  if(observer.transitionKind!==kind||String(observer.producerSourceCommit||'').toLowerCase()!==String(receipt.sourceCommit||'').toLowerCase()) return false;
  if(receipt.observedAt!==observer.observedAt) return false;
  if(!text(receipt.evidenceRef)||receipt.evidenceRef!==observer.evidenceRef||!text(receipt.independentVerifierRef)||receipt.independentVerifierRef!==observer.independentVerifierRef) return false;
  if(!distinctIdentity(receipt.runtimeIdentity,receipt.independentVerifierRef)||!validDate(receipt.observedAt)) return false;
  if(kind==='CUTOVER_ROLLBACK'&&!distinctIdentity(receipt.fromRuntimeIdentity,receipt.toRuntimeIdentity)) return false;
  if(kind==='PROVIDER_LOSS'&&!distinctIdentity(receipt.failedProvider,receipt.alternateProvider)) return false;
  const preimage=runtimeTransitionObservedReceiptPreimage(receipt,kind);
  return Boolean(preimage&&text(receipt.receiptDigest,80)?.toLowerCase()===digest(preimage));
}

export function runtimeTransitionIdentityEquivalent(a,b){return Boolean(identityKey(a)&&identityKey(a)===identityKey(b));}
