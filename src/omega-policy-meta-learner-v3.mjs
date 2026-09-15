import { ZERO_EFFECTS, digest, normalizeProblem, solveProblem } from './omega-private-lab-core.mjs';
import { trainPolicyMetaCrystal as trainV2, extractStructuralFeatures } from './omega-policy-meta-learner.mjs';

export const OMEGA_POLICY_META_LEARNER_V3_VERSION='uberbond.omega-policy-meta-learner.v3.1';
const envelope=extra=>({businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:{...ZERO_EFFECTS},...extra});
const fail=(...r)=>envelope({ok:false,status:'OMEGA_POLICY_META_V3_REFUSED',version:OMEGA_POLICY_META_LEARNER_V3_VERSION,reasonCodes:[...new Set(r.flat().filter(Boolean))]});
const work=r=>Number(r?.metrics?.totalWork??Number.POSITIVE_INFINITY);
const TYPE_KEYS=['type_neq','type_eq','type_lt','type_sumEq','type_allDifferent'];

function vector(features,keys,scales){ return keys.map(k=>(features[k]??0)/(scales[k]||1)); }
function distance(a,b){ let s=0; for(let i=0;i<a.length;i++) s+=(a[i]-b[i])**2; return Math.sqrt(s); }
function nearestDistance(features,examples,keys,scales,skip=-1){
  const v=vector(features,keys,scales); let best=Number.POSITIVE_INFINITY;
  for(let i=0;i<examples.length;i++){ if(i===skip) continue; best=Math.min(best,distance(v,vector(examples[i].features,keys,scales))); }
  return best;
}
function supportEnvelope(examples,keys){ const out={}; for(const key of keys){ const values=examples.map(e=>Number(e.features[key]??0)); out[key]={min:Math.min(...values),max:Math.max(...values)}; } return out; }

export function trainCalibratedMetaCrystal({sourceTasks=[],policyBudget=5000,distanceMultiplier=1.5}={}){
  if(!Number.isFinite(distanceMultiplier)||distanceMultiplier<1||distanceMultiplier>10) return fail('valid-distance-multiplier-required');
  const base=trainV2({sourceTasks,policyBudget}); if(!base.ok) return base;
  const examples=base.crystal.examples,keys=base.crystal.featureKeys,scales=base.crystal.scales;
  const loo=examples.map((e,i)=>nearestDistance(e.features,examples,keys,scales,i)); const finite=loo.filter(Number.isFinite).sort((a,b)=>a-b); if(!finite.length)return fail('calibration-distances-required');
  const maxLoo=finite.at(-1),p95=finite[Math.min(finite.length-1,Math.floor(0.95*(finite.length-1)))],threshold=Math.max(maxLoo,p95)*distanceMultiplier;
  const core={baseCrystalHash:base.crystal.crystalHash,featureKeys:keys,scales,examples,sourceDomains:base.crystal.sourceDomains,k:base.crystal.k,policyBudget,calibration:{distanceMultiplier,maxLeaveOneOutDistance:maxLoo,p95LeaveOneOutDistance:p95,oodDistanceThreshold:threshold,supportEnvelope:supportEnvelope(examples,keys),typeKeys:TYPE_KEYS,minSupportingNeighbors:2,minPredictedSavingsFraction:0}};
  return envelope({ok:true,status:'OMEGA_CALIBRATED_META_CRYSTAL_TRAINED',version:OMEGA_POLICY_META_LEARNER_V3_VERSION,crystal:{...core,crystalHash:digest(core),containsAnswers:false,containsTargetTasks:false,promotionAuthority:'NONE'},training:{...base.training,calibrationDistances:loo},truthBoundary:'Calibration, benefit evidence and distance thresholds are derived only from charged source runs. Abstention reduces unsupported transfer risk but cannot prove every accepted transfer will improve.'});
}

function supportViolations(features,calibration){
  const violations=[],env=calibration.supportEnvelope;
  for(const key of calibration.typeKeys){const value=Number(features[key]??0),range=env[key];if(range?.max===0&&value>0)violations.push(`unseen-constraint-type:${key.slice(5)}`);}
  for(const [key,range] of Object.entries(env)){const value=Number(features[key]??0),rawSpan=range.max-range.min,margin=rawSpan===0?Math.max(0.05,Math.abs(range.max)*0.25):rawSpan*0.5;if(value<range.min-margin||value>range.max+margin)violations.push(`outside-support:${key}`);}
  return [...new Set(violations)];
}
function abstentionReceipt({features,d,crystal,violations,reason,extra={}}){
  const core={targetFeatureHash:digest(features),nearestDistance:d,threshold:crystal.calibration.oodDistanceThreshold,violations,reason,...extra};
  return envelope({ok:true,status:'OMEGA_META_POLICY_ABSTAINED',version:OMEGA_POLICY_META_LEARNER_V3_VERSION,abstained:true,selectedPolicy:'INPUT_ORDER',confidence:'ABSTAIN_FALLBACK',ood:{...core,oodHash:digest(core)},truthBoundary:'INPUT_ORDER is used only as a refusal fallback. It is not credited as transferred intelligence.'});
}

export function selectCalibratedPolicy({crystal,targetTask}={}){
  if(!crystal?.crystalHash||!crystal.calibration||!Array.isArray(crystal.examples))return fail('calibrated-crystal-required');
  const task=normalizeProblem(targetTask);if(!task)return fail('valid-target-task-required');
  const features=extractStructuralFeatures(task),d=nearestDistance(features,crystal.examples,crystal.featureKeys,crystal.scales),violations=supportViolations(features,crystal.calibration),distanceOod=!Number.isFinite(d)||d>crystal.calibration.oodDistanceThreshold;
  if(distanceOod||violations.length)return abstentionReceipt({features,d,crystal,violations,reason:distanceOod?'OUTSIDE_CALIBRATED_DISTANCE':'OUTSIDE_SOURCE_SUPPORT'});
  const v=vector(features,crystal.featureKeys,crystal.scales);
  const neighbors=crystal.examples.map((e,i)=>({i,policy:e.bestPolicy,distance:distance(v,vector(e.features,crystal.featureKeys,crystal.scales)),observedSavings:Number(e.observedSavings??0),observedSavingsFraction:Number(e.observedSavingsFraction??0)})).sort((a,b)=>a.distance-b.distance||a.i-b.i).slice(0,Math.max(1,Math.min(crystal.k??3,crystal.examples.length)));
  const votes=new Map();for(const n of neighbors){const weight=1/(1e-9+n.distance);votes.set(n.policy,(votes.get(n.policy)||0)+weight);}const selected=[...votes.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0][0];
  const support=neighbors.filter(n=>n.policy===selected),supportWeight=support.reduce((s,n)=>s+1/(1e-9+n.distance),0),predictedSavingsFraction=supportWeight>0?support.reduce((s,n)=>s+(1/(1e-9+n.distance))*n.observedSavingsFraction,0)/supportWeight:Number.NEGATIVE_INFINITY;
  const benefitWeak=support.length<crystal.calibration.minSupportingNeighbors||!(predictedSavingsFraction>crystal.calibration.minPredictedSavingsFraction)||support.some(n=>n.observedSavings<=0);
  if(benefitWeak)return abstentionReceipt({features,d,crystal,violations:[],reason:'INSUFFICIENT_SOURCE_ADVANTAGE',extra:{selectedCandidatePolicy:selected,supportingNeighbors:support.length,predictedSavingsFraction}});
  const core={targetFeatureHash:digest(features),nearestDistance:d,threshold:crystal.calibration.oodDistanceThreshold,selectedPolicy:selected,neighborPolicies:neighbors.map(n=>n.policy),supportingNeighbors:support.length,predictedSavingsFraction};
  return envelope({ok:true,status:'OMEGA_META_POLICY_TRANSFER_SELECTED',version:OMEGA_POLICY_META_LEARNER_V3_VERSION,abstained:false,selectedPolicy:selected,confidence:'IN_SUPPORT_WITH_SOURCE_ADVANTAGE',adapter:{...core,adapterHash:digest(core),answerFree:true,usesTargetPortfolioRuns:false,usesIdentifiers:false},neighbors});
}

export function evaluateCalibratedTransfer({crystal,targetTasks=[]}={}){
  if(!crystal?.crystalHash)return fail('calibrated-crystal-required');if(!Array.isArray(targetTasks)||!targetTasks.length||targetTasks.length>512)return fail('target-tasks-required');
  const rows=[];let coldWork=0,executionWork=0,abstentions=0,transfers=0;
  for(const raw of targetTasks){const task=normalizeProblem(raw);if(!task)return fail('invalid-target-task');const choice=selectCalibratedPolicy({crystal,targetTask:task});if(!choice.ok)return choice;const cold=solveProblem({problem:task,policy:'INPUT_ORDER'}),run=choice.abstained?cold:solveProblem({problem:task,policy:choice.selectedPolicy});if(!cold.ok||!run.ok||!cold.verifier?.valid||!run.verifier?.valid)return fail('target-solve-failed');const cw=work(cold),tw=work(run);coldWork+=cw;executionWork+=tw;if(choice.abstained)abstentions++;else transfers++;rows.push({taskHash:digest(task),domain:task.domain,selectedPolicy:choice.selectedPolicy,abstained:choice.abstained,confidence:choice.confidence,coldWork:cw,executionWork:tw,reduction:cw-tw,ood:choice.ood??null});}
  return envelope({ok:true,status:'OMEGA_CALIBRATED_TRANSFER_EVALUATED',version:OMEGA_POLICY_META_LEARNER_V3_VERSION,receipt:{targetCount:rows.length,coldWork,executionWork,reduction:coldWork-executionWork,reductionFraction:coldWork?(coldWork-executionWork)/coldWork:0,abstentions,transfers,improvedTasks:rows.filter(r=>r.reduction>0).length,worsenedTasks:rows.filter(r=>r.reduction<0).length,tiedTasks:rows.filter(r=>r.reduction===0).length,rows,catastrophicNegativeTransferPrevented:rows.filter(r=>r.abstained).every(r=>r.executionWork===r.coldWork)},truthBoundary:'Abstention converts detected unsupported or weak-benefit tasks to baseline execution. This is calibrated failure handling in a bounded finite-CSP representation, not universal uncertainty calibration.'});
}
