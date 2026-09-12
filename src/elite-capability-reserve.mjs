export const ELITE_CAPABILITY_RESERVE_VERSION='uberbond.elite-capability-reserve.v1';
export const ELITE_CAPABILITY_RESERVE_TARGET=1_000_000;
const n=v=>Number.isFinite(Number(v))?Number(v):0;
const s=v=>String(v??'').trim();

export function eliteEligibility(candidate={}){
 const reasons=[];
 if(!s(candidate.mechanismId)) reasons.push('MECHANISM_ID');
 if(!s(candidate.provenanceDigest)) reasons.push('PROVENANCE');
 if(!s(candidate.benchmarkReceipt)) reasons.push('BENCHMARK');
 if(!(n(candidate.incrementalUtility)>0)) reasons.push('UTILITY');
 if(!Array.isArray(candidate.inputContract)||candidate.inputContract.length===0) reasons.push('INPUT_CONTRACT');
 if(!Array.isArray(candidate.outputContract)||candidate.outputContract.length===0) reasons.push('OUTPUT_CONTRACT');
 return {eligible:reasons.length===0,reasons};
}

export function buildEliteReserve(candidates=[]){
 const byMechanism=new Map();
 for(const candidate of candidates){
  const eligibility=eliteEligibility(candidate);
  if(!eligibility.eligible) continue;
  const key=s(candidate.mechanismId).toLowerCase();
  const current=byMechanism.get(key);
  if(!current||n(candidate.incrementalUtility)>n(current.incrementalUtility)) byMechanism.set(key,{...candidate,eligibility});
 }
 const elite=[...byMechanism.values()].sort((a,b)=>n(b.incrementalUtility)-n(a.incrementalUtility)).slice(0,ELITE_CAPABILITY_RESERVE_TARGET);
 return {version:ELITE_CAPABILITY_RESERVE_VERSION,target:ELITE_CAPABILITY_RESERVE_TARGET,distinctMechanisms:elite.length,targetSatisfied:elite.length>=ELITE_CAPABILITY_RESERVE_TARGET,elite,antiInflationLaw:'COUNT_DISTINCT_EVALUABLE_MECHANISMS_NOT_FORKS_WRAPPERS_OR_VERSIONS'};
}
