export const ECONOMIC_RELIABILITY_AUTOPREP_VERSION='uberbond.economic-reliability-autoprep.v1';

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

export function compileEconomicReliabilityPreparationJobs({reliabilityReceipt,maxJobs=8,date=null}={}){
  const limit=Math.max(0,Math.min(32,Number.isSafeInteger(maxJobs)?maxJobs:8));
  const jobs=[];
  const skipped=[];
  const seen=new Set();

  for(const action of arr(reliabilityReceipt?.nextActions)){
    if(jobs.length>=limit) break;
    const type=text(action?.type,120);
    const opportunityId=commercialOpportunityId(action?.routeId);
    if(!SAFE_PREPARATION_ACTIONS.has(type)){
      skipped.push({routeId:action?.routeId||null,type:type||null,reason:'action-not-local-preparation-safe'});
      continue;
    }
    if(!opportunityId){
      skipped.push({routeId:action?.routeId||null,type,reason:'commercial-route-required'});
      continue;
    }
    const key=`${type}:${opportunityId}`;
    if(seen.has(key)) continue;
    seen.add(key);
    jobs.push({
      type:'prometheus.commercial.opportunity.prepare',
      consequenceClass:'LOCAL_PREPARATION',
      payload:{
        opportunityId,
        ...(date?{date}:{}),
        reliabilityActionType:type,
        reliabilityRouteId:action.routeId,
        reliabilityReasonCodes:arr(action.reasonCodes)
      },
      sourceAction:{type,routeId:action.routeId}
    });
  }

  return {
    ok:true,
    schemaVersion:ECONOMIC_RELIABILITY_AUTOPREP_VERSION,
    status:jobs.length?'ECONOMIC_RELIABILITY_PREPARATION_JOBS_READY':'NO_SAFE_RELIABILITY_PREPARATION_JOBS',
    jobs,
    skipped,
    externalEffectAuthority:'NONE',
    moneyAuthority:'NONE',
    truthBoundary:'These jobs only compile existing local commercial preparation packets. They do not prove dependency factors, grant policy clearance, close live execution dependencies, send messages, spend money, call providers, create trials, or alter reliability probability. Any resulting evidence must pass the normal dependency, authority, execution, and calibration gates before it can affect the eleven-nine model.'
  };
}
