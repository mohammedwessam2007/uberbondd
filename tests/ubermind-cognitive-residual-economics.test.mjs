import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateUberMindFidelityPortfolio as calc}
 from '../src/ubermind-cognitive-residual-economics.mjs';

test('W24 50 percent assumed certified reuse + same Opus batch/cache + $0.20 proof = $1.56',()=>{
 const r=calc();
 assert.equal(r.ok,true);
 assert.equal(r.baselineOpusSynchronousUsd,8);
 assert.equal(r.frontierResidualTaskUnits,5);
 assert.equal(r.remainingSameOpusInferenceUsd,1.36);
 assert.equal(r.modeledAdditionalVerificationBudgetUsd,.2);
 assert.equal(r.modeledConditionalCostUsd,1.56);
 assert.equal(r.modeledConditionalDifferenceUsd,6.44);
 assert.equal(r.modeledConditionalReductionPercent,80.5);
 assert.equal(r.selectedSameModelRoute,'OPUS55_BATCH_CACHE_WITH_WRITES');
 assert.equal(r.actualQualityMatchedSavingsUsd,null);
 assert.equal(r.independentlyMatchedFrontierQualityObserved,false);
 assert.equal(r.monthlyClaudeProSubscriptionUsd,20);
 assert.equal(r.cashSavingsVersusSameSubscriptionUsd,0);
 assert.equal(r.paidInferencePerformed,0);
});

test('W24 no reuse with proof budget is $2.92 and remains same Opus',()=>{
 const r=calc({assumedProofCertifiedReuseUnits:0});
 assert.equal(r.ok,true);
 assert.equal(r.remainingSameOpusInferenceUsd,2.72);
 assert.equal(r.modeledConditionalCostUsd,2.92);
 assert.equal(r.modeledConditionalReductionPercent,63.5);
 assert.equal(r.frontierResidualTaskUnits,10);
});
test('W24 80 percent hypothetical exact reuse yields $0.744 with assumed $0.20 verification',()=>{
 const r=calc({assumedProofCertifiedReuseUnits:8});
 assert.equal(r.ok,true);
 assert.equal(r.remainingSameOpusInferenceUsd,.544);
 assert.equal(r.modeledConditionalCostUsd,.744);
 assert.equal(r.modeledConditionalDifferenceUsd,7.256);
 assert.equal(r.modeledConditionalReductionPercent,90.7);
 assert.equal(r.frontierResidualTaskUnits,2);
});
test('W24 all work assumed already accepted skips inference but not charged verification',()=>{
 const r=calc({assumedProofCertifiedReuseUnits:10});
 assert.equal(r.ok,true);
 assert.equal(r.remainingSameOpusInferenceUsd,0);
 assert.equal(r.modeledConditionalCostUsd,.2);
 assert.equal(r.frontierResidualTaskUnits,0);
 assert.equal(r.selectedSameModelRoute,'CERTIFIED_REUSE_ASSUMED_ALL');
 assert.equal(r.actualPaidProviderChargeUsd,null);
 assert.equal(r.exactSourceProofRequiredForEverySkippedTask,true);
});
test('W24 impossible exact-reuse counts and impossible prompt shapes fail closed',()=>{
 for(const q of [
  {assumedProofCertifiedReuseUnits:11},
  {assumedProofCertifiedReuseUnits:2.5},
  {taskUnits:-1},{taskUnits:0},
  {inputTokensPerTask:-100},
  {outputTokensPerTask:128001},
  {inputTokensPerTask:990000,outputTokensPerTask:20000},
  {cacheWrite5mTokensPerRemainingTask:50000,cacheReadTokensPerRemainingTask:70000},
  {assumedValidCachePrefix:'yes'},
  {batchPermitted:'true'},
  {separateVerificationBudgetUsd:Infinity},
  {extraToolAndFailureBudgetUsd:-1},
  {monthlyClaudeProUsd:-20}
 ]){
  const r=calc(q);
  assert.equal(r.ok,false,JSON.stringify(q));
  assert.equal(r.paidInferencePerformed,0);
 }
});
test('W24 real batch deadline failure forces same Opus synchronous cache or fresh',()=>{
 const r=calc({maximumAcceptableDelayMinutes:30});
 assert.equal(r.ok,true);
 assert.equal(r.residualRouteReceipt.batchAdmittedToScenario,false);
 assert.equal(r.selectedSameModelRoute,'OPUS55_SYNCHRONOUS_CACHE_WITH_WRITES');
 assert.equal(r.remainingSameOpusInferenceUsd,2.72);
 assert.equal(r.modeledConditionalCostUsd,2.92);
});
test('W24 unproven common cache prefix cannot be priced as a cache hit',()=>{
 const r=calc({assumedValidCachePrefix:false});
 assert.equal(r.ok,true);
 assert.equal(r.residualRouteReceipt.cacheAdmittedToScenario,false);
 assert.equal(r.remainingSameOpusInferenceUsd,2);
 assert.equal(r.modeledConditionalCostUsd,2.2);
 assert.equal(r.actualQualityMatchedSavingsUsd,null);
});
test('W24 all external overhead is explicit and does not reduce fixed subscription',()=>{
 const r=calc({extraToolAndFailureBudgetUsd:1.25,separateVerificationBudgetUsd:.75});
 assert.equal(r.ok,true);
 assert.equal(r.modeledConditionalCostUsd,3.36);
 assert.equal(r.monthlyClaudeProSubscriptionUsd,20);
 assert.equal(r.cashSavingsVersusSameSubscriptionUsd,0);
 assert.equal(r.actualPaidProviderChargeUsd,null);
});