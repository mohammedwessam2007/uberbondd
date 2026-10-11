import test from 'node:test';
import assert from 'node:assert/strict';
import {compileOutreach30kFeasibility as audit} from '../src/outreach-30k-feasibility.mjs';

test('default 30-active-day, 50 box scenario is below 30k at evidence cap',()=>{
 const a=audit();
 assert.equal(a.fleet.currentPolicyMonthlyMax,15000);
 assert.equal(a.fleet.providerAdvertisedMonthlyMax,22500);
 assert.equal(a.fleet.requiredMailboxesAtProviderGuidance,67);
 assert.equal(a.fleet.requiredMailboxesAtInternalCap,100);
 assert.equal(a.scheduling.requiredBatchSizeIgnoringHourlyCaps,11);
 assert.equal(a.scheduling.legacyBatchMaxMessagesPerMonth,28800);
 assert.equal(a.scheduling.legacyTwoLaneHourlyMaxMessagesPerMonth,2400);
 assert.equal(a.money.providerGuidanceFleet.recurringTotalUsd,95);
 assert.equal(a.status,'PLANNING_ONLY_NOT_SEND_READY');
 assert.equal(a.fullLaunchReady,false);
});
test('30-day upper provider guidance is mathematical edge case, not launch ready',()=>{
 const a=audit({sendingDays:30,providerColdPerMailboxDay:20,internalDailyCap:10});
 assert.equal(a.fleet.providerAdvertisedMonthlyMax,30000);
 assert.equal(a.fleet.currentPolicyMonthlyMax,15000);
 assert.equal(a.fleet.requiredMailboxesAtProviderGuidance,50);
 assert.equal(a.fleet.requiredMailboxesAtInternalCap,100);
 assert.equal(a.fullLaunchReady,false);
});
test('22-day comparative case requires 69 mailboxes at 20/day',()=>{
 const a=audit({sendingDays:22,providerColdPerMailboxDay:20});
 assert.equal(a.fleet.requiredMailboxesAtProviderGuidance,69);
 assert.equal(a.money.providerGuidanceFleet.domainSlots,23);
 assert.equal(a.money.providerGuidanceFleet.recurringTotalUsd,97);
});
test('50 default mailboxes plus optional warmup costs $108/month with retained pilot',()=>{
 const a=audit({warmingEnabled:true});
 assert.deepEqual(a.money.plannedFleet,{mailboxes:50,domainSlots:17,startupWithExtrasUsd:69,optionalWarmingUsd:30,retainedPilotUsd:9,recurringTotalUsd:108,excludes:'domains, taxes, processing fees, FX, additional tools and compute'});
 assert.equal(a.money.providerGuidanceFleet.recurringTotalUsd,135.2);
});
test('provider warming traffic can reduce upper cold cap',()=>{
 const a=audit({sendingDays:30,providerColdPerMailboxDay:20,providerTotalPerMailboxDay:20,warmingEmailsPerMailboxDay:10});
 assert.equal(a.fleet.providerAdvertisedMonthlyMax,15000);
 assert.equal(a.fleet.requiredMailboxesAtProviderGuidance,100);
});
test('owned inventory excludes protected brand domains, without assuming DNS',()=>{
 const a=audit({totalOwnedDomains:30});
 assert.equal(a.fleet.ownerReportedSendingDomains,28);
 assert.ok(!a.blockers.includes('insufficient-verified-domain-topology-for-planned-mailboxes'));
 assert.ok(a.blockers.includes('actual-healthy-mailbox-count-unknown'));
 assert.equal(a.fullLaunchReady,false);
});
test('a planned fleet of 100 boxes cannot fit 28 domains at max 3/domain',()=>{
 const a=audit({plannedMailboxes:100,totalOwnedDomains:30});
 assert.ok(a.blockers.includes('insufficient-verified-domain-topology-for-planned-mailboxes'));
 assert.equal(a.fleet.requiredDomainSlotsForPlannedFleet,34);
});
test('observed 50 healthy alone never grants send authority',()=>{
 const a=audit({observedHealthyMailboxes:50,observedEligibleMessages:30000,totalOwnedDomains:30});
 assert.equal(a.fullLaunchReady,false);
 assert.ok(a.blockers.includes('actual-healthy-mailbox-capacity-below-target'));
});
test('reject impossible or contradictory inputs',()=>{
 for(const arg of [{sendingDays:0},{sendingDays:32},{plannedMailboxes:-1},{targetMessages:1.2},{warmingEnabled:'yes'},{totalOwnedDomains:1,protectedOwnedDomains:2},{observedHealthyMailboxes:51},{providerColdPerMailboxDay:51},{schedulerIntervalMinutes:0}]) assert.throws(()=>audit(arg));
});
test('known zero eligible volume remains known zero, unlike unknown',()=>{
 const z=audit({observedEligibleMessages:0});
 assert.ok(z.blockers.includes('eligible-source-message-inventory-below-target'));
 assert.ok(!z.blockers.includes('eligible-source-message-inventory-unknown'));
});
test('legacy hourly cap cannot be green even with inflated sender count',()=>{
 const a=audit({plannedMailboxes:150,observedHealthyMailboxes:150,observedEligibleMessages:40000,totalOwnedDomains:55});
 assert.ok(a.scheduling.legacyTwoLaneHourlyMaxMessagesPerMonth<30000);
 assert.equal(a.fullLaunchReady,false);
});
test('sender volume scenarios at 30 active days remain arithmetic, not measured',()=>{
 const a=audit();
 assert.deepEqual(a.scenarioMatrix.map(x=>[x.coldPerMailboxDay,x.mailboxesRequired,x.capacity50]),[[10,100,15000],[15,67,22500],[20,50,30000]]);
});
test('30-day scenario requires regional calendar proof rather than assumes any globally valid Saturday',()=>{
 const a=audit({providerColdPerMailboxDay:20});
 assert.equal(a.regionalBusinessCalendar.complete,false);
 assert.equal(a.fleet.providerAdvertisedMonthlyMax,30000);
 assert.ok(a.blockers.includes('daily-global-business-window-evidence-not-complete'));
 assert.equal(a.fullLaunchReady,false);
});
test('10 percent missed mailbox-days requires buffer, not 50 maxed inboxes',()=>{
 const a=audit({providerColdPerMailboxDay:20});
 assert.equal(a.availabilitySensitivity.at(-1).mailboxesRequiredAtProviderGuidance,56);
 assert.equal(a.availabilitySensitivity.at(-1).mailboxesRequiredAtCurrentCap,112);
});
test('30 evidence dates with Saturday closed records cannot prove daily 1000',()=>{
 const start=Date.UTC(2026,9,1);
 const dailyMarketEvidence=Array.from({length:30},(_,i)=>{
  const date=new Date(start+i*86400000).toISOString().slice(0,10);
  const sat=new Date(start+i*86400000).getUTCDay()===6;
  return {date,markets:[{region:'R1',businessHoursVerified:!sat,senderLegalityVerified:true,recipientLegalityVerified:true,evidenceRef:'fixture',healthyMailboxIds:Array.from({length:100},(_,j)=>'slot-'+j),eligibleRecipients:1000}]};
 });
 const a=audit({dailyMarketEvidence,plannedMailboxes:100});
 assert.equal(a.regionalBusinessCalendar.complete,true);
 assert.equal(a.regionalBusinessCalendar.provenAndInsufficient,true);
 assert.ok(a.regionalBusinessCalendar.shortDays.length>0);
 assert.equal(a.fullLaunchReady,false);
});
test('refuse duplicate dates, ungrounded regions, and missing eligibility',()=>{
 const same={date:'2026-10-01',markets:[{region:'X',businessHoursVerified:true,senderLegalityVerified:true,recipientLegalityVerified:true,evidenceRef:'proof',healthyMailboxIds:['slot-1'],eligibleRecipients:1}]};
 assert.throws(()=>audit({sendingDays:2,dailyMarketEvidence:[same,same]}),/duplicate-date/);
 assert.throws(()=>audit({sendingDays:1,dailyMarketEvidence:[{date:'2026-10-01',markets:[]}]}),/region-evidence/);
});
test('cross-region sender reuse cannot double count single mailbox daily cap',()=>{
 const dailyMarketEvidence=[{date:'2026-10-01',markets:[
 {region:'West',businessHoursVerified:true,senderLegalityVerified:true,recipientLegalityVerified:true,evidenceRef:'r1',healthyMailboxIds:['sam@a.com'],eligibleRecipients:100},
 {region:'East',businessHoursVerified:true,senderLegalityVerified:true,recipientLegalityVerified:true,evidenceRef:'r2',healthyMailboxIds:['sam@a.com'],eligibleRecipients:100}
 ]}];
 const a=audit({sendingDays:1,targetMessages:20,internalDailyCap:10,dailyMarketEvidence});
 assert.equal(a.regionalBusinessCalendar.calendarMaxTotal,10);
 assert.equal(a.regionalBusinessCalendar.shortDays.length,1);
});
