import test from 'node:test';
import assert from 'node:assert/strict';
import { executeBoundedSourceWork, compileSourceWorkCheckpoint } from '../src/ubermind-exact-source-work.mjs';

const a='config/absolute-frontier-quality-lock.json';
const b='open router/MANIFEST.json';
const date='2026-10-08T17:00:00Z';
const sources=()=>({[a]:{task:{id:'case',accepted:true},groups:[3,5,8]},
  [b]:{version:1,items:[{name:'first',ok:true},{name:'second',ok:false}]}});
test('resolves a bounded actual JSON-source workload with exact output receipts',()=>{
  const x=executeBoundedSourceWork({sourceDocuments:sources()});
  assert.equal(x.ok,true);assert.equal(x.verifiedSourceCount,2);
  assert.equal(x.materializedOutputCount,10);
  assert.equal(new Set(x.completedObligationIds).size,10);
  assert.match(x.receiptBatchDigest,/^sha256:[a-f0-9]{64}$/);
  assert.equal(x.providerCallsPerformed,0);
  assert.equal(x.independentFrontierQualitySamplesAdded,0);
  assert.equal(x.empiricalMultiplier,null);
  assert.equal(x.global33333xConfirmed,false);
});
test('unapproved paths and empty input are rejected',()=>{
  for(const docs of [{},{'misc/unlisted.json':{a:1}},
    {'../config/absolute-frontier-quality-lock.json':{a:1}}]){
    const x=executeBoundedSourceWork({sourceDocuments:docs});
    assert.equal(x.ok,false);assert.equal(x.materializedOutputCount,0);
  }
});
test('independent resolver mismatch aborts without returning partial work',()=>{
  let calls=0;
  const x=executeBoundedSourceWork({sourceDocuments:sources(),
    resolve:(_doc,_ptr)=>{calls++;return calls===2?'different':'other';}});
  assert.equal(x.ok,false);assert.equal(x.materializedOutputCount,0);
  assert.equal(x.receiptBatchDigest,null);
});
test('workload capacity bound is enforced before release',()=>{
  const x=executeBoundedSourceWork({sourceDocuments:sources(),maximumObligations:1});
  assert.equal(x.ok,false);assert.equal(x.materializedOutputCount,0);
});
test('identical versions never inflate source-work metrics',()=>{
  const work=executeBoundedSourceWork({sourceDocuments:sources()});
  const first=compileSourceWorkCheckpoint({work,observedAt:date});
  assert.equal(first.ok,true);assert.equal(first.changed,true);
  const second=compileSourceWorkCheckpoint({prior:first.ledger,work,observedAt:date});
  assert.equal(second.ok,true);assert.equal(second.changed,false);
  assert.equal(second.newVerifiedObligationsThisVersion,0);
  assert.equal(second.ledger.versions.length,1);
});
test('source changes are recorded as distinct verified versions',()=>{
  const w=executeBoundedSourceWork({sourceDocuments:sources()});
  const first=compileSourceWorkCheckpoint({work:w,observedAt:date});
  const next=sources();next[b].version=2;
  const second=compileSourceWorkCheckpoint({prior:first.ledger,
    work:executeBoundedSourceWork({sourceDocuments:next}),observedAt:date});
  assert.equal(second.ok,true);assert.equal(second.changed,true);
  assert.equal(second.ledger.versions.length,2);
});
test('conflicting prior versions and inflated output claims are held',()=>{
  const work=executeBoundedSourceWork({sourceDocuments:sources()});
  const first=compileSourceWorkCheckpoint({work,observedAt:date});
  const mismatch={...work,receiptBatchDigest:'sha256:'+'f'.repeat(64)};
  assert.equal(compileSourceWorkCheckpoint({prior:first.ledger,work:mismatch,observedAt:date}).ok,false);
  assert.equal(compileSourceWorkCheckpoint({work:{...work,materializedOutputCount:50000},observedAt:date}).ok,false);
});
