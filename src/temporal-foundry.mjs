import crypto from 'node:crypto';

export const TEMPORAL_FOUNDRY_VERSION = 'uberbond.temporal-foundry.v1';

export const FUTURE_FUNCTION_STATES = Object.freeze([
  'PRESENT_VERIFIED',
  'PRESENT_COMPOSABLE',
  'INTERNAL_PRIMITIVE_MISSING',
  'EXTERNAL_OR_PHYSICAL_FLOOR',
  'UNKNOWN'
]);

const ZERO_EXTERNAL_EFFECTS = Object.freeze({
  customerMessages:0,
  providerCalls:0,
  spendCents:0,
  deployments:0,
  dnsChanges:0,
  credentialChanges:0,
  paymentMutations:0,
  productionMutations:0
});

const text=(value,max=2000)=>{const out=String(value??'').trim();return out&&out.length<=max?out:null;};
const list=(value,max=2048,itemMax=1000)=>{
  if(!Array.isArray(value)||value.length>max)return null;
  const out=[];const seen=new Set();
  for(const raw of value){const item=text(raw,itemMax);if(!item)return null;if(!seen.has(item)){seen.add(item);out.push(item);}}
  return out;
};
const weight=value=>{const n=Number(value);return Number.isFinite(n)&&n>0&&n<=1_000_000?n:null;};
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const envelope=extra=>({businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:{...ZERO_EXTERNAL_EFFECTS},...extra});
const fail=(reasonCodes,extra={})=>envelope({ok:false,status:'TEMPORAL_FOUNDRY_REFUSED',version:TEMPORAL_FOUNDRY_VERSION,reasonCodes:[...new Set(reasonCodes.filter(Boolean))],...extra});

function normalizeFunction(raw){
  const id=text(raw?.id,240)?.toLowerCase();
  const label=text(raw?.label,1000);
  const functionWeight=weight(raw?.weight);
  const requires=list(raw?.requires||[],2048,240)?.map(v=>v.toLowerCase());
  const realizationState=text(raw?.realizationState,80);
  const evidenceRefs=list(raw?.evidenceRefs||[],256,1000);
  if(!id||!label||functionWeight===null||!requires||!FUTURE_FUNCTION_STATES.includes(realizationState)||!evidenceRefs)return null;
  if(['PRESENT_VERIFIED','PRESENT_COMPOSABLE','EXTERNAL_OR_PHYSICAL_FLOOR'].includes(realizationState)&&evidenceRefs.length===0)return null;
  return{id,label,weight:functionWeight,requires,realizationState,evidenceRefs};
}

function normalizeCapability(input={}){
  const futureCapabilityName=text(input.futureCapabilityName,500);
  const terminalContract=text(input.terminalContract,4000);
  const horizonLabel=text(input.horizonLabel,300);
  if(!futureCapabilityName||!terminalContract||!horizonLabel||!Array.isArray(input.functions)||input.functions.length<1||input.functions.length>20_000){
    return{ok:false,reasonCodes:['bounded-future-capability-contract-required']};
  }
  const functions=input.functions.map(normalizeFunction);
  if(functions.some(row=>!row))return{ok:false,reasonCodes:['valid-future-function-decomposition-required']};
  const byId=new Map();
  for(const row of functions){if(byId.has(row.id))return{ok:false,reasonCodes:['unique-future-function-ids-required']};byId.set(row.id,row);}
  for(const row of functions){
    const missing=row.requires.filter(id=>!byId.has(id));
    if(missing.length)return{ok:false,reasonCodes:['future-function-dependency-missing'],functionId:row.id,missing};
    if(row.requires.includes(row.id))return{ok:false,reasonCodes:['future-function-self-dependency-refused'],functionId:row.id};
  }
  const terminals=list(input.terminalFunctionIds||[],256,240)?.map(v=>v.toLowerCase());
  if(!terminals||terminals.length<1)return{ok:false,reasonCodes:['terminal-function-ids-required']};
  const missingTerminals=terminals.filter(id=>!byId.has(id));
  if(missingTerminals.length)return{ok:false,reasonCodes:['terminal-function-id-missing'],missing:missingTerminals};

  const indegree=new Map(functions.map(row=>[row.id,row.requires.length]));
  const children=new Map(functions.map(row=>[row.id,[]]));
  for(const row of functions)for(const dep of row.requires)children.get(dep).push(row.id);
  const ready=functions.filter(row=>indegree.get(row.id)===0).map(row=>row.id).sort();
  const order=[];
  while(ready.length){
    const id=ready.shift();order.push(id);
    for(const child of children.get(id).sort()){
      indegree.set(child,indegree.get(child)-1);
      if(indegree.get(child)===0){ready.push(child);ready.sort();}
    }
  }
  if(order.length!==functions.length)return{ok:false,reasonCodes:['future-function-dependency-cycle-refused']};
  const core={futureCapabilityName,terminalContract,horizonLabel,functions,terminalFunctionIds:terminals};
  return{ok:true,capability:{...core,capabilityDigest:digest(core)},byId,children,order};
}

function ratio(n,d){return d>0?Number((n/d).toFixed(6)):0;}

export function analyzeFutureCapability(input={}){
  const normalized=normalizeCapability(input);
  if(!normalized.ok)return fail(normalized.reasonCodes,normalized.functionId?{functionId:normalized.functionId,missing:normalized.missing}:normalized.missing?{missing:normalized.missing}:{});
  const rows=normalized.capability.functions;
  const totalFunctionWeight=rows.reduce((sum,row)=>sum+row.weight,0);
  const weightFor=state=>rows.filter(row=>row.realizationState===state).reduce((sum,row)=>sum+row.weight,0);
  const presentCapturedWeight=weightFor('PRESENT_VERIFIED')+weightFor('PRESENT_COMPOSABLE');
  const internallyPullableWeight=weightFor('INTERNAL_PRIMITIVE_MISSING');
  const externalOrPhysicalFloorWeight=weightFor('EXTERNAL_OR_PHYSICAL_FLOOR');
  const unknownWeight=weightFor('UNKNOWN');
  const internalTargets=rows.filter(row=>row.realizationState==='INTERNAL_PRIMITIVE_MISSING').map(row=>({id:row.id,label:row.label,weight:row.weight,requires:row.requires}));
  return envelope({
    ok:true,
    status:'FUTURE_CAPABILITY_DECOMPOSED',
    version:TEMPORAL_FOUNDRY_VERSION,
    futureCapabilityName:normalized.capability.futureCapabilityName,
    horizonLabel:normalized.capability.horizonLabel,
    terminalContract:normalized.capability.terminalContract,
    capabilityDigest:normalized.capability.capabilityDigest,
    totalFunctionWeight,
    presentCapturedWeight,
    presentFunctionCaptureRatio:ratio(presentCapturedWeight,totalFunctionWeight),
    internallyPullableWeight,
    externalOrPhysicalFloorWeight,
    unknownWeight,
    internalTargets,
    futureLabelBoundary:'A_FUTURE_HORIZON_LABEL_IS_NOT_EVIDENCE_THAT_THE_CAPABILITY_REQUIRES_THAT_MUCH_TIME',
    realityBoundary:'PRESENT_CAPTURE_REQUIRES_EVIDENCE__EXTERNAL_PHYSICAL_AND_UNKNOWN_FUNCTIONS_CANNOT_BE_RELABELED_AS_CURRENT_BY_SOURCE_ASSERTION'
  });
}

function dependenciesSatisfiedForPullForward(id,selected,byId,visiting=new Set()){
  if(visiting.has(id))return false;
  visiting.add(id);
  const row=byId.get(id);
  if(!row)return false;
  for(const depId of row.requires){
    const dep=byId.get(depId);
    if(!dep)return false;
    if(['PRESENT_VERIFIED','PRESENT_COMPOSABLE'].includes(dep.realizationState))continue;
    if(dep.realizationState==='INTERNAL_PRIMITIVE_MISSING'&&selected.has(depId)){
      if(!dependenciesSatisfiedForPullForward(depId,selected,byId,new Set(visiting)))return false;
      continue;
    }
    return false;
  }
  return true;
}

export function compileTemporalFoundryRaid(input={}){
  const normalized=normalizeCapability(input?.futureCapability||{});
  if(!normalized.ok)return fail(['valid-future-capability-required',...normalized.reasonCodes]);
  const analysis=analyzeFutureCapability(input.futureCapability);
  if(!analysis.ok)return analysis;
  const primitive=input?.primitiveCandidate||{};
  const requirementName=text(primitive.requirementName,180);
  const primitiveName=text(primitive.name,500);
  const unlockFunctionIds=list(primitive.unlockFunctionIds||[],512,240)?.map(v=>v.toLowerCase());
  const evidenceRefs=list(primitive.evidenceRefs||[],256,1000);
  const rationale=text(primitive.rationale,2000);
  if(!requirementName||!primitiveName||!unlockFunctionIds||unlockFunctionIds.length<1||!evidenceRefs||evidenceRefs.length<1||!rationale){
    return fail(['bounded-evidence-backed-enabling-primitive-required']);
  }
  const selected=new Set(unlockFunctionIds);
  let unlockedWeight=0;
  for(const id of selected){
    const row=normalized.byId.get(id);
    if(!row)return fail([`unknown-unlock-function:${id}`]);
    if(row.realizationState!=='INTERNAL_PRIMITIVE_MISSING'){
      return fail([`only-internal-missing-functions-may-be-pulled-forward:${id}`]);
    }
    if(!dependenciesSatisfiedForPullForward(id,selected,normalized.byId)){
      return fail([`pull-forward-dependencies-not-satisfied:${id}`]);
    }
    unlockedWeight+=row.weight;
  }
  const projectedCapturedWeight=analysis.presentCapturedWeight+unlockedWeight;
  if(!(projectedCapturedWeight>analysis.presentCapturedWeight))return fail(['primitive-must-increase-present-function-capture']);
  const trustedEvidence={
    futureCapabilityName:analysis.futureCapabilityName,
    horizonLabel:analysis.horizonLabel,
    capabilityDigest:analysis.capabilityDigest,
    terminalContractPreserved:true,
    requirementName,
    primitiveName,
    unlockFunctionIds:[...selected].sort(),
    presentCapturedWeight:analysis.presentCapturedWeight,
    totalFunctionWeight:analysis.totalFunctionWeight,
    presentFunctionCaptureRatio:analysis.presentFunctionCaptureRatio,
    projectedCapturedWeight,
    projectedFunctionCaptureRatio:ratio(projectedCapturedWeight,analysis.totalFunctionWeight),
    futureFunctionWeightPulledForward:unlockedWeight,
    remainingExternalOrPhysicalFloorWeight:analysis.externalOrPhysicalFloorWeight,
    remainingUnknownWeight:analysis.unknownWeight,
    evidenceRefs,
    evidenceClass:'HYPOTHESIS',
    law:'STEAL_THE_FUNCTION_FROM_THE_FUTURE_WITH_PRESENT_PRIMITIVES_BEFORE_WAITING_FOR_THE_FINAL_SUBSTRATE'
  };
  return envelope({
    ok:true,
    status:'TEMPORAL_FOUNDRY_PRIMITIVE_READY',
    version:TEMPORAL_FOUNDRY_VERSION,
    trustedEvidence,
    metric:'future function weight pulled forward by one dependency-satisfied internal primitive',
    admissionBoundary:'THIS_SELECTS_AN_INTERNAL_PRIMITIVE_TO_INVESTIGATE__IT_DOES_NOT_IMPLEMENT_IT_OR_PROVE_PHYSICAL_EXTERNAL_BIOLOGICAL_OR_LONGITUDINAL_CAPABILITY',
    sovereigntyBoundary:'FUTURE_CAPABILITY_MODELING_DOES_NOT_CREATE_A_FOUNDER_GOAL_OR_EXTERNAL_EFFECT_AUTHORITY'
  });
}
