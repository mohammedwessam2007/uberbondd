import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { UBER_SOVEREIGN_LAYERS, compileUberSovereignStack } from './uber-sovereign-stack.mjs';

export const UBER_ORCHESTRATION_CONTROL_PLANE_VERSION='uberbond.uber-orchestration-control-plane.v1';
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const text=(value,max=2000)=>{const out=String(value??'').trim();return out&&out.length<=max?out:null;};
const boundedInt=(value,min,max)=>Number.isSafeInteger(Number(value))&&Number(value)>=min&&Number(value)<=max?Number(value):null;

export const UBER_ORCHESTRATION_DEPENDENCIES=Object.freeze({
  UBERIDENTITY:[],UBERVAULT:['UBERIDENTITY'],UBERSOURCE:['UBERIDENTITY','UBERVAULT'],UBERSTATE:['UBERIDENTITY','UBERVAULT'],UBERMESH:['UBERIDENTITY'],UBEROBSERVE:['UBERIDENTITY','UBERVAULT'],UBERQUEUE:['UBERIDENTITY','UBERSTATE'],UBERFORGE:['UBERSOURCE','UBERIDENTITY'],UBERCLOUD:['UBERMESH','UBERSTATE','UBERIDENTITY'],UBERCEL:['UBERFORGE','UBERCLOUD','UBERMESH','UBERSTATE'],UBERRUNTIME:['UBERCEL','UBERSTATE','UBERQUEUE','UBEROBSERVE','UBERIDENTITY'],UBERCONTROL:['UBERIDENTITY','UBERVAULT','UBEROBSERVE'],UBERGRAPH:['UBERSTATE','UBERVAULT'],UBERMEMORY:['UBERGRAPH','UBERVAULT','UBERSTATE'],UBERMODELS:['UBERIDENTITY','UBEROBSERVE'],UBERMIND:['UBERMODELS','UBERMEMORY','UBERGRAPH'],UBERSKILLS:['UBERIDENTITY','UBEROBSERVE'],UBERBROWSER:['UBERIDENTITY','UBERSKILLS','UBEROBSERVE'],UBERAGENTS:['UBERMIND','UBERSKILLS','UBERQUEUE','UBERCONTROL','UBEROBSERVE'],UBERRESEARCH:['UBERBROWSER','UBERGRAPH','UBERSKILLS','UBEROBSERVE'],UBERGENESIS:['UBERRESEARCH','UBERMIND','UBERGRAPH'],UBERDNA:['UBERSOURCE','UBERFORGE','UBEROBSERVE'],UBERORCHESTRATION:['UBERCONTROL','UBERAGENTS','UBERQUEUE','UBEROBSERVE','UBERMIND'],UBERECONOMY:['UBERGRAPH','UBEROBSERVE','UBERCONTROL'],UBERPAY:['UBERIDENTITY','UBERSTATE','UBEROBSERVE','UBERCONTROL'],UBERMAIL:['UBERIDENTITY','UBERSKILLS','UBEROBSERVE','UBERCONTROL'],UBERDELIVERY:['UBERSTATE','UBERCONTROL','UBEROBSERVE'],UBERDISTRIBUTION:['UBERMAIL','UBERECONOMY','UBERCONTROL','UBEROBSERVE']
});

export const UBER_ORCHESTRATION_PHASES=Object.freeze([
  {id:'SOVEREIGN_FOUNDATION',layers:['UBERIDENTITY','UBERVAULT','UBERSOURCE','UBERSTATE','UBERMESH']},
  {id:'EXECUTION_SUBSTRATE',layers:['UBEROBSERVE','UBERQUEUE','UBERFORGE','UBERCLOUD','UBERCEL','UBERRUNTIME','UBERCONTROL']},
  {id:'COGNITIVE_CIVILIZATION',layers:['UBERGRAPH','UBERMEMORY','UBERMODELS','UBERMIND','UBERSKILLS','UBERBROWSER','UBERAGENTS','UBERRESEARCH','UBERGENESIS','UBERDNA','UBERORCHESTRATION']},
  {id:'REALITY_AND_ECONOMY',layers:['UBERECONOMY','UBERPAY','UBERMAIL','UBERDELIVERY','UBERDISTRIBUTION']}
]);

function dependencyIntegrity(){
  const registryIds=UBER_SOVEREIGN_LAYERS.map(layer=>layer.id);const graphIds=Object.keys(UBER_ORCHESTRATION_DEPENDENCIES);const phaseIds=UBER_ORCHESTRATION_PHASES.flatMap(phase=>phase.layers);
  const unknownDependencies=[...new Set(graphIds.flatMap(id=>(UBER_ORCHESTRATION_DEPENDENCIES[id]||[]).filter(dep=>!registryIds.includes(dep))))];
  const missingFromGraph=registryIds.filter(id=>!graphIds.includes(id));const graphNotRegistry=graphIds.filter(id=>!registryIds.includes(id));const missingFromPhases=registryIds.filter(id=>!phaseIds.includes(id));const phaseNotRegistry=phaseIds.filter(id=>!registryIds.includes(id));const duplicatePhaseLayers=phaseIds.filter((id,index)=>phaseIds.indexOf(id)!==index);
  return {ok:missingFromGraph.length===0&&graphNotRegistry.length===0&&missingFromPhases.length===0&&phaseNotRegistry.length===0&&duplicatePhaseLayers.length===0&&unknownDependencies.length===0,registryIds,graphIds,phaseIds,missingFromGraph,graphNotRegistry,missingFromPhases,phaseNotRegistry,duplicatePhaseLayers:[...new Set(duplicatePhaseLayers)],unknownDependencies};
}

function topologicalOrder(integrity){
  if(!integrity.ok)return {ok:false,order:[],waves:[],reasonCodes:['orchestration-registry-integrity-required']};
  const ids=integrity.registryIds,indegree=new Map(ids.map(id=>[id,0])),children=new Map(ids.map(id=>[id,[]]));
  for(const id of ids)for(const dep of UBER_ORCHESTRATION_DEPENDENCIES[id]){indegree.set(id,(indegree.get(id)||0)+1);children.get(dep).push(id);}
  const queue=ids.filter(id=>indegree.get(id)===0).sort(),order=[],depth=new Map(ids.map(id=>[id,0]));
  while(queue.length){const id=queue.shift();order.push(id);for(const child of children.get(id).sort()){depth.set(child,Math.max(depth.get(child)||0,(depth.get(id)||0)+1));indegree.set(child,indegree.get(child)-1);if(indegree.get(child)===0){queue.push(child);queue.sort();}}}
  if(order.length!==ids.length)return {ok:false,order,waves:[],reasonCodes:['orchestration-dependency-cycle-detected']};
  const maxDepth=Math.max(...[...depth.values()],0),waves=Array.from({length:maxDepth+1},(_,index)=>({wave:index,layers:order.filter(id=>depth.get(id)===index)}));
  return {ok:true,order,waves,depth:Object.fromEntries(depth),reasonCodes:[]};
}

function readyFor(row,target){if(target==='SOURCE')return row.sourceReady===true;if(target==='INDEPENDENCE')return row.independenceReady===true;return row.runtimeReady===true;}
function targetReasonCodes(row,target){if(target==='SOURCE')return row.reasonCodes.filter(code=>['source-verification-required','test-evidence-required','evidence-ref-required'].includes(code));if(target==='INDEPENDENCE')return row.reasonCodes.filter(code=>code!=='runtime-observation-required');return [...row.reasonCodes];}

export function compileUberOrchestrationPlan({target='SOURCE',layerEvidence={},mission={}}={}){
  const normalizedTarget=String(target||'').trim().toUpperCase();
  if(!['SOURCE','INDEPENDENCE','RUNTIME'].includes(normalizedTarget))return {ok:false,status:'UBER_ORCHESTRATION_PLAN_BLOCKED',reasonCodes:['recognized-orchestration-target-required'],executionAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()};
  const missionId=text(mission.missionId,240)||'uber-orchestration',objective=text(mission.objective,4000)||'Advance the Uber sovereign stack through the highest dependency-satisfied evidence gap without widening authority.';
  const maxParallel=boundedInt(mission.maxParallel??4,1,32),founderMinutesBudget=boundedInt(mission.founderMinutesBudget??0,0,1000000),spendCentsBudget=boundedInt(mission.spendCentsBudget??0,0,1000000000);
  if(maxParallel==null||founderMinutesBudget==null||spendCentsBudget==null)return {ok:false,status:'UBER_ORCHESTRATION_PLAN_BLOCKED',reasonCodes:['bounded-mission-budgets-required'],executionAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()};
  const integrity=dependencyIntegrity(),topology=topologicalOrder(integrity);
  if(!integrity.ok||!topology.ok)return {ok:false,status:'UBER_ORCHESTRATION_PLAN_BLOCKED',reasonCodes:[...new Set([...(topology.reasonCodes||[]),'complete-canonical-layer-accounting-required'])],integrity,executionAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()};
  const stack=compileUberSovereignStack({layerEvidence}),rows=new Map(stack.layers.map(row=>[row.id,row])),states={};
  for(const id of topology.order){const row=rows.get(id),dependencies=UBER_ORCHESTRATION_DEPENDENCIES[id],dependencyBlockers=dependencies.filter(dep=>states[dep]?.ready!==true),selfReady=readyFor(row,normalizedTarget),ready=selfReady&&dependencyBlockers.length===0;states[id]={id,target:normalizedTarget,ready,selfReady,dependencyBlockers,reasonCodes:selfReady?[]:targetReasonCodes(row,normalizedTarget),sourceReady:row.sourceReady,independenceReady:row.independenceReady,runtimeReady:row.runtimeReady};}
  const waves=topology.waves.map(wave=>{const eligible=wave.layers.filter(id=>states[id].ready),blocked=wave.layers.filter(id=>!states[id].ready).map(id=>states[id]);return {...wave,eligible:eligible.slice(0,maxParallel),deferredEligible:eligible.slice(maxParallel),blocked};});
  const blockers=topology.order.filter(id=>!states[id].ready).map(id=>states[id]);
  const nextActions=blockers.filter(item=>item.dependencyBlockers.length===0).slice(0,maxParallel).map(item=>({layerId:item.id,target:normalizedTarget,reasonCodes:item.reasonCodes,action:'ACQUIRE_OR_VERIFY_MISSING_EVIDENCE_ONLY',effectAuthority:'NONE'}));
  const allReady=blockers.length===0,status=allReady?`UBER_ORCHESTRATION_${normalizedTarget}_READY`:'UBER_ORCHESTRATION_PLAN_READY_WITH_BLOCKERS';
  const phaseReports=UBER_ORCHESTRATION_PHASES.map(phase=>({id:phase.id,layers:phase.layers,ready:phase.layers.every(id=>states[id].ready),blockers:phase.layers.filter(id=>!states[id].ready)}));
  return {ok:true,status,version:UBER_ORCHESTRATION_CONTROL_PLANE_VERSION,mission:{missionId,objective,target:normalizedTarget,maxParallel,founderMinutesBudget,spendCentsBudget},stackStatus:stack.status,counts:{layers:topology.order.length,ready:topology.order.filter(id=>states[id].ready).length,blocked:blockers.length,phases:phaseReports.length},order:topology.order,waves,phases:phaseReports,layerStates:states,blockers,nextActions,executionAuthority:'NONE',promotionAuthority:'NONE',providerAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero(),orchestrationLaw:'PARALLEL_COGNITION_SERIAL_AUTHORITY; A PLAN MAY SELECT DEPENDENCY_SATISFIED WORK BUT MAY NOT CREATE EXTERNAL AUTHORITY',sovereigntyLaw:stack.sovereigntyLaw,truthBoundary:'ORCHESTRATION READINESS IS EVIDENCE-CLASS SPECIFIC. SOURCE READINESS IS NOT INDEPENDENCE; INDEPENDENCE IS NOT LIVE RUNTIME; LIVE RUNTIME IS NOT EXTERNAL OUTCOME PROOF.'};
}

export function inspectUberOrchestrationIntegrity(){const integrity=dependencyIntegrity(),topology=topologicalOrder(integrity);return {ok:integrity.ok&&topology.ok,status:integrity.ok&&topology.ok?'UBER_ORCHESTRATION_GRAPH_INTACT':'UBER_ORCHESTRATION_GRAPH_INVALID',integrity,topology,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()};}
