import { REMAINING_CUT_IDS } from './remaining-cut-evidence.mjs';

export const REMAINING_CUT_EVIDENCE_OVERLAY_VERSION='uberbond.remaining-cut-evidence-overlay.v1';
const PROVIDER_CUTS=new Set(['MESSAGING_PROVIDER','PAYMENT_PROVIDER','DEPLOYMENT_PROVIDER']);
const OWNER_CUTS=new Set(['CREDENTIAL_CUSTODY','SOVEREIGN_IDENTITY']);

export function applyRemainingCutEvidenceOverlay({cutSetReport,evidenceByCut={}}={}){
  const base=cutSetReport&&typeof cutSetReport==='object'?cutSetReport:{};
  const originalProviders=Array.isArray(base.externalProviderCuts)?base.externalProviderCuts:[];
  const originalOwners=Array.isArray(base.ownerCustodyCuts)?base.ownerCustodyCuts:[];
  const accepted=[];const rejected=[];const evidence={};
  for(const cutId of REMAINING_CUT_IDS){
    const row=evidenceByCut?.[cutId]||null;
    const canClose=(PROVIDER_CUTS.has(cutId)&&originalProviders.includes(cutId))||(OWNER_CUTS.has(cutId)&&originalOwners.includes(cutId));
    if(row?.accepted===true&&row.cutId===cutId&&canClose){accepted.push(cutId);evidence[cutId]={evidenceRef:row.evidenceRef,receiptDigest:row.receiptDigest,sourceCommit:row.sourceCommit};}
    else if(row&&row.accepted===false&&Array.isArray(row.reasonCodes)&&row.reasonCodes.length)evidence[cutId]={accepted:false,reasonCodes:[...row.reasonCodes]};
    if(row?.accepted===true&&row.cutId!==cutId)rejected.push(`${cutId}:cut-id-mismatch`);
  }
  const externalProviderCuts=originalProviders.filter(cut=>!accepted.includes(cut));
  const ownerCustodyCuts=originalOwners.filter(cut=>!accepted.includes(cut));
  return{...base,externalProviderCuts,ownerCustodyCuts,remainingCutEvidenceOverlay:{version:REMAINING_CUT_EVIDENCE_OVERLAY_VERSION,acceptedCuts:accepted,rejectedClaims:rejected,remainingProviderCuts:externalProviderCuts,remainingOwnerCuts:ownerCustodyCuts,evidence,businessEffectAuthority:'NONE',truthBoundary:'EACH EXACT-SOURCE SECRET-FREE RECEIPT MAY CLOSE ONLY ITS OWN NAMED CUT. MESSAGING, PAYMENT, DEPLOYMENT, CREDENTIAL CUSTODY AND SOVEREIGN IDENTITY EVIDENCE ARE NON-TRANSITIVE AND NEVER CREATE AUTHORITY.'}};
}
