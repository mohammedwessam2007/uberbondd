import test from 'node:test';
import assert from 'node:assert/strict';
import { compilePlacementProbePlan, normalizePlacementObservation, compilePlacementReport, uberWarmPlacementObservation } from '../src/uberplacement.mjs';
test('plan uses only owner-controlled receive-ready seed inboxes and sends nothing',()=>{
 const p=compilePlacementProbePlan({
  senders:[{slot:'s1',email:'sender@example.com',connected:true}],
  seedInboxes:[
   {email:'a@gmail.com',ownerControlled:true,receiveReady:true},
   {email:'b@outlook.com',ownerControlled:true,receiveReady:true},
   {email:'no@yahoo.com',ownerControlled:false,receiveReady:true}
  ],now:new Date('2026-09-26T16:00:00Z')
 });
 assert.equal(p.probes.length,2);assert.equal(p.messagesSent,0);assert.equal(p.probes.every(x=>x.sendAuthorized===false),true);
});
test('observations require concrete receiving-folder evidence',()=>{
 const bad=normalizePlacementObservation({probeId:'p',senderEmail:'s@example.com',seedEmail:'a@gmail.com',evidenceRef:'x',observedAt:'2026-09-26T16:00:00Z'});
 assert.equal(bad.ok,false);
 const good=normalizePlacementObservation({probeId:'p',senderEmail:'s@example.com',seedEmail:'a@gmail.com',folder:'INBOX',evidenceRef:'receipt:g',observedAt:'2026-09-26T16:00:00Z'});
 assert.equal(good.ok,true);assert.equal(good.observation.state,'INBOX');
});
test('report computes only observed seed placement and exports UberWarm fields',()=>{
 const plan={probes:[
  {probeId:'p1',senderEmail:'s@example.com',seedEmail:'a@gmail.com',seedProvider:'google'},
  {probeId:'p2',senderEmail:'s@example.com',seedEmail:'b@outlook.com',seedProvider:'microsoft'}
 ]};
 const observations=[
  {probeId:'p1',senderEmail:'s@example.com',seedEmail:'a@gmail.com',seedProvider:'google',folder:'inbox',evidenceRef:'g',observedAt:'2026-09-26T16:00:00Z'},
  {probeId:'p2',senderEmail:'s@example.com',seedEmail:'b@outlook.com',seedProvider:'microsoft',folder:'spam',evidenceRef:'m',observedAt:'2026-09-26T16:00:00Z'}
 ];
 const report=compilePlacementReport({plan,observations});
 assert.equal(report.senderReports[0].inboxPlacementRate,.5);
 assert.equal(report.senderReports[0].spamPlacementRate,.5);
 assert.equal(uberWarmPlacementObservation(report.senderReports[0]).inboxPlacementRate,.5);
});
