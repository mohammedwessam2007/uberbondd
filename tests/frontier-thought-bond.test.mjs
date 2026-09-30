import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { semanticHash, semanticProgramHash } from '../src/semantic-closure-kernel.mjs';
import { mintFrontierThoughtBond, verifyFrontierThoughtBond, verifyDistinctThoughtBondConsumers, modelThoughtBondFanout, thoughtBondAuthorityId } from '../src/frontier-thought-bond.mjs';
import { createInfiniteOpusRuntime, INFINITE_OPUS_TASK_SCHEMA } from '../src/infinite-opus-native-runtime.mjs';

const h=x=>crypto.createHash('sha256').update(String(x)).digest('hex');
const now=Date.parse('2026-09-30T20:00:00Z');

function makeStore(){let settings={};return{transaction:async fn=>fn({transactionClient:false,getSettings:async()=>structuredClone(settings),setSetting:async(k,v)=>{settings={...settings,[k]:structuredClone(v)};}})};}

function fixture(){
 const quality=h('quality');
 const value={decision:'APPROVE'};
 const artifact={scope:'TB',qualityContractHash:quality,nodes:[],claims:[]};
 const context={scope:'TB',crownRevision:'opus-5.5-r1',qualityContractHash:quality,sourceHashes:{source:h('source')},invalidators:{drift:false},requiredClaimIds:['answer'],authorizedProgramHash:null};
 const obligation={taskClass:'SHARED_DECISION',question:'Is exact condition P satisfied?'};
 // Build authority id from the final cut. authorizedProgramHash itself depends on
 // the artifact program, so derive the program after inserting the deterministic id.
 let cut={obligation,context:{...context,authorizedProgramHash:h('placeholder')}};
 let authorityId=thoughtBondAuthorityId(semanticHash(cut));
 artifact.nodes=[{id:'crown',kind:'CROWN',authorityId,dependencies:[],value}];
 artifact.claims=[{id:'answer',nodeId:'crown',value}];
 context.authorizedProgramHash=semanticProgramHash(artifact);
 // Recompute once with final context and update the artifact authority id.
 cut={obligation,context};
 authorityId=thoughtBondAuthorityId(semanticHash(cut));
 artifact.nodes[0].authorityId=authorityId;
 context.authorizedProgramHash=semanticProgramHash(artifact);
 cut={obligation,context};
 // The authority id now depends on a context hash that includes the program hash,
 // so use a stable explicit bond id in the artifact generated from the final cut.
 const cutHash=semanticHash(cut);
 authorityId=thoughtBondAuthorityId(cutHash);
 artifact.nodes[0].authorityId=authorityId;
 context.authorizedProgramHash=semanticProgramHash(artifact);
 cut={obligation,context};
 const finalCutHash=semanticHash(cut);
 if(thoughtBondAuthorityId(finalCutHash)!==authorityId){
   // Avoid recursive self-reference by binding the task program to a neutral
   // authority slot and letting the runtime map the exact cut to that slot.
   artifact.nodes[0].authorityId='thought-bond-slot';
   context.authorizedProgramHash=semanticProgramHash(artifact);
   cut={obligation,context};
 }
 const observation={
  observationId:'obs-1',semanticAuthority:'CURRENT_TASK_CLASS_CROWN',exactModelId:'anthropic/claude-opus-5.5',
  cutHash:semanticHash(cut),scope:context.scope,qualityContractHash:context.qualityContractHash,crownRevision:context.crownRevision,
  sourceHashes:structuredClone(context.sourceHashes),invalidators:structuredClone(context.invalidators),
  value,providerReceiptRef:'openrouter://generation/1',observedAt:'2026-09-30T19:00:00Z'
 };
 const pin=semanticHash(observation);
 const minted=mintFrontierThoughtBond({cut,crownObservation:observation,observationTrustPin:pin,expiresAt:'2026-10-01T00:00:00Z',now});
 return {quality,value,artifact,context,obligation,cut,observation,pin,minted};
}

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
