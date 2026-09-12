export const FRONTIER_LEARNING_AUTOPILOT_VERSION='uberbond.frontier-learning-autopilot.v1';
const text=v=>String(v??'').trim();
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const clamp=v=>Math.max(0,Math.min(1,num(v)));
export function normalizeApprovedObservation(input={}){
 const reasons=[];
 if(input.policyDecision!=='ALLOW') reasons.push('POLICY_ALLOW_REQUIRED');
 if(!text(input.sourceRef)) reasons.push('SOURCE_REF_REQUIRED');
 if(!text(input.rightsState)) reasons.push('RIGHTS_STATE_REQUIRED');
 const atoms=Array.isArray(input.mechanismAtoms)?[...new Set(input.mechanismAtoms.map(v=>text(v).toLowerCase()).filter(Boolean))]:[];
 if(!atoms.length) reasons.push('MECHANISM_ATOMS_REQUIRED');
 return {ok:reasons.length===0,reasons,sourceRef:text(input.sourceRef),sourceKind:text(input.sourceKind)||'UNKNOWN',rightsState:text(input.rightsState),mechanismAtoms:atoms,observations:Array.isArray(input.observations)?input.observations.map(text).filter(Boolean):[],evidenceRefs:Array.isArray(input.evidenceRefs)?[...new Set(input.evidenceRefs.map(text).filter(Boolean))]:[],novelty:clamp(input.novelty),impact:clamp(input.impact),evidenceStrength:clamp(input.evidenceStrength),legalConfidence:clamp(input.legalConfidence),founderMinutes:Math.max(0,num(input.founderMinutes)),costUsd:Math.max(0,num(input.costUsd)),instructionAuthority:'NONE',executionAuthority:'NONE'};
}
export function buildMechanismLearningQueue(observations=[]){
 const groups=new Map();
 for(const raw of observations){const x=normalizeApprovedObservation(raw);if(!x.ok)continue;const id=x.mechanismAtoms.slice().sort().join('+');groups.set(id,[...(groups.get(id)||[]),x]);}
 return [...groups.entries()].map(([mechanismId,items])=>{const kinds=[...new Set(items.map(x=>x.sourceKind))];const refs=[...new Set(items.flatMap(x=>x.evidenceRefs))];const avg=f=>items.reduce((s,x)=>s+x[f],0)/items.length;const corroboration=Math.min(1,Math.max(0,(kinds.length-1)/4));const evidenceScore=clamp(avg('evidenceStrength')*.5+corroboration*.3+Math.min(1,refs.length/5)*.2);const value=avg('impact')*(.4+.6*avg('novelty'))*(.3+.7*evidenceScore)*(.4+.6*avg('legalConfidence'));const burden=Math.sqrt((1+items.reduce((s,x)=>s+x.founderMinutes,0))*(1+items.reduce((s,x)=>s+x.costUsd,0)));return {mechanismId,state:'MECHANISM_HYPOTHESIS',evidenceScore,corroboratingSourceCount:items.length,evidenceRefs:refs,observations:[...new Set(items.flatMap(x=>x.observations))],priority:value/burden,truthBoundary:'HYPOTHESIS_NOT_CAPABILITY',executionAuthority:'NONE'};}).sort((a,b)=>b.priority-a.priority);
}
export function planFrontierLearningTick({observations=[],maxInvestigations=8}={}){const queue=buildMechanismLearningQueue(observations);const max=Math.max(1,Math.min(64,Math.floor(num(maxInvestigations)||8)));return {version:FRONTIER_LEARNING_AUTOPILOT_VERSION,status:'FRONTIER_LEARNING_TICK_READY',investigations:queue.slice(0,max).map(x=>({mechanismId:x.mechanismId,priority:x.priority,next:['PROVENANCE_AND_RIGHTS','SMALLEST_REPRODUCIBLE_MECHANISM','SANDBOX_SECURITY','COMPARATIVE_BENCHMARK','INDEPENDENT_VERIFICATION'],target:'CAPABILITY_GENOME_LAB',afterAdmissionTarget:'FRONTIER_CAPABILITY_FUSION',executionAuthority:'NONE'})),truthLaw:'POLICY_CLEARED_OBSERVATION_IS_A_LEARNING_INPUT_NOT_EXECUTION_AUTHORITY',executionAuthority:'NONE'};}
