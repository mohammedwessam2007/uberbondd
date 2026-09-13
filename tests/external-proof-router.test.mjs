import test from 'node:test';
import assert from 'node:assert/strict';
import {routeMissingProofs,canInternalEngineeringClose} from '../src/external-proof-router.mjs';

test('routes code gaps internally and reality gaps externally without manufacturing proof',()=>{
  const out=routeMissingProofs({requirements:[
    {id:'adapter',description:'missing adapter',proofClass:'SOURCE_INTERNAL'},
    {id:'payment',description:'cleared payment receipt',proofClass:'BANK_PAYMENT'},
    {id:'acceptance',description:'customer accepted delivery',proofClass:'CUSTOMER_ACCEPTANCE'},
    {id:'identity',description:'owner liveness recovery',proofClass:'OWNER_IDENTITY'}
  ]});
  assert.equal(out.ok,true);
  assert.equal(out.status,'INTERNAL_PROOF_WORK_REMAINS');
  assert.deepEqual(out.internalQueue,['adapter']);
  assert.equal(out.externalQueue.length,3);
  assert.ok(out.requirements.every(row=>row.proofMayBeSynthesized===false));
  assert.equal(out.externalEffectAuthority,'NONE');
});

test('once internal work is closed, router can say EXTERNAL_OR_OWNER_ONLY',()=>{
  const out=routeMissingProofs({requirements:[
    {id:'source',description:'source test',proofClass:'SOURCE_INTERNAL',satisfied:true,evidenceRefs:['test:green']},
    {id:'provider',description:'provider acceptance',proofClass:'PROVIDER_ACCEPTANCE'},
    {id:'elapsed',description:'30 day observation',proofClass:'ELAPSED_TIME'}
  ]});
  assert.equal(out.status,'EXTERNAL_OR_OWNER_ONLY');
  assert.equal(out.counts.internalClosable,0);
  assert.equal(out.counts.externalOrOwnerOnly,2);
});

test('a satisfied flag without evidence does not close a proof requirement',()=>{
  const out=routeMissingProofs({requirements:[{id:'bank',description:'settlement',proofClass:'BANK_PAYMENT',satisfied:true,evidenceRefs:[]}]});
  assert.equal(out.status,'EXTERNAL_OR_OWNER_ONLY');
  assert.equal(out.counts.closed,0);
});

test('only source-internal requirements are closable by engineering',()=>{
  assert.equal(canInternalEngineeringClose({proofClass:'SOURCE_INTERNAL'}),true);
  assert.equal(canInternalEngineeringClose({proofClass:'CUSTOMER_ACCEPTANCE'}),false);
  assert.equal(canInternalEngineeringClose({proofClass:'OWNER_CUSTODY'}),false);
});

test('unknown proof classes are refused rather than silently treated as code work',()=>{
  const out=routeMissingProofs({requirements:[{id:'x',description:'mystery',proofClass:'MAGIC'}]});
  assert.equal(out.ok,false);
  assert.ok(out.reasonCodes.includes('valid-proof-class-required:x'));
});
