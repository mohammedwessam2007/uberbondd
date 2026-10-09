/**
 * UberMind W33: same-task, same-quality five-hour Claude Pro usage comparison.
 * This module is read-only. It does not infer Anthropic quota or invoke models.
 *
 * Attribution boundary: the supplied /usage snapshots and independent grader
 * results are user-attested; this code does NOT verify the Claude account.
 */
export const UBERMIND_FIVE_HOUR_SCHEMA='uberbond.ubermind.pro.five-hour-fidelity.v1';
const text=v=>typeof v==='string'&&v.trim().length>0&&v.length<=512;
const finiteIn=(n,lo,hi)=>typeof n==='number'&&Number.isFinite(n)&&n>=lo&&n<=hi;
const rnd=n=>Number(n.toFixed(9));
const refused=reason=>({
  ok:false,status:'FIVE_HOUR_COMPARISON_NOT_ADMISSIBLE',reason,
  actualMeasuredUsagePercent:null,qualityParityIndependentlyVerified:false,
  providerCallsPerformed:0,extraSpendAuthorizedUsd:0,externalEffectAuthority:'NONE'
});
/**
 * Returns a CONDITIONAL mathematical comparison only when BOTH runs supply
 * quality and complete allowance meter receipts from two five-hour sessions.
 * Different windows are necessary when a baseline alone fills a window.
 * Equal input/suite/quality floor/plan required; selected models may differ.
 * Coordination, retries, agent calls and tests must be included in the meter.
 */
export function compareUberMindFiveHourUsage({
 baseline=null,candidate=null,
 sameClaudeProAccountAttested=false,
 graderIndependentOfCandidateAttested=false,
 wholeWorkflowMeteredAttested=false,
 noSeparatePaidInferenceAttested=false
}={}){
 if(!baseline||!candidate||
    typeof baseline!=='object'||typeof candidate!=='object')
  return refused('two-paired-run-receipts-required');
 if([sameClaudeProAccountAttested,graderIndependentOfCandidateAttested,
     wholeWorkflowMeteredAttested,noSeparatePaidInferenceAttested].some(v=>v!==true))
  return refused('account-grader-whole-workflow-and-no-paid-spend-attestations-required');
 for(const field of ['taskSha256','sourceSha256','acceptanceSuiteSha256',
                      'benchmarkVersion','qualityRubricSha256']){
  if(!text(baseline[field])||!text(candidate[field])||
     baseline[field]!==candidate[field])
   return refused('different-or-missing-task-source-or-quality-contract:'+field);
 }
 if(!text(baseline.sessionWindowId)||!text(candidate.sessionWindowId)||
    baseline.sessionWindowId===candidate.sessionWindowId)
  return refused('baseline-and-candidate-must-be-measured-in-separate-complete-five-hour-windows');
 for(const [label,run] of [['baseline',baseline],['candidate',candidate]]){
  if(!text(run.usageMeterReceipt)||!text(run.independentGraderReceipt)||
     !finiteIn(run.usageBeforePercent,0,100)||
     !finiteIn(run.usageAfterPercent,0,100)||
     run.usageAfterPercent<=run.usageBeforePercent||
     !finiteIn(run.qualityScore,0,1)||
     !finiteIn(run.requiredQualityFloor,0,1)||
     typeof run.accepted!=='boolean'||
     !finiteIn(run.paidExternalApiUsd,0,1e6)||
     run.paidExternalApiUsd!==0)
   return refused('invalid-five-hour-meter-quality-or-extra-spend:'+label);
 }
 if(baseline.requiredQualityFloor!==candidate.requiredQualityFloor||
    !baseline.accepted||!candidate.accepted||
    baseline.qualityScore<baseline.requiredQualityFloor||
    candidate.qualityScore<candidate.requiredQualityFloor||
    candidate.qualityScore+1e-12<baseline.qualityScore)
  return refused('accepted-quality-parity-not-established');
 const b=rnd(baseline.usageAfterPercent-baseline.usageBeforePercent);
 const c=rnd(candidate.usageAfterPercent-candidate.usageBeforePercent);
 if(b<=0||c<=0)return refused('meter-has-no-reliable-positive-resolution');
 const reduction=rnd((b-c)/b*100);
 const speed=rnd(b/c);
 return {
  ok:true,status:'USER_ATTESTED_PAIRED_FIVE_HOUR_RESULT_UNVERIFIED',
  taskSha256:baseline.taskSha256,sourceSha256:baseline.sourceSha256,
  acceptedQualityParityReported:true,
  baselineReportedFiveHourUsagePoints:b,
  candidateReportedFiveHourUsagePoints:c,
  reportedReductionPercent:reduction,
  reportedComparableTasksPerFiveHourAllowanceMultiplier:speed,
  candidateBetterThanBaselineOnReportedMeter:c<b,
  sameSubscriptionCashUsd:20,actualSubscriptionCashSavingsUsd:0,
  userReportedUsageEvidenceNotAccountVerified:true,
  independentlyCertifiedQuality:false,
  actualMeasuredUsagePercent:null,
  providerCallsPerformed:0,extraSpendAuthorizedUsd:0,
  externalEffectAuthority:'NONE',
  warning:'Numbers are arithmetic over user-attested snapshots, not live authenticated Claude account telemetry or independent grading. Model/window cache differences, rounded usage meters and session resets can distort inference. Do not call an actual same-quality efficiency gain proved until receipt sources and scoring are independently verified.'
 };
}
/**
 * Translate a founder-set target into a clear experiment threshold.
 * This is a target, never a prediction; lower is better only if quality holds.
 */
export function uberMindFiveHourGoal({
 normalTaskFiveHourUsagePercent=100,
 targetFiveHourUsagePercent=30
}={}){
 if(!finiteIn(normalTaskFiveHourUsagePercent,0.001,100)||
    !finiteIn(targetFiveHourUsagePercent,0.001,100))
  return refused('positive-bounded-five-hour-percentage-target-required');
 return {
  ok:true,status:'TARGET_ONLY_NO_OBSERVED_QUOTA_SAVINGS',
  referenceUsagePoints:normalTaskFiveHourUsagePercent,
  desiredUsagePoints:targetFiveHourUsagePercent,
  targetReductionPercent:rnd((normalTaskFiveHourUsagePercent-targetFiveHourUsagePercent)/normalTaskFiveHourUsagePercent*100),
  conditionalThroughputMultiplier:rnd(normalTaskFiveHourUsagePercent/targetFiveHourUsagePercent),
  observedActualFiveHourUsagePercent:null,
  acceptedQualityPreservedObserved:false,
  noPaidApiAllowed:true,providerCallsPerformed:0,
  externalEffectAuthority:'NONE'
 };
}
