import test from 'node:test';
import assert from 'node:assert/strict';
import {compareFairFrontierRoutes,evaluateHistoricalTwoCaseBatchCounterfactual}
 from '../src/ubermind-cheapest-eligible-reference.mjs';
const base={
 model:'anthropic/claude-opus-5.5',provider:'Anthropic',
 routeId:'opus-regular',priceEvidenceUrl:'https://openrouter.ai/anthropic/claude-opus-5.5/',
 priceAsOf:'2026-10-08',inputUsdPerMillion:4,outputUsdPerMillion:20,
 contextTokens:1_000_000,maxOutputTokens:128_000,
 asynchronous:false,maximumServiceWaitMinutes:0
};
const batch={...base,routeId:'opus-batch',priceEvidenceUrl:'https://openrouter.ai/anthropic/claude-opus-5.5:batch/',
 inputUsdPerMillion:2,outputUsdPerMillion:10,
 asynchronous:true,maximumServiceWaitMinutes:1440};
const work=(extra={})=>({requiredModel:base.model,inputTokens:1000,outputTokens:500,
 maximumWaitMinutes:1440,batchPermitted:true,...extra});
test('same Opus model permits cheaper batch only when workload can wait',()=>{
 const r=compareFairFrontierRoutes({workload:work(),routes:[base,batch]});
 assert.equal(r.ok,true);
 assert.equal(r.cheapestModeledRoute.routeId,'opus-batch');
 assert.equal(r.cheapestModeledRoute.modeledMicrousd,7000);
 assert.equal(r.eligibleRoutes[1].modeledMicrousd,14000);
 assert.equal(r.empiricalMultiplier,null);
 assert.equal(r.target33333xConfirmed,false);
});
test('latency-sensitive task must not masquerade as batch-cost-eligible',()=>{
 const r=compareFairFrontierRoutes({workload:work({maximumWaitMinutes:30,batchPermitted:false}),
 routes:[base,batch]});
 assert.equal(r.cheapestModeledRoute.routeId,'opus-regular');
 assert.ok(r.excludedRoutes[0].reasons.includes('BATCH_LATENCY_INELIGIBLE'));
});
test('route output-context overflow refuses route rather than inflating reference',()=>{
 const r=compareFairFrontierRoutes({workload:work({inputTokens:1000,outputTokens:200000}),
 routes:[base,batch]});
 assert.equal(r.ok,true);
 assert.equal(r.status,'NO_ELIGIBLE_FRONTIER_ROUTE');
 assert.equal(r.eligibleRoutes.length,0);
 assert.equal(r.empiricalMultiplier,null);
});
test('stale price route is excluded, not silently refreshed',()=>{
 const r=compareFairFrontierRoutes({workload:work(),routes:[base,batch],now:'2026-10-09'});
 assert.equal(r.status,'NO_ELIGIBLE_FRONTIER_ROUTE');
 assert.ok(r.excludedRoutes.every(x=>x.reasons.includes('STALE_PRICE_RECEIPT')));
});
test('wrong model cannot claim same frontier quality merely because cheaper',()=>{
 const r=compareFairFrontierRoutes({workload:work(),
 routes:[{...base,model:'typesafe/jev-1.13',routeId:'jev-unauthorized',
 inputUsdPerMillion:.042,outputUsdPerMillion:0}]});
 assert.equal(r.status,'NO_ELIGIBLE_FRONTIER_ROUTE');
 assert.ok(r.excludedRoutes[0].reasons.includes('NOT_MATCHED_FRONTIER_MODEL'));
});
test('historic measured 2-task result remains the only historic factor, batch is conditional',()=>{
 const r=evaluateHistoricalTwoCaseBatchCounterfactual();
 assert.equal(r.ok,true);
 assert.ok(Math.abs(r.observedHistoricCandidateOnlyFactor-2.002515)<.00001);
 assert.ok(Math.abs(r.observedHistoricSynchronousProofInclusiveFactor-1.1305544)<.00001);
 assert.ok(r.conditionalBatchProofInclusiveFactor<1);
 assert.equal(r.currentObservedNewMultiplierIncrease,0);
 assert.equal(r.empiricalGlobalMultiplier,null);
 assert.equal(r.batchActuallyUsedOnOriginalReference,false);
});
test('fabricated zero denominator is rejected rather than declaring infinite savings',()=>{
 const r=evaluateHistoricalTwoCaseBatchCounterfactual({observedSolCandidateUsd:0});
 assert.equal(r.ok,false);
 assert.equal(r.empiricalMultiplier,null);
});
test('duplicate route identity and malformed evidence fail closed',()=>{
 const r=compareFairFrontierRoutes({workload:work(),routes:[base,base]});
 assert.equal(r.ok,false);
 assert.equal(r.empiricalMultiplier,null);
});
