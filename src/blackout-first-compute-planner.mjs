import {
  compileExecutionLeafContinuation,
  recordExecutionLeafResult,
  buildExecutionLeafContinuationCheckpoint,
  resumeExecutionLeafContinuation
} from './execution-leaf-continuation.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const BLACKOUT_FIRST_COMPUTE_PLANNER_VERSION='uberbond.blackout-first-compute-planner.v1.1';
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const envelope=extra=>({businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero(),...extra});
const SHA256=/^[0-9a-f]{64}$/;
const uniq=v=>[...new Set((Array.isArray(v)?v:[]).map(x=>String(x??'').trim()).filter(Boolean))].sort();

function validAttestation(a){
  return Boolean(a)
    && a.version==='uberbond.execution-leaf-result-attestation.v1'
    && SHA256.test(String(a.publicKeyFingerprint||''))
    && typeof a.signatureBase64==='string'
    && a.signatureBase64.length>0
    && a.signatureBase64.length<=4096;
}
function validEvent(e){
  if(!e||typeof e!=='object'||Array.isArray(e)) return false;
  if(e.type==='BLACKOUT') return true;
  if(e.type!=='RESULT') return false;
  return typeof e.leafId==='string'
    && ['COMPLETED','FAILED','BLOCKED'].includes(e.status)
    && SHA256.test(String(e.receiptDigest||''))
    && Array.isArray(e.evidenceRefs) && e.evidenceRefs.length>0
    && SHA256.test(String(e.authorityEpoch||''))
    && Number.isFinite(Date.parse(String(e.expiresAt||'')))
    && SHA256.test(String(e.strategyFingerprint||''))
    && SHA256.test(String(e.blockerFingerprint||''))
    && validAttestation(e.attestation);
}
function resultFromEvent(event){
  return {
    status:event.status,
    receiptDigest:event.receiptDigest,
    evidenceRefs:uniq(event.evidenceRefs),
    authorityEpoch:event.authorityEpoch,
    expiresAt:event.expiresAt,
    strategyFingerprint:event.strategyFingerprint,
    blockerFingerprint:event.blockerFingerprint,
    attestation:structuredClone(event.attestation)
  };
}

export function compileBlackoutFirstComputePlan({graph,maxAttempts=3,trustedVerifierPublicKeyPem}={}){
  if(typeof trustedVerifierPublicKeyPem!=='string'||!trustedVerifierPublicKeyPem.trim()){
    return envelope({ok:false,status:'BLACKOUT_FIRST_PLAN_BLOCKED',reasonCodes:['trusted-verifier-required-for-recoverable-results']});
  }
  const base=compileExecutionLeafContinuation({graph,maxAttempts,trustedVerifierPublicKeyPem});
  if(!base.ok) return envelope({ok:false,status:'BLACKOUT_FIRST_PLAN_BLOCKED',reasonCodes:base.reasonCodes||['continuation-compile-failed']});
  if(!base.state?.trustedVerifierFingerprint){
    return envelope({ok:false,status:'BLACKOUT_FIRST_PLAN_BLOCKED',reasonCodes:['trusted-verifier-fingerprint-required']});
  }
  const checkpoint=buildExecutionLeafContinuationCheckpoint({graph,state:base.state});
  if(!checkpoint.ok) return envelope({ok:false,status:'BLACKOUT_FIRST_PLAN_BLOCKED',reasonCodes:checkpoint.reasonCodes||['checkpoint-compile-failed']});
  return envelope({
    ok:true,
    status:'BLACKOUT_FIRST_PLAN_READY',
    version:BLACKOUT_FIRST_COMPUTE_PLANNER_VERSION,
    state:base.state,
    checkpoint:checkpoint.checkpoint,
    verifier:{publicKeyFingerprint:base.state.trustedVerifierFingerprint,privateKeyStored:false},
    recoveryPolicy:{
      checkpointAfterEveryAcceptedResult:true,
      resumeRequiresExactSourceRevision:true,
      proofCarryingResultsRequired:true,
      replayPolicy:'IDENTICAL_ATTESTED_TERMINAL_RECEIPT_IS_IDEMPOTENT__CONFLICTING_REPLAY_REFUSED',
      localRetryBound:maxAttempts,
      dependencySkippingAllowed:false,
      providerAuthorityCreated:false,
      externalEffectAuthority:'NONE'
    },
    truthBoundary:'THIS_IS_AN_INTERNAL_PROOF_CARRYING_EXECUTION_RECOVERY_PLAN__IT_DOES_NOT_CONTROL_POWER_OR_PROVE_HARDWARE_UPTIME.'
  });
}

export function applyBlackoutFirstEvent({
  graph,state,checkpoint,event,currentSourceCommit,verifierPublicKeyPem,now=Date.now()
}={}){
  if(!validEvent(event)) return envelope({ok:false,status:'BLACKOUT_FIRST_EVENT_BLOCKED',reasonCodes:['recognized-proof-carrying-fault-event-required']});
  if(event.type==='BLACKOUT'){
    const resumed=resumeExecutionLeafContinuation({graph,state,checkpoint,currentSourceCommit});
    if(!resumed.ok) return envelope({ok:false,status:'BLACKOUT_FIRST_RESUME_BLOCKED',reasonCodes:resumed.reasonCodes||['resume-failed']});
    return envelope({
      ok:true,status:'BLACKOUT_FIRST_RESUMED',
      state:resumed.state,checkpoint:structuredClone(checkpoint),
      blackoutObserved:true,
      truthBoundary:'RESUME_RESTORES_THE_LAST_VERIFIED_CHECKPOINT_ONLY__UNRECEIPTED_OR_UNATTESTED_WORK_IS_NOT_PROMOTED.'
    });
  }

  const applied=recordExecutionLeafResult({
    graph,state,leafId:event.leafId,
    result:resultFromEvent(event),
    verifierPublicKeyPem,
    now
  });
  if(!applied.ok) return envelope({ok:false,status:'BLACKOUT_FIRST_RESULT_BLOCKED',reasonCodes:applied.reasonCodes||['result-record-failed']});
  if(applied.status==='EXECUTION_LEAF_RESULT_IDEMPOTENT'){
    return envelope({
      ok:true,status:'BLACKOUT_FIRST_RESULT_IDEMPOTENT',
      state:applied.state,checkpoint:structuredClone(checkpoint),
      duplicateTerminalEffect:false
    });
  }
  const nextCheckpoint=buildExecutionLeafContinuationCheckpoint({graph,state:applied.state});
  if(!nextCheckpoint.ok) return envelope({ok:false,status:'BLACKOUT_FIRST_CHECKPOINT_BLOCKED',reasonCodes:nextCheckpoint.reasonCodes||['checkpoint-failed']});
  return envelope({
    ok:true,status:'BLACKOUT_FIRST_RESULT_CHECKPOINTED',
    state:applied.state,checkpoint:nextCheckpoint.checkpoint,
    duplicateTerminalEffect:false
  });
}

function runEvents({graph,maxAttempts,events,currentSourceCommit,trustedVerifierPublicKeyPem,now}){
  const plan=compileBlackoutFirstComputePlan({graph,maxAttempts,trustedVerifierPublicKeyPem});
  if(!plan.ok) return plan;
  let state=plan.state,checkpoint=plan.checkpoint,blackouts=0,idempotentReplays=0;
  for(const event of events){
    const out=applyBlackoutFirstEvent({
      graph,state,checkpoint,event,currentSourceCommit,
      verifierPublicKeyPem:trustedVerifierPublicKeyPem,
      now
    });
    if(!out.ok) return out;
    state=out.state;checkpoint=out.checkpoint;
    if(event.type==='BLACKOUT') blackouts++;
    if(out.status==='BLACKOUT_FIRST_RESULT_IDEMPOTENT') idempotentReplays++;
  }
  return {ok:true,state,checkpoint,blackouts,idempotentReplays};
}

export function evaluateBlackoutRecoveryReplay({
  graph,maxAttempts=3,events=[],currentSourceCommit,trustedVerifierPublicKeyPem,now=Date.now()
}={}){
  if(!Array.isArray(events)||events.length<1||events.length>500||events.some(e=>!validEvent(e))){
    return envelope({ok:false,status:'BLACKOUT_FIRST_REPLAY_BLOCKED',reasonCodes:['bounded-valid-proof-carrying-fault-events-required']});
  }
  const source=String(currentSourceCommit||graph?.sourceCommit||'');
  const faulted=runEvents({graph,maxAttempts,events,currentSourceCommit:source,trustedVerifierPublicKeyPem,now});
  if(!faulted.ok) return faulted;
  const controlEvents=events.filter(e=>e.type!=='BLACKOUT');
  const control=runEvents({graph,maxAttempts,events:controlEvents,currentSourceCommit:source,trustedVerifierPublicKeyPem,now});
  if(!control.ok) return control;

  const equivalent=faulted.state.stateDigest===control.state.stateDigest;
  const noLostCompletedWork=JSON.stringify([...faulted.state.completedLeafIds].sort())===JSON.stringify([...control.state.completedLeafIds].sort());
  return envelope({
    ok:true,
    status:equivalent&&noLostCompletedWork?'BLACKOUT_RECOVERY_EQUIVALENT':'BLACKOUT_RECOVERY_DIVERGED',
    version:BLACKOUT_FIRST_COMPUTE_PLANNER_VERSION,
    faultedStateDigest:faulted.state.stateDigest,
    controlStateDigest:control.state.stateDigest,
    blackoutCount:faulted.blackouts,
    idempotentReplayCount:faulted.idempotentReplays,
    proofCarryingResultsRequired:true,
    faultRecoveryEquivalent:equivalent,
    noLostCompletedWork,
    duplicateTerminalEffectsObserved:false,
    hypothesisSupported:equivalent&&noLostCompletedWork,
    falsifierTriggered:!(equivalent&&noLostCompletedWork),
    truthBoundary:'THIS_FIXED_REPLAY_TESTS_SIGNED_SOFTWARE_RECOVERY_EQUIVALENCE_ONLY__IT_DOES_NOT_PROVE_REAL_POWER_NETWORK_STORAGE_OR_HARDWARE_RELIABILITY.'
  });
}
