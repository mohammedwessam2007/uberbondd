import test from 'node:test';
import assert from 'node:assert/strict';
import {compileUberWarm3ZeroAddonDecision as rawDecision} from '../src/uberwarm3-cash-first-governor.mjs';
const compileUberWarm3ZeroAddonDecision=options=>rawDecision({
  ...options,
  verifyIndependentDemandReceipt:({count,evidenceRef})=>
    Number.isInteger(count)&&typeof evidenceRef==='string'&&evidenceRef.length>0,
  verifyPilotProviderCapacityReceipt:({senders,dailyCap,evidenceRef})=>
    senders>0&&dailyCap>0&&typeof evidenceRef==='string'&&evidenceRef.length>0
});
test('unknown facts and no eligible contacts do not trigger new subscription or messages',()=>{
 const x=compileUberWarm3ZeroAddonDecision({
   monthlyDiscretionaryBudgetCents:10000,
   currentVerifiedEligibleUniqueContacts:0,
   pilotVerifiedHealthySenders:2,pilotVerifiedDailyFirstTouchCap:10,
   qualifiedContactsEvidenceRef:'observed-queue:oct12',
   pilotCapacityEvidenceRef:'observed-sender:oct12'
 });
 assert.equal(x.startupPurchaseRecommendation,'DEFER');
 assert.equal(x.paidWarmAddonRecommendation,'NO_NEW_PAID_ADDON');
 assert.equal(x.monthlyCommittedCents,900);
 assert.equal(x.messagesSentByThisDecision,0);
 assert.equal(x.pilotTwoWeekMaxSlotCapacity,140);
});
test('eligible demand below pilot capacity defers $69 despite spare budget',()=>{
 const x=compileUberWarm3ZeroAddonDecision({
   monthlyDiscretionaryBudgetCents:20000,
   currentVerifiedEligibleUniqueContacts:100,
   pilotVerifiedHealthySenders:2,pilotVerifiedDailyFirstTouchCap:10,
   qualifiedContactsEvidenceRef:'verified:100',
   pilotCapacityEvidenceRef:'provider:live',
   campaignLegality:'READY',ownerCampaignAuthority:true,productionDispatcherReady:true
 });
 assert.equal(x.startupPurchaseRecommendation,'DEFER');
 assert.ok(x.expansionDeferralReasons.includes('existing-pilot-covers-evidenced-two-week-queue'));
});
test('strong verified queue and owner-authorized legal route recommends a checkout, not a charge',()=>{
 const x=compileUberWarm3ZeroAddonDecision({
   monthlyDiscretionaryBudgetCents:8000,
   currentVerifiedEligibleUniqueContacts:400,
   pilotVerifiedHealthySenders:2,pilotVerifiedDailyFirstTouchCap:10,
   qualifiedContactsEvidenceRef:'verified:400',pilotCapacityEvidenceRef:'provider:live',
   campaignLegality:'READY',ownerCampaignAuthority:true,productionDispatcherReady:true
 });
 assert.equal(x.startupPurchaseRecommendation,'CONSIDER_ONLY_WITH_NEW_EXPLICIT_OWNER_CHECKOUT');
 assert.equal(x.newMailboxesPurchasedByThisDecision,0);
 assert.equal(x.recommendNewPaidWarming,false);
});
test('no sender proof, no cash, or no legal approval means defer',()=>{
 for(const overrides of [
  {monthlyDiscretionaryBudgetCents:3000},
  {pilotCapacityEvidenceRef:''},
  {campaignLegality:'UNCERTAIN'}
 ]) {
  const x=compileUberWarm3ZeroAddonDecision({
    monthlyDiscretionaryBudgetCents:8000,
    currentVerifiedEligibleUniqueContacts:400,
    pilotVerifiedHealthySenders:2,pilotVerifiedDailyFirstTouchCap:10,
    qualifiedContactsEvidenceRef:'verified:400',pilotCapacityEvidenceRef:'provider:live',
    campaignLegality:'READY',ownerCampaignAuthority:true,productionDispatcherReady:true,
    ...overrides
  });
  assert.equal(x.startupPurchaseRecommendation,'DEFER');
 }
});
test('purchased subscription is accounted for without double-buying or auto-cancellation',()=>{
 const x=compileUberWarm3ZeroAddonDecision({
   startupPurchased:true,paidWarmAddonActive:true,
   currentVerifiedEligibleUniqueContacts:null,pilotPaidCents:900
 });
 assert.equal(x.startupPurchaseRecommendation,'ALREADY_PURCHASED_NEVER_DOUBLE_CHARGE');
 assert.equal(x.paidWarmAddonRecommendation,'REVIEW_EXISTING_COST_AND_ASK_OWNER_BEFORE_CANCELLING');
 assert.equal(x.monthlyCommittedCents,10800);
 assert.equal(x.paidWarmupAddedCents,0);
});
test('unverified raw prospect counts cannot override missing independent evidence pointers',()=>{
 const x=compileUberWarm3ZeroAddonDecision({
   monthlyDiscretionaryBudgetCents:10000,
   currentVerifiedEligibleUniqueContacts:100000,
   pilotVerifiedHealthySenders:3,pilotVerifiedDailyFirstTouchCap:45,
   qualifiedContactsEvidenceRef:'',pilotCapacityEvidenceRef:''
 });
 assert.equal(x.startupPurchaseRecommendation,'DEFER');
 assert.equal(x.knownVerifiedUniqueRecipients,null);
});

test('raw unsourced evidence reference cannot authorize purchase recommendation',()=>{
 const x=rawDecision({
   monthlyDiscretionaryBudgetCents:8000,
   currentVerifiedEligibleUniqueContacts:400,
   pilotVerifiedHealthySenders:2,pilotVerifiedDailyFirstTouchCap:10,
   qualifiedContactsEvidenceRef:'forged:400',pilotCapacityEvidenceRef:'forged:capacity',
   campaignLegality:'READY',ownerCampaignAuthority:true,productionDispatcherReady:true
 });
 assert.equal(x.startupPurchaseRecommendation,'DEFER');
 assert.equal(x.knownVerifiedUniqueRecipients,null);
 assert.ok(x.expansionDeferralReasons.includes('no-evidenced-eligible-volume-demand'));
});
test('spend recommendation is blocked until campaign authority and dispatcher are genuinely ready',()=>{
 const x=compileUberWarm3ZeroAddonDecision({
   monthlyDiscretionaryBudgetCents:8000,
   currentVerifiedEligibleUniqueContacts:400,
   pilotVerifiedHealthySenders:2,pilotVerifiedDailyFirstTouchCap:10,
   qualifiedContactsEvidenceRef:'verified:400',pilotCapacityEvidenceRef:'provider:live',
   campaignLegality:'READY',ownerCampaignAuthority:false,productionDispatcherReady:false
 });
 assert.equal(x.startupPurchaseRecommendation,'DEFER');
 assert.ok(x.expansionDeferralReasons.includes('production-dispatch-not-enabled'));
});
test('a failed/throwing source verifier fails closed',()=>{
 const x=rawDecision({
   monthlyDiscretionaryBudgetCents:8000,
   currentVerifiedEligibleUniqueContacts:400,
   pilotVerifiedHealthySenders:2,pilotVerifiedDailyFirstTouchCap:10,
   qualifiedContactsEvidenceRef:'claimed:400',pilotCapacityEvidenceRef:'claimed:capacity',
   verifyIndependentDemandReceipt:()=>{throw Error('tampered receipt')},
   verifyPilotProviderCapacityReceipt:()=>true,
   campaignLegality:'READY',ownerCampaignAuthority:true,productionDispatcherReady:true
 });
 assert.equal(x.startupPurchaseRecommendation,'DEFER');
 assert.equal(x.knownVerifiedUniqueRecipients,null);
});

test('a strict $69 all-in budget refuses a second $69 plan when the $9 pilot remains active',()=>{
 const base={
   currentVerifiedEligibleUniqueContacts:400,
   pilotVerifiedHealthySenders:2,pilotVerifiedDailyFirstTouchCap:10,
   qualifiedContactsEvidenceRef:'verified:400',pilotCapacityEvidenceRef:'provider:live',
   campaignLegality:'READY',ownerCampaignAuthority:true,productionDispatcherReady:true
 };
 const insufficient=compileUberWarm3ZeroAddonDecision({
   ...base,monthlyDiscretionaryBudgetCents:6900
 });
 assert.equal(insufficient.startupPurchaseRecommendation,'DEFER');
 assert.equal(insufficient.expansionBudgetRequirementCents,7800);
 assert.ok(insufficient.expansionDeferralReasons.includes('cash-budget-for-expansion-not-evidenced'));
 const fullyFunded=compileUberWarm3ZeroAddonDecision({
   ...base,monthlyDiscretionaryBudgetCents:7800
 });
 assert.equal(fullyFunded.startupPurchaseRecommendation,'CONSIDER_ONLY_WITH_NEW_EXPLICIT_OWNER_CHECKOUT');
});
test('incremental $69 is permitted only when budget is expressly above other existing commitments',()=>{
 const x=compileUberWarm3ZeroAddonDecision({
   budgetBasis:'INCREMENTAL_AVAILABLE',monthlyDiscretionaryBudgetCents:6900,
   currentVerifiedEligibleUniqueContacts:400,
   pilotVerifiedHealthySenders:2,pilotVerifiedDailyFirstTouchCap:10,
   qualifiedContactsEvidenceRef:'verified:400',pilotCapacityEvidenceRef:'provider:live',
   campaignLegality:'READY',ownerCampaignAuthority:true,productionDispatcherReady:true
 });
 assert.equal(x.expansionBudgetRequirementCents,6900);
 assert.equal(x.startupPurchaseRecommendation,'CONSIDER_ONLY_WITH_NEW_EXPLICIT_OWNER_CHECKOUT');
});

test('cash-first governor defaults to no invented mathematical dominance certificate',()=>{
 const x=rawDecision({monthlyDiscretionaryBudgetCents:10000});
 assert.equal(x.economicDominanceCertificate,null);
 assert.equal(x.paidWarmAddonRecommendation,'NO_NEW_PAID_ADDON');
 assert.equal(x.paidWarmAddonBuyingRationale,'HOLD_SPEND_PENDING_INDEPENDENT_INCREMENTAL_ROI_EVIDENCE');
});
test('signed-server-verified upper bounds can certify free warmer for specific 30-day economy',()=>{
 const refs={
  feeEvidenceRef:'provider-billing:approved-30d',
  eligibleEvidenceRef:'eligible-queue:attested-bound',
  valueEvidenceRef:'cleared-economics:upper-bound-receipt',
  causalUpliftEvidenceRef:'experiment:independent-credible-uplift-upper',
  futureOptionEvidenceRef:'audited-future-options:upper'
 };
 const verified={
  verifyPaidFee:()=>true,verifyEligibleUpper:()=>true,
  verifyValueUpper:()=>true,verifyCausalUpliftUpper:()=>true,
  verifyFutureOptionUpper:()=>true
 };
 const x=rawDecision({economicDominanceInputs:{
  paidFeeCents:1, // must be overwritten by actual procurement amount
  certifiedEligibleUpper:9000,
  certifiedValuePerExtraInboxCentsUpper:10,
  certifiedPaidPlacementUpliftUpper:0.03,
  certifiedFutureOptionValueCentsUpper:0,
  ...refs,...verified
 }});
 assert.equal(x.economicDominanceCertificate.paidFeeCents,3000);
 assert.equal(x.economicDominanceCertificate.maximumPaidBenefitCents,2700);
 assert.equal(x.paidWarmAddonBuyingRationale,'CERTIFIED_BOUNDED_PERIOD_ECONOMIC_DOMINANCE');
 assert.equal(x.paidWarmAddonRecommendation,'NO_NEW_PAID_ADDON');
});
test('fake impressive numeric estimates without independently verified receipt refuse proof',()=>{
 const x=rawDecision({economicDominanceInputs:{
  certifiedEligibleUpper:9000,
  certifiedValuePerExtraInboxCentsUpper:1,
  certifiedPaidPlacementUpliftUpper:0,
  certifiedFutureOptionValueCentsUpper:0
 }});
 assert.equal(x.economicDominanceCertificate.status,'NOT_CERTIFIED');
 assert.equal(x.paidWarmAddonBuyingRationale,'HOLD_SPEND_PENDING_INDEPENDENT_INCREMENTAL_ROI_EVIDENCE');
});
test('cash governor does not claim theoretical inevitability when paid could actually improve profit',()=>{
 const refs={
  feeEvidenceRef:'provider-billing:approved-30d',
  eligibleEvidenceRef:'eligible-queue:attested-bound',
  valueEvidenceRef:'cleared-economics:upper-bound-receipt',
  causalUpliftEvidenceRef:'experiment:independent-credible-uplift-upper',
  futureOptionEvidenceRef:'audited-future-options:upper'
 };
 const all={
  verifyPaidFee:()=>true,verifyEligibleUpper:()=>true,
  verifyValueUpper:()=>true,verifyCausalUpliftUpper:()=>true,
  verifyFutureOptionUpper:()=>true
 };
 const x=rawDecision({economicDominanceInputs:{
  certifiedEligibleUpper:9000,certifiedValuePerExtraInboxCentsUpper:10,
  certifiedPaidPlacementUpliftUpper:0.05,certifiedFutureOptionValueCentsUpper:0,
  ...refs,...all
 }});
 assert.equal(x.economicDominanceCertificate.zeroAddonEconomicallyDominant,false);
 assert.equal(x.economicDominanceCertificate.conservativeZeroAddonAdvantageCents,-1500);
 assert.equal(x.paidWarmAddonBuyingRationale,'HOLD_SPEND_PENDING_INDEPENDENT_INCREMENTAL_ROI_EVIDENCE');
});
