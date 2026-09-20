import test from 'node:test';
import assert from 'node:assert/strict';
import { runCubefreeExternalV7 } from '../src/cubefree-external-v7.mjs';

test('v7 executes the frozen 864-program v6 grammar',()=>{
  const r=runCubefreeExternalV7();
  assert.equal(r.ok,true);
  assert.equal(r.grammarCandidateCount,864);
  assert.equal(r.grammarMutationAfterPreregistration,false);
  assert.equal(r.heldOutUsedForSelection,false);
});

test('v7 reports balanced accuracy and both class recalls',()=>{
  const r=runCubefreeExternalV7();
  assert.equal(typeof r.heldOut.balancedAccuracy,'number');
  assert.equal(typeof r.heldOut.positiveRecall,'number');
  assert.equal(typeof r.heldOut.negativeRecall,'number');
  assert.equal(typeof r.negativeControl.heldOut.balancedAccuracy,'number');
});

test('v7 preserves the preregistered base comparator',()=>{
  const r=runCubefreeExternalV7();
  assert.equal(r.frozenBaseHeldOutBalancedAccuracy,0.8614864864864865);
});

test('v7 never converts a result into ontology authority',()=>{
  const r=runCubefreeExternalV7();
  assert.equal(r.externalEffectAuthority,'NONE');
  assert.match(r.claimBoundary,/DOES_NOT_PROVE_OPEN_ENDED_ONTOLOGY_INVENTION/);
});
