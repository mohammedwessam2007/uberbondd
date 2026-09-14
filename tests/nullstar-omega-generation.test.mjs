import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPABILITY_DIMENSIONS, compareGenerations, improvementTrend, recordGeneration
} from '../src/nullstar-omega-generation.mjs';

const SHA = 'a'.repeat(40);
const gen = (over = {}) => recordGeneration({
  generationId: 'G0', sourceCommit: SHA, suiteVersion: 'omega-suite-1.0.0',
  corpusDigest: 'b'.repeat(64), vector: { reasoning: 0.5, software: 0.6 }, ...over
});

test('a generation pins an exact commit, suite and corpus', () => {
  assert.equal(gen().ok, true);
  assert.ok(recordGeneration({ generationId: 'G0', sourceCommit: 'main', suiteVersion: 's', corpusDigest: 'd', vector: { reasoning: 0.5 } })
    .reasonCodes.includes('exact-40-character-source-commit-required'));
  assert.ok(gen({ suiteVersion: '' }).reasonCodes.includes('suite-version-required'));
  assert.ok(gen({ corpusDigest: '' }).reasonCodes.includes('corpus-digest-required'));
});

test('an unmeasured dimension is null and never zero', () => {
  // Defaulting to zero makes the next generation look like an improvement for
  // having run more tests; defaulting to the mean hides that it never ran.
  const out = gen();
  assert.equal(out.vector.reasoning, 0.5);
  assert.equal(out.vector.mathematics, null);
  assert.ok(out.coverage.unmeasuredDimensions.includes('mathematics'));
  assert.equal(out.coverage.measured, 2);
});

test('a generation that measured nothing is refused', () => {
  assert.ok(gen({ vector: {} }).reasonCodes.includes('generation-must-measure-at-least-one-dimension'));
});

test('an unrecognized dimension or out-of-range score is refused', () => {
  assert.ok(gen({ vector: { vibes: 0.9 } }).reasonCodes.includes('unrecognized-capability-dimension'));
  assert.ok(gen({ vector: { reasoning: 1.4 } }).reasonCodes.some(c => c.startsWith('dimension-score-0-to-1-required:')));
});

test('only dimensions measured in both generations are compared', () => {
  // Counting a newly-measured dimension as a gain is the most available way to
  // manufacture improvement.
  const g0 = gen({ vector: { reasoning: 0.5 } });
  const g1 = gen({ generationId: 'G1', vector: { reasoning: 0.6, software: 0.9 } });
  const cmp = compareGenerations(g0, g1);
  assert.equal(cmp.counts.comparable, 1);
  assert.equal(cmp.deltas.reasoning, 0.1);
  assert.ok(cmp.incomparableDimensions.includes('software'));
  assert.equal(cmp.deltas.software, undefined);
});

test('a regression is surfaced rather than netted away', () => {
  const g0 = gen({ vector: { reasoning: 0.5, software: 0.9 } });
  const g1 = gen({ generationId: 'G1', vector: { reasoning: 0.9, software: 0.4 } });
  const cmp = compareGenerations(g0, g1);
  assert.deepEqual(cmp.regressedDimensions, ['software']);
  assert.equal(cmp.counts.regressed, 1);
  assert.ok(cmp.netDelta < 0.01, 'a net number must not be the only signal');
});

test('a trend is refused from fewer than three generations', () => {
  assert.equal(improvementTrend([]).trend, 'INSUFFICIENT_DATA');
  assert.equal(improvementTrend([gen()]).trend, 'INSUFFICIENT_DATA');
  assert.equal(improvementTrend([gen(), gen({ generationId: 'G1' })]).trend, 'INSUFFICIENT_DATA');
});

test('three rising generations report RISING and still refuse to claim acceleration', () => {
  const series = [
    gen({ generationId: 'G0', vector: { reasoning: 0.4 } }),
    gen({ generationId: 'G1', vector: { reasoning: 0.5 } }),
    gen({ generationId: 'G2', vector: { reasoning: 0.7 } })
  ];
  const out = improvementTrend(series);
  assert.equal(out.trend, 'RISING');
  assert.equal(out.accelerationClaim, 'NOT_ESTABLISHED_BY_SCORE_SERIES_ALONE');
});

test('a mixed series is NOISY rather than rising', () => {
  const series = [
    gen({ generationId: 'G0', vector: { reasoning: 0.4 } }),
    gen({ generationId: 'G1', vector: { reasoning: 0.7 } }),
    gen({ generationId: 'G2', vector: { reasoning: 0.5 } })
  ];
  assert.equal(improvementTrend(series).trend, 'NOISY');
});

test('a generation carries no authority and declares its own limits', () => {
  const out = gen();
  assert.equal(out.businessEffectAuthority, 'NONE');
  assert.match(out.truthBoundary, /AN_UNMEASURED_DIMENSION_IS_NULL_AND_NEVER_ZERO/);
  assert.match(out.truthBoundary, /DOES_NOT_PROVE_IMPROVEMENT/);
  assert.ok(CAPABILITY_DIMENSIONS.length >= 17);
});
