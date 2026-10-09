/**
 * UberMind W23: Same-model, same-token-geometry API tariff optimizer.
 * Uses publicly published Opus 5.5 prices as of 2026-10-09.
 * Never infers output equivalence, source authorization, account callability,
 * cache hit legitimacy, provider billing, or a real Claude Pro cost reduction.
 */
export const OPUS55_COST_FLOOR_SCHEMA='uberbond.ubermind.opus55-same-model-cost-floor.v1';
export const OPUS55_PRICING_DATE='2026-10-09';
export const OPUS55_TARIFF=Object.freeze({
  synchronous:Object.freeze({
    freshInputUsdPerMillion:4,outputUsdPerMillion:20,
    cacheHitUsdPerMillion:.2,cacheWrite5mUsdPerMillion:5,
    cacheWrite1hUsdPerMillion:8
  }),
  batch:Object.freeze({
    freshInputUsdPerMillion:2,outputUsdPerMillion:10,
    cacheHitUsdPerMillion:.1,cacheWrite5mUsdPerMillion:2.5,
    cacheWrite1hUsdPerMillion:4
  })
});
const boundedCount=n=>Number.isSafeInteger(n)&&n>=0&&n<=1000000000;
const validMoney=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1000000;
const usd=n=>Number(n.toFixed(9));
const refuse=reason=>({
  ok:false,status:'OPUS55_QUALITY_PRESERVING_TARIFF_COMPARISON_REFUSED',reason,
  paidInferencePerformed:0,realTaskQualityMatched:false,
  externalEffectAuthority:'NONE',empiricalSavingsUsd:null
});
const value=(input,output,p)=>usd((input*p.freshInputUsdPerMillion+
  output*p.outputUsdPerMillion)/1000000);
/**
 * verifiedSamePrefix is a caller-provided assumption, never an accepted
 * trust certificate. The calculation remains CONDITIONAL even when true.
 *
 * cacheWrite5mTokens and cacheWrite1hTokens count separately as part of
 * totalInputTokens. The cache bill is NOT silently thrown away, even when
 * many later reads are repeated. Refuse cache claims with zero writes inside
 * the accounting window instead of attributing past spend to $0.
 */
export function calculateOpus55SameModelCostFloor({
  totalInputTokens=1000000,totalOutputTokens=200000,
  requestCount=10,maxInputTokensPerRequest=100000,
  maxOutputTokensPerRequest=20000,
  cacheWrite5mTokens=100000,cacheWrite1hTokens=0,
  cacheReadTokens=700000,verifiedSamePrefix=false,
  batchPermitted=false,maximumAcceptableDelayMinutes=0,
  batchServiceDeadlineMinutes=4320,
  externalAdditionalCostUsd=0
}={}){
 const counts={totalInputTokens,totalOutputTokens,requestCount,
  maxInputTokensPerRequest,maxOutputTokensPerRequest,
  cacheWrite5mTokens,cacheWrite1hTokens,cacheReadTokens,
  maximumAcceptableDelayMinutes,batchServiceDeadlineMinutes};
 if(Object.values(counts).some(n=>!boundedCount(n))||
    requestCount===0||totalInputTokens+totalOutputTokens===0||
    !validMoney(externalAdditionalCostUsd)||
    typeof batchPermitted!=='boolean'||typeof verifiedSamePrefix!=='boolean')
   return refuse('bounded-numeric-workload-and-boolean-gates-required');
 if(totalOutputTokens>requestCount*maxOutputTokensPerRequest||
    totalInputTokens>requestCount*maxInputTokensPerRequest||
    maxOutputTokensPerRequest>128000||
    maxInputTokensPerRequest+maxOutputTokensPerRequest>1000000)
   return refuse('impossible-request-geometry');
 const accounted=cacheWrite5mTokens+cacheWrite1hTokens+cacheReadTokens;
 if(!Number.isSafeInteger(accounted)||accounted>totalInputTokens)
   return refuse('cache-token-overlap-or-overcount');
 const freshTokens=totalInputTokens-accounted;
 const useCache=verifiedSamePrefix&&cacheReadTokens>0&&
   (cacheWrite5mTokens+cacheWrite1hTokens)>0;
 const batchEligible=batchPermitted&&batchServiceDeadlineMinutes>0&&
   maximumAcceptableDelayMinutes>=batchServiceDeadlineMinutes;
 const base=value(totalInputTokens,totalOutputTokens,OPUS55_TARIFF.synchronous);
 const choices=[{
   route:'OPUS55_SYNCHRONOUS_NO_CACHE',mode:'SYNCHRONOUS',
   cacheUsed:false,modeledUsd:usd(base+externalAdditionalCostUsd)
 }];
 if(batchEligible)choices.push({
   route:'OPUS55_BATCH_NO_CACHE',mode:'BATCH',cacheUsed:false,
   modeledUsd:usd(value(totalInputTokens,totalOutputTokens,OPUS55_TARIFF.batch)+
     externalAdditionalCostUsd)
 });
 if(useCache){
  const price=p=>usd((freshTokens*p.freshInputUsdPerMillion+
   cacheReadTokens*p.cacheHitUsdPerMillion+
   cacheWrite5mTokens*p.cacheWrite5mUsdPerMillion+
   cacheWrite1hTokens*p.cacheWrite1hUsdPerMillion+
   totalOutputTokens*p.outputUsdPerMillion)/1000000+
   externalAdditionalCostUsd);
  choices.push({route:'OPUS55_SYNCHRONOUS_CACHE_WITH_WRITES',
    mode:'SYNCHRONOUS',cacheUsed:true,modeledUsd:price(OPUS55_TARIFF.synchronous)});
  if(batchEligible)choices.push({route:'OPUS55_BATCH_CACHE_WITH_WRITES',
    mode:'BATCH',cacheUsed:true,modeledUsd:price(OPUS55_TARIFF.batch)});
 }
 choices.sort((a,b)=>a.modeledUsd-b.modeledUsd||a.route.localeCompare(b.route));
 const best=choices[0];
 const baseAllIn=usd(base+externalAdditionalCostUsd);
 const scenarioSaving=usd(baseAllIn-best.modeledUsd);
 const readOnlyAsymptoticOpusFloor=usd((
   totalInputTokens*OPUS55_TARIFF.batch.cacheHitUsdPerMillion+
   totalOutputTokens*OPUS55_TARIFF.batch.outputUsdPerMillion
 )/1000000+externalAdditionalCostUsd);
 return {
   ok:true,status:'OPUS55_CONDITIONAL_SAME_MODEL_TARIFF_MINIMUM',
   model:'anthropic/claude-opus-5.5',pricingDate:OPUS55_PRICING_DATE,
   inputTokens:totalInputTokens,outputTokens:totalOutputTokens,requestCount,
   freshTokens,cacheReadTokens,cacheWrite5mTokens,cacheWrite1hTokens,
   verifiedSamePrefixAssumed:verifiedSamePrefix,
   cacheAdmittedToScenario:useCache,
   batchAdmittedToScenario:batchEligible,
   baselineSynchronousNoCacheUsd:baseAllIn,
   candidates:choices,lowestConditionalCandidate:best,
   conditionalModeledSavingsUsd:scenarioSaving,
   conditionalModeledReductionPercent:baseAllIn>0
     ?usd(scenarioSaving/baseAllIn*100):null,
   readOnlySteadyStatePriceFloorUsd:readOnlyAsymptoticOpusFloor,
   floorMode:'NONATTAINABLE_FROM_COLD_CACHE_WITHOUT_PRIOR_WRITES',
   authorization:'NONE',paidInferencePerformed:0,actualProviderInvoiceObserved:false,
   realTaskQualityMatched:false,empiricalSavingsUsd:null,
   subscriptionCashSavingsUsd:0,externalEffectAuthority:'NONE',
   truthBoundary:'Same supplier/model tariff arithmetic for identical total token geometry only. Cache prefixes and paid cache writes must be real; batch deadlines must genuinely fit; model identity is unchanged but identical quality of particular generated answers is not certified. No extra Claude Pro usage, paid provider call, all-in economic result, or zero-cost new frontier reasoning has been demonstrated.'
 };
}
