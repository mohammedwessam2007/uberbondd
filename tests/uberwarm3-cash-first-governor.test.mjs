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
   monthlyDiscretionaryBudgetCents:7000,
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
    monthlyDiscretionaryBudgetCents:7000,
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
   monthlyDiscretionaryBudgetCents:7000,
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
   monthlyDiscretionaryBudgetCents:7000,
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
   monthlyDiscretionaryBudgetCents:7000,
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
