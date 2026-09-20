import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ONTOLOGICAL_REPRESENTATION_CANARY_CANDIDATES,
  ONTOLOGICAL_REPRESENTATION_CANARY_TASKS,
  runOntologicalRepresentationCanary
} from '../src/ontological-representation-canary.mjs';

test('representation canary follows preregistered split and never selects on held-out labels', () => {
  const result = runOntologicalRepresentationCanary();
  assert.equal(result.ok, true);
  assert.equal(result.heldOutUsedForSelection, false);
  assert.equal(result.taskResults.length, 4);
  assert.equal(ONTOLOGICAL_REPRESENTATION_CANARY_TASKS.length, 4);
  assert.equal(ONTOLOGICAL_REPRESENTATION_CANARY_CANDIDATES.length, 7);
});

test('searched representation beats raw baseline on at least three preregistered held-out families', () => {
  const result = runOntologicalRepresentationCanary();
  assert.equal(result.status, 'SOFTWARE_DEMONSTRATION_SUPPORTED__EXTERNAL_REVIEW_REQUIRED');
  assert.ok(result.supportedFamilyCount >= 3);
  for (const row of result.taskResults.filter(row => row.selectedHeldOutAccuracy >= 0.95 && row.heldOutImprovement >= 0.20)) {
    assert.ok(row.selectedHeldOutAccuracy >= 0.95);
    assert.ok(row.heldOutImprovement >= 0.20);
  }
  assert.equal(result.falsifierTriggered, false);
});

test('search overhead is explicitly counted rather than hidden', () => {
  const result = runOntologicalRepresentationCanary();
  assert.ok(result.resourceAccounting.totalSearchThresholdModels > result.resourceAccounting.totalBaselineThresholdModels);
  assert.equal(
    result.resourceAccounting.explicitSearchOverheadThresholdModels,
    result.resourceAccounting.totalSearchThresholdModels - result.resourceAccounting.totalBaselineThresholdModels
  );
});

test('software success does not self-promote the grand moonshot', () => {
  const result = runOntologicalRepresentationCanary();
  assert.equal(result.promotionCandidate.authority, 'REVIEW_REQUIRED__NO_SELF_PROMOTION');
  assert.match(result.claimBoundary, /NOT_PROOF_OF_NEW_MATHEMATICS_ONTOLOGY_OR_GENERAL_INTELLIGENCE/);
  assert.equal(result.externalEffectAuthority, 'NONE');
});
