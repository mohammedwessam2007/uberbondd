import test from 'node:test';
import assert from 'node:assert/strict';
import { runFourthPowerFreeV9 } from '../src/fourth-power-free-v9.mjs';

test('v9 consumes exactly the frozen 1344-program v8 grammar',()=>{
  const r=runFourthPowerFreeV9();
  assert.equal(r.ok,true);
  assert.equal(r.grammarCandidateCount,1344);
  assert.equal(r.grammarMutationAfterPreregistration,false);
  assert.equal(r.heldOutUsedForSelection,false);
});
test('v9 reports balanced metrics and preserves the frozen comparator',()=>{
  const r=runFourthPowerFreeV9();
  assert.equal(r.frozenComparatorHeldOutBalancedAccuracy,0.8808325232606582);
  assert.equal(typeof r.heldOut.balancedAccuracy,'number');
  assert.equal(typeof r.heldOut.positiveRecall,'number');
  assert.equal(typeof r.heldOut.negativeRecall,'number');
});
test('v9 cannot grant ontology or external authority',()=>{
  const r=runFourthPowerFreeV9();
  assert.equal(r.externalEffectAuthority,'NONE');
  assert.match(r.claimBoundary,/DOES_NOT_PROVE_GENERAL_NUMBER_THEORY_DISCOVERY/);
});
