import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { validateFrontierCallabilityProbeReceipt } from './frontier-callability-provenance.mjs';

export const COMPUTE_SOVEREIGNTY_CAPACITY_VERSION = 'uberbond.compute-sovereignty-capacity.v1';
const clone=value=>structuredClone(value);
const zeroEffects=()=>clone(ZERO_EXTERNAL_EFFECTS);
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text=(value,max=1000)=>{const out=String(value??'').trim();return out&&out.length<=max?out:null;};
function fail(reasonCodes,extra={}){return{ok:false,status:'COMPUTE_SOVEREIGNTY_CAPACITY_DENIED',reasonCodes:[...new Set(reasonCodes.filter(Boolean))],businessEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),...extra};}
function fresh(value,now,maxAgeMs){const at=Date.parse(String(value||''));const current=new Date(now).getTime();return Number.isFinite(at)&&Number.isFinite(current)&&at<=current&&current-at<=maxAgeMs;}
function estimateCostCents(profile,inputTokens,outputTokens){
  const input=Number(profile?.centsPerMillionInputTokens); const output=Number(profile?.centsPerMillionOutputTokens);
  if(!Number.isFinite(input)||input<0||!Number.isFinite(output)||output<0)return null;
  return (inputTokens/1_000_000)*input+(outputTokens/1_000_000)*output;
}
function canonicalProfile(raw){
  const id=text(raw?.id,120)?.toLowerCase();
  const provider=text(raw?.provider,80)?.toLowerCase();
  const model=text(raw?.model,160); const revision=text(raw?.revision,240);
  const transportProvider=text(raw?.transportProvider,80)?.toLowerCase();
  const transportModel=text(raw?.transportModel,160);
  const transportSourceRef=text(raw?.transportSourceRef,1000);
  const pricingSourceRef=text(raw?.pricingSourceRef,1000);
  const transportVerifiedAt=text(raw?.transportVerifiedAt,100);
  const pricingVerifiedAt=text(raw?.pricingVerifiedAt,100);
  const pricingValid=Number.isFinite(Number(raw?.centsPerMillionInputTokens))&&Number(raw.centsPerMillionInputTokens)>=0&&Number.isFinite(Number(raw?.centsPerMillionOutputTokens))&&Number(raw.centsPerMillionOutputTokens)>=0;
  if(!id||!provider||!model||!revision||!transportProvider||!transportModel||!transportSourceRef||!pricingSourceRef||!transportVerifiedAt||!pricingVerifiedAt||!pricingValid)return null;
  return{...raw,id,provider,model,revision,transportProvider,transportModel,transportSourceRef,pricingSourceRef,transportVerifiedAt,pricingVerifiedAt};
}
function observationMatchesProfile(observation,profile){
  return Boolean(observation&&profile&&observation.observedProvider===profile.provider&&observation.observedModel===profile.model&&observation.observedRevision===profile.revision&&observation.observedTransportProvider===profile.transportProvider&&observation.observedTransportModel===profile.transportModel);
}

export function compileComputeSovereigntyCapacityFrontier({
  catalogCandidates=[], profiles=[], callabilityReceipt=null, callabilityReceiptDigest=null,
  benchmarks=[], taskClass='general', budgetCents=0, estimatedInputTokens=0, estimatedOutputTokens=0,
  now=new Date().toISOString(), benchmarkMaxAgeMs=30*24*60*60*1000
}={}){
  const reasons=[];
  if(!Array.isArray(catalogCandidates)||!Array.isArray(profiles)||!Array.isArray(benchmarks))reasons.push('catalog-profiles-benchmarks-arrays-required');
  if(!Number.isFinite(Number(budgetCents))||Number(budgetCents)<0)reasons.push('nonnegative-budget-required');
  if(!Number.isSafeInteger(estimatedInputTokens)||estimatedInputTokens<0||!Number.isSafeInteger(estimatedOutputTokens)||estimatedOutputTokens<0)reasons.push('nonnegative-token-estimates-required');
  if(!Number.isFinite(new Date(now).getTime()))reasons.push('valid-now-required');
  if(reasons.length)return fail(reasons);

  let liveProbe=null;
  if(callabilityReceipt&&callabilityReceiptDigest){
    const validated=validateFrontierCallabilityProbeReceipt({receipt:callabilityReceipt,receiptDigest:callabilityReceiptDigest,allowSynthetic:false});
    if(validated.ok&&validated.trustedForLiveExecution===true)liveProbe=validated;
  }
  const liveByProfile=liveProbe?.observationByProfileId instanceof Map?liveProbe.observationByProfileId:new Map();
  const profileByIdentity=new Map();
  for(const rawProfile of profiles){
    const profile=canonicalProfile(rawProfile);
    if(!profile)continue;
    profileByIdentity.set(`${profile.provider}\u0000${profile.model}`,profile);
  }
  const discoveredKeys=new Set();
  const rows=[];
  for(const raw of catalogCandidates){
    const provider=text(raw?.provider,80)?.toLowerCase();
    const model=text(raw?.canonicalModel??raw?.model,160);
    if(!provider||!model)continue;
    const key=`${provider}\u0000${model}`; if(discoveredKeys.has(key))continue; discoveredKeys.add(key);
    const profile=profileByIdentity.get(key)||null;
    const configured=Boolean(profile&&profile.enabled!==false);
    const liveObservation=configured?liveByProfile.get(profile.id):null;
    const callableNow=observationMatchesProfile(liveObservation,profile);
    const estimatedCost=configured?estimateCostCents(profile,estimatedInputTokens,estimatedOutputTokens):null;
    const affordable=callableNow&&estimatedCost!=null&&estimatedCost<=Number(budgetCents);
    const taskBenchmark=benchmarks
      .filter(item=>text(item?.provider??item?.candidate?.provider,80)?.toLowerCase()===provider&&text(item?.model??item?.candidate?.model,160)===model&&text(item?.observedRevision??item?.revision,240)===profile?.revision&&text(item?.taskClass,160)?.toLowerCase()===String(taskClass).toLowerCase())
      .filter(item=>fresh(item?.observedAt,now,benchmarkMaxAgeMs))
      .sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt))[0]||null;
    const benchmarkTrusted=Boolean(taskBenchmark&&Number(taskBenchmark.quality)>=0.8&&Number(taskBenchmark.reliability)>=0.8&&Number(taskBenchmark.evidenceConfidence)>=0.8&&text(taskBenchmark.evidenceRef??taskBenchmark.sourceRef,1000));
    const trustedForTask=affordable&&benchmarkTrusted;
    rows.push({
      provider, model, discovered:true, configured, callableNow, affordable, trustedForTask,
      profileId:profile?.id??null, revision:profile?.revision??null,
      transportProvider:profile?.transportProvider??null, transportModel:profile?.transportModel??null,
      estimatedCostCents:estimatedCost==null?null:Number(estimatedCost.toFixed(6)),
      taskClass:String(taskClass).toLowerCase(), benchmarkEvidencePresent:benchmarkTrusted,
      state:trustedForTask?'TRUSTED_FOR_TASK':affordable?'AFFORDABLE_CALLABLE':callableNow?'CALLABLE_NOT_AFFORDABLE_OR_UNPRICED':configured?'CONFIGURED_NOT_LIVE_PROVEN':'DISCOVERED_ONLY'
    });
  }
  for(const profile of profileByIdentity.values()){
    const key=`${profile.provider}\u0000${profile.model}`; if(discoveredKeys.has(key))continue;
    const liveObservation=liveByProfile.get(profile.id);
    const callableNow=profile.enabled!==false&&observationMatchesProfile(liveObservation,profile);
    const estimatedCost=estimateCostCents(profile,estimatedInputTokens,estimatedOutputTokens);
    const affordable=callableNow&&estimatedCost!=null&&estimatedCost<=Number(budgetCents);
    rows.push({provider:profile.provider,model:profile.model,discovered:false,configured:profile.enabled!==false,callableNow,affordable,trustedForTask:false,profileId:profile.id,revision:profile.revision,transportProvider:profile.transportProvider,transportModel:profile.transportModel,estimatedCostCents:estimatedCost==null?null:Number(estimatedCost.toFixed(6)),taskClass:String(taskClass).toLowerCase(),benchmarkEvidencePresent:false,state:callableNow?(affordable?'AFFORDABLE_CALLABLE':'CALLABLE_NOT_AFFORDABLE_OR_UNPRICED'):'CONFIGURED_NOT_LIVE_PROVEN'});
  }
  rows.sort((a,b)=>`${a.provider}/${a.model}`.localeCompare(`${b.provider}/${b.model}`));
  const counts={discovered:rows.filter(r=>r.discovered).length,configured:rows.filter(r=>r.configured).length,callableNow:rows.filter(r=>r.callableNow).length,affordable:rows.filter(r=>r.affordable).length,trustedForTask:rows.filter(r=>r.trustedForTask).length};
  const receipt={schemaVersion:COMPUTE_SOVEREIGNTY_CAPACITY_VERSION,generatedAt:new Date(now).toISOString(),taskClass:String(taskClass).toLowerCase(),budgetCents:Number(budgetCents),estimatedInputTokens,estimatedOutputTokens,liveCallabilityReceiptAccepted:Boolean(liveProbe),counts,models:rows,truthBoundary:'CATALOG_DISCOVERY_NEVER_IMPLIES_CONFIGURATION__CONFIGURATION_NEVER_IMPLIES_LIVE_CALLABILITY__CALLABILITY_NEVER_IMPLIES_AFFORDABILITY__AFFORDABILITY_NEVER_IMPLIES_TASK_TRUST',businessEffectAuthority:'NONE',externalEffectLedger:zeroEffects()};
  return{ok:true,status:'COMPUTE_SOVEREIGNTY_CAPACITY_FRONTIER_COMPILED',receipt,receiptDigest:digest(receipt),businessEffectAuthority:'NONE',externalEffectLedger:zeroEffects()};
}
