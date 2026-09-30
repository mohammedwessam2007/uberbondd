import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createLivingEvidenceGraph, planLivingEvidenceDelta, applyLivingEvidenceDelta, modelLivingEvidenceDeltaCompression } from '../src/living-evidence-graph.mjs';

const h=x=>crypto.createHash('sha256').update(String(x)).digest('hex');
function fixture(){
 const nodes=[],current={};
 for(let i=0;i<100;i++){
  const sourceKey='source-'+i,sourceHash=h('source-v1-'+i);current[sourceKey]=sourceHash;
  nodes.push({id:'s'+i,kind:'SOURCE',dependencies:[],sourceKey,sourceHash,contentHash:h('source-content-'+i),proofClass:'E0',proofRef:'source://'+i});
  nodes.push({id:'c'+i,kind:'CLAIM',dependencies:['s'+i],contentHash:h('claim-content-'+i),proofClass:'CURRENT_CROWN',proofRef:'crown://'+i});
 }
 const graph=createLivingEvidenceGraph({nodes,roots:Array.from({length:100},(_,i)=>'c'+i),qualityContractHash:h('quality'),crownRevision:'opus-5.5-r1',createdAt:'2026-09-30T19:00:00Z'});
 return {graph,current};
}

test('two changed sources invalidate exactly 2% of a 200-node evidence graph',()=>{
 const {graph,current}=fixture();current['source-0']=h('source-v2-0');current['source-1']=h('source-v2-1');
 const plan=planLivingEvidenceDelta({graph,currentSourceHashes:current,currentCrownRevision:'opus-5.5-r1'});
 assert.equal(plan.changedSourceIds.length,2);assert.equal(plan.affectedIds.length,4);
 assert.equal(plan.recomputeFraction,.02);assert.equal(plan.reuseFraction,.98);
 assert.equal(plan.reusableIds.length,196);
});

test('complete proof-bearing replacements update only the affected subgraph',()=>{
 const {graph,current}=fixture();current['source-0']=h('source-v2-0');
 const plan=planLivingEvidenceDelta({graph,currentSourceHashes:current});
 const replacements=[
  {...graph.nodes.find(n=>n.id==='s0'),sourceHash:current['source-0'],contentHash:h('new-source-content'),proofClass:'E0',proofRef:'source://0/v2'},
  {...graph.nodes.find(n=>n.id==='c0'),contentHash:h('new-claim-content'),proofClass:'CURRENT_CROWN',proofRef:'crown://0/v2'}
 ];
 const next=applyLivingEvidenceDelta({graph,plan,currentSourceHashes:current,replacements,appliedAt:'2026-09-30T20:00:00Z'});
 assert.notEqual(next.graphHash,graph.graphHash);
 assert.equal(next.nodes.find(n=>n.id==='s0').sourceHash,current['source-0']);
 assert.equal(next.nodes.find(n=>n.id==='s1').contentHash,graph.nodes.find(n=>n.id==='s1').contentHash);
});

test('Crown succession invalidates all cognition instead of reusing stale authority',()=>{
 const {graph,current}=fixture();
 const plan=planLivingEvidenceDelta({graph,currentSourceHashes:current,currentCrownRevision:'opus-successor'});
 assert.equal(plan.crownSuccessionInvalidatedAll,true);assert.equal(plan.recomputeFraction,1);assert.equal(plan.reuseFraction,0);
});

test('cycle is refused',()=>{
 const nodes=[
  {id:'a',kind:'DERIVED',dependencies:['b'],contentHash:h('a'),proofClass:'E1',proofRef:'proof://a'},
  {id:'b',kind:'DERIVED',dependencies:['a'],contentHash:h('b'),proofClass:'E1',proofRef:'proof://b'}
 ];
 assert.throws(()=>createLivingEvidenceGraph({nodes,roots:['a'],qualityContractHash:h('q'),crownRevision:'opus-5.5-r1'}),/evidence-graph-cycle/);
});

test('2% source delta models above 315x while changed semantics still page to Crown',()=>{
 const modeled=modelLivingEvidenceDeltaCompression({directOpusUsd:.85,changedSourceTokens:4000,deltaWorkerOutputTokens:100,crownResidualInputTokens:500,crownOutputTokens:6});
 assert.ok(modeled.multiplier>315);assert.ok(modeled.multiplier<316);
 assert.equal(modeled.uberMindUsd,.002692);
});
