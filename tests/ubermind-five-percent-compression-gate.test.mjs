import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateUberMindFivePercent as calculate,
  planEvidenceBoundedMinUsage as plan
} from '../src/ubermind-five-percent-compression-gate.mjs';
const digest='sha256:'+'a'.repeat(64);
const shaB='sha256:'+'b'.repeat(64);
const shaC='sha256:'+'c'.repeat(64);
const unit=(id,cost,opts=[])=>({
  id,baselineUsagePoints:cost,baselineQualityScore:0.95,
  taskDigest:digest,sourceDigest:shaB,rubricDigest:shaC,routes:opts
});
const route=(cost,more={})=>({
  id:'quality-route',kind:'CERTIFIED_REPLAY_CANDIDATE',usagePoints:cost,
  qualityScore:0.95,accepted:true,taskDigest:digest,
  sourceDigest:shaB,rubricDigest:shaC,evidencePointer:'validator:passed:holdout',
  paidApiUsd:0,...more
});
test('W35 95% exact reuse with no overhead reaches 5% modeled, not measured',()=>{
 const v=calculate({certifiedReusableShareOfRemaining:.95});
 assert.equal(v.modeledUsagePoints,5);
 assert.equal(v.minimumRequiredReuseShare,.95);
 assert.equal(v.modeledTargetMet,true);
 assert.equal(v.observedClaudeUsagePoints,null);
 assert.equal(v.qualifiedEmpiricalSuccess,false);
 assert.equal(v.providerCallsPerformed,0);
});
test('W35 unavoidable 2%, overhead .5%, half residual metering requires 94.8979592% reuse',()=>{
 const v=calculate({unavoidableUsagePoints:2,coordinationOverheadUsagePoints:.5,
   remainingWorkUsageMultiplier:.5,certifiedReusableShareOfRemaining:.95});
 assert.equal(v.minimumRequiredReuseShare,.948979592);
 assert.equal(v.modeledUsagePoints,4.95);
 assert.equal(v.targetMathematicallyReachable,true);
});
test('W35 fixed cost > 5% makes target physically impossible at full reuse',()=>{
 const v=calculate({unavoidableUsagePoints:6,coordinationOverheadUsagePoints:.5,
   certifiedReusableShareOfRemaining:1});
 assert.equal(v.targetMathematicallyReachable,false);
 assert.equal(v.minimumRequiredReuseShare,null);
 assert.equal(v.modeledTargetMet,false);
});
test('W35 zero reuse and same model needs normal 100% of allowance',()=>{
 const v=calculate();assert.equal(v.modeledUsagePoints,100);
 assert.equal(v.modeledTargetMet,false);
 assert.equal(v.minimumRequiredReuseShare,.95);
});
test('W35 high parallel overhead can cost more than baseline',()=>{
 const v=calculate({coordinationOverheadUsagePoints:20,remainingWorkUsageMultiplier:1.1});
 assert.equal(v.modeledUsagePoints,130);
 assert.equal(v.modeledSavingsPoints,-30);
});
test('W35 a 10x equal-quality metering multiplier still needs 50% replay to reach 5%',()=>{
 const v=calculate({remainingWorkUsageMultiplier:.1,certifiedReusableShareOfRemaining:.5});
 assert.equal(v.minimumRequiredReuseShare,.5);
 assert.equal(v.modeledUsagePoints,5);
 assert.equal(v.sameQualityVerifiedInput,false);
});
test('W35 malformed inputs always fail closed',()=>{
 for(const a of [{baselineUsagePoints:0},{targetUsagePoints:-1},
 {remainingWorkUsageMultiplier:0},{certifiedReusableShareOfRemaining:1.01},
 {unavoidableUsagePoints:101},{sameQualityVerified:'YES'},
 {coordinationOverheadUsagePoints:Infinity}]){
  assert.equal(calculate(a).ok,false,JSON.stringify(a));
 }
});
test('W35 conservative planner chooses cheaper high-quality exact same contract',()=>{
 const r=plan({units:[unit('a',60,[route(1)]),unit('b',40,[])]});
 assert.equal(r.ok,true);
 assert.equal(r.baselineUsagePoints,100);
 assert.equal(r.candidateUsagePoints,41);
 assert.equal(r.modeledReductionPercent,59);
 assert.equal(r.changedRouteCount,1);
 assert.equal(r.actualVerifiedClaudeUsagePoints,null);
 assert.equal(r.acceptedQualityIndependentlyVerified,false);
});
test('W35 reject lower quality, mismatched SHA and nonaccepted candidate',()=>{
 for(const changes of [
   {qualityScore:.949},{sourceDigest:digest},
   {taskDigest:shaB},{rubricDigest:digest},
   {accepted:false},{paidApiUsd:.0000001},
   {evidencePointer:''}
 ]){
   const r=plan({units:[unit('a',100,[route(0,changes)])]});
   assert.equal(r.ok,true,JSON.stringify(changes));
   assert.equal(r.changedRouteCount,0,JSON.stringify(changes));
   assert.equal(r.candidateUsagePoints,100);
 }
});
test('W35 reject duplicate tasks, excess total baseline, and unbounded unit count',()=>{
 assert.equal(plan({units:[unit('a',50),unit('a',50)]}).ok,false);
 assert.equal(plan({units:[unit('a',70),unit('b',40)]}).ok,false);
 assert.equal(plan({units:[]}).ok,false);
 assert.equal(plan({units:Array.from({length:129},(_,i)=>unit('x'+i,.1))}).ok,false);
});
test('W35 no scenario can claim verified savings from receipt labels alone',()=>{
 const r=plan({units:[unit('a',100,[route(0)])],extraCoordinationUsagePoints:.1});
 assert.equal(r.status,'USER_ATTESTED_ROUTE_SCENARIO_NOT_OBSERVED');
 assert.equal(r.candidateUsagePoints,.1);
 assert.equal(r.actualVerifiedClaudeUsagePoints,null);
 assert.equal(r.providerCallsPerformed,0);
});
test('W35 no accumulation of API fees or external authority',()=>{
 const v=calculate({certifiedReusableShareOfRemaining:.95,sameQualityVerified:true});
 assert.equal(v.qualifiedEmpiricalSuccess,false);
 assert.equal(v.extraApiSpendingAuthorizedUsd,0);
 assert.equal(v.externalEffectAuthority,'NONE');
 const x=plan({units:[unit('a',100)]});
 assert.equal(x.extraApiSpendingAuthorizedUsd,0);
 assert.equal(x.externalEffectAuthority,'NONE');
});