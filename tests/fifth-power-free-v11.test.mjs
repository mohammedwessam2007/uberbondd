import test from 'node:test';
import assert from 'node:assert/strict';
import { runFifthPowerFreeV11 } from '../src/fifth-power-free-v11.mjs';

test('v11 consumes exactly the frozen 2592-program v10 grammar',()=>{
  const r=runFifthPowerFreeV11();
  assert.equal(r.ok,true);
  assert.equal(r.grammarCandidateCount,2592);
  assert.equal(r.grammarMutationAfterPreregistration,false);
  assert.equal(r.heldOutUsedForSelection,false);
});
test('v11 exact success requires threshold five',()=>{
  const r=runFifthPowerFreeV11();
  if(!r.falsifierTriggered){
    assert.equal(r.train.accuracy,1);
    assert.equal(r.validation.accuracy,1);
    assert.equal(r.heldOut.accuracy,1);
    assert.equal(r.selectedProgramSpec.outputMode,'DEPTH_LT');
    assert.equal(r.selectedProgramSpec.threshold,5);
  }
});
test('v11 keeps external authority at none',()=>{
  const r=runFifthPowerFreeV11();
  assert.equal(r.externalEffectAuthority,'NONE');
  assert.match(r.claimBoundary,/DOES_NOT_PROVE_GENERAL_MATHEMATICAL_DISCOVERY/);
});
