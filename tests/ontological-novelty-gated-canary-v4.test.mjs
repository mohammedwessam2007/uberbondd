import test from 'node:test';
import assert from 'node:assert/strict';
import { runOntologicalNoveltyGatedCanaryV4 } from '../src/ontological-novelty-gated-canary-v4.mjs';

test('v4 excludes held-out and transfer labels from primitive selection', () => {
  const result = runOntologicalNoveltyGatedCanaryV4();
  assert.equal(result.ok, true);
  assert.equal(result.heldOutUsedForPrimitiveSelection, false);
  assert.equal(result.transferLabelsUsedForPrimitiveSelection, false);
});

test('v4 makes semantic novelty against the old ontology explicit', () => {
  const result = runOntologicalNoveltyGatedCanaryV4();
  assert.equal(result.semanticNovelty.candidatesCompared, 8626);
  assert.equal(result.semanticNovelty.fixtureSize, 1022);
  assert.match(result.semanticNovelty.claimBoundary, /NOT_UNIVERSAL_ONTOLOGICAL_NOVELTY/);
});

test('v4 preserves all transfer and negative-control evidence regardless of verdict', () => {
  const result = runOntologicalNoveltyGatedCanaryV4();
  assert.equal(result.transfers.length, 3);
  assert.equal(result.negativeControl.taskId, 'NEGATIVE_HASH_CONTROL_V4');
  assert.equal(typeof result.negativeControlPassed, 'boolean');
  assert.ok(result.discovery.metaCandidatesEvaluated > 0);
  assert.ok(result.discovery.baseExpressionsEvaluated > 0);
});

test('v4 never self-promotes a positive result', () => {
  const result = runOntologicalNoveltyGatedCanaryV4();
  if (!result.falsifierTriggered) {
    assert.equal(result.promotionCandidate.authority, 'REVIEW_REQUIRED__NO_SELF_PROMOTION');
  }
  assert.match(result.claimBoundary, /DECLARED_META_PRIMITIVE_FAMILY/);
  assert.equal(result.externalEffectAuthority, 'NONE');
});
