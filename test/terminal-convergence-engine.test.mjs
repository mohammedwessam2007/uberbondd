import test from 'node:test';
import assert from 'node:assert/strict';
import { ASI_DIMENSIONS, createConvergencePlan, summarizeConvergence, validateBehavioralObservation } from '../src/terminal-convergence-engine.mjs';

const id = { candidateId: 'UBERBOND_CANDIDATE', candidateRevision: 'rev-001' };
const plan = createConvergencePlan({ ...id, variantsPerAttack: 1 });
const make = (dimension, n, extra = {}) => ({
  ...id, dimension, observed: true, behavioral: true, synthetic: false, latencyOnly: false,
  hiddenPopulation: true, taskPopulationHash: `${dimension}-${'a'.repeat(40)}-${n}`,
  verifierLineage: `verifier-${dimension}-${n}`, baselineScore: 0.5, candidateScore: 0.7,
  noRegression: true, ...extra
});

test('freezes the twenty-dimension denominator', () => {
  assert.equal(plan.denominator, 20);
  assert.deepEqual(plan.frozenDimensions, ASI_DIMENSIONS);
  assert.ok(plan.lanes.length > 20);
  assert.ok(plan.lanes.every(x => x.authority === 'ZERO_EXTERNAL_EFFECT'));
});

test('rejects identity mismatch and weak evidence classes', () => {
  assert.throws(() => validateBehavioralObservation(plan, make(ASI_DIMENSIONS[0], 1, { candidateRevision: 'wrong' })), /mismatch/);
  assert.throws(() => validateBehavioralObservation(plan, make(ASI_DIMENSIONS[0], 2, { synthetic: true })), /synthetic/);
  assert.throws(() => validateBehavioralObservation(plan, make(ASI_DIMENSIONS[0], 3, { latencyOnly: true })), /latency-only/);
  assert.throws(() => validateBehavioralObservation(plan, make(ASI_DIMENSIONS[0], 4, { observed: false })), /unobserved/);
});

test('rejects missing uplift and regression', () => {
  assert.throws(() => validateBehavioralObservation(plan, make(ASI_DIMENSIONS[0], 5, { candidateScore: 0.5 })), /uplift/);
  assert.throws(() => validateBehavioralObservation(plan, make(ASI_DIMENSIONS[0], 6, { noRegression: false })), /noRegression/);
});

test('rejects reused populations and verifier lineages', () => {
  const first = validateBehavioralObservation(plan, make(ASI_DIMENSIONS[0], 7));
  assert.throws(() => validateBehavioralObservation(plan, make(ASI_DIMENSIONS[1], 8, { taskPopulationHash: first.taskPopulationHash }), [first]), /population/);
  assert.throws(() => validateBehavioralObservation(plan, make(ASI_DIMENSIONS[1], 9, { verifierLineage: first.verifierLineage }), [first]), /verifier lineage/);
});

test('terminal verdict requires twenty independent admitted observations', () => {
  const admitted = [];
  ASI_DIMENSIONS.forEach((dimension, i) => admitted.push(validateBehavioralObservation(plan, make(dimension, 100 + i), admitted)));
  const summary = summarizeConvergence(plan, admitted);
  assert.equal(summary.denominator, 20);
  assert.equal(summary.passedCount, 20);
  assert.equal(summary.failedCount, 0);
  assert.equal(summary.percentage, 100);
  assert.equal(summary.terminal, true);
});
