import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateUberMind55AllInMesh as calculate,
 requiredReuseForMeshCut as threshold}
 from '../src/ubermind-55-agent-mesh-total-cost.mjs';
const agents=()=>[
 {role:'haiku-source-scout',model:'haiku',calls:4,inputTokensPerCall:18000,outputTokensPerCall:2000},
 {role:'sonnet-independent-verifier',model:'sonnet',calls:1,inputTokensPerCall:30000,outputTokensPerCall:4000},
 {role:'opus-final-crown',model:'opus',calls:1,inputTokensPerCall:20000,outputTokensPerCall:3000}
];
test('W37 no reuse and no agents reproduces W36 $3.66 mix',()=>{
 const x=calculate({certifiedReuseShare:0});
 assert.equal(x.ok,true);assert.equal(x.residualMainModelApiEquivalentUsd,3.66);
 assert.equal(x.combinedApiEquivalentUsd,3.66);
 assert.equal(x.combinedApiEquivalentPriceCutPercent,54.25);
});
test('W37 six named auxiliary calls cost 0.2512 including Opus review',()=>{
 const x=calculate({auxiliaryCalls:agents(),certifiedReuseShare:0});
 assert.equal(x.auxiliaryCallCount,6);
 assert.equal(x.auxiliaryAgentAndExtraVerificationApiEquivalentUsd,.2512);
 assert.deepEqual(x.auxiliaryCallsBreakdown.map(z=>z.apiEquivalentUsd),[.0112,.1,.14]);
});
test('W37 40% certified source reuse with realistic bounded scouts and reviewer is 69.41% API cut',()=>{
 const x=calculate({auxiliaryCalls:agents()});
 assert.equal(x.baselineAllOpusApiEquivalentUsd,8);
 assert.equal(x.residualMainModelApiEquivalentUsd,2.196);
 assert.equal(x.combinedApiEquivalentUsd,2.4472);
 assert.equal(x.combinedApiEquivalentPriceCutPercent,69.41);
 assert.equal(x.frontierQualityParityProven,false);
 assert.equal(x.actualClaudeProFiveHourUsagePercent,null);
});
test('W37 60% source reuse with same six actual counted scout/review calls saves 78.56% tariff',()=>{
 const x=calculate({auxiliaryCalls:agents(),certifiedReuseShare:.6});
 assert.equal(x.combinedApiEquivalentUsd,1.7152);
 assert.equal(x.combinedApiEquivalentPriceCutPercent,78.56);
});
test('W37 80% reuse gives 87.71% modeled cut with full overhead',()=>{
 const x=calculate({auxiliaryCalls:agents(),certifiedReuseShare:.8});
 assert.equal(x.combinedApiEquivalentUsd,.9832);
 assert.equal(x.combinedApiEquivalentPriceCutPercent,87.71);
});
test('W37 break even 90% price cut needs 85.00546 percent source-certified reuse',()=>{
 const x=threshold({auxiliaryCalls:agents(),desiredApiEquivalentCutPercent:90});
 assert.equal(x.targetReachableWithDeclaredFixedAgentOverhead,true);
 assert.equal(x.requiredCertifiedReuseShare,.850054645);
});
test('W37 break even 95% tariff cut needs 95.9344 percent source reuse',()=>{
 const x=threshold({auxiliaryCalls:agents(),desiredApiEquivalentCutPercent:95});
 assert.equal(x.requiredCertifiedReuseShare,.959344262);
});
test('W37 99% cut impossible if scout and review calls are fixed',()=>{
 const x=threshold({auxiliaryCalls:agents(),desiredApiEquivalentCutPercent:99});
 assert.equal(x.targetReachableWithDeclaredFixedAgentOverhead,false);
 assert.equal(x.requiredCertifiedReuseShare,null);
 assert.equal(x.completeReuseAllInFloorApiEquivalentUsd,.2512);
});
test('W37 if all subtask work already certified and scouts disabled, costs zero fresh inference',()=>{
 const x=calculate({certifiedReuseShare:1,auxiliaryCalls:[]});
 assert.equal(x.combinedApiEquivalentUsd,0);
 assert.equal(x.frontierQualityParityProven,false);
});
test('W37 tenfold scout overuse may erase intended savings',()=>{
 const x=calculate({certifiedReuseShare:0,auxiliaryCalls:[
  {role:'opus-unnecessary',model:'opus',calls:10,inputTokensPerCall:100000,outputTokensPerCall:20000}
 ]});
 assert.equal(x.auxiliaryAgentAndExtraVerificationApiEquivalentUsd,8);
 assert.equal(x.combinedApiEquivalentUsd,11.66);
 assert.ok(x.combinedApiEquivalentPriceCutPercent<0);
});
test('W37 Haiku prompt larger than 100k billed at higher tier',()=>{
 const x=calculate({certifiedReuseShare:1,auxiliaryCalls:[
  {role:'long-scout',model:'haiku',calls:1,inputTokensPerCall:100001,outputTokensPerCall:2000}
 ]});
 assert.equal(x.auxiliaryCallsBreakdown[0].haikuLongTier,true);
 assert.equal(x.combinedApiEquivalentUsd,.0550005);
});
test('W37 reject malformed calls and bad model share',()=>{
 for(const calls of [[{role:'bad',model:'other',calls:1,inputTokensPerCall:1,outputTokensPerCall:1}],
   [{role:'bad',model:'haiku',calls:-1,inputTokensPerCall:1,outputTokensPerCall:1}],
   [{role:'bad',model:'haiku',calls:1,inputTokensPerCall:0,outputTokensPerCall:1}]]){
  assert.equal(calculate({auxiliaryCalls:calls}).ok,false);
 }
 assert.equal(calculate({opusShare:2,sonnetShare:-1,haikuShare:0}).ok,false);
 assert.equal(threshold({desiredApiEquivalentCutPercent:101}).ok,false);
});
test('W37 Pro bill, real quota and quality claims remain truthful',()=>{
 const x=calculate({auxiliaryCalls:agents()});
 assert.equal(x.proMonthlySubscriptionUsd,20);
 assert.equal(x.subscriptionCashPriceCutPercent,0);
 assert.equal(x.actualClaudeProWeeklyUsagePercent,null);
 assert.equal(x.combinedCostPerAcceptedTaskVerified,false);
 assert.equal(x.paidApiCallsPerformed,0);
 assert.equal(x.extraPaidSpendingAuthorizedUsd,0);
 assert.equal(x.externalEffectAuthority,'NONE');
});