import test from 'node:test';
import assert from 'node:assert/strict';
import { compileFeasibleBoundedExperiment } from '../src/genesis-experiment-feasibility.mjs';

const baseProbe = (over = {}) => ({
  description: 'run a held-out fixture comparison',
  costCents: 0,
  timeMinutes: 10,
  measure: 'classification error rate',
  decisionRule: 'support only if error rate exceeds the predeclared tolerance; falsify otherwise',
  supportsHypothesis: 'error rate is materially higher under the candidate defect',
  falsifiesHypothesis: 'error rate is unchanged within the predeclared tolerance',
  ...over
});

const compile = (over = {}) => compileFeasibleBoundedExperiment({
  hypothesis: 'the candidate rule causes the observed classification error',
  falsifier: 'the held-out error rate is unchanged within the predeclared tolerance',
  costCeilingCents: 0,
  timeCeilingMinutes: 15,
  probes: [baseProbe()],
  ...over
});

test('a hypothesis and falsifier with no actual probe cannot be called runnable', () => {
  const result = compileFeasibleBoundedExperiment({
    hypothesis: 'x', falsifier: 'y', costCeilingCents: 0, timeCeilingMinutes: 10
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasonCodes, ['at-least-one-bounded-probe-required']);
  assert.match(result.why, /no action/);
});

test('caller-written discriminating=true is not discrimination evidence', () => {
  const result = compileFeasibleBoundedExperiment({
    hypothesis: 'x', falsifier: 'y', costCeilingCents: 0, timeCeilingMinutes: 10,
    probes: [{ description: 'look at one fixture', costCents: 0, timeMinutes: 5, discriminating: true }]
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('probe-measure-required'));
  assert.ok(result.reasonCodes.includes('probe-decision-rule-required'));
  assert.ok(result.reasonCodes.includes('probe-supporting-observation-required'));
  assert.ok(result.reasonCodes.includes('probe-falsifying-observation-required'));
});

test('a measure without an explicit decision rule is not yet discriminating', () => {
  const result = compile({ probes: [baseProbe({ decisionRule: '' })] });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasonCodes, ['probe-decision-rule-required']);
});

test('supporting and falsifying observations must actually differ', () => {
  const result = compile({
    probes: [baseProbe({
      supportsHypothesis: 'conversion stays flat',
      falsifiesHypothesis: 'Conversion stays flat.'
    })]
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('probe-competing-observations-must-differ'));
});

test('selected probe cost and time must fit the declared top-level ceilings', () => {
  const result = compileFeasibleBoundedExperiment({
    hypothesis: 'x', falsifier: 'y', costCeilingCents: 100, timeCeilingMinutes: 20,
    probes: [
      baseProbe({ description: 'too expensive', costCents: 101, timeMinutes: 5 }),
      baseProbe({ description: 'too slow', costCents: 0, timeMinutes: 21 })
    ]
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasonCodes, ['no-probe-fits-declared-cost-and-time-ceilings']);
  assert.equal(result.discardedProbes.length, 2);
  assert.ok(result.discardedProbes.some(row => row.discardReasons.includes('probe-cost-exceeds-cost-ceiling')));
  assert.ok(result.discardedProbes.some(row => row.discardReasons.includes('probe-time-exceeds-time-ceiling')));
});

test('an over-budget probe is discarded while the smallest bounded discriminating probe survives', () => {
  const result = compileFeasibleBoundedExperiment({
    hypothesis: 'x', falsifier: 'y', costCeilingCents: 100, timeCeilingMinutes: 30,
    probes: [
      baseProbe({ description: 'large batch', costCents: 500, timeMinutes: 10 }),
      baseProbe({ description: 'slow local batch', costCents: 0, timeMinutes: 25 }),
      baseProbe({ description: 'small local batch', costCents: 0, timeMinutes: 8 })
    ]
  });
  assert.equal(result.ok, true, JSON.stringify(result.reasonCodes));
  assert.equal(result.status, 'FEASIBLE_EXPERIMENT_COMPILED');
  assert.equal(result.probe.description, 'small local batch');
  assert.equal(result.feasibility.costFits, true);
  assert.equal(result.feasibility.timeFits, true);
  assert.equal(result.feasibility.hasExplicitDecisionRule, true);
  assert.equal(result.feasibility.discardedProbes.length, 1);
  assert.equal(result.feasibility.empiricallyValidatedDiscrimination, false);
});

test('probe cost cannot understate a separately declared spend', () => {
  const result = compileFeasibleBoundedExperiment({
    hypothesis: 'x', falsifier: 'y', costCeilingCents: 500, timeCeilingMinutes: 20,
    effects: { spendCents: 200 },
    probes: [baseProbe({ costCents: 100 })]
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasonCodes, ['selected-probe-cost-understates-declared-spend']);
});

test('malformed numeric effects fail closed instead of falling through to zero authority', () => {
  const negativeSpend = compile({ effects: { spendCents: -1 } });
  assert.equal(negativeSpend.ok, false);
  assert.deepEqual(negativeSpend.reasonCodes, ['spendCents-must-be-a-non-negative-safe-integer']);

  const badCalls = compile({ effects: { providerCalls: 'many' } });
  assert.equal(badCalls.ok, false);
  assert.deepEqual(badCalls.reasonCodes, ['providerCalls-must-be-a-non-negative-safe-integer']);
});

test('probe-level reversibility typos fail closed rather than silently becoming the top-level default', () => {
  const result = compile({ probes: [baseProbe({ reversibility: 'PRACTICALLY_IRREVERSIBL' })] });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasonCodes, ['probe-recognized-reversibility-required']);
});

test('mature authority law is preserved: structurally feasible customer experiment is still not runnable', () => {
  const result = compileFeasibleBoundedExperiment({
    hypothesis: 'customers prefer the shorter pack',
    falsifier: 'held-out reply rate is unchanged',
    costCeilingCents: 1000,
    timeCeilingMinutes: 60,
    blastRadius: 'CUSTOMER',
    effects: { customerContact: true },
    probes: [baseProbe({
      description: 'held-out customer split',
      costCents: 0,
      timeMinutes: 30,
      measure: 'held-out reply rate',
      decisionRule: 'support only if the short-pack lift exceeds the predeclared margin',
      supportsHypothesis: 'short-pack reply rate exceeds long-pack reply rate by the predeclared margin',
      falsifiesHypothesis: 'the reply-rate difference is below the predeclared margin'
    })]
  });
  assert.equal(result.ok, true);
  assert.equal(result.runnable, false);
  assert.equal(result.status, 'FEASIBLE_EXPERIMENT_REQUIRES_EXPLICIT_AUTHORITY');
  assert.ok(result.requiredAuthority.includes('CUSTOMER_CONTACT'));
  assert.ok(result.requiredAuthority.includes('BLAST_RADIUS_BEYOND_LOCAL'));
  assert.equal(result.businessEffectAuthority, 'NONE');
});

test('a local bounded probe carries explicit structural discrimination without claiming real informativeness', () => {
  const result = compile();
  assert.equal(result.ok, true);
  assert.equal(result.runnable, true);
  assert.equal(result.probe.measure, 'classification error rate');
  assert.match(result.probe.decisionRule, /predeclared tolerance/);
  assert.match(result.probe.structuralDiscrimination, /NOT_EMPIRICALLY_VALIDATED/);
  assert.match(result.truthBoundary, /DO_NOT_PROVE/);
  assert.equal(result.businessEffectAuthority, 'NONE');
});

test('duplicate probe descriptions fail closed so selected evidence cannot bind ambiguously', () => {
  const result = compile({ probes: [baseProbe(), baseProbe()] });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasonCodes, ['probe-descriptions-must-be-unique']);
});
