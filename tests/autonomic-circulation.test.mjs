import test from 'node:test';
import assert from 'node:assert/strict';
import { compileAutonomicCirculationPlan, compileAutonomicFeedback } from '../src/autonomic-circulation.mjs';

const SHA='a'.repeat(40);
const now=new Date('2026-09-13T00:00:00Z');
function cognitive(overrides={}){return{sourceCommit:SHA,observedAt:'2026-09-12T23:59:30Z',cycleDigest:'c'.repeat(64),eventCount:4,activationCount:9,targetCounts:{'genesis-metabolism':2,'opportunity-factory':1,'economic-memory':1},eventSummaries:['new buyer signal','provider blocker'],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',...overrides};}
function metabolism(overrides={}){return{receiptId:'met-1',sourceCommit:SHA,inputDigest:'other',observedAt:'2026-09-12T23:59:40Z',status:'METABOLISM_CANDIDATE_READY',missingFamilies:['CAPABILITY_SUBSTITUTION'],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',...overrides};}
function revenue(overrides={}){return{receiptId:'rev-1',sourceCommit:SHA,inputDigest:'r'.repeat(64),observedAt:'2026-09-12T23:59:45Z',status:'REVENUE_CANARIES_SELECTED',canaries:['lead-generation-service'],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',...overrides};}

test('cold circulation energizes cognition and paper revenue without creating consequence authority',()=>{
 const r=compileAutonomicCirculationPlan({sourceCommit:SHA,now});
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.deepEqual(r.plan.jobs.map(x=>x.type).sort(),['autonomic.cognitive.refresh','autonomic.revenue.paper']);
 assert.equal(r.plan.businessEffectAuthority,'NONE');
 assert.equal(r.plan.externalEffectAuthority,'NONE');
 assert.ok(r.plan.jobs.every(job=>job.consequenceClass==='LOCAL_PREPARATION'&&job.externalEffectAuthority==='NONE'));
});

test('live cognitive pressure fans out independent local lanes instead of idling behind one blocker',()=>{
 const r=compileAutonomicCirculationPlan({sourceCommit:SHA,cognitive:cognitive(),revenue:revenue(),now});
 assert.equal(r.ok,true,JSON.stringify(r));
 const types=new Set(r.plan.jobs.map(x=>x.type));
 assert.ok(types.has('autonomic.metabolism.plan'));
 assert.ok(types.has('prometheus.commercial.catalog'));
 assert.ok(types.has('prometheus.commercial_memory.contradiction_scan'));
 assert.ok(types.has('autonomic.feedback.compile'));
});

test('stable matching receipts collapse work instead of clock-spamming the same energy packet',()=>{
 const first=compileAutonomicCirculationPlan({sourceCommit:SHA,cognitive:cognitive(),revenue:revenue(),now});
 const cd=first.plan.cognitiveDigest;
 const stableMet=metabolism({inputDigest:cd});
 const feedback={sourceCommit:SHA,feedbackDigest:'f'.repeat(64),cognitiveDigest:cd,metabolismReceiptId:stableMet.receiptId,revenueReceiptId:'rev-1',observedAt:'2026-09-12T23:59:50Z'};
 const acknowledged=cognitive({autonomicFeedbackDigest:feedback.feedbackDigest});
 const r=compileAutonomicCirculationPlan({sourceCommit:SHA,cognitive:acknowledged,metabolism:stableMet,revenue:revenue(),commercialCatalog:{inputDigest:cd},contradictionScan:{inputDigest:cd},feedback,now});
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.equal(r.plan.jobs.length,0,JSON.stringify(r.plan.jobs));
 assert.equal(r.status,'AUTONOMIC_CIRCULATION_STABLE');
});

test('assimilating internal feedback changes the full cycle but not upstream stimulus identity or metabolism demand',()=>{
 const stimulus='s'.repeat(64);const feedbackDigest='f'.repeat(64);
 const met=metabolism({inputDigest:stimulus});
 const feedback={sourceCommit:SHA,feedbackDigest,metabolismReceiptId:met.receiptId,revenueReceiptId:'rev-1',observedAt:'2026-09-12T23:59:50Z'};
 const before=cognitive({stimulusDigest:stimulus,autonomicFeedbackDigest:null});
 const pending=compileAutonomicCirculationPlan({sourceCommit:SHA,cognitive:before,metabolism:met,revenue:revenue(),commercialCatalog:{inputDigest:stimulus},contradictionScan:{inputDigest:stimulus},feedback,now});
 assert.ok(pending.plan.jobs.some(job=>job.type==='autonomic.cognitive.refresh'));
 assert.ok(!pending.plan.jobs.some(job=>job.type==='autonomic.metabolism.plan'));
 const after=cognitive({cycleDigest:'d'.repeat(64),stimulusDigest:stimulus,autonomicFeedbackDigest:feedbackDigest,eventCount:6,activationCount:12});
 const settled=compileAutonomicCirculationPlan({sourceCommit:SHA,cognitive:after,metabolism:met,revenue:revenue(),commercialCatalog:{inputDigest:stimulus},contradictionScan:{inputDigest:stimulus},feedback,now});
 assert.equal(settled.plan.cognitiveDigest,stimulus);
 assert.ok(!settled.plan.jobs.some(job=>job.type==='autonomic.metabolism.plan'));
 assert.ok(!settled.plan.jobs.some(job=>job.type==='autonomic.cognitive.refresh'));
});

test('stale cognition self-refreshes while unrelated paper allocation remains independently eligible',()=>{
 const r=compileAutonomicCirculationPlan({sourceCommit:SHA,cognitive:cognitive({observedAt:'2026-09-12T20:00:00Z'}),now});
 const types=new Set(r.plan.jobs.map(x=>x.type));
 assert.ok(types.has('autonomic.cognitive.refresh'));
 assert.ok(types.has('autonomic.revenue.paper'));
});

test('feedback converts metabolism and revenue receipts into cognitive events with zero authority',()=>{
 const r=compileAutonomicFeedback({sourceCommit:SHA,cognitive:cognitive(),metabolism:metabolism(),revenue:revenue(),observedAt:now});
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.equal(r.bundle.events.length,2);
 assert.deepEqual(r.bundle.events.map(e=>e.event.kind).sort(),['ECONOMIC_LEARNING','METABOLISM_UPDATE']);
 assert.ok(r.bundle.events.every(e=>e.event.businessEffectAuthority==='NONE'&&e.event.consequenceAuthority==='NONE'));
 assert.equal(r.bundle.externalEffectAuthority,'NONE');
});

test('feedback refuses any receipt that tries to smuggle consequence authority',()=>{
 const r=compileAutonomicFeedback({sourceCommit:SHA,metabolism:metabolism({externalEffectAuthority:'DEPLOY'}),revenue:revenue(),observedAt:now});
 assert.equal(r.ok,false,JSON.stringify(r));
 assert.ok(r.reasonCodes.includes('zero-authority-metabolism-receipt-required'));
});

test('source identity is mandatory',()=>{
 assert.equal(compileAutonomicCirculationPlan({sourceCommit:'not-a-sha',now}).ok,false);
 assert.equal(compileAutonomicFeedback({sourceCommit:'not-a-sha',observedAt:now}).ok,false);
});
