import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ONTOLOGICAL_REPRESENTATION_CANARY_V2_TASKS,
  runOntologicalRepresentationCanaryV2
} from '../src/ontological-representation-canary-v2.mjs';

test('v2 freezes five tasks and keeps held-out labels out of selection', () => {
  const result = runOntologicalRepresentationCanaryV2();
  assert.equal(result.ok, true);
  assert.equal(ONTOLOGICAL_REPRESENTATION_CANARY_V2_TASKS.length, 5);
  assert.equal(result.heldOutUsedForSelection, false);
  assert.equal(result.taskResults.length, 5);
});

test('v2 explicitly reports stronger generic baselines and search burden', () => {
  const result = runOntologicalRepresentationCanaryV2();
  for (const row of result.taskResults) {
    assert.ok(Object.hasOwn(row.baselineAccuracies, 'MAJORITY_CLASS'));
    assert.ok(Object.hasOwn(row.baselineAccuracies, 'RAW_THRESHOLD'));
    assert.ok(Object.hasOwn(row.baselineAccuracies, 'ATOMIC_FEATURE_STUMP'));
    assert.ok(Object.hasOwn(row.baselineAccuracies, 'KNN_RAW_K3'));
    assert.ok(row.candidateExpressionsEvaluated > 0);
  }
  assert.ok(result.searchAccounting.totalCandidateExpressionsEvaluated > 0);
});

test('negative control may not be falsely called solved', () => {
  const result = runOntologicalRepresentationCanaryV2();
  assert.equal(result.negativeControlPassed, true);
  const negative = result.taskResults.find(row => row.taskId === 'NEGATIVE_HASH_CONTROL');
  assert.ok(negative.heldOutAccuracy < 0.90);
});

test('any positive result remains narrow and requires review', () => {
  const result = runOntologicalRepresentationCanaryV2();
  if (!result.falsifierTriggered) {
    assert.equal(result.promotionCandidate.authority, 'REVIEW_REQUIRED__NO_SELF_PROMOTION');
  }
  assert.match(result.claimBoundary, /DOES_NOT_PROVE_NEW_MATHEMATICS/);
  assert.equal(result.externalEffectAuthority, 'NONE');
});
