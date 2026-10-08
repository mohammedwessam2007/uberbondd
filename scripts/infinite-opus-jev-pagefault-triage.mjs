import { createGovernedJevRuntimeService } from '../src/jev-governed-runtime-service.mjs';

export const NATIVE_JEV_TRIAGE_MAX_CALLS=16;
export const NATIVE_JEV_TRIAGE_MAX_TOTAL_USD=.005;

export async function runPendingNativeJevTriage({
  store,apiKey,paidAuthorization,marketSnapshot,fetchImpl=fetch,clock=Date.now,
  maxCalls=NATIVE_JEV_TRIAGE_MAX_CALLS,maxTotalUsd=NATIVE_JEV_TRIAGE_MAX_TOTAL_USD
}={}){
  if(!Number.isSafeInteger(maxCalls)||maxCalls<1||maxCalls>NATIVE_JEV_TRIAGE_MAX_CALLS)
    throw new Error('bounded-native-jev-triage-call-count-required');
  if(!Number.isFinite(Number(maxTotalUsd))||Number(maxTotalUsd)<=0||Number(maxTotalUsd)>NATIVE_JEV_TRIAGE_MAX_TOTAL_USD)
    throw new Error('bounded-native-jev-triage-total-spend-required');

  const service=createGovernedJevRuntimeService({store,apiKey,paidAuthorization,marketSnapshot,fetchImpl,clock});
  const pending=await service.runtime.listPendingJevTriage({limit:maxCalls});
  if(!pending.ok)return {...pending,paidInferenceTriggered:false};
  let observedCostMicrousd=0,knownProviderCalls=0,unknownProviderCalls=false,unknownCost=false;
  const results=[];
  for(const row of pending.rows){
    const remainingMicrousd=Math.floor(Number(maxTotalUsd)*1e6)-observedCostMicrousd;
    if(remainingMicrousd<100)break;
    const perCallMaxUsd=Math.min(.001,remainingMicrousd/1e6);
    const out=await service.triagePageFault({taskId:row.taskId,maximumSpendUsd:perCallMaxUsd});
    const n=out.providerCallsPerformed;
    const callsKnown=Number.isSafeInteger(n)&&n>=0;
    const observedCost=out.observedCostMicrousd;
    const costKnown=Number.isSafeInteger(observedCost)&&observedCost>=0;
    const provablyNoCall=callsKnown&&n===0;
    const costMicrousd=costKnown?observedCost:provablyNoCall?0:null;
    if(callsKnown)knownProviderCalls+=n;
    else unknownProviderCalls=true;
    if(costMicrousd===null)unknownCost=true;
    else observedCostMicrousd+=costMicrousd;
    results.push({
      taskId:row.taskId,
      ok:out.ok===true&&callsKnown&&costMicrousd!==null,
      status:out.status??null,
      recommendedLane:out.recommendedLane??null,
      reviewRecommendation:out.reviewRecommendation??null,
      observedCostUsd:costMicrousd===null?null:costMicrousd/1e6,
      providerCallsPerformed:callsKnown?n:null
    });
    // Stop immediately for ANY failed, unknown, or partially settled call:
    // the next loop iteration must never spend against an uncertain total.
    if(out.ok!==true||!callsKnown||costMicrousd===null)break;
  }
  return {
    ok:!unknownProviderCalls&&!unknownCost&&results.every(x=>x.ok),
    status:unknownProviderCalls||unknownCost
      ?'NATIVE_JEV_TRIAGE_DISPATCH_OR_COST_UNKNOWN_HOLD'
      :results.length?'NATIVE_JEV_PAGE_FAULT_TRIAGE_BATCH_OBSERVED':'NO_UNTRIAGED_NATIVE_PAGE_FAULTS',
    pendingAtStart:pending.count,
    triagedCount:results.filter(x=>x.ok&&x.status==='JEV_PAGE_FAULT_TRIAGE_OBSERVED_NONAUTHORITATIVE').length,
    providerCallsPerformed:unknownProviderCalls?null:knownProviderCalls,
    observedProviderCallsLowerBound:knownProviderCalls,
    actualSpendUsd:unknownCost?null:observedCostMicrousd/1e6,
    observedSpendLowerBoundUsd:observedCostMicrousd/1e6,
    automaticRetryAuthorized:false,
    maximumSpendUsd:Number(maxTotalUsd),
    results,
    semanticAuthority:'NONE',
    crownSuppressionAuthority:'NONE',
    businessEffectAuthority:'NONE',
    externalEffectAuthority:'NONE',
    truthBoundary:'Jev may classify and route unresolved native semantic page faults, but every debt remains unresolved until independently certified bounded authority or frontier authority settles it.'
  };
}
