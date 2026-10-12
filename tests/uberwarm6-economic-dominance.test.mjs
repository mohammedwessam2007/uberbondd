import test from 'node:test';
import assert from 'node:assert/strict';
import {
 compileUberWarm6EconomicDominance as prove,
 calculateUberWarm6BreakEven as breakEven
} from '../src/uberwarm6-economic-dominance.mjs';
const refs={
 feeEvidenceRef:'invoice:verified:30d:20261012',
 eligibleEvidenceRef:'legal-ledger:verified-upper:3000',
 valueEvidenceRef:'cleared-contribution:audited-upper:10c',
 causalUpliftEvidenceRef:'matched-placement-study:upper-bound:003',
 futureOptionEvidenceRef:'future-option:accounted:zero:20261012'
};
const trusted={
 verifyPaidFee:()=>true,verifyEligibleUpper:()=>true,verifyValueUpper:()=>true,
 verifyCausalUpliftUpper:()=>true,verifyFutureOptionUpper:()=>true
};
const sample={
 paidFeeCents:3000,certifiedEligibleUpper:9000,
 certifiedValuePerExtraInboxCentsUpper:10,
 certifiedPaidPlacementUpliftUpper:0.03,
 certifiedFutureOptionValueCentsUpper:0,
 ...refs,...trusted
};
test('formal robust dominance: paid fee exceeds independently bounded maximum uplift',()=>{
 const x=prove(sample);
 assert.equal(x.status,'PROVEN_ZERO_ADDON_ECONOMIC_DOMINANCE');
 assert.equal(x.maximumPaidBenefitCents,2700);
 assert.equal(x.conservativeZeroAddonAdvantageCents,300);
 assert.equal(x.zeroAddonEconomicallyDominant,true);
 assert.equal(x.paidWarmingOutperformsInbox,false);
 assert.equal(x.doesNotAuthorizeSpend,true);
});
test('one higher plausible uplift destroys dominance even when $0 is preferred',()=>{
 const x=prove({...sample,certifiedPaidPlacementUpliftUpper:0.05});
 assert.equal(x.status,'NO_PROOF_PAID_ADDON_UNECONOMICAL');
 assert.equal(x.zeroAddonEconomicallyDominant,false);
 assert.equal(x.maximumPaidBenefitCents,4500);
});
test('unknown causal uplift is NOT assumed zero',()=>{
 const x=prove({...sample,certifiedPaidPlacementUpliftUpper:null});
 assert.equal(x.status,'NOT_CERTIFIED');
 assert.equal(x.zeroAddonEconomicallyDominant,false);
});
test('self-attested evidence references cannot certify any proof',()=>{
 const {verifyCausalUpliftUpper,...rest}=sample;
 const x=prove({...rest,verifyCausalUpliftUpper:undefined});
 assert.equal(x.status,'NOT_CERTIFIED');
 assert.ok(x.reasonCodes.includes('causal-uplift-bound-not-verified'));
});
test('missing future option bound defeats an otherwise apparent win',()=>{
 const x=prove({...sample,certifiedFutureOptionValueCentsUpper:null});
 assert.equal(x.status,'NOT_CERTIFIED');
 assert.equal(x.zeroAddonEconomicallyDominant,false);
});
test('verified future option can overturn an apparently favorable current month',()=>{
 const x=prove({...sample,certifiedFutureOptionValueCentsUpper:1000});
 assert.equal(x.status,'NO_PROOF_PAID_ADDON_UNECONOMICAL');
 assert.equal(x.maximumPaidBenefitCents,3700);
});
test('zero legally eligible volume proves period dominance only if future option bound is also 0',()=>{
 const x=prove({...sample,certifiedEligibleUpper:0});
 assert.equal(x.status,'PROVEN_ZERO_ADDON_ECONOMIC_DOMINANCE');
 assert.equal(x.maximumPaidBenefitCents,0);
 assert.equal(x.conservativeZeroAddonAdvantageCents,3000);
});
test('unverified zero future option must never pass',()=>{
 const x=prove({...sample,verifyFutureOptionUpper:()=>false});
 assert.equal(x.status,'NOT_CERTIFIED');
});
test('uncertain or failed verifier cannot produce a win even with favorable numbers',()=>{
 const x=prove({...sample,verifyPaidFee:()=>{throw Error('unavailable billing receipt')}});
 assert.equal(x.status,'NOT_CERTIFIED');
});
test('unsafe integer product refuses proof rather than overflowing to fake margin',()=>{
 const x=prove({...sample,certifiedEligibleUpper:Number.MAX_SAFE_INTEGER,
   certifiedValuePerExtraInboxCentsUpper:Number.MAX_SAFE_INTEGER});
 assert.equal(x.status,'NOT_CERTIFIED');
 assert.ok(x.reasonCodes.includes('bound-arithmetic-not-safe'));
});
test('no experimental claim of being better at inbox placement is ever returned',()=>{
 for(const delta of [0,0.02,0.05,0.5,1]) {
   const result=prove({...sample,certifiedPaidPlacementUpliftUpper:delta});
   assert.equal(result.paidWarmingOutperformsInbox,false);
   assert.equal(result.doesNotAuthorizeSend,true);
 }
});
test('9000 eligible, ten cents per incremental inbox needs 3.333333 pp paid uplift',()=>{
 const x=breakEven({eligibleFirstTouches:9000,clearedContributionCentsPerExtraInbox:10});
 assert.equal(x.status,'HYPOTHETICAL_THRESHOLD');
 assert.equal(x.breakEvenUpliftPercentagePoints,3.333333);
 assert.equal(x.requiredAdditionalInboxDeliveries,300);
});
test('3000 eligible, ten cents each requires ten percentage points improvement',()=>{
 const x=breakEven({eligibleFirstTouches:3000,clearedContributionCentsPerExtraInbox:10});
 assert.equal(x.breakEvenUpliftPercentagePoints,10);
});
test('3000 eligible, one cent each requires impossible 100 percentage points? equal is possible at 100',()=>{
 const x=breakEven({eligibleFirstTouches:3000,clearedContributionCentsPerExtraInbox:1});
 assert.equal(x.breakEvenUpliftPercentagePoints,100);
 assert.equal(x.status,'HYPOTHETICAL_THRESHOLD');
});
test('zero eligible recipients cannot monetize improved placement in billing window',()=>{
 const x=breakEven({eligibleFirstTouches:0,clearedContributionCentsPerExtraInbox:10});
 assert.equal(x.status,'NO_CURRENT_INBOX_PATH_TO_RECOVER_FEE');
 assert.equal(x.breakEvenUpliftPercentagePoints,null);
});
test('zero cleared contribution implies no feasible Inbox-only recovery',()=>{
 const x=breakEven({eligibleFirstTouches:50000,clearedContributionCentsPerExtraInbox:0});
 assert.equal(x.status,'NO_CURRENT_INBOX_PATH_TO_RECOVER_FEE');
});
test('a 5 percent uplift upper with positive expected per-Inbox revenue may merit a PAID experiment',()=>{
 const x=prove({...sample,certifiedPaidPlacementUpliftUpper:0.05});
 assert.equal(x.zeroAddonEconomicallyDominant,false);
 assert.equal(x.conservativeZeroAddonAdvantageCents,-1500);
});
