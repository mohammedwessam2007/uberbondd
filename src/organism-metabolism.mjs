import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { compileWallProblem, planWallbreakerCycle, classifyWallFailure } from './wallbreaker.mjs';
import { buildUnknownUnknownAgenda } from './perpetual-frontier-genesis.mjs';

export const ORGANISM_METABOLISM_VERSION='uberbond.organism-metabolism.v1';
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const text=(v,max=1000)=>{const s=String(v??'').trim();return s&&s.length<=max?s:null;};
const list=(v,max=100,itemMax=500)=>Array.isArray(v)&&v.length<=max?[...new Set(v.map(x=>text(x,itemMax)).filter(Boolean))]:null;
function fail(reasonCodes,extra={}){return{ok:false,status:'ORGANISM_METABOLISM_DENIED',reasonCodes:[...new Set(reasonCodes.filter(Boolean))],businessEffectAuthority:'NONE',externalEffectLedger:zero(),...extra};}

export function compileObjectiveMetabolism({
  objective, successCriteria=[], hardConstraints=[], assumptions=[], unknowns=[], anomalies=[], contradictions=[], blindSpots=[], disagreements=[],
  requiredCapabilities=[], requiredCapabilityAtomIds=[], ownerReservedAuthority=[], riskBudget=5, maxSpendCents=0, maxFounderMinutes=30
}={}){
  const reasonCodes=[];
  const normalizedObjective=text(objective,2000); const success=list(successCriteria,40,500); const constraints=list(hardConstraints,60,500);
  const assumptionList=list(assumptions,100,500); const unknownList=list(unknowns,100,500);
  if(!normalizedObjective)reasonCodes.push('objective-required'); if(!success?.length)reasonCodes.push('success-criteria-required');
  if(!constraints||!assumptionList||!unknownList)reasonCodes.push('bounded-objective-metadata-required');
  if(reasonCodes.length)return fail(reasonCodes);
  const agenda=buildUnknownUnknownAgenda({anomalies,contradictions,blindSpots,disagreements,maxItems:128});
  if(!agenda.ok)return fail(agenda.reasonCodes||['unknown-unknown-agenda-invalid']);
  const researchUnknowns=agenda.agenda.map(item=>`${item.kind}:${item.observation}`);
  const wall=compileWallProblem({objective:normalizedObjective,successCriteria:success,hardConstraints:constraints,assumptions:assumptionList,unknowns:[...unknownList,...researchUnknowns],requiredCapabilities,requiredCapabilityAtomIds,ownerReservedAuthority,riskBudget,maxSpendCents,maxFounderMinutes,evidenceRefs:[]});
  if(!wall.ok)return fail(wall.reasonCodes||['wall-problem-invalid']);
  const metabolism={schemaVersion:ORGANISM_METABOLISM_VERSION,objective:normalizedObjective,wallProblem:wall,unknownUnknownAgenda:agenda.agenda,assumptionInventory:assumptionList.map(value=>({assumption:value,status:'UNTESTED'})),constraintInventory:constraints.map(value=>({constraint:value,class:'UNCLASSIFIED',relaxable:'UNKNOWN'})),strategyFamilyRequirements:['DIRECT_MECHANISM','INDIRECT_OBJECTIVE_SUBSTITUTE','CAPABILITY_SUBSTITUTION','ENVIRONMENT_CHANGE','DECOMPOSITION_OR_REFRAME','INFORMATION_ACQUISITION','COUNTERFACTUAL_DESIGN','NEW_MECHANISM_INVENTION'],experimentAuthority:'PROPOSE_ONLY',capabilityAcquisitionAuthority:'PROPOSE_ONLY',consequenceAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectLedger:zero()};
  return{ok:true,status:'OBJECTIVE_METABOLISM_COMPILED',metabolism,metabolismDigest:digest(metabolism),businessEffectAuthority:'NONE',externalEffectLedger:zero()};
}

export function planMetabolismCycle({metabolism,candidates=[],failures=[],genome=null}={}){
  if(!metabolism?.wallProblem?.ok||metabolism.schemaVersion!==ORGANISM_METABOLISM_VERSION)return fail(['compiled-objective-metabolism-required']);
  if(!Array.isArray(candidates)||!Array.isArray(failures))return fail(['candidate-and-failure-arrays-required']);
  const plan=planWallbreakerCycle({problem:metabolism.wallProblem,candidates,failures,genome});
  if(!plan.ok)return fail(plan.reasonCodes||['wallbreaker-plan-rejected'],{wallbreaker:plan});
  const observedFamilies=new Set(candidates.map(x=>text(x?.family,120)).filter(Boolean));
  const familyCoverage=metabolism.strategyFamilyRequirements.map(family=>({family,represented:observedFamilies.has(family)}));
  const missingFamilies=familyCoverage.filter(x=>!x.represented).map(x=>x.family);
  return{ok:true,status:plan.selected?'METABOLISM_CANDIDATE_READY':'METABOLISM_SEARCH_REQUIRED',wallbreaker:plan,familyCoverage,missingFamilies,next:plan.selected?plan.nextSearchInstruction:'Generate materially different strategy families, prioritizing missing family classes.',learningAuthority:'PROPOSE_ONLY',consequenceAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectLedger:zero()};
}

export function compileMetabolismLearningReceipt({metabolism,plan,outcome}={}){
  if(!metabolism?.wallProblem?.ok||!plan?.wallbreaker?.ok)return fail(['compiled-metabolism-and-plan-required']);
  if(!outcome||typeof outcome!=='object'||Array.isArray(outcome))return fail(['outcome-object-required']);
  const selected=plan.wallbreaker.selected?.candidate||null;
  const succeeded=outcome.succeeded===true;
  const evidenceRefs=list(outcome.evidenceRefs,100,1000);
  if(!evidenceRefs?.length)return fail(['outcome-evidence-required']);
  let failure=null;
  if(!succeeded){
    failure=classifyWallFailure({...outcome.failure,candidateId:selected?.id,failedSignature:selected?.signature,evidenceRefs});
    if(!failure.ok)return fail(failure.reasonCodes||['failure-classification-rejected']);
  }
  const invalidated=[...new Set(failure?.invalidatedAssumptions||[])];
  const discoveredConstraints=[...new Set(failure?.discoveredConstraints||[])];
  const missingCapabilities=[...new Set([...(failure?.missingCapabilities||[]),...(selected?.requiredCapabilities||[]).filter(cap=>outcome.missingCapability===true)])];
  const receipt={schemaVersion:'uberbond.organism-metabolism-learning.v1',metabolismDigest:digest(metabolism),wallbreakerReceiptId:plan.wallbreaker.wallbreakerReceiptId,selectedCandidateId:selected?.id||null,selectedSignature:selected?.signature||null,succeeded,evidenceRefs,failureClass:failure?.failureClass||null,invalidatedAssumptions:invalidated,discoveredConstraints,missingCapabilities,retrySameMechanismAllowed:succeeded?false:failure?.safeToRetrySameMechanism===true,capabilityAcquisitionRecommended:missingCapabilities.length>0,nextLearningAction:succeeded?'PRESERVE_MECHANISM_AND_UPDATE_MEASURED_OUTCOMES':failure?.hardStop?'ESCALATE_OR_REFRAME_WITH_PROOF':'REPLAN_WITH_FAILURE_EVIDENCE',authorityDelta:'NONE',businessEffectAuthority:'NONE',externalEffectLedger:zero()};
  return{ok:true,status:'METABOLISM_LEARNING_RECEIPT_COMPILED',receipt,receiptDigest:digest(receipt),businessEffectAuthority:'NONE',externalEffectLedger:zero()};
}
