import test from 'node:test';
import assert from 'node:assert/strict';
import { compileFeasibleBoundedExperiment } from '../src/genesis-experiment-feasibility.mjs';
import { runGenesisExperimentFeasibilityDoctor } from '../scripts/genesis-experiment-feasibility-doctor.mjs';

const probe = {
  description: 'run local fixture',
  costCents: 0,
  timeMinutes: 2,
  measure: 'fixture verdict',
  decisionRule: 'support on FAIL; falsify on PASS',
  supportsHypothesis: 'fixture fails',
  falsifiesHypothesis: 'fixture passes'
};

const compile = effects => compileFeasibleBoundedExperiment({
  hypothesis: 'the candidate contains the defect',
  falsifier: 'the fixture passes',
  costCeilingCents: 0,
  timeCeilingMinutes: 5,
  effects,
  probes: [probe]
});

test('string true cannot erase a consequential boolean effect', () => {
  for (const field of ['customerContact', 'deployment', 'credentialChange', 'dnsChange', 'productionMutation']) {
    const result = compile({ [field]: 'true' });
    assert.equal(result.ok, false, field);
    assert.deepEqual(result.reasonCodes, [`${field}-must-be-boolean`]);
  }
});

test('real boolean true remains visible to the mature authority compiler', () => {
  const result = compile({ customerContact: true });
  assert.equal(result.ok, true);
  assert.equal(result.runnable, false);
  assert.ok(result.requiredAuthority.includes('CUSTOMER_CONTACT'));
  assert.equal(result.businessEffectAuthority, 'NONE');
});

test('the operator doctor exercises the hardened feasibility path with zero effects', () => {
  const result = runGenesisExperimentFeasibilityDoctor();
  assert.equal(result.ok, true, JSON.stringify(result.checks));
  assert.equal(result.status, 'GENESIS_EXPERIMENT_FEASIBILITY_HEALTHY');
  assert.ok(Object.values(result.externalEffectLedger).every(value => value === 0));
  assert.equal(result.businessEffectAuthority, 'NONE');
});
