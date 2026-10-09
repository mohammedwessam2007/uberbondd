import test from 'node:test';
import assert from 'node:assert/strict';
import {
 calculateOpus55SameModelCostFloor as floor,
 OPUS55_TARIFF,OPUS55_PRICING_DATE
} from '../src/ubermind-opus-quality-cost-floor.mjs';

const eligible=()=>({
  verifiedSamePrefix:true,batchPermitted:true,
  maximumAcceptableDelayMinutes:4320,batchServiceDeadlineMinutes:4320
});
test('W23 same-model price floor includes cache-writing cost and preserves Opus identity',()=>{
 const r=floor(eligible());
 assert.equal(r.ok,true);
 assert.equal(r.model,'anthropic/claude-opus-5.5');
 assert.equal(r.pricingDate,OPUS55_PRICING_DATE);
 assert.equal(r.baselineSynchronousNoCacheUsd,8);
 assert.equal(r.lowestConditionalCandidate.route,'OPUS55_BATCH_CACHE_WITH_WRITES');
 assert.equal(r.lowestConditionalCandidate.modeledUsd,2.72);
 assert.equal(r.conditionalModeledSavingsUsd,5.28);
 assert.equal(r.conditionalModeledReductionPercent,66);
 assert.equal(r.realTaskQualityMatched,false);
 assert.equal(r.actualProviderInvoiceObserved,false);
 assert.equal(r.subscriptionCashSavingsUsd,0);
 assert.equal(r.paidInferencePerformed,0);
 assert.equal(r.externalEffectAuthority,'NONE');
});
test('W23 pricing covers four same-model tariff options and rejects invented quality gain',()=>{
 const r=floor(eligible());
 const costs=Object.fromEntries(r.candidates.map(c=>[c.route,c.modeledUsd]));
 assert.deepEqual(costs,{
  OPUS55_BATCH_CACHE_WITH_WRITES:2.72,
  OPUS55_BATCH_NO_CACHE:4,
  OPUS55_SYNCHRONOUS_CACHE_WITH_WRITES:5.44,
  OPUS55_SYNCHRONOUS_NO_CACHE:8
 });
 assert.equal(r.readOnlySteadyStatePriceFloorUsd,2.1);
 assert.equal(r.floorMode,'NONATTAINABLE_FROM_COLD_CACHE_WITHOUT_PRIOR_WRITES');
 assert.equal(r.empiricalSavingsUsd,null);
});
test('W23 if batch deadline is unavailable, select same Opus sync-cache, not fake batch',()=>{
 const r=floor({...eligible(),maximumAcceptableDelayMinutes:30});
 assert.equal(r.ok,true);
 assert.equal(r.batchAdmittedToScenario,false);
 assert.equal(r.lowestConditionalCandidate.modeledUsd,5.44);
 assert.equal(r.lowestConditionalCandidate.route,'OPUS55_SYNCHRONOUS_CACHE_WITH_WRITES');
});
test('W23 no claimed cache prefix proof, do not count hit discounts',()=>{
 const r=floor({...eligible(),verifiedSamePrefix:false});
 assert.equal(r.ok,true);
 assert.equal(r.cacheAdmittedToScenario,false);
 assert.equal(r.lowestConditionalCandidate.modeledUsd,4);
 assert.equal(r.candidates.some(c=>c.cacheUsed),false);
});
test('W23 no cache writes in accounting horizon, refuse zero-cost cached read story',()=>{
 const r=floor({...eligible(),cacheWrite5mTokens:0,cacheWrite1hTokens:0});
 assert.equal(r.ok,true);
 assert.equal(r.cacheAdmittedToScenario,false);
 assert.equal(r.lowestConditionalCandidate.modeledUsd,4);
});
test('W23 1h writes are charged at correct higher tariffs',()=>{
 const r=floor({...eligible(),cacheWrite5mTokens:0,cacheWrite1hTokens:100000});
 assert.equal(r.ok,true);
 assert.equal(r.lowestConditionalCandidate.modeledUsd,2.87);
 assert.equal(OPUS55_TARIFF.batch.cacheWrite1hUsdPerMillion,4);
});
test('W23 additional real overhead costs are accounted equally, no hidden subsidy',()=>{
 const r=floor({...eligible(),externalAdditionalCostUsd:.8});
 assert.equal(r.ok,true);
 assert.equal(r.baselineSynchronousNoCacheUsd,8.8);
 assert.equal(r.lowestConditionalCandidate.modeledUsd,3.52);
 assert.equal(r.conditionalModeledSavingsUsd,5.28);
});
test('W23 zero, noninteger, overcount, impossible output geometry fail closed',()=>{
 for(const args of [
  {totalInputTokens:-2},{cacheReadTokens:1000001},
  {cacheWrite5mTokens:400000,cacheReadTokens:700000},
  {totalInputTokens:Infinity},{requestCount:0},
  {totalInputTokens:0,totalOutputTokens:0,
    cacheWrite5mTokens:0,cacheReadTokens:0},
  {maxOutputTokensPerRequest:140000},
  {maxInputTokensPerRequest:999999,maxOutputTokensPerRequest:128000},
  {totalOutputTokens:300000},{verifiedSamePrefix:'true'},
  {batchPermitted:'yes'},{externalAdditionalCostUsd:NaN}
 ]){
  const r=floor({...eligible(),...args});
  assert.equal(r.ok,false,'expected refusal: '+JSON.stringify(args));
  assert.equal(r.paidInferencePerformed,0);
  assert.equal(r.empiricalSavingsUsd,null);
 }
});
test('W23 no batch and no cache: same Opus ordinary API rate, never invents 33k',()=>{
 const r=floor({cacheReadTokens:0,cacheWrite5mTokens:0});
 assert.equal(r.ok,true);
 assert.equal(r.lowestConditionalCandidate.modeledUsd,8);
 assert.equal(r.conditionalModeledReductionPercent,0);
 assert.equal(r.realTaskQualityMatched,false);
 assert.equal(r.subscriptionCashSavingsUsd,0);
});
