import test from 'node:test';
import assert from 'node:assert/strict';
import {
 compareUberMindFiveHourUsage as compare,
 uberMindFiveHourGoal as goal
} from '../src/ubermind-five-hour-quality-budget.mjs';

const run=(name,change={})=>({
 taskSha256:'sha-one-hard-task',
 sourceSha256:'repo-source-abcdef',
 acceptanceSuiteSha256:'blind-held-out-qa',
 benchmarkVersion:'v1',
 qualityRubricSha256:'rubric-stable',
 sessionWindowId:name,
 usageMeterReceipt:'private-usage-'+name,
 independentGraderReceipt:'grading-'+name,
 usageBeforePercent:0,
 usageAfterPercent:name==='baseline'?100:30,
 qualityScore:.96,requiredQualityFloor:.92,accepted:true,
 paidExternalApiUsd:0,...change
});
const args=()=>({
 baseline:run('baseline'),
 candidate:run('uberMind'),
 sameClaudeProAccountAttested:true,
 graderIndependentOfCandidateAttested:true,
 wholeWorkflowMeteredAttested:true,
 noSeparatePaidInferenceAttested:true
});
test('W33 100%-to-30% quality-matched receipts report 70% only as attested',()=>{
 const r=compare(args());
 assert.equal(r.ok,true);
 assert.equal(r.reportedReductionPercent,70);
 assert.equal(r.reportedComparableTasksPerFiveHourAllowanceMultiplier,3.333333333);
 assert.equal(r.baselineReportedFiveHourUsagePoints,100);
 assert.equal(r.candidateReportedFiveHourUsagePoints,30);
 assert.equal(r.acceptedQualityParityReported,true);
 assert.equal(r.actualMeasuredUsagePercent,null);
 assert.equal(r.independentlyCertifiedQuality,false);
 assert.equal(r.providerCallsPerformed,0);
 assert.equal(r.actualSubscriptionCashSavingsUsd,0);
});
test('W33 no account or independent grade attestation refuses',()=>{
 for(const k of ['sameClaudeProAccountAttested',
 'graderIndependentOfCandidateAttested','wholeWorkflowMeteredAttested',
 'noSeparatePaidInferenceAttested']){
  const a=args();a[k]=false;
  assert.equal(compare(a).ok,false,k);
 }
});
test('W33 no receipts refuses to invent a savings percentage',()=>{
 const r=compare();
 assert.equal(r.ok,false);
 assert.equal(r.actualMeasuredUsagePercent,null);
});
test('W33 exact benchmark/source/suite/rubric drift refuses despite 70% cheap',()=>{
 for(const k of ['taskSha256','sourceSha256','acceptanceSuiteSha256',
 'benchmarkVersion','qualityRubricSha256']){
  const a=args();a.candidate[k]='changed';
  assert.equal(compare(a).ok,false,k);
 }
});
test('W33 same five-hour window is not allowed for full-window baseline',()=>{
 const a=args();a.candidate.sessionWindowId=a.baseline.sessionWindowId;
 assert.equal(compare(a).ok,false);
});
test('W33 missing or decreasing five-hour usage receipt refuses',()=>{
 for(const changes of [
  {usageMeterReceipt:''},{usageBeforePercent:30,usageAfterPercent:20},
  {usageAfterPercent:0},{usageAfterPercent:Infinity},{usageAfterPercent:101},
  {usageBeforePercent:-1}]){
  const a=args();Object.assign(a.candidate,changes);
  assert.equal(compare(a).ok,false,JSON.stringify(changes));
 }
});
test('W33 inferior quality or unaccepted work cannot be called cost success',()=>{
 for(const changes of [
  {qualityScore:.95},{qualityScore:.2},{accepted:false},
  {requiredQualityFloor:.99},{independentGraderReceipt:''}
 ]){
  const a=args();Object.assign(a.candidate,changes);
  assert.equal(compare(a).ok,false,JSON.stringify(changes));
 }
});
test('W33 no paid API plus subscription-only flag is strict',()=>{
 const a=args();a.candidate.paidExternalApiUsd=.00001;
 assert.equal(compare(a).ok,false);
 const missingBudgetAttestation=args();
 missingBudgetAttestation.noSeparatePaidInferenceAttested=false;
 assert.equal(compare(missingBudgetAttestation).ok,false);
});
test('W33 candidate using more usage is surfaced as regression, never victory',()=>{
 const a=args();a.baseline.usageAfterPercent=40;
 a.candidate.usageAfterPercent=80;
 const r=compare(a);
 assert.equal(r.ok,true);
 assert.equal(r.candidateBetterThanBaselineOnReportedMeter,false);
 assert.equal(r.reportedReductionPercent,-100);
 assert.equal(r.reportedComparableTasksPerFiveHourAllowanceMultiplier,.5);
});
test('W33 target only 30% does not assert achieved token efficiency',()=>{
 const t=goal();
 assert.equal(t.ok,true);
 assert.equal(t.targetReductionPercent,70);
 assert.equal(t.conditionalThroughputMultiplier,3.333333333);
 assert.equal(t.observedActualFiveHourUsagePercent,null);
 assert.equal(t.acceptedQualityPreservedObserved,false);
 assert.equal(t.noPaidApiAllowed,true);
 assert.equal(goal({targetFiveHourUsagePercent:-2}).ok,false);
 assert.equal(goal({normalTaskFiveHourUsagePercent:0}).ok,false);
});
