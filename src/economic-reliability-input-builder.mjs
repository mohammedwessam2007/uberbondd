import crypto from 'node:crypto';
import { listCommercialOpportunityCatalog } from './commercial-opportunity-catalog.mjs';

export const ECONOMIC_RELIABILITY_INPUT_BUILDER_VERSION='uberbond.economic-reliability-input-builder.v1';
const arr=v=>Array.isArray(v)?v:[];
const text=(v,max=500)=>{const s=String(v??'').trim();return s&&s.length<=max?s:null;};
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');

function stateByRoute(routeStates=[]){
  const map=new Map();
  for(const raw of arr(routeStates)){
    const routeId=text(raw?.routeId,180);
    if(routeId) map.set(routeId,raw);
  }
  return map;
}

function evidenceRefsFor(entry){
  const refs=[];
  for(const source of arr(entry?.evidence?.sources)){
    const url=text(source?.url,1000);
    if(url) refs.push(url);
  }
  for(const signal of arr(entry?.observedBuyerSignals)){
    const url=text(signal?.source?.url,1000);
    if(url) refs.push(url);
  }
  return [...new Set(refs)];
}

function defaultRegimeId(date){
  const d=date instanceof Date?date:new Date(date);
  if(!Number.isFinite(d.getTime())) return 'commercial-current';
  return `commercial-${d.toISOString().slice(0,10)}`;
}

function shellFromCatalog(entry,state,date){
  const routeId=`commercial:${entry.id}`;
  const regimeId=text(state?.regimeId,180)||defaultRegimeId(date);
  return {
    routeId,
    failureDomain:`commercial:${text(entry.category,160)||'uncategorized'}`,
    regimeId,
    routeEvidenceRefs:evidenceRefsFor(entry),
    dependencyReceipt:state?.dependencyReceipt&&typeof state.dependencyReceipt==='object'?structuredClone(state.dependencyReceipt):null,
    policyCleared:state?.policyCleared===true,
    executableNow:state?.executableNow===true,
    founderMinutes:Number.isFinite(Number(state?.founderMinutes))?Math.max(0,Number(state.founderMinutes)):0,
    timeToCashMinutes:Number.isFinite(Number(state?.timeToCashMinutes))?Math.max(0,Number(state.timeToCashMinutes)):0,
    minTrials:Number.isSafeInteger(state?.minTrials)&&state.minTrials>0?state.minTrials:20,
    maxTrialAgeMs:Number.isFinite(Number(state?.maxTrialAgeMs))&&Number(state.maxTrialAgeMs)>0?Number(state.maxTrialAgeMs):30*24*60*60*1000,
    opportunity: {
      id:entry.id,
      name:entry.name,
      category:entry.category,
      verdict:entry.verdict,
      recurringRoute:entry.recurringRoute||null
    }
  };
}

export function compileEconomicReliabilityInput({date=new Date(),routeStates=[],trials=[],maxAdditions=32}={}){
  const catalog=listCommercialOpportunityCatalog();
  const states=stateByRoute(routeStates);
  const candidateRoutes=catalog.map(entry=>{
    const routeId=`commercial:${entry.id}`;
    return shellFromCatalog(entry,states.get(routeId),date);
  });
  const activeIds=new Set(arr(routeStates).filter(x=>x?.active===true).map(x=>text(x?.routeId,180)).filter(Boolean));
  const activeRoutes=[];
  const inactive=[];
  for(const route of candidateRoutes){
    if(activeIds.has(route.routeId)) activeRoutes.push(route);
    else inactive.push(route);
  }
  const receiptCore={
    schemaVersion:ECONOMIC_RELIABILITY_INPUT_BUILDER_VERSION,
    observedAt:(date instanceof Date?date:new Date(date)).toISOString(),
    catalogRouteCount:candidateRoutes.length,
    activeRouteCount:activeRoutes.length,
    candidateRouteCount:inactive.length,
    trialCount:arr(trials).length,
    routeIds:candidateRoutes.map(x=>x.routeId)
  };
  return {
    ok:true,
    ...receiptCore,
    inputDigest:digest(receiptCore),
    activeRoutes,
    candidateRoutes:inactive,
    trials:structuredClone(arr(trials)),
    maxAdditions:Number.isSafeInteger(maxAdditions)&&maxAdditions>=0?maxAdditions:32,
    externalEffectAuthority:'NONE',
    moneyAuthority:'NONE',
    truthBoundary:'The commercial catalog creates a breadth universe of routes to investigate, not probabilities or execution authority. No route becomes policy-cleared, executable, dependency-proven, calibrated, or money-producing merely because it exists in the catalog. Only fresh provider-origin outcome evidence may calibrate success probability.'
  };
}
