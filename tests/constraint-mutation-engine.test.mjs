import test from 'node:test';
import assert from 'node:assert/strict';
import { compileConstraintMutationPlan } from '../src/constraint-mutation-engine.mjs';

function attempt(overrides = {}) {
  return {
    objectiveId: 'deploy-uberbond-portably',
    mechanismId: 'vercel-preview',
    providerId: 'vercel',
    evidenceRefs: ['receipt:rate-limit-1'],
    failure: { providerUnavailable: true, rateLimited: true, outcomeUncertain: true },
    ...overrides
  };
}

test('repeating the same blocked provider strategy requires immediate mutation', () => {
  const prior = attempt();
  const current = attempt();
  const plan = compileConstraintMutationPlan({ currentAttempt: current, history: [prior] });
  assert.equal(plan.ok, true);
  assert.equal(plan.status, 'STRATEGY_MUTATION_REQUIRED');
  assert.equal(plan.identicalRetryAllowed, false);
  assert.equal(plan.hardMutationRequired, true);
  assert.equal(plan.decision, 'MUTATE_STRATEGY_NOW');
  assert.ok(plan.mutationFamilies.includes('switch-provider'));
  assert.ok(plan.mutationFamilies.includes('switch-execution-substrate'));
  assert.ok(plan.mutationFamilies.includes('self-host-authorized-runtime'));
  assert.ok(plan.forbidden.includes('blind-identical-retry'));
});

test('new evidence does not permit retry when provider outcome remains uncertain', () => {
  const prior = attempt();
  const current = attempt({ evidenceRefs: ['receipt:rate-limit-1', 'receipt:new-status'] });
  const plan = compileConstraintMutationPlan({ currentAttempt: current, history: [prior] });
  assert.equal(plan.identicalRetryAllowed, false);
  assert.equal(plan.status, 'STRATEGY_MUTATION_REQUIRED');
});

test('safe retry requires known-safe outcome and genuinely new evidence', () => {
  const prior = attempt({
    evidenceRefs: ['receipt:old'],
    failure: { failureClass: 'STOCHASTIC_FAILURE', safeToRetrySameMechanism: true, outcomeUncertain: false }
  });
  const current = attempt({
    evidenceRefs: ['receipt:old', 'receipt:new'],
    failure: { failureClass: 'STOCHASTIC_FAILURE', safeToRetrySameMechanism: true, outcomeUncertain: false }
  });
  const plan = compileConstraintMutationPlan({ currentAttempt: current, history: [prior] });
  assert.equal(plan.identicalRetryAllowed, true);
  assert.equal(plan.status, 'BOUNDED_RETRY_WITH_NEW_EVIDENCE_PERMITTED');
  assert.deepEqual(plan.novelEvidenceRefs, ['receipt:new']);
});

test('authority blocks mutate dependency rather than suggesting circumvention', () => {
  const plan = compileConstraintMutationPlan({
    currentAttempt: attempt({
      mechanismId: 'forbidden-provider-action',
      providerId: 'provider-x',
      failure: { authorityDenied: true, outcomeUncertain: false }
    }),
    history: [attempt({
      mechanismId: 'forbidden-provider-action',
      providerId: 'provider-x',
      failure: { authorityDenied: true, outcomeUncertain: false }
    })]
  });
  assert.equal(plan.status, 'STRATEGY_MUTATION_REQUIRED');
  assert.ok(plan.mutationFamilies.includes('find-lawful-substitute'));
  assert.ok(plan.mutationFamilies.includes('redesign-dependency'));
  assert.ok(plan.forbidden.includes('access-control-circumvention'));
  assert.ok(plan.forbidden.includes('provider-limit-bypass'));
  assert.ok(!plan.mutationFamilies.some(item => /bypass|evad|circumvent/i.test(item)));
});

test('capability gap turns into compose-or-build work instead of scheduled retry', () => {
  const gap = attempt({
    mechanismId: 'missing-parser',
    providerId: 'local',
    failure: { missingCapability: true, missingCapabilities: ['bounded-parser'], outcomeUncertain: false }
  });
  const plan = compileConstraintMutationPlan({ currentAttempt: gap, history: [gap] });
  assert.equal(plan.status, 'STRATEGY_MUTATION_REQUIRED');
  assert.ok(plan.mutationFamilies.includes('query-capability-genome'));
  assert.ok(plan.mutationFamilies.includes('compose-existing-capability-atoms'));
  assert.ok(plan.mutationFamilies.includes('build-missing-capability'));
});

test('changing mechanism family is not misclassified as an identical retry', () => {
  const plan = compileConstraintMutationPlan({
    history: [attempt()],
    currentAttempt: attempt({ mechanismId: 'portable-docker-host', providerId: 'authorized-self-host' })
  });
  assert.equal(plan.sameStrategyRepeated, false);
  assert.equal(plan.repeatCount, 0);
});

test('engine never gains effect authority', () => {
  const plan = compileConstraintMutationPlan({ currentAttempt: attempt(), history: [attempt()] });
  assert.equal(plan.businessEffectAuthority, 'NONE');
  assert.match(plan.truthBoundary, /NEVER WIDENS AUTHORITY/);
});

test('unbounded history is refused rather than silently truncated', () => {
  const plan = compileConstraintMutationPlan({ currentAttempt: attempt(), history: Array.from({ length: 201 }, () => attempt()) });
  assert.equal(plan.ok, false);
  assert.ok(plan.reasonCodes.includes('bounded-history-required'));
});
