import test from 'node:test';
import assert from 'node:assert/strict';
import { downstreamUnlockCount, normalizeBottleneck, rankBottlenecks } from '../src/nullstar-omega-bottleneck.mjs';

const bn = (over = {}) => ({
  id: 'B1', dimension: 'retrieval', symptom: 'wrong document retrieved on long prompts',
  evidenceClass: 'SEALED_HOLDOUT_FAILURE', evidenceRef: 'artifacts/nullstar-omega/generations/G0.json',
  rootCauseHypotheses: ['chunking loses the answer span', 'ranker ignores recency'],
  discriminatingTest: 'rerun with fixed chunk boundaries and unchanged ranker',
  estimatedCost: 2, ...over
});

test('one hypothesis is a guess and is refused', () => {
  // A diagnosis with no alternative and no way to tell them apart burns a
  // generation on a story.
  const out = normalizeBottleneck(bn({ rootCauseHypotheses: ['it is slow'] }));
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.some(c => c.startsWith('competing-root-cause-hypotheses-required:')));
});

test('a diagnosis without a discriminating test is refused', () => {
  const out = normalizeBottleneck(bn({ discriminatingTest: '' }));
  assert.ok(out.reasonCodes.some(c => c.startsWith('discriminating-test-required:')));
});

test('evidence must be a recognized class and carry a reference', () => {
  assert.ok(normalizeBottleneck(bn({ evidenceClass: 'A_HUNCH' }))
    .reasonCodes.some(c => c.startsWith('recognized-evidence-class-required:')));
  assert.ok(normalizeBottleneck(bn({ evidenceRef: '' }))
    .reasonCodes.some(c => c.startsWith('bottleneck-evidence-reference-required:')));
});

test('downstream unlocks are counted transitively', () => {
  // A dimension two hops upstream of ten systems is upstream of ten systems.
  const graph = { planning: ['retrieval'], software: ['planning'], research: ['planning'], unrelated: ['memory'] };
  assert.equal(downstreamUnlockCount('retrieval', graph), 3);
  assert.equal(downstreamUnlockCount('memory', graph), 1);
  assert.equal(downstreamUnlockCount('nothing-depends-on-this', graph), 0);
});

test('a declared cycle terminates instead of hanging, and nothing unlocks itself', () => {
  const graph = { a: ['b'], b: ['a'] };
  // `a` unlocks `b`; the walk then reaches `a` again and stops. Counting `a`
  // as its own downstream unlock would inflate every node in a cycle.
  assert.equal(downstreamUnlockCount('a', graph), 1);
  assert.equal(downstreamUnlockCount('b', graph), 1);
});

test('leverage ranks unlocks per unit cost, not lowest score', () => {
  const graph = { planning: ['retrieval'], software: ['retrieval'], research: ['retrieval'] };
  const out = rankBottlenecks({
    bottlenecks: [
      bn({ id: 'CHEAP_NICHE', dimension: 'niche', estimatedCost: 1 }),
      bn({ id: 'RETRIEVAL', dimension: 'retrieval', estimatedCost: 2 })
    ],
    dependencyGraph: graph
  });
  assert.equal(out.ok, true);
  // retrieval: (3+1)/2 = 2.0 beats niche: (0+1)/1 = 1.0
  assert.equal(out.selected.id, 'RETRIEVAL');
  assert.equal(out.ranked[0].downstreamUnlocks, 3);
});

test('a weak-evidence finding is ranked but never selected first', () => {
  const out = rankBottlenecks({
    bottlenecks: [
      bn({ id: 'HUNCH', evidenceClass: 'OPERATOR_OBSERVATION', dimension: 'everything', estimatedCost: 0.01 }),
      bn({ id: 'MEASURED', evidenceClass: 'SEALED_HOLDOUT_FAILURE', estimatedCost: 100 })
    ],
    dependencyGraph: {}
  });
  // The hunch has vastly higher nominal leverage and still cannot be selected:
  // a story about the system must not outrank a measured failure of it.
  assert.equal(out.selected.id, 'MEASURED');
  assert.equal(out.ranked.at(-1).id, 'HUNCH');
  assert.equal(out.counts.weakEvidence, 1);
});

test('duplicate ids and empty input are refused', () => {
  assert.ok(rankBottlenecks({ bottlenecks: [bn(), bn()] }).reasonCodes.some(c => c.startsWith('duplicate-bottleneck-id:')));
  assert.equal(rankBottlenecks({ bottlenecks: [] }).ok, false);
});

test('a ranking carries no authority and claims no established cause', () => {
  const out = rankBottlenecks({ bottlenecks: [bn()], dependencyGraph: {} });
  assert.equal(out.businessEffectAuthority, 'NONE');
  assert.equal(out.externalEffectLedger.providerCalls, 0);
  assert.match(out.truthBoundary, /NOT_A_PROOF_OF_CAUSE/);
});
