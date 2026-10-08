export const FAIR_FRONTIER_ROUTE_SCHEMA='uberbond.ubermind-fair-frontier-route.v1';
const safeInt=x=>Number.isSafeInteger(x)&&x>=0;
const pos=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
const safeText=x=>typeof x==='string'&&x.length>=1&&x.length<=320;
const refusal=(reason)=>({ok:false,status:'REFERENCE_ROUTE_COMPARISON_REFUSED',reason,empiricalMultiplier:null,target33333xConfirmed:false,paidCallsPerformed:0});

/**
 * Compare ACTUAL task token geometry against multiple provider-offered prices.
 * Caller price receipts and SLA policies are not independent provider proof:
 * output is planning-only until separately authenticated/custody-bound.
 */
export function compareFairFrontierRoutes({
 workload={},routes=[],candidateActualAllInMicrousd=null,
 independentPriceCustodyVerified=false,now='2026-10-08'
}={}){
 if(!safeInt(workload.inputTokens)||!safeInt(workload.outputTokens)||
   (workload.inputTokens+workload.outputTokens)<1||
   !safeInt(workload.maximumWaitMinutes)||typeof workload.batchPermitted!=='boolean'||
   !Array.isArray(routes)||!routes.length||routes.length>32)
   return refusal('bounded-task-workload-required');
 const seen=new Set(),admitted=[],excluded=[];
 for(const route of routes){
   if(!safeText(route?.model)||!safeText(route?.provider)||!safeText(route?.routeId)||
      seen.has(route.routeId)||!safeText(route?.priceEvidenceUrl)||!route.priceEvidenceUrl.startsWith('https://')||
      !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(route.priceAsOf??'')||
      !pos(route.inputUsdPerMillion)||!pos(route.outputUsdPerMillion)||
      !safeInt(route.contextTokens)||route.contextTokens<1||
      !safeInt(route.maxOutputTokens)||route.maxOutputTokens<1||
      !safeInt(route.maximumServiceWaitMinutes)||typeof route.asynchronous!=='boolean')
     return refusal('invalid-route-or-price-identity');
   seen.add(route.routeId);
   const reasons=[];
   if(route.model!==workload.requiredModel)reasons.push('NOT_MATCHED_FRONTIER_MODEL');
   if(workload.inputTokens+workload.outputTokens>route.contextTokens||
      workload.outputTokens>route.maxOutputTokens)
     reasons.push('TASK_EXCEEDS_ROUTE_CONTEXT_OR_OUTPUT_CAP');
   if(route.asynchronous&&(!workload.batchPermitted||
      route.maximumServiceWaitMinutes>workload.maximumWaitMinutes))
     reasons.push('BATCH_LATENCY_INELIGIBLE');
   if(route.priceAsOf!==now)reasons.push('STALE_PRICE_RECEIPT');
   if(reasons.length){excluded.push({routeId:route.routeId,reasons});continue;}
   const modeledMicrousd=Math.ceil(workload.inputTokens*route.inputUsdPerMillion)+
     Math.ceil(workload.outputTokens*route.outputUsdPerMillion);
   if(!safeInt(modeledMicrousd))return refusal('invalid-modeled-route-cost');
   admitted.push({routeId:route.routeId,provider:route.provider,
     asynchronous:route.asynchronous,modeledMicrousd,
     priceEvidenceUrl:route.priceEvidenceUrl,priceAsOf:route.priceAsOf});
 }
 admitted.sort((a,b)=>a.modeledMicrousd-b.modeledMicrousd||a.routeId.localeCompare(b.routeId));
 const lowest=admitted[0]??null;
 const ratio=lowest&&safeInt(candidateActualAllInMicrousd)&&candidateActualAllInMicrousd>0
   ?lowest.modeledMicrousd/candidateActualAllInMicrousd:null;
 return {ok:true,schemaVersion:FAIR_FRONTIER_ROUTE_SCHEMA,
  status:lowest?'MODELED_CHEAPEST_ELIGIBLE_FRONTIER_ROUTE':'NO_ELIGIBLE_FRONTIER_ROUTE',
  asOfDate:now,workload,
  eligibleRoutes:admitted,excludedRoutes:excluded,
  cheapestModeledRoute:lowest,
  candidateAllInCostInputMicrousd:safeInt(candidateActualAllInMicrousd)?candidateActualAllInMicrousd:null,
  conditionalModeledRatio:ratio,
  empiricalMultiplier:null,
  target33333xConfirmed:false,
  independentPriceCustodyVerified:Boolean(independentPriceCustodyVerified),
  realIndependentQualityMatched:false,
  realActualBaselineInvoiceObserved:false,
  cheapestGlobalModelFamilyProven:false,
  modelScaleSufficiencyProven:false,
  externalEffectAuthority:'NONE',paidCallsPerformed:0,
  truthBoundary:'Only same-model listed tariff and declared service eligibility are compared. Cached input, subscription terms, country/provider-specific pricing, batch acceptance, request overhead and actual paid workload require independently authenticated receipts. No general frontier-quality equivalence or empirical 33k admission is minted.'
 };
}

/** Historical 2-case bookkeeping illustration; cannot convert the already
 * observed synchronous Opus expense into an actually paid batch invoice. */
export function evaluateHistoricalTwoCaseBatchCounterfactual({
 observedSynchronousOpusUsd=0.063696,
 observedSolCandidateUsd=0.031808,
 observedEvaluatorUsd=0.0245325,
 batchDiscountFactor=0.5,
 batchWasIndependentlyEligible=false
}={}){
 if(!pos(observedSynchronousOpusUsd)||!pos(observedSolCandidateUsd)||
  !pos(observedEvaluatorUsd)||observedSolCandidateUsd<=0||
  !(batchDiscountFactor>0&&batchDiscountFactor<=1))
  return refusal('invalid-historical-paid-receipt-or-discount');
 const synchronousFactor=observedSynchronousOpusUsd/
   (observedSolCandidateUsd+observedEvaluatorUsd);
 const conditionalBatchReferenceUsd=observedSynchronousOpusUsd*batchDiscountFactor;
 return {ok:true,status:'HISTORICAL_BATCH_COUNTERFACTUAL_ONLY',
  observedHistoricSynchronousProofInclusiveFactor:synchronousFactor,
  observedHistoricCandidateOnlyFactor:observedSynchronousOpusUsd/observedSolCandidateUsd,
  modeledBatchReferenceUsd:conditionalBatchReferenceUsd,
  conditionalBatchProofInclusiveFactor:conditionalBatchReferenceUsd/
    (observedSolCandidateUsd+observedEvaluatorUsd),
  batchWasIndependentlyEligible,
  batchActuallyUsedOnOriginalReference:false,
  currentObservedNewMultiplierIncrease:0,
  empiricalGlobalMultiplier:null,target33333xConfirmed:false,
  externalEffectAuthority:'NONE',paidCallsPerformed:0,
  truthBoundary:'Historic observed synchronous Opus charges remain unchanged. Half-price batch is a CONDITIONAL hypothetical route only, not verified eligible/fulfilled for the actual historical tasks, and never a measured factor.'};
}
