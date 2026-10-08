import {compareFairFrontierRoutes,evaluateHistoricalTwoCaseBatchCounterfactual}
 from '../src/ubermind-cheapest-eligible-reference.mjs';

export function runUberMindCheapestReferenceDoctor(){
 const asOf='2026-10-08';
 const requiredModel='anthropic/claude-opus-5.5';
 const base={
  model:requiredModel,provider:'Anthropic',
  priceAsOf:asOf,contextTokens:1_000_000,maxOutputTokens:128_000,
  maximumServiceWaitMinutes:0,asynchronous:false
 };
 const standard={...base,routeId:'opus-standard',
  priceEvidenceUrl:'https://openrouter.ai/anthropic/claude-opus-5.5/',
  inputUsdPerMillion:4,outputUsdPerMillion:20};
 const batch={...base,routeId:'opus-batch',
  priceEvidenceUrl:'https://openrouter.ai/anthropic/claude-opus-5.5:batch/',
  inputUsdPerMillion:2,outputUsdPerMillion:10,
  asynchronous:true,maximumServiceWaitMinutes:1440};
 const workload={requiredModel,inputTokens:1000,outputTokens:500,
  maximumWaitMinutes:1440,batchPermitted:true};
 const batchEligible=compareFairFrontierRoutes({
  workload,routes:[standard,batch],now:new Date().toISOString().slice(0,10)});
 const urgent=compareFairFrontierRoutes({
  workload:{...workload,maximumWaitMinutes:30,batchPermitted:false},
  routes:[standard,batch],now:new Date().toISOString().slice(0,10)});
 const historical=evaluateHistoricalTwoCaseBatchCounterfactual();
 return {
  schemaVersion:'uberbond.ubermind-reference-route-doctor.v1',
  ok:batchEligible.ok&&urgent.ok&&historical.ok,
  status:'HISTORICAL_MULTIPLIER_UNCHANGED_BENCHMARK_ROUTE_AUDIT',
  providerListedPriceDate:asOf,
  providerPriceSources:[standard.priceEvidenceUrl,batch.priceEvidenceUrl],
  modeledBatchEligibleCheapestRoute:batchEligible.cheapestModeledRoute?.routeId??null,
  modeledUrgentCheapestRoute:urgent.cheapestModeledRoute?.routeId??null,
  twoCaseHistoricalModelOnlyFactor:historical.observedHistoricCandidateOnlyFactor,
  twoCaseHistoricalProofInclusiveFactor:historical.observedHistoricSynchronousProofInclusiveFactor,
  conditionalBatchProofInclusiveFactor:historical.conditionalBatchProofInclusiveFactor,
  historicBatchEligibilityIndependentlyEstablished:false,
  historicalActualProviderBillsReplaced:false,
  measuredGeneralMultiplier:null,
  measuredMultiplierIncreaseThisCycle:0,
  target33333xVerified:false,
  paidInferenceCallsPerformed:0,
  truthBoundary:'This doctor compares listed synchronous and half-price batch prices under declared latency constraints. Historical two-task Opus was billed synchronously; the 0.5653x batch hypothetical is not measured, independently qualified or a production economics claim.'
 };
}
