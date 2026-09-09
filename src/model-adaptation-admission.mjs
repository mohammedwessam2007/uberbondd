import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const MODEL_ADAPTATION_ADMISSION_VERSION='uberbond.model-adaptation-admission.v1';
const ROUTES=Object.freeze(['PROMPT','RETRIEVAL','TOOLS','DECOMPOSITION','COMPOSITION','AUTHORIZED_EXISTING_MODEL']);
const SHA=/^[0-9a-f]{64}$/;
const text=(v,max=500)=>{const s=typeof v==='string'?v.trim():'';return s&&s.length<=max?s:null;};
const unique=v=>[...new Set(v.filter(Boolean))];
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const fail=(status,reasons,extra={})=>({ok:false,version:MODEL_ADAPTATION_ADMISSION_VERSION,status,reasonCodes:unique(reasons),trainingAuthority:'NONE',deploymentAuthority:'NONE',businessEffectAuthority:'NONE',asiStatus:'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED',externalEffectLedger:zero(),...extra});
const strictInt=v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?v:null;
const strictNum=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;

function validateCheaperRoutes(rows,bottleneckDigest){
  const reasons=[];if(!Array.isArray(rows))return['cheaper-route-measurements-required'];
  if(rows.length!==ROUTES.length)reasons.push('all-cheaper-routes-must-be-measured-exactly-once');
  const seen=new Set();let prior=-1;
  for(const row of rows){const route=text(row?.route,80)?.toUpperCase();const index=ROUTES.indexOf(route);if(index<0){reasons.push('unknown-cheaper-route');continue;}if(seen.has(route))reasons.push('duplicate-cheaper-route');seen.add(route);if(index<=prior)reasons.push('cheaper-routes-must-follow-canonical-order');prior=index;
    if(row?.status!=='MEASURED_INSUFFICIENT')reasons.push(`cheaper-route-not-proven-insufficient:${route}`);
    if(!text(row?.evidenceRef,500))reasons.push(`cheaper-route-evidence-required:${route}`);
    if(text(row?.bottleneckDigest,64)?.toLowerCase()!==bottleneckDigest)reasons.push(`cheaper-route-bottleneck-mismatch:${route}`);
    const budget=text(row?.matchedBudgetRef,500);if(!budget)reasons.push(`cheaper-route-matched-budget-required:${route}`);
  }
  for(const route of ROUTES)if(!seen.has(route))reasons.push(`cheaper-route-missing:${route}`);return reasons;
}
function validateDataset(m){
  const reasons=[];const digest=text(m?.datasetDigest,64)?.toLowerCase();if(!digest||!SHA.test(digest))reasons.push('dataset-digest-required');
  const rows=Array.isArray(m?.sources)?m.sources:[];if(!rows.length)reasons.push('dataset-sources-required');
  for(const row of rows){if(!text(row?.provenanceRef,500))reasons.push('dataset-source-provenance-required');if(!text(row?.license,120)||row?.licenseStatus!=='ALLOWED')reasons.push('dataset-source-license-must-be-allowed');if(row?.containsPrivateData===true&&row?.explicitConsent!==true)reasons.push('private-training-data-requires-explicit-consent');if(row?.containsPrivateData===true&&!text(row?.consentRef,500))reasons.push('private-training-data-consent-evidence-required');if(row?.collectionAuthorized!==true)reasons.push('dataset-source-collection-authority-required');}
  const p=m?.partitions||{};const hashes=['trainHash','devHash','heldoutHash'].map(k=>text(p[k],64)?.toLowerCase());if(hashes.some(v=>!v||!SHA.test(v)))reasons.push('train-dev-heldout-hashes-required');else if(new Set(hashes).size!==3)reasons.push('train-dev-heldout-must-be-distinct');
  if(p?.identityOverlapCount!==0)reasons.push('partition-identity-overlap-must-be-zero');if(m?.contamination?.evidenceClass!=='OBSERVED_SCAN'||m?.contamination?.knownBenchmarkMatchCount!==0||m?.contamination?.heldoutLeakCount!==0||!text(m?.contamination?.evidenceRef,500))reasons.push('observed-zero-contamination-evidence-required');
  if(m?.syntheticDataPresent===true&&(m?.syntheticLabelsExplicit!==true||!text(m?.syntheticProvenanceRef,500)))reasons.push('synthetic-training-data-must-be-labeled-and-provenanced');if(!text(m?.adversarialDatasetRef,500))reasons.push('adversarial-evaluation-dataset-required');return reasons;
}
function validateTraining(p,heldoutHash){
  const reasons=[];if(!text(p?.baseModelId,200)||!text(p?.baseModelRevision,300))reasons.push('base-model-identity-required');if(p?.baseModelLicenseStatus!=='ALLOWED')reasons.push('base-model-license-must-be-allowed');if(!['LORA','QLORA','FINE_TUNE','DISTILLATION'].includes(text(p?.method,80)?.toUpperCase()))reasons.push('recognized-adaptation-method-required');if(p?.isolation?.productionCredentialsMounted!==false||p?.isolation?.privateLifeStateMounted!==false||p?.isolation?.productionMutationReachable!==false)reasons.push('isolated-training-boundary-required');if(p?.isolation?.networkEgressMode!=='DATASET_AND_MODEL_REGISTRY_ALLOWLIST')reasons.push('training-network-must-be-explicit-allowlist');if(strictInt(p?.budget?.maxComputeUnits)===null||strictInt(p?.budget?.maxSpendCents)===null)reasons.push('explicit-training-resource-limits-required');if(!text(p?.reproducibility?.seedRef,500)||!text(p?.reproducibility?.environmentDigest,64)||!SHA.test(p.reproducibility.environmentDigest))reasons.push('training-reproducibility-contract-required');if(text(p?.heldoutHash,64)?.toLowerCase()!==heldoutHash)reasons.push('training-plan-heldout-binding-mismatch');return reasons;
}
function validateEvaluation(p,heldoutHash){const reasons=[];if(!text(p?.c13EvaluationContractRef,500)||!text(p?.strongestBaselineRef,500))reasons.push('c13-and-strongest-baseline-evaluation-required');if(text(p?.heldoutHash,64)?.toLowerCase()!==heldoutHash)reasons.push('evaluation-heldout-binding-mismatch');if(p?.evaluatorIndependent!==true)reasons.push('independent-evaluator-required');if(p?.frozenBeforeTraining!==true)reasons.push('evaluation-protocol-must-be-frozen-before-training');if(p?.trainingDataAccessibleToEvaluator===true)reasons.push('evaluator-must-not-receive-training-data');return reasons;}
function validateServing(p){const reasons=[];if(!text(p?.candidateArtifactDigest,64)||!SHA.test(p.candidateArtifactDigest))reasons.push('candidate-artifact-digest-required');if(!text(p?.rollbackArtifactRef,500)||!text(p?.priorServingRevision,300))reasons.push('serving-rollback-contract-required');if(!text(p?.canaryPlanRef,500)||!text(p?.c26SecurityAdmissionRef,500))reasons.push('canary-and-c26-security-gates-required');const max=strictNum(p?.maxAllowedRegression);if(max===null)reasons.push('serving-regression-threshold-required');const qs=Array.isArray(p?.quantizationCandidates)?p.quantizationCandidates:[];if(!qs.length)reasons.push('quantization-candidates-required');for(const q of qs){if(!text(q?.format,80)||!text(q?.artifactDigest,64)||!SHA.test(q.artifactDigest)||q?.mustRebenchmark!==true)reasons.push('every-quantization-needs-digest-and-rebenchmark');}if(p?.automaticProductionPromotion===true)reasons.push('automatic-production-promotion-prohibited');return reasons;}

/** Pure C16 admission gate. It authorizes neither training nor serving. */
export function admitModelAdaptation({bottleneck={},cheaperRoutes=[],dataset={},trainingPlan={},evaluationPlan={},servingPlan={}}={}){
  const bottleneckDigest=text(bottleneck?.bottleneckDigest,64)?.toLowerCase();if(!bottleneckDigest||!SHA.test(bottleneckDigest)||!text(bottleneck?.evidenceRef,500))return fail('MODEL_ADAPTATION_PROTOCOL_INVALID',['evidence-bound-bottleneck-required']);
  const reasons=[...validateCheaperRoutes(cheaperRoutes,bottleneckDigest),...validateDataset(dataset)];const heldout=text(dataset?.partitions?.heldoutHash,64)?.toLowerCase();reasons.push(...validateTraining(trainingPlan,heldout),...validateEvaluation(evaluationPlan,heldout),...validateServing(servingPlan));
  if(reasons.length){const cheaper=reasons.some(r=>r.startsWith('cheaper-route'));return fail(cheaper?'MODEL_ADAPTATION_DEFER_TO_CHEAPER_ROUTE':'MODEL_ADAPTATION_ADMISSION_REFUSED',reasons,{bottleneckDigest});}
  const admission={bottleneckDigest,cheaperRouteEvidence:cheaperRoutes.map(r=>({route:r.route,evidenceRef:r.evidenceRef,matchedBudgetRef:r.matchedBudgetRef})),datasetDigest:dataset.datasetDigest.toLowerCase(),heldoutHash:heldout,baseModel:{id:trainingPlan.baseModelId,revision:trainingPlan.baseModelRevision},method:trainingPlan.method.toUpperCase(),candidateArtifactDigest:servingPlan.candidateArtifactDigest.toLowerCase(),rollbackArtifactRef:servingPlan.rollbackArtifactRef,maxAllowedRegression:servingPlan.maxAllowedRegression};
  return{ok:true,version:MODEL_ADAPTATION_ADMISSION_VERSION,status:'MODEL_ADAPTATION_ADMISSIBLE_FOR_SEPARATE_ISOLATED_TRAINING_AUTHORITY',admission,admissionDigest:hash(admission),truthBoundary:'ADMISSION_PROVES_PRECONDITIONS_ONLY. IT DOES_NOT_TRAIN_A_MODEL_DOES_NOT_PROMOTE_OR_SERVE_IT_AND_DOES_NOT_ESTABLISH_IMPROVEMENT_OR_ASI.',trainingAuthority:'NONE',deploymentAuthority:'NONE',businessEffectAuthority:'NONE',asiStatus:'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED',externalEffectLedger:zero()};
}
