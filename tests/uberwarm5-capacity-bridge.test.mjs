import test from 'node:test';
import assert from 'node:assert/strict';
import {protectUberWarm5FleetCapacity as protect} from '../src/uberwarm5-capacity-bridge.mjs';
const NOW='2026-10-12T20:00:00Z';
const mock=(address,cap=10,state='RAMP')=>({
  address,mailboxId:address,state,recommendedColdDailyCap:cap,reasonCodes:[]
});
const FLEET={version:'uberbond.uberwarm.v1.1',decisions:[
 mock('tara@sender.example',15),mock('nadia@sender.example',10),
 mock('partner@other.example',7)],
 totalRecommendedDailyCap:32,readyMailboxCount:3
};
const report=(patch={})=>({
  status:'OBSERVED_RECEIVER_FEEDBACK_COMPILED',generatedAt:NOW,
  decisions:FLEET.decisions.map(x=>({senderEmail:x.address,state:'NO_OBSERVED_INCIDENT'})),
  blockedProviderGroups:[],suppressionActions:[],messageNoRetryActions:[],
  ...patch
});
const run=(receiverReport,opts={})=>protect({
 warmFleet:FLEET,receiverReport,now:NOW,verifyReceiverReport:()=>true,...opts
});
test('missing receiver history reduces old 32/day capacity to ZERO',()=>{
 const r=run(null);
 assert.equal(r.originalRecommendedDailyCap,32);
 assert.equal(r.totalRecommendedDailyCap,0);
 assert.equal(r.readyMailboxCount,0);
 assert.equal(r.decisions.every(x=>x.state==='QUARANTINED'),true);
});
test('untrusted or stale report reduces all senders to ZERO',()=>{
 const forged=run(report(),{verifyReceiverReport:()=>false});
 assert.equal(forged.totalRecommendedDailyCap,0);
 const stale=run(report({generatedAt:'2026-10-12T19:30:00Z'}));
 assert.equal(stale.totalRecommendedDailyCap,0);
});
test('verified current complete sender roster preserves lower original capacities',()=>{
 const r=run(report());
 assert.equal(r.receiverReportAuthenticated,true);
 assert.equal(r.totalRecommendedDailyCap,32);
 assert.equal(r.readyMailboxCount,3);
 assert.equal(r.externalEffectAuthority,'NONE');
});
test('provider hold for sending domain blocks all its senders while other domain retains cap',()=>{
 const r=run(report({blockedProviderGroups:[{
    domain:'sender.example',recipientProviderGroup:'GOOGLE_MX',state:'HOLD'
 }]}));
 assert.equal(r.totalRecommendedDailyCap,7);
 assert.equal(r.decisions[0].recommendedColdDailyCap,0);
 assert.equal(r.decisions[1].recommendedColdDailyCap,0);
 assert.equal(r.decisions[2].recommendedColdDailyCap,7);
});
test('a sender missing from trusted roster is quarantined, not silently assumed healthy',()=>{
 const roster=report();roster.decisions=roster.decisions.slice(1);
 const r=run(roster);
 assert.equal(r.totalRecommendedDailyCap,17);
 assert.equal(r.decisions[0].state,'QUARANTINED');
});
test('existing quarantine is never cleared by healthy receiver observations',()=>{
 const fleet={...FLEET,decisions:[mock('tara@sender.example',0,'QUARANTINED')]};
 const r=protect({warmFleet:fleet,receiverReport:report(),now:NOW,verifyReceiverReport:()=>true});
 assert.equal(r.totalRecommendedDailyCap,0);
 assert.equal(r.readyMailboxCount,0);
});
test('even apparent 300/day sender cannot increase beyond protective 20 upper cap',()=>{
 const fleet={...FLEET,decisions:[mock('tara@sender.example',300)]};
 const r=protect({warmFleet:fleet,receiverReport:report(),now:NOW,verifyReceiverReport:()=>true});
 assert.equal(r.totalRecommendedDailyCap,20);
 assert.equal(r.externalEffectAuthority,'NONE');
});
test('invalid provider report missing suppression or message no-retry arrays fails closed',()=>{
 const v=run(report({messageNoRetryActions:null}));
 assert.equal(v.totalRecommendedDailyCap,0);
});
