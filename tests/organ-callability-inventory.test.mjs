import test from 'node:test';
import assert from 'node:assert/strict';
import { compileOrganCallabilityInventory } from '../src/organ-callability-inventory.mjs';

const SHA='a'.repeat(40);
const layers=[
  {id:'CALLABLE',role:'callable',kind:'CORE',stateful:false,runtimeProof:true,sourceRefs:['src/callable.mjs']},
  {id:'GATED',role:'gated',kind:'CORE',stateful:false,runtimeProof:true,sourceRefs:['src/gated.mjs']},
  {id:'REGISTERED',role:'registered',kind:'CORE',stateful:false,runtimeProof:false,sourceRefs:['src/registered.mjs']}
];
const sourceFacts={
  'src/callable.mjs':{exists:true,unattendedReachable:true,classification:null},
  'src/gated.mjs':{exists:true,unattendedReachable:false,classification:{category:'AWAITING_ACTIVATION',gate:'EXTERNAL'}},
  'src/registered.mjs':{exists:true,unattendedReachable:false,classification:null}
};

test('source reachability never impersonates runtime observation',()=>{
  const result=compileOrganCallabilityInventory({sourceCommit:SHA,layers,sourceFacts,generatedAt:new Date('2026-09-12T16:10:00Z')});
  assert.equal(result.ok,true);
  assert.equal(result.rows.find(row=>row.id==='CALLABLE').state,'CALLABLE_UNOBSERVED');
  assert.equal(result.rows.find(row=>row.id==='CALLABLE').runtimeObserved,false);
  assert.equal(result.rows.find(row=>row.id==='GATED').state,'EXTERNALLY_BLOCKED_OR_GATED');
  assert.deepEqual(result.rows.find(row=>row.id==='GATED').gates,['EXTERNAL']);
  assert.equal(result.rows.find(row=>row.id==='REGISTERED').state,'REGISTERED_SOURCE_ONLY');
});

test('runtime observation requires exact source binding and evidence references',()=>{
  const wrong=compileOrganCallabilityInventory({sourceCommit:SHA,layers,sourceFacts,runtimeEvidence:{layers:{CALLABLE:{evidenceClass:'OBSERVED_RUNTIME',sourceCommit:'f'.repeat(40),runtimeObserved:true,evidenceRefs:['receipt:x']}}}});
  assert.equal(wrong.rows.find(row=>row.id==='CALLABLE').state,'CALLABLE_UNOBSERVED');
  const noRefs=compileOrganCallabilityInventory({sourceCommit:SHA,layers,sourceFacts,runtimeEvidence:{layers:{CALLABLE:{evidenceClass:'OBSERVED_RUNTIME',sourceCommit:SHA,runtimeObserved:true,evidenceRefs:[]}}}});
  assert.equal(noRefs.rows.find(row=>row.id==='CALLABLE').runtimeObserved,false);
  const exact=compileOrganCallabilityInventory({sourceCommit:SHA,layers,sourceFacts,runtimeEvidence:{layers:{CALLABLE:{evidenceClass:'OBSERVED_RUNTIME',sourceCommit:SHA,runtimeObserved:true,observedAt:'2026-09-12T16:11:00Z',providerIdentity:'owned-cell',runtimeIdentity:'node20',costCents:0,evidenceRefs:['receipt:runtime-x']}}}});
  const row=exact.rows.find(row=>row.id==='CALLABLE');
  assert.equal(row.state,'RUNTIME_OBSERVED');
  assert.equal(row.runtimeEvidence.providerIdentity,'owned-cell');
  assert.deepEqual(row.runtimeEvidence.evidenceRefs,['receipt:runtime-x']);
});

test('missing implementation source prevents inventory success',()=>{
  const broken=compileOrganCallabilityInventory({sourceCommit:SHA,layers:[{id:'MISSING',role:'x',kind:'CORE',sourceRefs:['src/missing.mjs']}],sourceFacts:{}});
  assert.equal(broken.ok,false);
  assert.deepEqual(broken.missingSource,['MISSING']);
});
