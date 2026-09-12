import {auditC21EvidenceBundle,compileC21EvidenceCampaign,CRITICAL_C21_DIMENSIONS} from './c21-evidence-factory.mjs';
import {evaluateSystemLevelAsiEvidence} from './system-level-asi-evidence.mjs';

export const C21_CURRENT_HEAD_TRIBUNAL_VERSION='uberbond.c21-current-head-tribunal.v1';
const SHA256=/^[0-9a-f]{64}$/;
const text=(v,n=1000)=>typeof v==='string'&&v.trim()&&v.trim().length<=n?v.trim():null;
const uniq=v=>[...new Set(v.filter(Boolean))];

export function freezeCurrentHeadCampaign({candidateRevision,frozenAt,rotationSaltDigest,candidateId='uberbond-main'}={}){
  return compileC21EvidenceCampaign({candidateId,candidateRevision,frozenAt,rotationSaltDigest,minimumIndependentVerifierIdentities:3});
}

function normalizeReceipt(receipt){
  return {...receipt,compoundReceiptHash:receipt?.compoundReceiptHash||receipt?.compoundEvaluation?.receiptHash};
}

export function preflightCurrentHeadEvidence({campaign,currentRevision,receipts=[]}={}){
  const reasons=[];
  if(!campaign||campaign.version!=='uberbond.c21-evidence-factory.v1') reasons.push('frozen-c21-campaign-required');
  if(!text(currentRevision,300)||campaign?.candidateRevision!==currentRevision) reasons.push('campaign-must-bind-exact-current-revision');
  const rows=(Array.isArray(receipts)?receipts:[]).map(normalizeReceipt);
  const externalRefs=new Set(),privateRefs=new Set(),resourceDigests=new Set();
  for(const row of rows){
    const cell=campaign?.cells?.find(c=>c.dimension===row?.dimension);
    if(row?.candidateId!==campaign?.candidateId||row?.candidateRevision!==campaign?.candidateRevision) reasons.push('receipt-candidate-must-match-frozen-campaign');
    if(row?.matchedResourceBudgetVerified!==true) reasons.push('matched-resource-budget-proof-required');
    const budgetDigest=text(row?.resourceBudgetDigest,64)?.toLowerCase();
    if(!budgetDigest||!SHA256.test(budgetDigest)) reasons.push('resource-budget-digest-required');
    else if(resourceDigests.has(budgetDigest)) reasons.push('resource-budget-receipt-reuse-refused'); else resourceDigests.add(budgetDigest);
    if(row?.externalBenchmarkObserved!==true||row?.privateHoldoutObserved!==true) reasons.push('external-benchmark-and-private-holdout-both-required');
    if(!cell||row?.externalBenchmarkSurface!==cell.benchmarkSurfaces?.[0]||row?.privateHoldoutSurface!==cell.benchmarkSurfaces?.[1]) reasons.push('benchmark-surfaces-must-match-frozen-cell');
    const ext=text(row?.externalBenchmarkEvidenceRef),priv=text(row?.privateHoldoutEvidenceRef);
    if(!ext||!priv||ext===priv) reasons.push('distinct-external-and-private-evidence-refs-required');
    if(ext){if(externalRefs.has(ext)) reasons.push('external-evidence-ref-reuse-refused'); else externalRefs.add(ext);}
    if(priv){if(privateRefs.has(priv)) reasons.push('private-evidence-ref-reuse-refused'); else privateRefs.add(priv);}
    if(row?.freshContextRetained!==true) reasons.push('fresh-context-retention-proof-required');
  }
  const packetAudit=campaign?auditC21EvidenceBundle({campaign,receipts:rows}):null;
  if(packetAudit?.ok===false) reasons.push(...(packetAudit.reasonCodes||[]));
  return {ok:reasons.length===0,version:C21_CURRENT_HEAD_TRIBUNAL_VERSION,status:reasons.length?'C21_CURRENT_HEAD_PREFLIGHT_REFUSED':'C21_CURRENT_HEAD_PREFLIGHT_PASSED',reasonCodes:uniq(reasons),rows,packetAudit,asiStatus:'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED',promotionAuthority:'NONE',businessEffectAuthority:'NONE'};
}

export function evaluateCurrentHeadC21({campaign,currentRevision,receipts=[],observedAt}={}){
  const preflight=preflightCurrentHeadEvidence({campaign,currentRevision,receipts});
  if(!preflight.ok) return {...preflight,evidenceStage:'SYSTEM_LEVEL_ASI_EVIDENCE_NOT_ESTABLISHED'};
  const evaluation=evaluateSystemLevelAsiEvidence({candidateId:campaign.candidateId,candidateRevision:campaign.candidateRevision,dimensions:preflight.rows,observedAt,minimumPartialDimensions:12,minimumIndependentVerifierIdentities:3});
  const missing=evaluation?.missingDimensions||campaign.cells.map(c=>c.dimension);
  const critical=new Set(CRITICAL_C21_DIMENSIONS);
  const nextCells=missing.map(d=>campaign.cells.find(c=>c.dimension===d)).filter(Boolean).sort((a,b)=>Number(critical.has(b.dimension))-Number(critical.has(a.dimension)));
  return {ok:evaluation?.ok===true,version:C21_CURRENT_HEAD_TRIBUNAL_VERSION,status:'C21_CURRENT_HEAD_EVALUATED',candidateRevision:currentRevision,packetAudit:preflight.packetAudit,evaluation,nextEvidenceCells:nextCells,asiStatus:'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED',truthBoundary:'ONLY_EXACT_CURRENT_HEAD_OBSERVED_NONSYNTHETIC_MATCHED_RESOURCE_EXTERNAL_PLUS_PRIVATE_HELDOUT_EVIDENCE_COUNTS'};
}
