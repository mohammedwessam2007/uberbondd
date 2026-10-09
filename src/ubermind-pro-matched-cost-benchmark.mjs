/**
 * UberMind W32: PRIVATE READ-ONLY Claude Pro paired-workload comparator.
 * Benchmark input is external human-observed evidence, never API dispatch.
 * Will not pronounce frontier quality or subscription economics verified.
 */
export const UBERMIND_PAIRED_METER_SCHEMA='uberbond.claude-pro.matched-quality-usage.v1';
const reject=(reason)=>({ok:false,status:'BENCHMARK_NOT_ADMISSIBLE',reason,providerCalls:0,externalEffectAuthority:'NONE',independentVerificationPerformed:false,measuredWeeklyUsageSavings:null});
const isText=(x)=>typeof x==='string'&&x.length>0&&x.length<513;
const pct=(x)=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=100;
const score=(x)=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1;
const usd=(x)=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=100000;
const round=(x)=>Number(x.toFixed(9));
/**
 * All paired tasks must be identical input digest, benchmark contract and quality
 * rubric. Assessments must be separately sourced but their truth is NOT
 * independently checked by this read-only calculator.
 *
 * Meter inputs are percentages from an existing plan's weekly UI, not tokens,
 * credits, API provider charges, model quotas or incremental USD.
 */
export function compareUberMindMatchedUsage({
 baseline=[],candidate=[],subscriptionPriceUsd=20
}={}){
 if(!Array.isArray(baseline)||!Array.isArray(candidate)||
    baseline.length===0||baseline.length>100||
    candidate.length!==baseline.length||!usd(subscriptionPriceUsd))
  return reject('paired-nonempty-bounded-arrays-and-subscription-price-required');
 const fields=['taskId','inputSha256','benchmarkVersion','suiteSha256','validatorReceipt','weeklyCycleId'];
 const map=new Map();
 for(const r of baseline){
  if(!r||typeof r!=='object'||fields.some(f=>!isText(r[f]))||
     map.has(r.taskId))return reject('baseline-task-id-or-proof-fields-invalid-or-duplicated');
  map.set(r.taskId,r);
 }
 let basePct=0,altPct=0,baseApi=0,altApi=0,completeApi=true;
 const seen=new Set(),failed=[];
 for(const c of candidate){
  if(!c||typeof c!=='object'||fields.some(f=>!isText(c[f]))||
     seen.has(c.taskId)||!map.has(c.taskId))
    return reject('candidate-missing-duplicated-or-unpaired-task');
  seen.add(c.taskId);
  const b=map.get(c.taskId);
  for(const f of ['inputSha256','benchmarkVersion','suiteSha256','weeklyCycleId']){
   if(b[f]!==c[f])return reject('different-input-quality-suite-or-weekly-window:'+c.taskId);
  }
  for(const run of [b,c]){
   if(!pct(run.weeklyBeforePercent)||!pct(run.weeklyAfterPercent)||
      run.weeklyAfterPercent<=run.weeklyBeforePercent)
    return reject('unmeasurable-or-invalid-weekly-usage-delta:'+c.taskId);
   if(!score(run.qualityScore)||!score(run.requiredQualityFloor)||
     typeof run.accepted!=='boolean'||!isText(run.validatorReceipt))
    return reject('quality-attestation-fields-invalid:'+c.taskId);
   if(run.apiEquivalentUsd!==null&&run.apiEquivalentUsd!==undefined&&
     !usd(run.apiEquivalentUsd))
    return reject('invalid-api-equivalent-usd:'+c.taskId);
  }
  if(b.requiredQualityFloor!==c.requiredQualityFloor)
   return reject('different-quality-floors:'+c.taskId);
  const floor=b.requiredQualityFloor;
  if(!b.accepted||!c.accepted||b.qualityScore<floor||
    c.qualityScore<floor||c.qualityScore+1e-12<b.qualityScore)
    failed.push(c.taskId);
  basePct+=(b.weeklyAfterPercent-b.weeklyBeforePercent);
  altPct+=(c.weeklyAfterPercent-c.weeklyBeforePercent);
  if(b.apiEquivalentUsd===null||b.apiEquivalentUsd===undefined||
     c.apiEquivalentUsd===null||c.apiEquivalentUsd===undefined)completeApi=false;
  else {baseApi+=b.apiEquivalentUsd;altApi+=c.apiEquivalentUsd;}
 }
 if(failed.length) return { ...reject('reported-quality-parity-or-acceptance-failed'),
  failedTaskIds:failed,qualityParityReported:false};
 const weeklySavings=basePct-altPct;
 const reduction=basePct>0?weeklySavings/basePct*100:null;
 return {
  ok:true,status:'MATCHED_USER_ATTESTED_SCENARIO_NOT_INDEPENDENTLY_CERTIFIED',
  taskCount:baseline.length,qualityParityReported:true,
  reportedQualityRationale:'Same task, source digest, quality contract and benchmark suite with accepted validator receipts; calculator cannot authenticate evaluator or model quality.',
  baseReportedWeeklyUsagePoints:round(basePct),
  candidateReportedWeeklyUsagePoints:round(altPct),
  modeledWeeklyUsagePointDifference:round(weeklySavings),
  reportedRelativeWeeklyMeterReductionPercent:round(reduction),
  reportedTasksPerWeeklyPercentagePointRatio:round(basePct/altPct),
  reportedEfficiencyMultiplier:round(basePct/altPct),
  reportedApiEquivalentBaselineUsd:completeApi?round(baseApi):null,
  reportedApiEquivalentCandidateUsd:completeApi?round(altApi):null,
  reportedApiEquivalentSavingsPercent:completeApi&&baseApi>0?round((baseApi-altApi)/baseApi*100):null,
  fixedMonthlySubscriptionPriceUsd:subscriptionPriceUsd,
  subscriptionCashSavingsUsd:0,
  providerCalls:0,independentVerificationPerformed:false,
  externalEffectAuthority:'NONE',
  tariffCostIsNotPlanAllowance:true,
  warning:'User-attested, paired scenarios only. Same task/rubric/hash and scores cannot prove independent quality, reproducibility or future meter limits. Weekly meter may be rounded and resets/mixed model use can distort comparisons. No provider invoice or account usage was read and the $20 Pro bill is unchanged.'
 };
}
