import test from 'node:test';
import assert from 'node:assert/strict';
import { runMultiplicitySensitiveMemoryCanaryV6 } from '../src/multiplicity-sensitive-memory-canary-v6.mjs';

test('v6 executes exactly the corrected 864-program grammar', () => {
  const result = runMultiplicitySensitiveMemoryCanaryV6();
  assert.equal(result.ok,true);
  assert.equal(result.candidateCount,864);
  assert.ok(result.results.every(row=>row.candidateCount===864));
});

test('v6 keeps held-out labels out and target-specific primitives absent', () => {
  const result = runMultiplicitySensitiveMemoryCanaryV6();
  assert.equal(result.heldOutUsedForSelection,false);
  assert.equal(result.targetSpecificNamedPrimitivePresent,false);
});

test('v6 retains all three public arithmetic targets and a negative control', () => {
  const result = runMultiplicitySensitiveMemoryCanaryV6();
  assert.deepEqual(
    result.results.map(row=>row.id),
    ['A008966_SQUAREFREE','A008683_MOBIUS_POSITIVE','A001221_DISTINCT_PRIME_PARITY']
  );
  assert.equal(typeof result.negativeControl.negativeControlPassed,'boolean');
});

test('v6 does not self-promote even when the hypothesis is supported', () => {
  const result = runMultiplicitySensitiveMemoryCanaryV6();
  if (!result.falsifierTriggered) {
    assert.equal(result.promotionCandidate.authority,'REVIEW_REQUIRED__NO_SELF_PROMOTION');
  }
  assert.match(result.claimBoundary,/DOES_NOT_ESTABLISH_OPEN_ENDED_ONTOLOGY_INVENTION/);
  assert.equal(result.externalEffectAuthority,'NONE');
});
