export const ECONOMIC_RELIABILITY_AUTOPREP_VERSION='uberbond.economic-reliability-autoprep.v1.2';

const arr=v=>Array.isArray(v)?v:[];
const text=(v,max=500)=>{const s=String(v??'').trim();return s&&s.length<=max?s:null;};

function commercialOpportunityId(routeId){
  const id=text(routeId,220);
  if(!id||!id.startsWith('commercial:')) return null;
  const opportunityId=id.slice('commercial:'.length).trim();
  return opportunityId||null;
}

const SAFE_PREPARATION_ACTIONS=new Set([
  'BUILD_EVIDENCED_DEPENDENCY_FINGERPRINT',
  'RESOLVE_POLICY_CLEARANCE',
  'CLOSE_EXECUTION_DEPENDENCIES'
]);

function candidateFromAction(action,index){
  const type=text(action?.type,120);
  const opportunityId=commercialOpportunityId(action?.routeId);
  if(!SAFE_PREPARATION_ACTIONS.has(type)) return {skip:{routeId:action?.routeId||null,type:type||null,reason:'action-not-local-preparation-safe'}};
  if(!opportunityId) return {skip:{routeId:action?.routeId||null,type,reason:'commercial-route-required'}};
  return {
    candidate:{
      action,
      index,
      type,
      opportunityId,
      routeId:action.routeId,
      failureDomain:text(action?.failureDomain,180)
    }
  };
}

function selectDiversified(candidates,limit){
  if(limit<=0) return [];
  const selected=[];
  const selectedKeys=new Set();
  const seenDomains=new Set();

  for(const item of candidates){
    if(selected.length>=limit) break;
    const key=`${item.type}:${item.opportunityId}`;
    if(selectedKeys.has(key)||!item.failureDomain||seenDomains.has(item.failureDomain)) continue;
    selected.push(item);
    selectedKeys.add(key);
    seenDomains.add(item.failureDomain);
  }

  for(const item of candidates){
    if(selected.length>=limit) break;
    const key=`${item.type}:${item.opportunityId}`;
    if(selectedKeys.has(key)) continue;
    selected.push(item);
    selectedKeys.add(key);
  }
  return selected;
}

export function compileEconomicReliabilityPreparationJobs({reliabilityReceipt,maxJobs=8,date=null,excludeRouteIds=[]}={}){
  const limit=Math.max(0,Math.min(32,Number.isSafeInteger(maxJobs)?maxJobs:8));
  const excluded=new Set(arr(excludeRouteIds).map(v=>text(v,220)).filter(Boolean));
  const skipped=[];
  const candidates=[];

  for(const [index,action] of arr(reliabilityReceipt?.nextActions).entries()){
    const normalized=candidateFromAction(action,index);
    if(normalized.skip){skipped.push(normalized.skip);continue;}
    if(excluded.has(normalized.candidate.routeId)){
      skipped.push({routeId:normalized.candidate.routeId,type:normalized.candidate.type,reason:'fresh-preparation-evidence-already-present'});
      continue;
    }
    candidates.push(normalized.candidate);
  }

  const selected=selectDiversified(candidates,limit);
  const jobs=selected.map(item=>({
    type:'prometheus.commercial.opportunity.prepare',
    consequenceClass:'LOCAL_PREPARATION',
    payload:{
      opportunityId:item.opportunityId,
      ...(date?{date}:{}),
      reliabilityActionType:item.type,
      reliabilityRouteId:item.routeId,
      reliabilityFailureDomain:item.failureDomain,
      reliabilityReasonCodes:arr(item.action.reasonCodes)
    },
    sourceAction:{type:item.type,routeId:item.routeId,failureDomain:item.failureDomain}
  }));

  return {
    ok:true,
    schemaVersion:ECONOMIC_RELIABILITY_AUTOPREP_VERSION,
    status:jobs.length?'ECONOMIC_RELIABILITY_PREPARATION_JOBS_READY':'NO_SAFE_RELIABILITY_PREPARATION_JOBS',
    jobs,
    skipped,
    excludedFreshPreparationRouteCount:excluded.size,
    eligibleCandidateCount:candidates.length,
    selectedFailureDomains:[...new Set(selected.map(x=>x.failureDomain).filter(Boolean))],
    diversityHeuristic:'DISTINCT_OBSERVED_FAILURE_DOMAIN_FIRST_THEN_ORIGINAL_PRIORITY_FILL',
    independenceClaimed:false,
    externalEffectAuthority:'NONE',
    moneyAuthority:'NONE',
    truthBoundary:'Fresh preparation memory suppresses redundant local prep so bounded bandwidth advances across the catalog. Distinct failure-domain labels are scheduling hints only and NEVER prove independence. These jobs only compile existing local commercial preparation packets and cannot grant authority, create trials, or alter reliability probability.'
  };
}
