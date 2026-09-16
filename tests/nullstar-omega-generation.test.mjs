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

const suiteGen = (id, vector, suiteVersion = 'suite-a') => recordGeneration({
  generationId: id,
  sourceCommit: 'a'.repeat(40),
  suiteVersion,
  corpusDigest: `sha256:${id}`,
  vector,
  baselines: {},
  cost: { providerCalls: 0, spendCents: 0 },
  environment: {},
  failures: []
});

test('a suite change is not a capability regression', () => {
  const before = suiteGen('G2', { reasoning: 1, calibration: 1, crossDomain: 1 }, 'probe-suite-1.0.0');
  const after = suiteGen('G3', { reasoning: 1, calibration: 0.6, crossDomain: 0.33 }, 'outcome-suite-1.0.0');
  const compared = compareGenerations(before, after);

  assert.equal(compared.status, 'INSTRUMENT_CHANGED__DELTAS_ARE_NOT_A_CAPABILITY_CHANGE');
  // The deltas stay visible, because they say what the new instrument reads.
  assert.ok(compared.deltas.calibration < 0);
  // But nothing may be called a regression across the change.
  assert.deepEqual(compared.regressedDimensions, []);
  assert.equal(compared.netDelta, null);
  assert.equal(compared.counts.regressed, null);
  assert.equal(compared.previousSuiteVersion, 'probe-suite-1.0.0');
  assert.equal(compared.currentSuiteVersion, 'outcome-suite-1.0.0');
});

test('the same suite still reports regressions normally', () => {
  const before = suiteGen('G1', { reasoning: 1, calibration: 1 });
  const after = suiteGen('G2', { reasoning: 1, calibration: 0.4 });
  const compared = compareGenerations(before, after);
  assert.equal(compared.status, 'NULLSTAR_OMEGA_GENERATIONS_COMPARED');
  assert.deepEqual(compared.regressedDimensions, ['calibration']);
  assert.ok(compared.netDelta < 0);
});

test('a series that holds still and then drops is falling, not flat', () => {
  const trend = improvementTrend([
    suiteGen('G0', { reasoning: 1 }),
    suiteGen('G1', { reasoning: 1 }),
    suiteGen('G2', { reasoning: 1 }),
    suiteGen('G3', { reasoning: 0.5 })
  ]);
  assert.equal(trend.trend, 'FALLING');
});

test('a genuinely unmoving series is flat', () => {
  const trend = improvementTrend([
    suiteGen('G0', { reasoning: 1 }),
    suiteGen('G1', { reasoning: 1 }),
    suiteGen('G2', { reasoning: 1 })
  ]);
  assert.equal(trend.trend, 'FLAT');
});

test('a series that holds still and then rises is rising', () => {
  const trend = improvementTrend([
    suiteGen('G0', { reasoning: 0.5 }),
    suiteGen('G1', { reasoning: 0.5 }),
    suiteGen('G2', { reasoning: 0.8 })
  ]);
  assert.equal(trend.trend, 'RISING');
});

test('a trend across a suite change describes the instrument, not the system', () => {
  const trend = improvementTrend([
    suiteGen('G0', { reasoning: 1 }, 'probe-suite-1.0.0'),
    suiteGen('G1', { reasoning: 1 }, 'probe-suite-1.0.0'),
    suiteGen('G2', { reasoning: 1 }, 'probe-suite-1.0.0'),
    suiteGen('G3', { reasoning: 0.5 }, 'outcome-suite-1.0.0')
  ]);
  assert.equal(trend.trend, 'INSTRUMENT_CHANGED');
  assert.equal(trend.suiteChanges.length, 1);
  assert.equal(trend.suiteChanges[0].to, 'G3');
  assert.equal(trend.accelerationClaim, 'NOT_ESTABLISHED_BY_SCORE_SERIES_ALONE');
});

test('a reading carried across a suite change is excluded from the headline mean', () => {
  const previous = suiteGen('G2', { reasoning: 1, robustness: 1, calibration: 1 }, 'probe-suite-1.0.0');
  const current = recordGeneration({
    generationId: 'G3',
    sourceCommit: 'a'.repeat(40),
    suiteVersion: 'outcome-suite-1.0.0',
    corpusDigest: 'sha256:x',
    // reasoning and robustness are unchanged from the old suite; calibration
    // was actually re-measured.
    vector: { reasoning: 1, robustness: 1, calibration: 0.4 },
    previousGeneration: previous,
    baselines: {},
    cost: {},
    environment: {},
    failures: []
  });

  assert.equal(current.ok, true);
  assert.deepEqual(current.coverage.carriedDimensions.sort(), ['reasoning', 'robustness']);
  assert.equal(current.coverage.measuredUnderThisSuite, 1);
  // The headline mean is the one dimension this suite actually measured.
  assert.equal(current.meanMeasuredScore, 0.4);
  // The inflated figure stays visible beside it rather than being the default.
  assert.equal(current.meanIncludingCarriedReadings, 0.8);
});

test('carryover is only detected across a suite change, not within one', () => {
  const previous = suiteGen('G1', { reasoning: 1, calibration: 1 }, 'same-suite');
  const current = recordGeneration({
    generationId: 'G2',
    sourceCommit: 'a'.repeat(40),
    suiteVersion: 'same-suite',
    corpusDigest: 'sha256:x',
    vector: { reasoning: 1, calibration: 0.4 },
    previousGeneration: previous,
    baselines: {}, cost: {}, environment: {}, failures: []
  });
  assert.equal(current.coverage.carriedFromAnotherSuite, 0);
  assert.equal(current.meanMeasuredScore, 0.7);
});

test('a generation whose every reading was carried measured nothing of its own', () => {
  const previous = suiteGen('G2', { reasoning: 1, robustness: 1 }, 'probe-suite');
  const current = recordGeneration({
    generationId: 'G3',
    sourceCommit: 'a'.repeat(40),
    suiteVersion: 'outcome-suite',
    corpusDigest: 'sha256:x',
    vector: { reasoning: 1, robustness: 1 },
    previousGeneration: previous,
    baselines: {}, cost: {}, environment: {}, failures: []
  });
  assert.equal(current.ok, false);
  assert.ok(current.reasonCodes.includes('every-measured-dimension-was-carried-from-a-different-suite'));
});

test('an explicitly declared carryover is honoured even without a previous generation', () => {
  const current = recordGeneration({
    generationId: 'G3',
    sourceCommit: 'a'.repeat(40),
    suiteVersion: 'outcome-suite',
    corpusDigest: 'sha256:x',
    vector: { reasoning: 1, calibration: 0.4 },
    carriedForward: ['reasoning'],
    baselines: {}, cost: {}, environment: {}, failures: []
  });
  assert.equal(current.meanMeasuredScore, 0.4);
  assert.deepEqual(current.coverage.carriedDimensions, ['reasoning']);
});

test('without a previous generation nothing is silently assumed fresh or stale', () => {
  const current = recordGeneration({
    generationId: 'G3',
    sourceCommit: 'a'.repeat(40),
    suiteVersion: 'outcome-suite',
    corpusDigest: 'sha256:x',
    vector: { reasoning: 1, calibration: 0.4 },
    baselines: {}, cost: {}, environment: {}, failures: []
  });
  assert.equal(current.coverage.carriedFromAnotherSuite, 0);
  assert.equal(current.meanMeasuredScore, 0.7);
  assert.equal(current.meanIncludingCarriedReadings, 0.7);
});
