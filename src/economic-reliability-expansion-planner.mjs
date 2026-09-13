import { evaluateEconomicReliability } from './economic-reliability-engine.mjs';

export const ECONOMIC_RELIABILITY_EXPANSION_PLANNER_VERSION='uberbond.economic-reliability-expansion-planner.v1';

const arr=v=>Array.isArray(v)?v:[];
const finite=v=>Number.isFinite(Number(v))?Number(v):null;
const text=(v,max=240)=>{const s=String(v??'').trim();return s&&s.length<=max?s:null;};

function routeBurden(route={}){
  const founderMinutes=Math.max(0,finite(route.founderMinutes)??0);
  const timeToCashMinutes=Math.max(0,finite(route.timeToCashMinutes)??0);
  return Math.max(1,founderMinutes+(timeToCashMinutes/60));
}

function marginalGain(currentRoutes,candidate){
  const before=evaluateEconomicReliability({routes:currentRoutes});
  const after=evaluateEconomicReliability({routes:[...currentRoutes,candidate]});
  const beforeResidual=Math.max(Number.MIN_VALUE,before.residualZeroProbability);
  const afterResidual=Math.max(Number.MIN_VALUE,after.residualZeroProbability);
  const absoluteGain=Math.max(0,before.residualZeroProbability-after.residualZeroProbability);
  const logGain=Math.max(0,Math.log(beforeResidual)-Math.log(afterResidual));
  const burden=routeBurden(candidate);
  return {
    routeId:text(candidate?.routeId,180),
    failureDomain:text(candidate?.failureDomain,180),
    absoluteResidualReduction:absoluteGain,
    logReliabilityGain:logGain,
    burden,
    gainPerBurden:logGain/burden,
    before,
    after
  };
}

export function planEconomicReliabilityExpansion({activeRoutes=[],candidateRoutes=[],maxAdditions=32}={}){
  const active=[...arr(activeRoutes)];
  const candidates=[...arr(candidateRoutes)];
  const startReliability=evaluateEconomicReliability({routes:active});
  const selected=[];
  const rejectedNoGain=[];
  const cap=Math.max(0,Math.min(512,Math.floor(finite(maxAdditions)??32)));
  let currentRoutes=[...active];
  let current=evaluateEconomicReliability({routes:currentRoutes});
  const remaining=new Map(candidates.map((route,index)=>[text(route?.routeId,180)||`candidate-${index}`,route]));

  while(!current.targetReached&&selected.length<cap&&remaining.size){
    const scored=[];
    for(const [id,candidate] of remaining){
      const gain=marginalGain(currentRoutes,candidate);
      scored.push({id,candidate,...gain});
    }
    scored.sort((a,b)=>b.gainPerBurden-a.gainPerBurden||b.logReliabilityGain-a.logReliabilityGain||String(a.id).localeCompare(String(b.id)));
    const best=scored[0];
    if(!best||!(best.logReliabilityGain>0)){
      for(const item of scored) rejectedNoGain.push(item.id);
      break;
    }
    selected.push({
      routeId:best.id,
      failureDomain:best.failureDomain,
      absoluteResidualReduction:best.absoluteResidualReduction,
      logReliabilityGain:best.logReliabilityGain,
      burden:best.burden,
      gainPerBurden:best.gainPerBurden,
      residualBefore:best.before.residualZeroProbability,
      residualAfter:best.after.residualZeroProbability
    });
    currentRoutes=[...currentRoutes,best.candidate];
    remaining.delete(best.id);
    current=evaluateEconomicReliability({routes:currentRoutes});
  }

  if(!current.targetReached){
    for(const id of remaining.keys()) if(!rejectedNoGain.includes(id)){
      const gain=marginalGain(currentRoutes,remaining.get(id));
      if(!(gain.logReliabilityGain>0)) rejectedNoGain.push(id);
    }
  }

  return {
    schemaVersion:ECONOMIC_RELIABILITY_EXPANSION_PLANNER_VERSION,
    status:current.targetReached?'ECONOMIC_RELIABILITY_TARGET_REACHED':'ECONOMIC_RELIABILITY_EXPANSION_REQUIRED',
    targetReached:current.targetReached,
    selectedAdditions:selected,
    selectedCount:selected.length,
    startReliability,
    finalReliability:current,
    remainingCandidateCount:remaining.size,
    rejectedNoGain:[...new Set(rejectedNoGain)],
    externalEffectAuthority:'NONE',
    moneyAuthority:'NONE',
    planningLaw:'SELECT_THE_EVIDENCE_BACKED_ORTHOGONAL_ROUTE_WITH_HIGHEST_MARGINAL_LOG_RELIABILITY_GAIN_PER_BURDEN; RECOMPUTE_AFTER_EACH_SELECTION',
    truthBoundary:'This planner only ranks already-described candidate routes. It does not discover customers, execute routes, send messages, spend money, create authority, prove independence, or prove cleared cash. A candidate without calibration and independence evidence cannot reduce the modeled zero-money probability.'
  };
}
