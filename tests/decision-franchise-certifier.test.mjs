import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { semanticHash } from '../src/semantic-closure-kernel.mjs';
import { certifyExhaustiveCrownDecisionFranchise } from '../src/decision-franchise-certifier.mjs';
import { executeDecisionFranchise, verifyDistinctFranchiseFanout } from '../src/decision-franchise.mjs';

const h=x=>crypto.createHash('sha256').update(String(x)).digest('hex');
const now=Date.parse('2026-09-30T20:00:00Z');
const quality=h('quality');
const domain=[{risk:'LOW'},{risk:'MEDIUM'},{risk:'HIGH'},{risk:'CRITICAL'}];
const decisionFor=risk=>({route:risk==='LOW'?'AUTO':risk==='MEDIUM'?'REVIEW':risk==='HIGH'?'CROWN':'BLOCK'});

function observations(){
 const rows=domain.map((input,i)=>({
   observationId:'obs-'+i,
   semanticAuthority:'CURRENT_TASK_CLASS_CROWN',
   exactModelId:'anthropic/claude-opus-5.5',
   taskClass:'ROUTE_DECISION',qualityContractHash:quality,crownRevision:'opus-5.5-r1',
   input:structuredClone(input),inputHash:semanticHash(input),
   decision:decisionFor(input.risk),decisionHash:semanticHash(decisionFor(input.risk)),
   providerReceiptRef:'openrouter://generation/'+i,
   observedAt:'2026-09-30T19:00:00Z'
 }));
 return {rows,pins:Object.fromEntries(rows.map(r=>[r.observationId,semanticHash(r)]))};
}
function certify(overrides={}){
 const {rows,pins}=observations();
 return certifyExhaustiveCrownDecisionFranchise({
   domain,observations:rows,observationTrustPins:pins,
   taskClass:'ROUTE_DECISION',qualityContractHash:quality,relevantKeys:['risk'],
   crownRevision:'opus-5.5-r1',sourceDependencies:{policy:h('source')},invalidators:{drift:false},
   evidenceRef:'proof://exhaustive-opus',expiresAt:'2026-10-01T00:00:00Z',now,
   ...overrides
 });
}
const ctx={crownRevision:'opus-5.5-r1',sourceHashes:{policy:h('source')},invalidators:{drift:false}};
const task=(i)=>({
 taskId:'consumer-'+i,taskClass:'ROUTE_DECISION',qualityContractHash:quality,sideEffectClass:'NONE',
 payload:{risk:domain[i%domain.length].risk,requestId:'unique-'+i,narrative:'different '+i}
});

test('exhaustive trusted Opus observations certify E3 franchise',()=>{
 const out=certify();assert.equal(out.ok,true);assert.equal(out.proofClass,'E3');
 assert.equal(out.zeroMismatch,true);assert.equal(out.observedStateCount,4);
 const hit=executeDecisionFranchise({record:out.record,trustPin:out.trustPin,task:task(3),currentContext:ctx,now});
 assert.equal(hit.ok,true);assert.deepEqual(hit.decision,{route:'BLOCK'});assert.equal(hit.providerCallsPerformed,0);
});

test('certified franchise serves 50000 distinct full tasks with zero model calls',()=>{
 const out=certify();assert.equal(out.ok,true);
 const tasks=Array.from({length:50000},(_,i)=>task(i));
 const proof=verifyDistinctFranchiseFanout({record:out.record,trustPin:out.trustPin,tasks,currentContext:ctx,now});
 assert.equal(proof.ok,true);assert.equal(proof.consumerCount,50000);
 assert.equal(proof.uniqueFullTaskCount,50000);assert.equal(proof.uniqueProjectedStateCount,4);
 assert.equal(proof.providerCallsPerformed,0);
});

test('mutated observation after trust pin is refused',()=>{
 const {rows,pins}=observations();rows[0].decision={route:'CROWN'};
 const out=certifyExhaustiveCrownDecisionFranchise({
   domain,observations:rows,observationTrustPins:pins,taskClass:'ROUTE_DECISION',
   qualityContractHash:quality,relevantKeys:['risk'],crownRevision:'opus-5.5-r1',
   sourceDependencies:{policy:h('source')},invalidators:{drift:false},
   evidenceRef:'proof://bad',expiresAt:'2026-10-01T00:00:00Z',now
 });
 assert.equal(out.ok,false);assert.ok(out.reasons.includes('untrusted-or-mutated-crown-observation'));
});

test('missing one domain observation is refused',()=>{
 const {rows,pins}=observations();rows.pop();
 const out=certifyExhaustiveCrownDecisionFranchise({
   domain,observations:rows,observationTrustPins:pins,taskClass:'ROUTE_DECISION',
   qualityContractHash:quality,relevantKeys:['risk'],crownRevision:'opus-5.5-r1',
   sourceDependencies:{policy:h('source')},invalidators:{drift:false},
   evidenceRef:'proof://missing',expiresAt:'2026-10-01T00:00:00Z',now
 });
 assert.equal(out.ok,false);assert.ok(out.reasons.includes('exactly-one-observation-per-domain-state-required'));
});

test('non-Opus observation cannot silently enter the franchise',()=>{
 const {rows,pins}=observations();rows[2].exactModelId='openai/gpt-6.1-sol';pins[rows[2].observationId]=semanticHash(rows[2]);
 const out=certifyExhaustiveCrownDecisionFranchise({
   domain,observations:rows,observationTrustPins:pins,taskClass:'ROUTE_DECISION',
   qualityContractHash:quality,relevantKeys:['risk'],crownRevision:'opus-5.5-r1',
   sourceDependencies:{policy:h('source')},invalidators:{drift:false},
   evidenceRef:'proof://wrong-model',expiresAt:'2026-10-01T00:00:00Z',now
 });
 assert.equal(out.ok,false);assert.ok(out.reasons.includes('exact-opus-5-5-observation-required'));
});
