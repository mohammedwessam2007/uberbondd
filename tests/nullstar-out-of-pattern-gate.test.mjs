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
