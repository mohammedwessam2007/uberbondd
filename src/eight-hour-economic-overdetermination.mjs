import crypto from 'node:crypto';

export const ECONOMIC_OVERDETERMINATION_VERSION='uberbond.economic-overdetermination.v1';
const hash=v=>crypto.createHash('sha256').update(String(v??'')).digest('hex').slice(0,24);
const clamp=(v,min=0,max=1)=>Math.max(min,Math.min(max,Number.isFinite(Number(v))?Number(v):min));

function dimension(path,key,fallback='unknown'){
  const value=path?.[key] ?? path?.dimensions?.[key] ?? fallback;
  return String(value||fallback).trim()||fallback;
}

export function normalizeMoneyRoute(input={}){
  const observedClearedPayments=Math.max(0,Math.floor(Number(input.observedClearedPayments)||0));
  const acceptedDeliveries=Math.max(0,Math.floor(Number(input.acceptedDeliveries)||0));
  const evidenceQuality=clamp(input.evidenceQuality,0,1);
  const rawP=clamp(input.successProbability,0,1);
  const observed=observedClearedPayments>0&&acceptedDeliveries>0;
  const readiness=String(input.readiness||input.maturity||'UNKNOWN').toUpperCase();
  const executable=Boolean(input.executable)||['EXECUTABLE_UNPROVEN','MONEY_LOOP_OBSERVED','RECURRING_OBSERVED'].includes(readiness);
  const modelOnly=!observed && evidenceQuality<=0.25;
  const cappedP=observed?rawP:Math.min(rawP,modelOnly?0.02:0.15);
  const effectiveP=executable?clamp(cappedP*evidenceQuality,0,0.999999):0;
  const dims={
    buyerPool:dimension(input,'buyerPool'),
    acquisitionChannel:dimension(input,'acquisitionChannel'),
    offerType:dimension(input,'offerType'),
    paymentRail:dimension(input,'paymentRail',input?.stages?.PAYMENT?.railId||'unknown'),
    fulfillmentMode:dimension(input,'fulfillmentMode',input?.stages?.FULFILLMENT?.railId||'unknown'),
    geography:dimension(input,'geography'),
    monetization:dimension(input,'monetization'),
    independenceClass:dimension(input,'independenceClass',input.mechanismFamily||'unknown')
  };
  return {
    id:String(input.id||`route_${hash(JSON.stringify(input))}`),
    executable,observed,evidenceQuality,rawSuccessProbability:rawP,effectiveSuccessProbability:effectiveP,
    expectedNetContribution:Number.isFinite(Number(input.expectedNetContribution))?Number(input.expectedNetContribution):0,
    founderMinutes:Math.max(0,Number(input.founderMinutes)||0),dimensions:dims,
    authorityBlocked:Boolean(input.authorityBlocked),prohibited:Boolean(input.prohibited),blockers:Array.isArray(input.blockers)?input.blockers:[]
  };
}

function overlap(a,b){
  const keys=Object.keys(a.dimensions);
  return keys.reduce((n,k)=>n+(a.dimensions[k]===b.dimensions[k]&&a.dimensions[k]!=='unknown'?1:0),0)/keys.length;
}
function marginal(route,selected){
  if(!selected.length) return route.effectiveSuccessProbability;
  const maxOverlap=Math.max(...selected.map(s=>overlap(route,s)),0);
  const novelty=1-0.85*maxOverlap;
  return route.effectiveSuccessProbability*Math.max(0.05,novelty);
}

export function compileEightHourOverdetermination({routes=[],maxParallel=64,targetClearanceProbability=0.995,minimumDiversity=4}={}){
  const normalized=(Array.isArray(routes)?routes:[]).map(normalizeMoneyRoute)
    .filter(r=>r.executable&&!r.authorityBlocked&&!r.prohibited&&r.effectiveSuccessProbability>0);
  const selected=[]; const pool=[...normalized];
  while(pool.length&&selected.length<Math.max(1,Math.floor(Number(maxParallel)||64))){
    pool.sort((a,b)=>marginal(b,selected)-marginal(a,selected)||b.expectedNetContribution-a.expectedNetContribution||a.id.localeCompare(b.id));
    selected.push(pool.shift());
    const p=1-selected.reduce((prod,r)=>prod*(1-marginal(r,selected.filter(s=>s!==r))),1);
    const classes=new Set(selected.map(r=>r.dimensions.independenceClass)).size;
    if(p>=targetClearanceProbability&&classes>=minimumDiversity) break;
  }
  const effectivePs=selected.map((r,i)=>marginal(r,selected.slice(0,i)));
  const boundedClearanceProbability=selected.length?1-effectivePs.reduce((prod,p)=>prod*(1-clamp(p,0,0.999999)),1):0;
  const keys=['buyerPool','acquisitionChannel','offerType','paymentRail','fulfillmentMode','geography','monetization','independenceClass'];
  const diversity=Object.fromEntries(keys.map(k=>[k,new Set(selected.map(r=>r.dimensions[k]).filter(v=>v!=='unknown')).size]));
  const weakDimensions=keys.filter(k=>diversity[k]<Math.min(minimumDiversity,Math.max(1,selected.length)));
  const saturationTargetMet=boundedClearanceProbability>=targetClearanceProbability&&diversity.independenceClass>=minimumDiversity&&weakDimensions.length<=2;
  const replacementIntents=[];
  if(!saturationTargetMet){
    for(const key of weakDimensions) replacementIntents.push({type:'DIVERSIFY_DIMENSION',dimension:key,needAtLeast:minimumDiversity});
    if(boundedClearanceProbability<targetClearanceProbability) replacementIntents.push({type:'SPAWN_MATERIALLY_DIFFERENT_ROUTE',targetClearanceProbability});
  }
  return {
    version:ECONOMIC_OVERDETERMINATION_VERSION,
    status:saturationTargetMet?'OVERDETERMINATION_TARGET_MET':'SATURATION_REQUIRED',
    targetClearanceProbability,
    boundedClearanceProbability:Number(boundedClearanceProbability.toFixed(6)),
    candidateRouteCount:normalized.length,
    selectedRouteCount:selected.length,
    selectedRouteDigests:selected.map(r=>hash(r.id)),
    diversity,weakDimensions,replacementIntents,saturationTargetMet,
    externalEffectAuthority:'NONE',capitalDeploymentAuthority:'NONE',
    truthBoundary:'CLEARANCE_PROBABILITY_IS_A_BOUNDED_MODEL_NOT_A_GUARANTEE; MODEL_ONLY_ROUTES_ARE_HEAVILY_CAPPED; CORRELATED_ROUTES_DO_NOT_COUNT_AS_INDEPENDENT; REAL_MONEY_REQUIRES_CLEARED_PAYMENT_AND_ACCEPTED_DELIVERY'
  };
}
