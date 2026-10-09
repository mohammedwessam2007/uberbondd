/**
 * UberMind W35: Amdahl-style LOWER BOUND for five-hour Pro usage.
 * Pure arithmetic. This does NOT observe Claude /usage or guarantee equal quality.
 * Reuse fraction is fraction of the BASELINE METERED DELEGABLE WORK, not
 * the fraction of tasks or source bytes. No API calls, spend, or side effects.
 */
export const UBERMIND_5PCT_SCHEMA='uberbond.ubermind.five-percent-feasibility.v1';
const between=(n,a,b)=>typeof n==='number'&&Number.isFinite(n)&&n>=a&&n<=b;
const rnd=n=>Number(n.toFixed(9));
const held=reason=>({
  ok:false,status:'UBERMIND_FIVE_PERCENT_FEASIBILITY_HELD',reason,
  observedClaudeUsagePoints:null,verifiedQualityParity:false,
  additionalPaidModelCalls:0,externalEffectAuthority:'NONE'
});
export function calculateUberMindFivePercent({
  baselineUsagePoints=100,
  targetUsagePoints=5,
  unavoidableUsagePoints=0,
  coordinationOverheadUsagePoints=0,
  remainingWorkUsageMultiplier=1,
  certifiedReusableShareOfRemaining=0,
  sameQualityVerified=false
}={}){
  if(!between(baselineUsagePoints,0.000001,100)||
     !between(targetUsagePoints,0.000001,100)||
     !between(unavoidableUsagePoints,0,baselineUsagePoints)||
     !between(coordinationOverheadUsagePoints,0,100)||
     !between(remainingWorkUsageMultiplier,0.000001,100)||
     !between(certifiedReusableShareOfRemaining,0,1)||
     typeof sameQualityVerified!=='boolean')
    return held('positive-bounded-input-and-quality-flag-required');
  const delegable=baselineUsagePoints-unavoidableUsagePoints;
  // A <= baseline residual formula. Multiplier > 1 models a costly swarm.
  const floor=unavoidableUsagePoints+coordinationOverheadUsagePoints;
  const residual=delegable*(1-certifiedReusableShareOfRemaining)*remainingWorkUsageMultiplier;
  const modeled=floor+residual;
  const available=targetUsagePoints-floor;
  const mathematicalAchievable=available>=-1e-10;
  const required=delegable>0
    ?(mathematicalAchievable?Math.max(0,1-available/(delegable*remainingWorkUsageMultiplier)):null)
    :(floor<=targetUsagePoints?0:null);
  const reachable=required!==null&&required<=1+1e-10;
  const objectiveMet=modeled<=targetUsagePoints+1e-10;
  return {
    ok:true,status:'MODEL_ONLY_NOT_ACCOUNT_OBSERVATION',
    baselineUsagePoints:rnd(baselineUsagePoints),
    targetUsagePoints:rnd(targetUsagePoints),
    unavoidableUsagePoints:rnd(unavoidableUsagePoints),
    coordinationOverheadUsagePoints:rnd(coordinationOverheadUsagePoints),
    minimumModeledUsagePointsEvenWithPerfectReuse:rnd(floor),
    remainingWorkUsageMultiplier,
    certifiedReusableShareAssumed:certifiedReusableShareOfRemaining,
    minimumRequiredReuseShare:reachable?rnd(Math.min(1,required)):null,
    targetMathematicallyReachable:reachable,
    modeledUsagePoints:rnd(modeled),
    modeledSavingsPoints:rnd(baselineUsagePoints-modeled),
    modeledTargetMet:objectiveMet,
    qualifiedEmpiricalSuccess:false,
    sameQualityVerifiedInput:sameQualityVerified,
    observedClaudeUsagePoints:null,
    accountMeterAuthenticated:false,
    replayShareIndependentlyCertified:false,
    providerCallsPerformed:0,
    additionalPaidModelCalls:0,
    extraApiSpendingAuthorizedUsd:0,
    externalEffectAuthority:'NONE',
    note:'Uses baseline-weighted metered work, not number of tasks or bytes. Values are user-supplied hypotheses unless real matched /usage and independent acceptance are checked. Even a true source-bound exact replay of selected JSON is NOT proof that an arbitrary task can skip 95% of frontier reasoning.'
  };
}

/**
 * Conservative additive independent-work planner. A cheaper route must
 * preserve the exact task/source/rubric and report quality >= baseline.
 * Optional evidence remains caller-ATTESTED, never provider-authenticated.
 * If any route lacks evidence, keep the baseline route for that unit.
 */
export function planEvidenceBoundedMinUsage({
  units=[],extraCoordinationUsagePoints=0
}={}){
  if(!Array.isArray(units)||!units.length||units.length>128||
    !between(extraCoordinationUsagePoints,0,100))
    return held('nonempty-bounded-work-units-and-overhead-required');
  const names=new Set(),details=[];
  let baseline=0,candidate=extraCoordinationUsagePoints,escaped=0;
  for(const u of units){
    if(!u||typeof u!=='object'||typeof u.id!=='string'||
      !/^[a-zA-Z0-9_.:-]{1,96}$/.test(u.id)||
      names.has(u.id)||!between(u.baselineUsagePoints,0,100)||
      !between(u.baselineQualityScore,0,1)||
      !/^sha256:[a-f0-9]{64}$/.test(u.sourceDigest??'')||
      !/^sha256:[a-f0-9]{64}$/.test(u.taskDigest??'')||
      !/^sha256:[a-f0-9]{64}$/.test(u.rubricDigest??'')||
      !Array.isArray(u.routes)||u.routes.length>12)
      return held('invalid-or-duplicated-task-and-source-contract');
    names.add(u.id);
    baseline+=u.baselineUsagePoints;
    let best={routeId:'BASELINE',usagePoints:u.baselineUsagePoints,kind:'BASELINE',evidence:'BASELINE'};
    for(const o of u.routes){
      if(!o||typeof o!=='object'||typeof o.id!=='string'||
        o.id.length>96||!between(o.usagePoints,0,100)||
        !between(o.qualityScore,0,1)||
        o.accepted!==true||
        o.sourceDigest!==u.sourceDigest||
        o.taskDigest!==u.taskDigest||
        o.rubricDigest!==u.rubricDigest||
        typeof o.evidencePointer!=='string'||
        o.evidencePointer.length<8||o.evidencePointer.length>512||
        o.qualityScore+1e-12<u.baselineQualityScore||
        o.paidApiUsd!==0)continue;
      // Evidence is named, not authenticated. Route choice remains advisory.
      if(o.usagePoints<best.usagePoints-1e-12)
        best={routeId:o.id,usagePoints:o.usagePoints,kind:o.kind??'DECLARED',
              evidence:'USER_ATTESTED_UNVERIFIED'};
    }
    if(best.kind!=='BASELINE')escaped++;
    candidate+=best.usagePoints;
    details.push({unitId:u.id,chosenRoute:best.routeId,baselineUsagePoints:u.baselineUsagePoints,
      modeledUsagePoints:rnd(best.usagePoints),evidence:best.evidence});
  }
  if(baseline<=0||baseline>100+1e-9)return held('sum-of-claimed-baseline-five-hour-meter-must-be-positive-at-most-100');
  return {ok:true,status:'USER_ATTESTED_ROUTE_SCENARIO_NOT_OBSERVED',
    baselineUsagePoints:rnd(baseline),candidateUsagePoints:rnd(candidate),
    modeledReductionPercent:rnd((baseline-candidate)/baseline*100),
    candidateLowerModeledUsage:candidate<baseline,
    changedRouteCount:escaped,details,
    actualVerifiedClaudeUsagePoints:null,
    acceptedQualityIndependentlyVerified:false,
    providerCallsPerformed:0,extraApiSpendingAuthorizedUsd:0,
    externalEffectAuthority:'NONE'};
}