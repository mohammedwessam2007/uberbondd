import test from 'node:test';
import assert from 'node:assert/strict';
import {
  admitNoveltyChallenge,
  compareBehavioralSignatures,
  inspectSplitDegeneracy
} from '../src/semantic-novelty-preflight.mjs';

test('semantic novelty preflight catches renamed equivalence', () => {
  const result = compareBehavioralSignatures({
    targetId: 'new-name',
    fixtureId: 'x-0-7',
    fixtureDescription: 'Eight deterministic Boolean fixtures.',
    targetOutputs: [0,1,1,0,0,1,1,0],
    candidates: [
      { id: 'old-xor', outputs: [0,1,1,0,0,1,1,0] },
      { id: 'other', outputs: [0,0,1,1,0,0,1,1] }
    ]
  });
  assert.equal(result.status, 'SEMANTIC_EQUIVALENT_FOUND');
  assert.deepEqual(result.exactEquivalentIds, ['old-xor']);
  assert.equal(result.noveltyOnFixture, false);
});

test('finite novelty remains explicitly bounded to its fixture', () => {
  const result = compareBehavioralSignatures({
    targetId: 'candidate',
    fixtureId: 'fixture',
    fixtureDescription: 'Declared finite fixtures.',
    targetOutputs: [0,1,0,1],
    candidates: [{ id: 'old', outputs: [0,0,0,1] }]
  });
  assert.equal(result.status, 'NO_EXACT_EQUIVALENT_ON_DECLARED_FIXTURE');
  assert.equal(result.noveltyOnFixture, true);
  assert.match(result.claimBoundary, /NOT_UNIVERSAL_ONTOLOGICAL_NOVELTY/);
});

test('split preflight catches class and baseline degeneracy', () => {
  const result = inspectSplitDegeneracy({
    splitId: 'bad',
    labels: [1,1,1,1,1,1,1,1,1,0],
    baselineScores: { majority: 0.9, raw: 1 },
    maximumClassShare: 0.9,
    maximumBaselineAccuracy: 0.98
  });
  assert.equal(result.status, 'SPLIT_DEGENERACY_DETECTED');
  assert.ok(result.reasonCodes.includes('class-imbalance-degeneracy'));
  assert.ok(result.reasonCodes.includes('baseline-ceiling-degeneracy'));
});

test('novelty challenge denies exact equivalents and degenerate splits', () => {
  const semantic = compareBehavioralSignatures({
    targetId: 'target',
    fixtureId: 'f',
    fixtureDescription: 'fixture',
    targetOutputs: [0,1,0,1],
    candidates: [{ id: 'same', outputs: [0,1,0,1] }]
  });
  const split = inspectSplitDegeneracy({
    splitId: 's',
    labels: [1,1,1,1,1,1,1,1,1,0],
    baselineScores: { raw: 1 }
  });
  const result = admitNoveltyChallenge({ semanticPreflight: semantic, splitPreflights: [split] });
  assert.equal(result.admitted, false);
  assert.ok(result.reasonCodes.includes('exact-semantic-equivalent-already-exists'));
});
