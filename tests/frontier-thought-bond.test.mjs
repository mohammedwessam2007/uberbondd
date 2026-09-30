import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { semanticHash, semanticProgramHash } from '../src/semantic-closure-kernel.mjs';
import { mintFrontierThoughtBond, verifyFrontierThoughtBond, verifyDistinctThoughtBondConsumers, modelThoughtBondFanout, thoughtBondAuthorityId, thoughtBondSlotHash } from '../src/frontier-thought-bond.mjs';
import { createInfiniteOpusRuntime, INFINITE_OPUS_TASK_SCHEMA } from '../src/infinite-opus-native-runtime.mjs';

const h=x=>crypto.createHash('sha256').update(String(x)).digest('hex');
const now=Date.parse('2026-09-30T20:00:00Z');

function makeStore(){let settings={};return{transaction:async fn=>fn({transactionClient:false,getSettings:async()=>structuredClone(settings),setSetting:async(k,v)=>{settings={...settings,[k]:structuredClone(v)};}})};}

function fixture(){
 const quality=h('quality');
 const value={decision:'APPROVE'};
 const obligation={taskClass:'SHARED_DECISION',question:'Is exact condition P satisfied?'};
 const context={
  scope:'TB',crownRevision:'opus-5.5-r1',qualityContractHash:quality,
  sourceHashes:{source:h('source')},invalidators:{drift:false},
  requiredClaimIds:['answer'],authorizedProgramHash:h('placeholder')
 };
 const slotCut={obligation,context};
 const authorityId=thoughtBondAuthorityId(thoughtBondSlotHash(slotCut));
 const artifact={
  scope:'TB',qualityContractHash:quality,
  nodes:[{id:'crown',kind:'CROWN',authorityId,dependencies:[],value}],
  claims:[{id:'answer',nodeId:'crown',value}]
 };
 context.authorizedProgramHash=semanticProgramHash(artifact);
 const cut={obligation,context};
 const observation={
  observationId:'obs-1',semanticAuthority:'CURRENT_TASK_CLASS_CROWN',exactModelId:'anthropic/claude-opus-5.5',
  cutHash:semanticHash(cut),scope:context.scope,qualityContractHash:context.qualityContractHash,crownRevision:context.crownRevision,
  sourceHashes:structuredClone(context.sourceHashes),invalidators:structuredClone(context.invalidators),
  value,providerReceiptRef:'openrouter://generation/1',observedAt:'2026-09-30T19:00:00Z'
 };
 const pin=semanticHash(observation);
 const minted=mintFrontierThoughtBond({cut,crownObservation:observation,observationTrustPin:pin,expiresAt:'2026-10-01T00:00:00Z',now});
 return {quality,value,artifact,context,obligation,cut,authorityId,observation,pin,minted};
}

function makeStore(){let settings={};return{transaction:async fn=>fn({transactionClient:false,getSettings:async()=>structuredClone(settings),setSetting:async(k,v)=>{settings={...settings,[k]:structuredClone(v)};}})};}
const runtimeTask=(f,id)=>({
 schemaVersion:INFINITE_OPUS_TASK_SCHEMA,taskId:id,taskClass:'SHARED_DECISION',stakes:'LOW',sideEffectClass:'NONE',
 artifact:structuredClone(f.artifact),obligation:structuredClone(f.obligation)
});

test('one trusted Opus observation mints a verified exact-cut Thought Bond',()=>{
 const f=fixture();assert.equal(f.minted.ok,true);
 const verified=verifyFrontierThoughtBond({bond:f.minted.bond,now});
 assert.equal(verified.ok,true);assert.equal(verified.cutHash,semanticHash(f.cut));
});

test('500 distinct consumers share one frontier leaf with 500x leaf compression',()=>{
 const f=fixture();assert.equal(f.minted.ok,true);
 const consumers=Array.from({length:500},(_,i)=>({consumerId:'c-'+i,cutHash:f.minted.bond.cutHash}));
 const proof=verifyDistinctThoughtBondConsumers({bond:f.minted.bond,consumers,now});
 assert.equal(proof.ok,true);assert.equal(proof.consumerCount,500);assert.equal(proof.frontierLeafCompressionFactor,500);
 const model=modelThoughtBondFanout({consumerCount:500,crownUnitUsd:.00212});
 assert.equal(model.multiplier,500);assert.equal(model.coalescedCrownUsd,.00212);
});

test('tampered bond is refused',()=>{
 const f=fixture();const bond=structuredClone(f.minted.bond);bond.record.value={decision:'REJECT'};
 const verified=verifyFrontierThoughtBond({bond,now});assert.equal(verified.ok,false);
});


test('native runtime coalesces debt into one admitted Thought Bond and reuses it across tasks',async()=>{
 const f=fixture();assert.equal(f.minted.ok,true);
 const runtime=createInfiniteOpusRuntime({store:makeStore(),clock:()=>now,contextLoader:async()=>structuredClone(f.context)});
 const first=await runtime.execute(runtimeTask(f,'tb-task-1'));
 assert.equal(first.ok,false);assert.equal(first.status,'CROWN_PAGE_FAULT_QUEUED');
 const plan=await runtime.demandPlan();
 assert.equal(plan.cuts.length,1);
 assert.equal(plan.cuts[0].thoughtBondAuthorityId,f.minted.bond.record.id);
 assert.equal(plan.cuts[0].thoughtBondPresent,false);
 const admitted=await runtime.admitThoughtBond(f.minted.bond);
 assert.equal(admitted.ok,true);assert.equal(admitted.status,'FRONTIER_THOUGHT_BOND_ADMITTED');
 const retry=await runtime.execute(runtimeTask(f,'tb-task-1'));
 assert.equal(retry.ok,true);assert.equal(retry.status,'CLOSED_TYPED_ARTIFACT');assert.equal(retry.providerCallsPerformed,0);
 const second=await runtime.execute(runtimeTask(f,'tb-task-2'));
 assert.equal(second.ok,true);assert.equal(second.status,'CLOSED_TYPED_ARTIFACT');assert.equal(second.providerCallsPerformed,0);
 const snap=await runtime.snapshot();assert.equal(snap.thoughtBondCount,1);
});
