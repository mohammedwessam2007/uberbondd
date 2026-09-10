export const SUBSTRATE_LIBERATION_VERSION = 'uberbond.substrate-liberation-1.0.0';

export const SUBSTRATE_CLASSES = Object.freeze([
  'DIGITAL_SILICON', 'NEUROMORPHIC', 'PHOTONIC', 'ANALOG', 'QUANTUM',
  'MOLECULAR', 'BIOHYBRID', 'DISTRIBUTED_AMBIENT', 'OTHER', 'UNKNOWN'
]);
export const SUBSTRATE_EVIDENCE_STATES = Object.freeze([
  'HYPOTHESIS', 'LAB_DEMONSTRATED', 'BENCHMARKED', 'DEPLOYABLE', 'OBSERVED_IN_UBERBOND'
]);

const fail=(status,reasonCodes,extra={})=>({ok:false,status,reasonCodes:[...new Set(reasonCodes.filter(Boolean))],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',...extra});
const text=(v,m=1000)=>{const out=String(v??'').trim();return out&&out.length<=m?out:null};
const num=(v,min,max)=>{const n=Number(v);return Number.isFinite(n)&&n>=min&&n<=max?n:null};
const bool=v=>typeof v==='boolean'?v:null;
const list=(v,max=128,itemMax=1000)=>{if(!Array.isArray(v)||v.length>max)return null;const o=[],s=new Set();for(const raw of v){const x=text(raw,itemMax);if(!x)return null;const k=x.toLowerCase();if(!s.has(k)){s.add(k);o.push(x)}}return o};
const zero=extra=>({businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',...extra});

export function definePhysicalFunction(input={}){
  const id=text(input.id,200)?.toLowerCase();
  const transformation=text(input.transformation,2000);
  const inputs=list(input.inputs||[],64,300);
  const outputs=list(input.outputs||[],64,300);
  const maxLatencyMs=num(input.maxLatencyMs,0,1e12);
  const maxEnergyJoules=num(input.maxEnergyJoules,0,1e15);
  const minReliability=num(input.minReliability,0,1);
  const portabilityRequired=bool(input.portabilityRequired??false);
  const environmentConstraints=list(input.environmentConstraints||[],128,500);
  const reasonCodes=[];
  if(!id)reasonCodes.push('function-id-required');
  if(!transformation)reasonCodes.push('transformation-required');
  if(!inputs||!outputs)reasonCodes.push('bounded-input-output-lists-required');
  if(maxLatencyMs===null)reasonCodes.push('valid-max-latency-required');
  if(maxEnergyJoules===null)reasonCodes.push('valid-max-energy-required');
  if(minReliability===null)reasonCodes.push('min-reliability-0-to-1-required');
  if(portabilityRequired===null)reasonCodes.push('portability-boolean-required');
  if(!environmentConstraints)reasonCodes.push('bounded-environment-constraints-required');
  if(reasonCodes.length)return fail('PHYSICAL_FUNCTION_INVALID',reasonCodes);
  return zero({ok:true,status:'PHYSICAL_FUNCTION_DEFINED',function:{id,transformation,inputs,outputs,maxLatencyMs,maxEnergyJoules,minReliability,portabilityRequired,environmentConstraints},law:'DEFINE_THE_REQUIRED_TRANSFORMATION_BEFORE_CHOOSING_THE_HARDWARE'});
}

export function evaluateSubstrateCandidate({physicalFunction=null,candidate=null}={}){
  if(!physicalFunction?.ok||physicalFunction.status!=='PHYSICAL_FUNCTION_DEFINED')return fail('SUBSTRATE_CANDIDATE_INVALID',['defined-physical-function-required']);
  const c=candidate||{};
  const id=text(c.id,200)?.toLowerCase();
  const name=text(c.name,500);
  const substrateClass=text(c.substrateClass,80);
  const evidenceState=text(c.evidenceState,80);
  const evidenceRefs=list(c.evidenceRefs||[],128,2000);
  const estimatedLatencyMs=num(c.estimatedLatencyMs,0,1e12);
  const estimatedEnergyJoules=num(c.estimatedEnergyJoules,0,1e15);
  const estimatedReliability=num(c.estimatedReliability,0,1);
  const portability=num(c.portability,0,1);
  const compatibility=num(c.compatibility,0,1);
  const maturity=num(c.maturity,0,1);
  const reversibility=num(c.reversibility,0,1);
  const reasonCodes=[];
  if(!id||!name)reasonCodes.push('candidate-id-and-name-required');
  if(!SUBSTRATE_CLASSES.includes(substrateClass))reasonCodes.push('known-substrate-class-required');
  if(!SUBSTRATE_EVIDENCE_STATES.includes(evidenceState))reasonCodes.push('known-evidence-state-required');
  if(!evidenceRefs)reasonCodes.push('bounded-evidence-refs-required');
  if(evidenceState!=='HYPOTHESIS'&&evidenceRefs?.length===0)reasonCodes.push('non-hypothesis-candidate-requires-evidence');
  if([estimatedLatencyMs,estimatedEnergyJoules,estimatedReliability,portability,compatibility,maturity,reversibility].some(x=>x===null))reasonCodes.push('valid-candidate-metrics-required');
  if(reasonCodes.length)return fail('SUBSTRATE_CANDIDATE_INVALID',reasonCodes);
  const fn=physicalFunction.function;
  const fits={
    latency:estimatedLatencyMs<=fn.maxLatencyMs,
    energy:estimatedEnergyJoules<=fn.maxEnergyJoules,
    reliability:estimatedReliability>=fn.minReliability,
    portability:!fn.portabilityRequired||portability>=0.5
  };
  const hardFit=Object.values(fits).every(Boolean);
  const evidenceMultiplier={HYPOTHESIS:0.25,LAB_DEMONSTRATED:0.45,BENCHMARKED:0.7,DEPLOYABLE:0.9,OBSERVED_IN_UBERBOND:1}[evidenceState];
  const latencyHeadroom=fn.maxLatencyMs===0?(estimatedLatencyMs===0?1:0):Math.max(0,Math.min(1,1-estimatedLatencyMs/fn.maxLatencyMs));
  const energyHeadroom=fn.maxEnergyJoules===0?(estimatedEnergyJoules===0?1:0):Math.max(0,Math.min(1,1-estimatedEnergyJoules/fn.maxEnergyJoules));
  const score=(latencyHeadroom*0.14+energyHeadroom*0.18+estimatedReliability*0.18+portability*0.1+compatibility*0.12+maturity*0.12+reversibility*0.08+evidenceMultiplier*0.08)*(hardFit?1:0.15);
  return zero({ok:true,status:hardFit?'SUBSTRATE_CANDIDATE_FITS_REQUIREMENTS':'SUBSTRATE_CANDIDATE_DOES_NOT_FIT_REQUIREMENTS',candidate:{id,name,substrateClass,evidenceState,evidenceRefs,estimatedLatencyMs,estimatedEnergyJoules,estimatedReliability,portability,compatibility,maturity,reversibility},fits,hardFit,substrateFitnessScore:Number(score.toFixed(6)),claimBoundary:'ESTIMATED_METRICS_AND_SCORE_ARE_COMPARATIVE_INPUTS_NOT_PHYSICAL_PROOF'});
}

export function buildSubstrateTournament({physicalFunction=null,candidates=[]}={}){
  if(!physicalFunction?.ok)return fail('SUBSTRATE_TOURNAMENT_INVALID',['defined-physical-function-required']);
  if(!Array.isArray(candidates)||candidates.length<1||candidates.length>256)return fail('SUBSTRATE_TOURNAMENT_INVALID',['1-to-256-candidates-required']);
  const evaluated=candidates.map(candidate=>evaluateSubstrateCandidate({physicalFunction,candidate}));
  if(evaluated.some(row=>!row.ok))return fail('SUBSTRATE_TOURNAMENT_INVALID',['one-or-more-candidates-invalid'],{invalid:evaluated.filter(row=>!row.ok).map(row=>row.reasonCodes)});
  const ranked=evaluated.sort((a,b)=>b.substrateFitnessScore-a.substrateFitnessScore||a.candidate.id.localeCompare(b.candidate.id));
  const fitting=ranked.filter(row=>row.hardFit);
  const classes=new Set(ranked.map(row=>row.candidate.substrateClass));
  return zero({ok:true,status:fitting.length?'SUBSTRATE_TOURNAMENT_READY':'NO_SUBSTRATE_CURRENTLY_FITS',physicalFunction:physicalFunction.function,rankedCandidates:ranked,representedClasses:[...classes].sort(),winner:fitting[0]||null,diversityWarning:classes.size<2?'SUBSTRATE_MONOCULTURE__SEARCH_AT_LEAST_ONE_DIFFERENT_PHYSICAL_PARADIGM':null,nextQuestion:fitting.length?'WHAT_EVIDENCE_WOULD_CAUSE_A_DIFFERENT_SUBSTRATE_TO_WIN':'SHOULD_THE_FUNCTION_REQUIREMENTS_CHANGE_OR_MUST_UBERBOND_INVENT_OR_DISCOVER_A_NEW_SUBSTRATE',selectionBoundary:'TOURNAMENT_PRIORITY_IS_NOT_PERMISSION_TO_BUILD_BUY_DEPLOY_OR_PHYSICALLY_TEST'});
}

export function buildSubstrateMigrationPlan({currentCandidate=null,targetCandidate=null,checkpoints=[]}={}){
  if(!currentCandidate?.ok||!targetCandidate?.ok)return fail('SUBSTRATE_MIGRATION_INVALID',['evaluated-current-and-target-required']);
  const steps=list(checkpoints,128,1000);
  if(!steps||steps.length<1)return fail('SUBSTRATE_MIGRATION_INVALID',['one-or-more-reversible-checkpoints-required']);
  return zero({ok:true,status:'SUBSTRATE_MIGRATION_PLAN_READY',from:currentCandidate.candidate.id,to:targetCandidate.candidate.id,checkpoints:steps,rollbackRequired:true,parallelValidationRequired:true,identityLaw:'UBERBOND_IDENTITY_MEMORY_PROVENANCE_AND_FOUNDER_RELATION_MUST_SURVIVE_SUBSTRATE_REPLACEMENT',authorityBoundary:'MIGRATION_PLAN_IS_INTERNAL_ONLY__PHYSICAL_PURCHASE_FABRICATION_DEPLOYMENT_OR_BODILY_INTEGRATION_REQUIRES_SEPARATE_AUTHORITY_AND_EVIDENCE'});
}
