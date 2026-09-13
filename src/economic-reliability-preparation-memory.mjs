import crypto from 'node:crypto';

export const ECONOMIC_RELIABILITY_PREPARATION_MEMORY_VERSION='uberbond.economic-reliability-preparation-memory.v1';
export const PREPARATION_AUDIT_TYPE='commercial_opportunity_preparation';

const arr=v=>Array.isArray(v)?v:[];
const text=(v,max=1000)=>{const s=String(v??'').trim();return s&&s.length<=max?s:null;};
const iso=value=>{const d=value instanceof Date?value:new Date(value);return Number.isFinite(d.getTime())?d.toISOString():null;};
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function provenanceRefs(result={}){
  const refs=[];
  for(const source of arr(result?.evidence?.sources)){
    const url=text(source?.url,1000);
    if(url) refs.push(url);
  }
  for(const signal of arr(result?.observedBuyerSignals)){
    const url=text(signal?.source?.url,1000);
    if(url) refs.push(url);
  }
  return [...new Set(refs)];
}

export function compilePreparationEvidenceRecord({result,actionContext={},observedAt=null}={}){
  const at=iso(observedAt||result?.timestamp||new Date());
  const opportunityId=text(result?.opportunityId,180);
  const routeId=text(actionContext?.reliabilityRouteId,220)|| (opportunityId?`commercial:${opportunityId}`:null);
  const actionType=text(actionContext?.reliabilityActionType,140);
  const failureDomain=text(actionContext?.reliabilityFailureDomain,180);

  if(result?.ok!==true || result?.status!=='READY_FOR_LOCAL_PREPARATION' || result?.experiment?.mode!=='LOCAL_PREPARATION_ONLY'){
    return {ok:false,status:'PREPARATION_EVIDENCE_REJECTED',reasonCodes:['successful-local-preparation-result-required']};
  }
  if(!opportunityId||!routeId||!at){
    return {ok:false,status:'PREPARATION_EVIDENCE_REJECTED',reasonCodes:['opportunity-route-and-observed-at-required']};
  }

  const core={
    schemaVersion:ECONOMIC_RELIABILITY_PREPARATION_MEMORY_VERSION,
    opportunityId,
    routeId,
    actionType,
    failureDomain,
    observedAt:at,
    preparationStatus:result.status,
    policyVersion:text(result.policyVersion,220),
    category:text(result.category,180),
    verdict:text(result.verdict,180),
    experimentId:text(result?.experiment?.experimentId,220),
    experimentMode:'LOCAL_PREPARATION_ONLY',
    localPreparationObserved:true,
    provenanceRefs:provenanceRefs(result),
    externalEffectsZero:result?.externalEffectLedger && Object.values(result.externalEffectLedger).every(v=>v===false||v===0||v===null||v==='NONE'),
    proves:{
      localPreparationPacket:true,
      catalogProvenance:true,
      structuredDependencyReceipt:false,
      policyClearance:false,
      executableRail:false,
      providerReadbackTrial:false,
      clearedSettlement:false,
      acceptedDelivery:false,
      successProbability:false
    },
    externalEffectAuthority:'NONE',
    moneyAuthority:'NONE'
  };
  return {
    ok:true,
    status:'PREPARATION_EVIDENCE_COMPILED',
    record:{
      ...core,
      recordDigest:digest(core),
      truthBoundary:'This record proves only that UberBond compiled a bounded local preparation packet from the canonical commercial opportunity catalog. It does not prove dependency separation, policy clearance, live executability, provider-origin trials, cleared payment, accepted delivery, profit, or any reliability probability.'
    }
  };
}

export function validatePreparationEvidenceRecord(record,{maxAgeMs=7*24*60*60*1000,now=new Date()}={}){
  if(!record||typeof record!=='object') return {ok:false,reasonCodes:['record-required']};
  const observedAt=iso(record.observedAt);
  const nowDate=now instanceof Date?now:new Date(now);
  const ageMs=observedAt&&Number.isFinite(nowDate.getTime())?nowDate.getTime()-new Date(observedAt).getTime():NaN;
  const reasons=[];
  if(record.schemaVersion!==ECONOMIC_RELIABILITY_PREPARATION_MEMORY_VERSION) reasons.push('schema-version-mismatch');
  if(record.localPreparationObserved!==true) reasons.push('local-preparation-observed-required');
  if(record.experimentMode!=='LOCAL_PREPARATION_ONLY') reasons.push('local-preparation-mode-required');
  if(record.externalEffectAuthority!=='NONE'||record.moneyAuthority!=='NONE') reasons.push('authority-must-remain-none');
  if(record?.proves?.structuredDependencyReceipt!==false||record?.proves?.policyClearance!==false||record?.proves?.executableRail!==false||record?.proves?.successProbability!==false) reasons.push('preparation-must-not-promote-runtime-or-probability-truth');
  if(!record.routeId||!String(record.routeId).startsWith('commercial:')) reasons.push('commercial-route-required');
  if(!Number.isFinite(ageMs)||ageMs<0||ageMs>maxAgeMs) reasons.push('preparation-evidence-stale-or-future');
  const {recordDigest,...withoutDigest}=record;
  const {truthBoundary,...core}=withoutDigest;
  if(recordDigest!==digest(core)) reasons.push('record-digest-mismatch');
  return {ok:reasons.length===0,reasonCodes:reasons,ageMs:Number.isFinite(ageMs)?ageMs:null};
}

export function indexPreparationEvidence(auditRows=[],options={}){
  const byRoute=new Map();
  for(const row of arr(auditRows)){
    if(row?.type!==PREPARATION_AUDIT_TYPE) continue;
    const record=row?.detail?.record||row?.detail;
    const validation=validatePreparationEvidenceRecord(record,options);
    if(!validation.ok) continue;
    const previous=byRoute.get(record.routeId);
    if(!previous||new Date(record.observedAt).getTime()>new Date(previous.observedAt).getTime()){
      byRoute.set(record.routeId,{...record,auditId:row.id||null});
    }
  }
  return byRoute;
}
