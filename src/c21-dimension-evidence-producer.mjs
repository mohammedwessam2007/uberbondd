import crypto from 'node:crypto';
import {evaluateCompoundIntelligence} from './compound-intelligence-evaluation.mjs';
import {preflightCurrentHeadEvidence} from './c21-current-head-tribunal.mjs';

export const C21_DIMENSION_EVIDENCE_PRODUCER_VERSION='uberbond.c21-dimension-evidence-producer.v1';
const SHA=/^[0-9a-f]{64}$/;
const text=(v,n=1000)=>typeof v==='string'&&v.trim()&&v.trim().length<=n?v.trim():null;
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail=(reasonCodes,extra={})=>({ok:false,version:C21_DIMENSION_EVIDENCE_PRODUCER_VERSION,status:'C21_DIMENSION_EVIDENCE_REFUSED',reasonCodes:[...new Set(reasonCodes.filter(Boolean))],asiStatus:'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED',promotionAuthority:'NONE',businessEffectAuthority:'NONE',...extra});

export function compileC21DimensionEvidence({campaign,dimension,compoundInput,externalBenchmark,privateHoldout,resourceBudget,verifier,observedAt,contaminationStatus='CLEAN'}={}){
  const reasons=[];
  const cell=campaign?.cells?.find(row=>row.dimension===dimension);
  if(!campaign||!cell) reasons.push('frozen-campaign-cell-required');
  const candidateId=text(campaign?.candidateId,200),candidateRevision=text(campaign?.candidateRevision,300);
  if(!candidateId||!candidateRevision) reasons.push('frozen-candidate-identity-required');
  if(compoundInput?.compositionId!==candidateId||compoundInput?.compositionRevision!==candidateRevision) reasons.push('compound-input-must-bind-frozen-candidate');

  const extRef=text(externalBenchmark?.evidenceRef),privRef=text(privateHoldout?.evidenceRef),budgetDigest=text(resourceBudget?.digest,64)?.toLowerCase();
  if(externalBenchmark?.observed!==true||externalBenchmark?.synthetic===true||externalBenchmark?.surface!==cell?.benchmarkSurfaces?.[0]||!extRef) reasons.push('observed-external-benchmark-bound-to-frozen-surface-required');
  if(privateHoldout?.observed!==true||privateHoldout?.synthetic===true||privateHoldout?.surface!==cell?.benchmarkSurfaces?.[1]||!privRef) reasons.push('observed-private-holdout-bound-to-frozen-surface-required');
  if(extRef&&privRef&&extRef===privRef) reasons.push('external-and-private-evidence-must-be-distinct');
  if(resourceBudget?.verified!==true||!budgetDigest||!SHA.test(budgetDigest)) reasons.push('verified-matched-resource-budget-digest-required');
  const verifierId=text(verifier?.id,200),lineage=text(verifier?.lineageRef,500),evaluatorRef=text(verifier?.independentEvaluatorRef,500);
  if(!verifierId||!lineage||!evaluatorRef||verifier?.independent!==true) reasons.push('independent-verifier-identity-lineage-and-evaluator-ref-required');
  const at=text(observedAt,100);
  if(!at) reasons.push('observed-at-required');
  const contamination=text(contaminationStatus,40)?.toUpperCase();
  if(!['CLEAN','BOUNDED_DISCLOSED'].includes(contamination)) reasons.push('valid-contamination-status-required');
  if(reasons.length) return fail(reasons);

  const c13=evaluateCompoundIntelligence(compoundInput);
  if(c13?.ok!==true||c13?.status!=='COMPOUND_INTELLIGENCE_GAIN_SUPPORTED_WITHIN_DEFINED_SCOPE') return fail(['authenticated-c13-gain-evidence-required'],{compoundEvaluation:c13});

  const evidenceRef=`c21-dimension:${hash({candidateId,candidateRevision,dimension,externalBenchmarkEvidenceRef:extRef,privateHoldoutEvidenceRef:privRef,c13ReceiptHash:c13.receiptHash,resourceBudgetDigest:budgetDigest,observedAt:at})}`;
  const row={
    candidateId,candidateRevision,dimension,observed:true,synthetic:false,evidenceRef,
    independentEvaluatorRef:evaluatorRef,verifierId,verifierLineageRef:lineage,
    taskPopulationHash:cell.taskPopulationHash,observedAt:at,compoundEvaluation:c13,
    baselineVerifiedAtEvaluationTime:true,thresholdFrozenBeforeEvaluation:true,
    freshContextHeldout:true,freshContextRetained:true,contaminationStatus:contamination,evaluatorIndependent:true,
    matchedResourceBudgetVerified:true,resourceBudgetDigest:budgetDigest,
    externalBenchmarkObserved:true,privateHoldoutObserved:true,
    externalBenchmarkSurface:cell.benchmarkSurfaces[0],privateHoldoutSurface:cell.benchmarkSurfaces[1],
    externalBenchmarkEvidenceRef:extRef,privateHoldoutEvidenceRef:privRef
  };
  const preflight=preflightCurrentHeadEvidence({campaign,currentRevision:candidateRevision,receipts:[row]});
  if(!preflight.ok) return fail(['c21-preflight-refused',...(preflight.reasonCodes||[])],{compoundEvaluation:c13,preflight});
  const rawPacket={version:C21_DIMENSION_EVIDENCE_PRODUCER_VERSION,candidateId,candidateRevision,dimension,taskPopulationHash:cell.taskPopulationHash,externalBenchmark,privateHoldout,resourceBudget,verifier,observedAt:at,contaminationStatus:contamination,compoundInput,compoundEvaluation:c13,c21Row:row};
  return {ok:true,version:C21_DIMENSION_EVIDENCE_PRODUCER_VERSION,status:'C21_DIMENSION_EVIDENCE_PACKET_COMPILED',packetDigest:hash(rawPacket),rawPacket,c21Row:row,asiStatus:'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED',promotionAuthority:'NONE',businessEffectAuthority:'NONE',truthBoundary:'COMPILER_PRESERVES_OBSERVED_RAW_EVIDENCE_AND_CAN_NEVER_CREATE_OR_WITNESS_BENCHMARK_RESULTS'};
}
