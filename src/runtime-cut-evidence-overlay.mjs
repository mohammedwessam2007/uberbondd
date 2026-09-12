export const RUNTIME_CUT_EVIDENCE_OVERLAY_VERSION='uberbond.runtime-cut-evidence-overlay.v2';
const SOURCE_CUTS=Object.freeze(['SOURCE_REPOSITORY_HOST']);
const RESTART_CUTS=Object.freeze(['DATABASE_STATE','WORKER_SCHEDULER_PROCESS']);
const WEB_CUTS=Object.freeze(['WEB_RUNTIME_HOST']);

export function applyRuntimeCutEvidenceOverlay({cutSetReport,sourceRepositoryEvidence,restartRecoveryEvidence,webRuntimeEvidence}={}){
  const base=cutSetReport&&typeof cutSetReport==='object'?cutSetReport:{};
  const original=Array.isArray(base.runtimeProofRequiredCuts)?base.runtimeProofRequiredCuts:[];
  const sourceAccepted=sourceRepositoryEvidence?.accepted===true,restartAccepted=restartRecoveryEvidence?.accepted===true,webAccepted=webRuntimeEvidence?.accepted===true;
  const eligible=new Set([...(sourceAccepted?SOURCE_CUTS:[]),...(restartAccepted?RESTART_CUTS:[]),...(webAccepted?WEB_CUTS:[])]);
  const closed=original.filter(cut=>eligible.has(cut));const remaining=original.filter(cut=>!eligible.has(cut));
  const evidenceSummary=evidence=>evidence?.accepted===true?{evidenceRef:evidence.evidenceRef,receiptDigest:evidence.receiptDigest,sourceCommit:evidence.sourceCommit}:null;
  return{...base,runtimeProofRequiredCuts:remaining,runtimeEvidenceOverlay:{version:RUNTIME_CUT_EVIDENCE_OVERLAY_VERSION,acceptedSourceRepositoryHost:sourceAccepted,acceptedRestartRecovery:restartAccepted,acceptedWebRuntimeHost:webAccepted,closedRuntimeCuts:closed,remainingRuntimeCuts:remaining,sourceRepositoryHost:evidenceSummary(sourceRepositoryEvidence),restartRecovery:evidenceSummary(restartRecoveryEvidence),webRuntimeHost:evidenceSummary(webRuntimeEvidence),evidenceRef:restartAccepted?restartRecoveryEvidence.evidenceRef:null,receiptDigest:restartAccepted?restartRecoveryEvidence.receiptDigest:null,sourceCommit:restartAccepted?restartRecoveryEvidence.sourceCommit:null,businessEffectAuthority:'NONE',truthBoundary:'RUNTIME_CUTS_CLOSE_ONLY_FOR_THEIR_EXACT_SOURCE_CANONICAL_RECEIPTS; RUNTIME HOST EVIDENCE DOES NOT CLOSE EXTERNAL PROVIDER OR OWNER CUSTODY CUTS'}};
}
