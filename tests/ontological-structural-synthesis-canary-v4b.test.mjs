import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ONTOLOGICAL_STRUCTURAL_SYNTHESIS_V4B_TASK_IDS,
  runOntologicalStructuralSynthesisCanaryV4B
} from '../src/ontological-structural-synthesis-canary-v4b.mjs';

test('v4b preserves target-blind primitive selection boundaries', () => {
  const result = runOntologicalStructuralSynthesisCanaryV4B();
  assert.equal(result.ok, true);
  assert.equal(result.heldOutUsedForPrimitiveSelection, false);
  assert.equal(result.transferLabelsUsedForPrimitiveSelection, false);
  assert.equal(result.structuralGrammar.selectedProgramContainsForbiddenPrimitive, false);
  assert.equal(ONTOLOGICAL_STRUCTURAL_SYNTHESIS_V4B_TASK_IDS.length, 5);
});

test('v4b rechecks semantic novelty against the 8626-feature base ontology', () => {
  const result = runOntologicalStructuralSynthesisCanaryV4B();
  assert.equal(result.baseOntology.featureCount, 8626);
  assert.equal(result.semanticNovelty.candidatesCompared, 8626);
  assert.equal(result.semanticNovelty.exactEquivalentFound, false);
  assert.ok(result.semanticNovelty.nearest.mismatchRate >= 0.10);
});

test('v4b records structural search program length and full baseline burden', () => {
  const result = runOntologicalStructuralSynthesisCanaryV4B();
  assert.equal(result.structuralGrammar.candidateCount, 96);
  assert.ok(result.structuralGrammar.selectedProgramDescriptionCost > 0);
  assert.ok(result.discovery.structuralProgramsEvaluated > 0);
  assert.ok(result.searchAccounting.baseSelectionRowEvaluations > 0);
  assert.ok(result.searchAccounting.semanticNoveltyFeatureFixtureEvaluations > 0);
});

test('v4b retains all three transfer tasks and negative control regardless of outcome', () => {
  const result = runOntologicalStructuralSynthesisCanaryV4B();
  assert.equal(result.transfers.length, 3);
  assert.equal(result.negativeControl.taskId, 'NEGATIVE_HASH_CONTROL_V4B');
  assert.equal(typeof result.negativeControl.negativeControlPassed, 'boolean');
});

test('v4b cannot self-promote and remains a finite synthetic claim', () => {
  const result = runOntologicalStructuralSynthesisCanaryV4B();
  if (!result.falsifierTriggered) {
    assert.equal(result.promotionCandidate.authority, 'REVIEW_REQUIRED__NO_SELF_PROMOTION');
  }
  assert.match(result.claimBoundary, /FINITE_SYNTHETIC_TARGET_BLIND_PROGRAM_SEARCH/);
  assert.equal(result.externalEffectAuthority, 'NONE');
});
