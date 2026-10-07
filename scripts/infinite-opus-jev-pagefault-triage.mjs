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
  let actualMicrousd=0,providerCalls=0;
  const results=[];
  for(const row of pending.rows){
    const remainingMicrousd=Math.floor(Number(maxTotalUsd)*1e6)-actualMicrousd;
    if(remainingMicrousd<100)break;
    const perCallMaxUsd=Math.min(.001,remainingMicrousd/1e6);
    const out=await service.triagePageFault({taskId:row.taskId,maximumSpendUsd:perCallMaxUsd});
    const cost=Number(out.observedCostMicrousd??0);
    if(Number.isFinite(cost)&&cost>=0)actualMicrousd+=cost;
    providerCalls+=Number(out.providerCallsPerformed??0);
    results.push({
      taskId:row.taskId,
      ok:out.ok===true,
      status:out.status??null,
      recommendedLane:out.recommendedLane??null,
      reviewRecommendation:out.reviewRecommendation??null,
      observedCostUsd:Number.isFinite(cost)?cost/1e6:null,
      providerCallsPerformed:Number(out.providerCallsPerformed??0)
    });
    if(out.ok!==true&&Number(out.providerCallsPerformed??0)>0)break;
  }
  return {
    ok:results.every(x=>x.ok),
    status:results.length?'NATIVE_JEV_PAGE_FAULT_TRIAGE_BATCH_OBSERVED':'NO_UNTRIAGED_NATIVE_PAGE_FAULTS',
    pendingAtStart:pending.count,
    triagedCount:results.filter(x=>x.ok&&x.status==='JEV_PAGE_FAULT_TRIAGE_OBSERVED_NONAUTHORITATIVE').length,
    providerCallsPerformed:providerCalls,
    actualSpendUsd:actualMicrousd/1e6,
    maximumSpendUsd:Number(maxTotalUsd),
    results,
    semanticAuthority:'NONE',
    crownSuppressionAuthority:'NONE',
    businessEffectAuthority:'NONE',
    externalEffectAuthority:'NONE',
    truthBoundary:'Jev may classify and route unresolved native semantic page faults, but every debt remains unresolved until independently certified bounded authority or frontier authority settles it.'
  };
}
