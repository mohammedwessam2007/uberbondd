import test from 'node:test';
import assert from 'node:assert/strict';
import {compileOutreach30kFeasibility as audit} from '../src/outreach-30k-feasibility.mjs';

test('default 22-day, 50 box scenario is below 30k',()=>{
 const a=audit();
 assert.equal(a.fleet.currentPolicyMonthlyMax,11000);
 assert.equal(a.fleet.providerAdvertisedMonthlyMax,16500);
 assert.equal(a.fleet.requiredMailboxesAtProviderGuidance,91);
 assert.equal(a.fleet.requiredMailboxesAtInternalCap,137);
 assert.equal(a.scheduling.requiredBatchSizeIgnoringHourlyCaps,15);
 assert.equal(a.scheduling.legacyBatchMaxMessagesPerMonth,21120);
 assert.equal(a.scheduling.legacyTwoLaneHourlyMaxMessagesPerMonth,1760);
 assert.equal(a.money.providerGuidanceFleet.recurringTotalUsd,119);
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
test('22 days at 20/day requires 69 mailboxes and 23 domain slots',()=>{
 const a=audit({providerColdPerMailboxDay:20});
 assert.equal(a.fleet.requiredMailboxesAtProviderGuidance,69);
 assert.equal(a.money.providerGuidanceFleet.domainSlots,23);
 assert.equal(a.money.providerGuidanceFleet.recurringTotalUsd,97);
});
test('50 default mailboxes plus optional warmup costs $108/month with retained pilot',()=>{
 const a=audit({warmingEnabled:true});
 assert.deepEqual(a.money.plannedFleet,{mailboxes:50,domainSlots:17,startupWithExtrasUsd:69,optionalWarmingUsd:30,retainedPilotUsd:9,recurringTotalUsd:108,excludes:'domains, taxes, processing fees, FX, additional tools and compute'});
 assert.equal(a.money.providerGuidanceFleet.recurringTotalUsd,173.6);
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
test('a planned fleet of 91 boxes cannot fit 28 domains at max 3/domain',()=>{
 const a=audit({plannedMailboxes:91,totalOwnedDomains:30});
 assert.ok(a.blockers.includes('insufficient-verified-domain-topology-for-planned-mailboxes'));
 assert.equal(a.fleet.requiredDomainSlotsForPlannedFleet,31);
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
test('partial weekday capacity cannot be green even with inflated sender count',()=>{
 const a=audit({plannedMailboxes:150,observedHealthyMailboxes:150,observedEligibleMessages:40000,totalOwnedDomains:55});
 assert.ok(a.scheduling.legacyTwoLaneHourlyMaxMessagesPerMonth<30000);
 assert.equal(a.fullLaunchReady,false);
});
test('sender volume scenarios at 22 business days remain arithmetic, not measured',()=>{
 const a=audit();
 assert.deepEqual(a.scenarioMatrix.map(x=>[x.coldPerMailboxDay,x.mailboxesRequired,x.capacity50]),[[10,137,11000],[15,91,16500],[20,69,22000]]);
});
