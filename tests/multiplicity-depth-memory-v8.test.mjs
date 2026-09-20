import test from 'node:test';
import assert from 'node:assert/strict';
import { runMultiplicityDepthMemoryV8 } from '../src/multiplicity-depth-memory-v8.mjs';

test('v8 uses a frozen generic 1344-program multiplicity-depth grammar',()=>{
  const r=runMultiplicityDepthMemoryV8();
  assert.equal(r.ok,true);
  assert.equal(r.candidateCount,1344);
  assert.equal(r.heldOutUsedForSelection,false);
  assert.equal(r.targetSpecificNamedPrimitivePresent,false);
});
test('v8 preserves all four public arithmetic targets and a hash control',()=>{
  const r=runMultiplicityDepthMemoryV8();
  assert.deepEqual(r.results.map(x=>x.id),[
    'A212793_CUBEFREE_INDICATOR','A008966_SQUAREFREE','A008683_MOBIUS_POSITIVE','A001221_DISTINCT_PRIME_PARITY'
  ]);
  assert.equal(typeof r.negativeControl.passed,'boolean');
});
test('v8 result never certifies unseen-order generalization',()=>{
  const r=runMultiplicityDepthMemoryV8();
  assert.match(r.claimBoundary,/UNSEEN_MULTIPLICITY_ORDER_GENERALIZATION_REMAINS_UNTESTED/);
  assert.equal(r.externalEffectAuthority,'NONE');
});
