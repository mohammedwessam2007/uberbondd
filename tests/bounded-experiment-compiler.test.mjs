import test from 'node:test';
import assert from 'node:assert/strict';
import { compileBoundedExperiment } from '../src/bounded-experiment-compiler.mjs';

const base = {
  mission: 'distinguish which explanation predicts the observed behavior',
  hypotheses: [
    { id: 'h1', predictedObservations: ['latency falls'] },
    { id: 'h2', predictedObservations: ['latency stays flat'] }
  ],
  budget: { maxCostCents: 1000, maxTimeMinutes: 60, maxDeclaredEffects: 2 },
  probe: {
    description: 'run one bounded comparison',
    costCents: 0,
    timeMinutes: 10,
    reversibility: 'REVERSIBLE',
    effects: []
  }
};

const effect = ({ party = 'FOUNDER', reversibility = 'REVERSIBLE', consented = true } = {}) => ({
  party,
  effect: 'one bounded observable changes',
  reversibility,
  consented
});

test('zero-effect discriminating probe can be compiled without inventing authority', () => {
  const result = compileBoundedExperiment(base);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'BOUNDED_ZERO_EFFECT_EXPERIMENT_FEASIBLE');
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.equal(result.discrimination.discriminating, true);
});

test('positive cost is refused when the cost ceiling is zero', () => {
  const result = compileBoundedExperiment({
    ...base,
    budget: { ...base.budget, maxCostCents: 0 },
    probe: { ...base.probe, costCents: 1 }
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'EXPERIMENT_BUDGET_EXCEEDED');
  assert.ok(result.reasonCodes.includes('probe-cost-exceeds-ceiling'));
});

test('time ceiling and effect ceiling are enforced independently', () => {
  const tooLong = compileBoundedExperiment({
    ...base,
    budget: { ...base.budget, maxTimeMinutes: 5 },
    probe: { ...base.probe, timeMinutes: 6 }
  });
  assert.equal(tooLong.ok, false);
  assert.ok(tooLong.reasonCodes.includes('probe-time-exceeds-ceiling'));

  const tooManyEffects = compileBoundedExperiment({
    ...base,
    budget: { ...base.budget, maxDeclaredEffects: 1 },
    probe: { ...base.probe, effects: [effect(), effect()] }
  });
  assert.equal(tooManyEffects.ok, false);
  assert.ok(tooManyEffects.reasonCodes.includes('probe-effects-exceed-ceiling'));
});

test('declared effect count cannot lie about the actual effect list', () => {
  const result = compileBoundedExperiment({
    ...base,
    probe: { ...base.probe, effects: [effect()], declaredEffectCount: 0 }
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('declared-effect-count-mismatch'));
});

test('a probe whose rival hypotheses predict the same observations is not discriminating', () => {
  const result = compileBoundedExperiment({
    ...base,
    hypotheses: [
      { id: 'h1', predictedObservations: ['same result', 'same secondary result'] },
      { id: 'h2', predictedObservations: ['same secondary result', 'same result'] }
    ]
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'EXPERIMENT_NOT_DISCRIMINATING');
  assert.ok(result.reasonCodes.includes('rival-hypotheses-predict-identical-observations'));
});

test('irreversible probe or irreversible declared effect is refused', () => {
  const probe = compileBoundedExperiment({
    ...base,
    probe: { ...base.probe, reversibility: 'PRACTICALLY_IRREVERSIBLE' }
  });
  assert.equal(probe.ok, false);
  assert.ok(probe.reasonCodes.includes('irreversible-probe-not-admissible'));

  const declared = compileBoundedExperiment({
    ...base,
    probe: { ...base.probe, effects: [effect({ reversibility: 'PHYSICALLY_IRREVERSIBLE' })] },
    capabilities: ['capability'],
    resources: ['resource'],
    authority: { ok: true }
  });
  assert.equal(declared.ok, false);
  assert.ok(declared.reasonCodes.includes('irreversible-probe-not-admissible'));
});

test('effect on another person without recorded consent is refused before execution authority matters', () => {
  const result = compileBoundedExperiment({
    ...base,
    probe: { ...base.probe, effects: [effect({ party: 'OTHER_PEOPLE', consented: false })] },
    capabilities: ['capability'],
    resources: ['resource'],
    authority: { ok: true }
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('effects-on-others-require-recorded-consent'));
});

test('effectful probe without existing Intent Compiler authority is refused', () => {
  const result = compileBoundedExperiment({
    ...base,
    probe: { ...base.probe, costCents: 1 },
    capabilities: ['capability'],
    resources: ['resource']
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'EXPERIMENT_AUTHORITY_REQUIRED');
  assert.ok(result.reasonCodes.includes('existing-intent-compiler-did-not-reach-permissions'));
  assert.equal(result.permissionCompilation.businessEffectAuthority, 'NONE');
});

test('descriptive authorized=true does not manufacture permission', () => {
  const result = compileBoundedExperiment({
    ...base,
    probe: { ...base.probe, costCents: 1, authorized: true, permission: 'granted' },
    capabilities: ['capability'],
    resources: ['resource']
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'EXPERIMENT_AUTHORITY_REQUIRED');
});

test('effectful probe with actual authority presented to Intent Compiler remains non-executing', () => {
  const result = compileBoundedExperiment({
    ...base,
    probe: { ...base.probe, costCents: 1, effects: [effect()] },
    capabilities: ['run bounded test'],
    resources: ['synthetic fixture'],
    authority: { ok: true, ref: 'synthetic-authority-fixture' }
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'BOUNDED_EXPERIMENT_FEASIBLE__SEPARATE_EXECUTOR_REQUIRED');
  assert.equal(result.permissionCompilation.status, 'READY_FOR_ACTION');
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.match(result.authorityBoundary, /FEASIBILITY_DOES_NOT_CREATE_EXECUTION_AUTHORITY/);
});

test('malformed effects fail closed instead of being silently dropped', () => {
  const result = compileBoundedExperiment({
    ...base,
    probe: {
      ...base.probe,
      effects: [{ party: 'FOUNDER', effect: 'something', reversibility: 'MADE_UP_VALUE', consented: true }]
    }
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('declared-effect-contract-invalid'));
});

test('duplicate hypothesis ids are rejected even when their predictions differ', () => {
  const result = compileBoundedExperiment({
    ...base,
    hypotheses: [
      { id: 'same', predictedObservations: ['one'] },
      { id: 'same', predictedObservations: ['two'] }
    ]
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('two-unique-hypotheses-with-predictions-required'));
});
