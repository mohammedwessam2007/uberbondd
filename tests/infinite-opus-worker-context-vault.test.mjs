import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createInfiniteOpusRuntime, createInfiniteOpusJobHandlers, INFINITE_OPUS_TASK_SCHEMA } from '../src/infinite-opus-native-runtime.mjs';
import { semanticHash } from '../src/semantic-closure-kernel.mjs';

const h=x=>crypto.createHash('sha256').update(String(x)).digest('hex');
const now=Date.parse('2026-09-30T20:00:00Z');
function store(){
 let settings={};
 return {transaction:async fn=>fn({transactionClient:false,getSettings:async()=>structuredClone(settings),setSetting:async(k,v)=>{settings={...settings,[k]:structuredClone(v)};}})};
}
const ctx={
 scope:'WORKER_RECURRING',crownRevision:'opus-5.5-r1',qualityContractHash:h('quality'),
 sourceHashes:{rules:h('rules-v1')},invalidators:{rulesChanged:false},
 requiredClaimIds:['decision'],authorizedProgramHash:h('program')
};
function bundle(){
 const domain=[{state:'A'},{state:'B'}];
 const observations=domain.map((input,i)=>{
  const decision={result:i?'B':'A'};
  const o={observationId:'obs-'+i,semanticAuthority:'CURRENT_TASK_CLASS_CROWN',exactModelId:'anthropic/claude-opus-5.5',
   taskClass:'WORKER_DECISION',qualityContractHash:ctx.qualityContractHash,crownRevision:ctx.crownRevision,
   input,inputHash:semanticHash(input),decision,decisionHash:semanticHash(decision),providerReceiptRef:'provider://receipt-'+i};
  return o;
 });
 return {domain,observations,observationTrustPins:Object.fromEntries(observations.map(o=>[o.observationId,semanticHash(o)])),
  taskClass:'WORKER_DECISION',qualityContractHash:ctx.qualityContractHash,relevantKeys:['state'],crownRevision:ctx.crownRevision,
  sourceDependencies:ctx.sourceHashes,invalidators:ctx.invalidators,evidenceRef:'proof://worker-df',expiresAt:'2026-10-01T00:00:00Z'};
}
const task={schemaVersion:INFINITE_OPUS_TASK_SCHEMA,taskId:'worker-1',taskClass:'WORKER_DECISION',stakes:'KNOWN_LOW',sideEffectClass:'NONE',
 payload:{state:'B'},obligation:{kind:'WORKER_DECISION'}};

test('durable context + durable franchise execute after restart with no external contextLoader',async()=>{
 const s=store(),admin=createInfiniteOpusRuntime({store:s,clock:()=>now});
 const c=await admin.admitContextSnapshot({taskClass:'WORKER_DECISION',context:ctx,evidenceRef:'context://rules-v1',expiresAt:'2026-10-01T00:00:00Z'});
 assert.equal(c.ok,true);
 const f=await admin.admitExhaustiveDecisionFranchise(bundle());assert.equal(f.ok,true);

 const restarted=createInfiniteOpusRuntime({store:s,clock:()=>now});
 const out=await restarted.execute(task);
 assert.equal(out.ok,true);assert.equal(out.status,'CLOSED_DECISION_FRANCHISE');assert.deepEqual(out.decision,{result:'B'});assert.equal(out.providerCallsPerformed,0);
 const snap=await restarted.snapshot();assert.equal(snap.contextSnapshotCount,1);assert.equal(snap.decisionFranchiseCount,1);
});
test('expired context snapshot cannot silently resurrect a franchise',async()=>{
 const s=store(),admin=createInfiniteOpusRuntime({store:s,clock:()=>now});
 const expired=await admin.admitContextSnapshot({taskClass:'WORKER_DECISION',context:ctx,evidenceRef:'context://old',expiresAt:'2026-09-30T19:59:59Z'});
 assert.equal(expired.ok,false);
});
test('queue job handler exposes Infinite Opus execute without exposing admission authority',()=>{
 const handlers=createInfiniteOpusJobHandlers({store:store()});
 assert.equal(typeof handlers['cognition.infinite-opus.execute'],'function');
 assert.equal(typeof handlers['cognition.infinite-opus.snapshot'],'function');
 assert.equal(handlers['cognition.infinite-opus.admitContext'],undefined);
});
