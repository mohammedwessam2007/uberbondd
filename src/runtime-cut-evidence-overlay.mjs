export const RUNTIME_CUT_EVIDENCE_OVERLAY_VERSION='uberbond.runtime-cut-evidence-overlay.v1';
const RESTART_CUTS=Object.freeze(['DATABASE_STATE','WORKER_SCHEDULER_PROCESS']);

export function applyRuntimeCutEvidenceOverlay({cutSetReport,restartRecoveryEvidence}={}){
  const base=cutSetReport&&typeof cutSetReport==='object'?cutSetReport:{};
  const original=Array.isArray(base.runtimeProofRequiredCuts)?base.runtimeProofRequiredCuts:[];
  const accepted=restartRecoveryEvidence?.accepted===true;
  const closed=accepted?RESTART_CUTS.filter(cut=>original.includes(cut)):[];
  const remaining=original.filter(cut=>!closed.includes(cut));
  return {
    ...base,
    runtimeProofRequiredCuts:remaining,
    runtimeEvidenceOverlay:{
      version:RUNTIME_CUT_EVIDENCE_OVERLAY_VERSION,
      acceptedRestartRecovery:accepted,
      closedRuntimeCuts:closed,
      remainingRuntimeCuts:remaining,
      evidenceRef:accepted?restartRecoveryEvidence.evidenceRef:null,
      receiptDigest:accepted?restartRecoveryEvidence.receiptDigest:null,
      sourceCommit:accepted?restartRecoveryEvidence.sourceCommit:null,
      businessEffectAuthority:'NONE',
      truthBoundary:'RUNTIME_CUTS_CLOSE_ONLY_FOR_THE_EXACT_SOURCE_RECEIPT_VALIDATED_OUTSIDE_THE_STATIC_SOURCE_AUDIT'
    }
  };
}
