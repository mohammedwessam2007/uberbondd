import crypto from 'node:crypto';
import { CANONICAL_ASI_DIMENSIONS } from './system-level-asi-evidence.mjs';

export const LITERAL_ASI_CLAIM_TRIBUNAL_VERSION='uberbond.literal-asi-claim-tribunal.v1';
const HEX64=/^[0-9a-f]{64}$/;const SHA40=/^[0-9a-f]{40}$/;
const FINAL_POPULATION_CLASSES=new Set(['EXTERNALLY_ADMINISTERED_HIDDEN','REAL_WORLD_OBSERVED']);
const HUMAN_CLASSES=new Set(['WORLD_CLASS_EXPERT','EXPERT_TEAM']);
const AI_CLASSES=new Set(['BEST_AVAILABLE_SINGLE_AI_MODEL','BEST_AVAILABLE_MULTI_MODEL_BASELINE']);
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const text=(v,n=500)=>{const s=String(v??'').trim();return s&&s.length<=n?s:null};
const interval=v=>{const low=Number(v?.low),high=Number(v?.high);return Number.isFinite(low)&&Number.isFinite(high)&&low<=high?{low,high}:null};
const fail=(reasons,extra={})=>({ok:false,version:LITERAL_ASI_CLAIM_TRIBUNAL_VERSION,status:'LITERAL_ASI_CLAIM_REFUSED',asiStatus:'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED',reasonCodes:[...new Set(reasons)],promotionAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',...extra});
function ref(raw,classes){const i=interval(raw?.scoreInterval),c=text(raw?.referenceClass,100),e=text(raw?.evidenceRef,500);return c&&classes.has(c)&&i&&e&&raw?.accessible===true&&raw?.observed===true&&raw?.strongestAccessibleVerifiedAtEvaluationTime===true?{referenceClass:c,scoreInterval:i,evidenceRef:e}:null}
export function evaluateLiteralAsiClaim({candidateId,candidateRevision,c21Evidence,comparisons=[],observedAt,minRobustMargin=0}={}){
 const id=text(candidateId,200),revision=text(candidateRevision,100),clock=Date.parse(observedAt||'');const reasons=[];
 if(!id||!SHA40.test(revision||''))reasons.push('exact-candidate-identity-required');if(!Number.isFinite(clock))reasons.push('valid-observation-time-required');
 if(c21Evidence?.candidateId!==id||c21Evidence?.candidateRevision!==revision||c21Evidence?.evidenceStage!=='SYSTEM_LEVEL_ASI_EVIDENCE_STRONG_WITHIN_DEFINED_SCOPE'||Number(c21Evidence?.counts?.evidencedDimensions)!==20||Number(c21Evidence?.counts?.missingDimensions)!==0||!HEX64.test(String(c21Evidence?.c21EvidenceDigest||c21Evidence?.evidenceDigest||'')))reasons.push('strong-authenticated-c21-20-of-20-required');
 if(!Array.isArray(comparisons)||comparisons.length!==20)reasons.push('exact-twenty-external-dimension-comparisons-required');
 const seenDimensions=new Set(),seenPopulations=new Set(),seenEvaluators=new Set(),rows=[];const margin=Number(minRobustMargin);
 if(!Number.isFinite(margin)||margin<0)reasons.push('valid-nonnegative-robust-margin-required');
 for(const raw of Array.isArray(comparisons)?comparisons:[]){const d=text(raw?.dimension,100)?.toLowerCase(),pop=text(raw?.taskPopulationHash,100),evalRef=text(raw?.independentEvaluatorRef,500),candidate=interval(raw?.candidateScoreInterval),human=ref(raw?.humanReference,HUMAN_CLASSES),ai=ref(raw?.aiReference,AI_CLASSES),composition=ref(raw?.humanAiReference,new Set(['BEST_AVAILABLE_HUMAN_AI_TOOL_COMPOSITION'])),local=[];
  if(!CANONICAL_ASI_DIMENSIONS.includes(d))local.push('canonical-dimension-required');if(seenDimensions.has(d))local.push('duplicate-dimension');seenDimensions.add(d);
  if(!HEX64.test(pop||''))local.push('sealed-task-population-required');if(seenPopulations.has(pop))local.push('task-population-reuse-refused');seenPopulations.add(pop);
  if(!evalRef||raw?.evaluatorIndependent!==true)local.push('independent-evaluator-required');if(seenEvaluators.has(evalRef))local.push('evaluator-record-reuse-refused');seenEvaluators.add(evalRef);
  if(!FINAL_POPULATION_CLASSES.has(raw?.populationClass)||raw?.synthetic===true||raw?.candidateExposedToPopulation===true) local.push('fresh-external-nonsynthetic-population-required');
  if(raw?.resourceParity!=='MATCHED'&&raw?.resourceParity!=='CANDIDATE_DISADVANTAGED')local.push('matched-or-candidate-disadvantaged-resources-required');
  if(!candidate||!human||!ai||!composition)local.push('observed-strongest-human-ai-and-human-ai-composition-references-required');
  const strongest=human&&ai&&composition?Math.max(human.scoreInterval.high,ai.scoreInterval.high,composition.scoreInterval.high):Infinity;const robust=Boolean(candidate&&candidate.low>=strongest+margin);if(!robust)local.push('candidate-not-robustly-above-strongest-external-reference');
  if(local.length)reasons.push(...local.map(x=>`${d||'UNKNOWN'}:${x}`));rows.push({dimension:d,taskPopulationHash:pop,independentEvaluatorRef:evalRef,candidateScoreInterval:candidate,strongestReferenceUpperBound:Number.isFinite(strongest)?strongest:null,robustSuperhuman:robust});
 }
 const complete=CANONICAL_ASI_DIMENSIONS.every(d=>seenDimensions.has(d));if(!complete)reasons.push('all-canonical-dimensions-require-external-superhuman-evidence');if(reasons.length)return fail(reasons,{counts:{required:20,received:rows.length,robustSuperhuman:rows.filter(r=>r.robustSuperhuman).length},dimensionEvidence:rows});
 const receipt={candidateId:id,candidateRevision:revision,c21EvidenceDigest:c21Evidence.c21EvidenceDigest||c21Evidence.evidenceDigest,observedAt:new Date(clock).toISOString(),minRobustMargin:margin,dimensionEvidence:rows};return{ok:true,version:LITERAL_ASI_CLAIM_TRIBUNAL_VERSION,status:'BROAD_SUPERHUMAN_SYSTEM_EVIDENCE_SUPPORTED',asiStatus:'OPERATIONAL_SYSTEM_LEVEL_ASI_EVIDENCE_SUPPORTED',receiptHash:hash(receipt),receipt,counts:{required:20,robustSuperhuman:20},truthBoundary:'ASI CLAIM IS OPERATIONAL AND EVIDENCE-BOUND: TWENTY FRESH EXTERNAL NONSYNTHETIC DIMENSIONS, EACH ROBUSTLY ABOVE VERIFIED STRONGEST ACCESSIBLE WORLD-CLASS HUMAN, AI, AND HUMAN-AI COMPOSITION REFERENCES.',promotionAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE'};
}
