import test from 'node:test';
import assert from 'node:assert/strict';
import { runExternalArithmeticFamilyCanaryV5 } from '../src/external-arithmetic-family-canary-v5.mjs';

test('v5 keeps the structural grammar frozen and held-out labels out of selection', () => {
  const result = runExternalArithmeticFamilyCanaryV5();
  assert.equal(result.ok, true);
  assert.equal(result.grammarMutatedAfterPreregistration, false);
  assert.equal(result.heldOutUsedForSelection, false);
  assert.equal(result.externalTargetCount, 3);
});

test('v5 reports every external target independently without redefining failures', () => {
  const result = runExternalArithmeticFamilyCanaryV5();
  assert.deepEqual(
    result.results.map(row => row.id),
    ['A008966_SQUAREFREE', 'A001221_DISTINCT_PRIME_PARITY', 'A008683_MOBIUS_POSITIVE']
  );
  assert.equal(
    result.passingTargetCount + result.failedTargetIds.length,
    result.externalTargetCount
  );
});

test('v5 records full frozen grammar and base ontology burden for every target', () => {
  const result = runExternalArithmeticFamilyCanaryV5();
  for (const row of result.results) {
    assert.equal(row.searchAccounting.structuralProgramsEvaluated, 96);
    assert.equal(row.searchAccounting.baseFeaturesEvaluated, 8626);
    assert.ok(row.searchAccounting.rawThresholdModelsEvaluated > 0);
  }
});

test('v5 failure targets become ontogenesis triggers rather than silent deletions', () => {
  const result = runExternalArithmeticFamilyCanaryV5();
  assert.deepEqual(result.ontogenesisTriggerIds, result.failedTargetIds);
  assert.match(result.claimBoundary, /DOES_NOT_ESTABLISH_OPEN_ENDED_ONTOLOGY_INVENTION/);
  assert.equal(result.externalEffectAuthority, 'NONE');
});
