import {eliteEligibility} from './elite-capability-reserve.mjs';
const n=v=>Number.isFinite(Number(v))?Number(v):0;
const s=v=>String(v??'').trim();
export const MISSION_BRAIN_COMPILER_VERSION='uberbond.mission-brain-compiler.v1';

export function compileMissionBrain({mission,candidates=[],maxCapabilities=16,maxRuntimeCostUsd=Infinity}={}){
 if(!s(mission)) throw new Error('mission required');
 const eligible=candidates.filter(c=>eliteEligibility(c).eligible&&n(c.runtimeCostUsd)<=maxRuntimeCostUsd);
 const selected=[];
 for(const candidate of eligible.sort((a,b)=>(n(b.missionFit)*n(b.incrementalUtility))/(1+n(b.runtimeCostUsd))-(n(a.missionFit)*n(a.incrementalUtility))/(1+n(a.runtimeCostUsd)))){
  const conflicts=new Set([...(candidate.conflicts||[])]);
  if(selected.some(x=>conflicts.has(x.mechanismId)||(x.conflicts||[]).includes(candidate.mechanismId))) continue;
  selected.push(candidate);
  if(selected.length>=Math.max(1,Math.floor(maxCapabilities))) break;
 }
 return {version:MISSION_BRAIN_COMPILER_VERSION,mission,selected,selectedCount:selected.length,law:'MINIMUM_SUFFICIENT_COMPATIBLE_PROVEN_BUNDLE'};
}
