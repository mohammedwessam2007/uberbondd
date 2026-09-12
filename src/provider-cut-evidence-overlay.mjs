export const PROVIDER_CUT_EVIDENCE_OVERLAY_VERSION='uberbond.provider-cut-evidence-overlay.v1';
const MODEL_CUT='MODEL_PROVIDER';
export function applyProviderCutEvidenceOverlay({cutSetReport,modelProviderEvidence}={}){
  const base=cutSetReport&&typeof cutSetReport==='object'?cutSetReport:{};const original=Array.isArray(base.externalProviderCuts)?base.externalProviderCuts:[];const accepted=modelProviderEvidence?.accepted===true;const closed=accepted&&original.includes(MODEL_CUT)?[MODEL_CUT]:[];const remaining=original.filter(cut=>!closed.includes(cut));
  return{...base,externalProviderCuts:remaining,providerEvidenceOverlay:{version:PROVIDER_CUT_EVIDENCE_OVERLAY_VERSION,acceptedModelProvider:accepted,closedProviderCuts:closed,remainingProviderCuts:remaining,modelProvider:accepted?{evidenceRef:modelProviderEvidence.evidenceRef,receiptDigest:modelProviderEvidence.receiptDigest,sourceCommit:modelProviderEvidence.sourceCommit}:null,businessEffectAuthority:'NONE',truthBoundary:'MODEL PROVIDER EVIDENCE MAY CLOSE ONLY MODEL_PROVIDER; IT MUST NOT CLOSE MESSAGING, PAYMENT, DEPLOYMENT OR OWNER-CUSTODY CUTS'}};
}
