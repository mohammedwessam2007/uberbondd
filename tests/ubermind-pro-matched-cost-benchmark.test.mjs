import test from 'node:test';
import assert from 'node:assert/strict';
import {compareUberMindMatchedUsage as compare}
 from '../src/ubermind-pro-matched-cost-benchmark.mjs';
const receipt=(taskId,kind,changes={})=>({
 taskId,inputSha256:'sha-'+taskId,benchmarkVersion:'egg-drop-v2',
 suiteSha256:'heldout-suite-v1',validatorReceipt:'validator:'+kind+':'+taskId,
 weeklyCycleId:'2026W41',weeklyBeforePercent:kind==='baseline'?4:5.5,
 weeklyAfterPercent:kind==='baseline'?5:6.1,
 qualityScore:.95,requiredQualityFloor:.9,accepted:true,
 apiEquivalentUsd:kind==='baseline'?.47:.14,...changes
});
const standard=()=>({
 baseline:[receipt('t1','baseline'),receipt('t2','baseline',{weeklyBeforePercent:8,weeklyAfterPercent:9})],
 candidate:[receipt('t1','candidate'),receipt('t2','candidate',{weeklyBeforePercent:10,weeklyAfterPercent:10.6})]
});
test('W32 paired accepted high-quality tasks compute reported Pro quota not monthly cash',()=>{
 const r=compare(standard());
 assert.equal(r.ok,true);
 assert.equal(r.taskCount,2);
 assert.equal(r.reportedRelativeWeeklyMeterReductionPercent,40);
 assert.equal(r.reportedEfficiencyMultiplier,1.666666667);
 assert.equal(r.reportedAcceptedTasksPerWeeklyPercentagePoint,1.666666667);
 assert.equal(r.reportedApiEquivalentBaselineUsd,.94);
 assert.equal(r.reportedApiEquivalentCandidateUsd,.28);
 assert.equal(r.reportedApiEquivalentSavingsPercent,70.212765957);
 assert.equal(r.fixedMonthlySubscriptionPriceUsd,20);
 assert.equal(r.subscriptionCashSavingsUsd,0);
 assert.equal(r.providerCalls,0);
 assert.equal(r.independentVerificationPerformed,false);
});
test('W32 no live receipts refuses benchmark rather than inventing 83B quota',()=>{
 const r=compare();assert.equal(r.ok,false);
 assert.equal(r.measuredWeeklyUsageSavings,null);
});
test('W32 reject lowering quality even if usage savings enormous',()=>{
 const s=standard();s.candidate[0].qualityScore=.94;
 const r=compare(s);assert.equal(r.ok,false);
 assert.deepEqual(r.failedTaskIds,['t1']);
});
test('W32 reject even a high score when candidate is not accepted',()=>{
 const s=standard();s.candidate[1].accepted=false;
 assert.equal(compare(s).ok,false);
});
test('W32 reject different input, source suite, model-meter cycle',()=>{
 for(const k of ['inputSha256','benchmarkVersion','suiteSha256','weeklyCycleId']){
  const s=standard();s.candidate[0][k]='drift';
  assert.equal(compare(s).ok,false,k);
 }
});
test('W32 reject changed quality floor and duplicate/missing tasks',()=>{
 let s=standard();s.candidate[0].requiredQualityFloor=.8;assert.equal(compare(s).ok,false);
 s=standard();s.candidate[1].taskId='t1';assert.equal(compare(s).ok,false);
 s=standard();s.candidate[1].taskId='missing';assert.equal(compare(s).ok,false);
});
test('W32 rounded or invalid meter snapshots fail closed',()=>{
 for(const change of [{weeklyAfterPercent:5.5},{weeklyAfterPercent:5.4},
 {weeklyAfterPercent:Infinity},{weeklyBeforePercent:101},{weeklyBeforePercent:-1}]){
  const s=standard();Object.assign(s.candidate[0],change);
  assert.equal(compare(s).ok,false);
 }
});
test('W32 partial tariff amounts preserve weekly estimate but withhold API dollar claims',()=>{
 const s=standard();delete s.candidate[0].apiEquivalentUsd;
 const r=compare(s);assert.equal(r.ok,true);
 assert.equal(r.reportedApiEquivalentCandidateUsd,null);
 assert.equal(r.reportedApiEquivalentSavingsPercent,null);
});
test('W32 incomplete independent assessment provenance fails closed',()=>{
 const s=standard();s.candidate[0].validatorReceipt='';
 assert.equal(compare(s).ok,false);
});
