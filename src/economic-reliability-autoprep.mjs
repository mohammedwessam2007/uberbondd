export const ECONOMIC_RELIABILITY_AUTOPREP_VERSION='uberbond.economic-reliability-autoprep.v1.1';

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

  // First pass: spread scarce preparation bandwidth across distinct observed
  // failure-domain labels. This is only a scheduling heuristic. It does NOT
  // prove statistical independence; the formal reliability engine still
  // requires structured dependency receipts before probabilities multiply.
  for(const item of candidates){
    if(selected.length>=limit) break;
    const key=`${item.type}:${item.opportunityId}`;
    if(selectedKeys.has(key)||!item.failureDomain||seenDomains.has(item.failureDomain)) continue;
    selected.push(item);
    selectedKeys.add(key);
    seenDomains.add(item.failureDomain);
  }

  // Second pass: preserve original controller priority while filling unused
  // capacity, including same-domain or unlabeled work that still deserves prep.
  for(const item of candidates){
    if(selected.length>=limit) break;
    const key=`${item.type}:${item.opportunityId}`;
    if(selectedKeys.has(key)) continue;
    selected.push(item);
    selectedKeys.add(key);
  }
  return selected;
}

export function compileEconomicReliabilityPreparationJobs({reliabilityReceipt,maxJobs=8,date=null}={}){
  const limit=Math.max(0,Math.min(32,Number.isSafeInteger(maxJobs)?maxJobs:8));
  const skipped=[];
  const candidates=[];

  for(const [index,action] of arr(reliabilityReceipt?.nextActions).entries()){
    const normalized=candidateFromAction(action,index);
    if(normalized.skip){skipped.push(normalized.skip);continue;}
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
    eligibleCandidateCount:candidates.length,
    selectedFailureDomains:[...new Set(selected.map(x=>x.failureDomain).filter(Boolean))],
    diversityHeuristic:'DISTINCT_OBSERVED_FAILURE_DOMAIN_FIRST_THEN_ORIGINAL_PRIORITY_FILL',
    independenceClaimed:false,
    externalEffectAuthority:'NONE',
    moneyAuthority:'NONE',
    truthBoundary:'Preparation bandwidth is spread across distinct observed failure-domain labels before same-domain fill, but this scheduling heuristic NEVER proves independence. These jobs only compile existing local commercial preparation packets. They do not prove dependency factors, grant policy clearance, close live execution dependencies, send messages, spend money, call providers, create trials, or alter reliability probability. Formal reliability still requires fresh calibrated outcomes plus evidenced structured dependency separation.'
  };
}
