// The gate that stops a lookup being promoted as a mechanism.
//
// GA3 promoted a solver that scored 1.0 on every item its generator emits,
// composed nothing outside them, and answered one out-of-pattern question with
// the answer to a different question. Three generations went into replacing it.
// These tests hold the parts of that which can silently come undone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { UBERBOND_SOLVERS } from '../src/nullstar-cognitive-solvers.mjs';
import { GATING_PROBES, REPORTING_PROBES, PROBE_SURFACE, runProbes, gateVerdict } from '../src/nullstar-out-of-pattern-probes.mjs';

const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));

test('the promoted invention solver composes out of pattern and never confabulates', () => {
  for (const [label, probes] of [['gating', GATING_PROBES.INVENTION], ['reporting', REPORTING_PROBES.INVENTION]]) {
    const result = runProbes(UBERBOND_SOLVERS.INVENTION, probes);
    assert.equal(result.confabulated, 0, `${label}: answering a different question is the failure this exists to catch`);
    assert.equal(result.correct, result.of, `${label}: ${result.correct} of ${result.of}`);
  }
});

test('the exact prompt that broke the previous solver is answered, not substring-matched', () => {
  // "Report the mean plus the midrange" contains "report the mean". The solver
  // GA3 promoted returned the mean. If this ever returns the mean again, the
  // whole of GA4 through GA6 has been undone.
  const surface = { primitives: [...PROBE_SURFACE.primitives], data: [...PROBE_SURFACE.data] };
  const probe = GATING_PROBES.INVENTION.find(row => row.id === 'mean-plus-midrange');
  const response = UBERBOND_SOLVERS.INVENTION(surface, probe.prompt);

  const mean = surface.data.reduce((a, b) => a + b, 0) / surface.data.length;
  assert.notEqual(response?.answer, mean.toFixed(4), 'the solver answered "the mean" to "the mean plus the midrange"');
  assert.equal(response?.answer, probe.groundTruth);
});

test('refusing beats answering wrongly, and the gate encodes that', () => {
  // A solver that returns nothing outside its competence is usable. One that
  // returns a confident wrong number is not, because nothing downstream can
  // separate its right answers from its wrong ones. So confabulation
  // disqualifies at any rate, while refusal only counts against the minimum.
  const confabulating = { of: 3, correct: 2, refused: 0, confabulated: 1, correctRate: 0.6667 };
  const refusing = { of: 3, correct: 2, refused: 1, confabulated: 0, correctRate: 0.6667 };
  assert.equal(gateVerdict(confabulating, { minimumCorrectRate: 0.6 }).passes, false);
  assert.equal(gateVerdict(refusing, { minimumCorrectRate: 0.6 }).passes, true);
  // And a solver that refuses everything cannot buy its way past the gate.
  assert.equal(gateVerdict({ of: 3, correct: 0, refused: 3, confabulated: 0, correctRate: 0 }, { minimumCorrectRate: 0.6 }).passes, false);
});

test('gating and reporting probes stay disjoint', () => {
  // A candidate judged and then congratulated by the same items proves nothing.
  const gating = new Set(GATING_PROBES.INVENTION.map(row => row.id));
  for (const probe of REPORTING_PROBES.INVENTION) {
    assert.ok(!gating.has(probe.id), `${probe.id} is in both sets`);
  }
  const gatingPrompts = new Set(GATING_PROBES.INVENTION.map(row => row.prompt));
  for (const probe of REPORTING_PROBES.INVENTION) assert.ok(!gatingPrompts.has(probe.prompt));
});

test('the runner runs the incumbent against the gate rather than assuming it passes', () => {
  // GA6 could only promote because the incumbent was measured against the gate
  // and failed it. If the runner stops checking, a failing incumbent silently
  // becomes an unbeatable one again.
  const source = readFileSync(new URL('../scripts/nullstar-generation.mjs', import.meta.url), 'utf8');
  assert.match(source, /incumbentProbeResult/);
  assert.match(source, /gateIsDecisive/);
  assert.match(source, /heldOut >= incumbentHeldOut/);
});

test('every generation from GA4 on declared its gate before it ran', () => {
  for (const name of ['ga4', 'ga5', 'ga6']) {
    const declaration = read(`artifacts/nullstar-terminal/${name}-declaration.json`);
    assert.equal(declaration.precommittedCriteria.outOfPatternGate, true, `${name} must declare the gate`);
    assert.ok(declaration.precommittedCriteria.thresholdLock);
    const result = read(`artifacts/nullstar-terminal/${name}-result.json`);
    assert.equal(result.outOfPatternGate.applied, true);
    assert.equal(result.precommittedThreshold, declaration.precommittedCriteria.promotionThreshold);
  }
});

test('GA5 and GA6 each drew held-out seeds no earlier generation had read', () => {
  // A held-out set is held out until someone reads the results. GA4's and GA5's
  // were both spent that way, and reusing one would make every later number a
  // measurement of seeds the candidates had already been judged against.
  const seen = new Set();
  for (const name of ['ga4', 'ga5', 'ga6']) {
    const seeds = read(`artifacts/nullstar-terminal/${name}-declaration.json`).precommittedCriteria.heldOutSeeds;
    for (const seed of seeds) {
      assert.ok(!seen.has(seed), `${name} reuses held-out seed ${seed}`);
      seen.add(seed);
    }
  }
});

test('two NO_PROMOTION results are recorded as results, not smoothed away', () => {
  assert.equal(read('artifacts/nullstar-terminal/ga4-result.json').outcome, 'NO_PROMOTION');
  assert.equal(read('artifacts/nullstar-terminal/ga5-result.json').outcome, 'NO_PROMOTION');
  assert.equal(read('artifacts/nullstar-terminal/ga6-result.json').outcome, 'PROMOTED');
});

test('all three families with a promoted solver have probes, and the solvers pass them', () => {
  for (const family of ['FORECASTING', 'RESEARCH', 'INVENTION']) {
    for (const [label, probes] of [['gating', GATING_PROBES[family]], ['reporting', REPORTING_PROBES[family]]]) {
      assert.ok(Array.isArray(probes) && probes.length >= 3, `${family} ${label}: needs a probe set`);
      const result = runProbes(UBERBOND_SOLVERS[family], probes);
      assert.equal(result.confabulated, 0, `${family} ${label}: confabulated ${result.confabulated}`);
      assert.equal(result.correct, result.of, `${family} ${label}: ${result.correct} of ${result.of}`);
    }
  }
});

test('the promoted solvers separate from the minimal fixes they were shown to tie', () => {
  // F010 closed on this. GA1 and GA2 each promoted out of a three-way tie, and
  // an ablation showed a one-line fix matching the winner -- which said the
  // instrument could not separate them, not that the mechanisms were the same.
  // If this ever stops separating, the promoted code is carrying complexity it
  // did not buy anything with and the closure was wrong.
  const audit = read('artifacts/nullstar-terminal/attribution-audit.json');
  assert.equal(audit.rows.length, 2);
  for (const row of audit.rows) {
    assert.equal(row.verdict, 'PROMOTED_SOLVER_IS_BETTER_OUT_OF_PATTERN', `${row.generation}: ${row.verdict}`);
    assert.ok(row.promoted.correct > row.minimalFix.correct);
    assert.equal(row.promoted.confabulated, 0);
  }

  // And the thing the audit explicitly cannot do. The historical record of how
  // those winners were selected stays as it was taken.
  assert.equal(audit.probesWrittenAfterTheFact, true);
  for (const name of ['ga1', 'ga2']) {
    assert.equal(read(`artifacts/nullstar-terminal/${name}-result.json`).discrimination, 'UNDISCRIMINATING__CANDIDATES_TIED');
  }
});

test('the research probe F010 named as its closing condition is the one that separates', () => {
  // "a fresh secondhand source carrying truth against a stale primary with no
  // replication to shortcut it" -- written into F010 when it was opened, months
  // of commits before the probe existed.
  const probe = GATING_PROBES.RESEARCH.find(row => row.id === 'fresh-secondhand-beats-stale-primary');
  assert.ok(probe, 'the probe F010 named must exist');
  assert.ok(!probe.surface.sources.some(source => source.quality === 'REPLICATED_MEASUREMENT'),
    'a replication present would let a ladder shortcut the ranking, which is the whole point of the probe');

  const ladderOnly = surface => {
    const rank = { REPLICATED_MEASUREMENT: 4, PRIMARY_MEASUREMENT: 3, SECONDHAND_SUMMARY: 1, UNSOURCED_ASSERTION: 0 };
    let best = null;
    let bestScore = -1;
    for (const source of surface.sources ?? []) {
      const score = rank[source.quality] ?? 0;
      if (score > bestScore) { bestScore = score; best = source; }
    }
    return best ? String(best.claim) : null;
  };
  assert.equal(UBERBOND_SOLVERS.RESEARCH(probe.surface), probe.groundTruth);
  assert.notEqual(ladderOnly(probe.surface), probe.groundTruth);
});
