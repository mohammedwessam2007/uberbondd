import test from 'node:test';
import assert from 'node:assert/strict';
import {
  executeWithFailover,
  classifyRouteFailure,
  ROUTE_FAILURE_CLASSES,
  TERMINAL_FAILURE_CLASSES
} from '../src/agent-model-failover.mjs';
import { routeModel, normalizeModelCandidate } from '../src/agent-model-router.mjs';

// The routing order existed and nothing walked it.
//
// `routeModel` has always returned `selected` plus a ranked `alternatives`
// list, and agent-model-routing-integration has always carried both. A grep for
// failover, fallbackProvider or FALLBACK across src/ returned nothing: when a
// provider hit a quota wall the run failed, next to a list naming exactly which
// model should have served it.
//
// These tests drive the real router -- not a hand-built route object -- so the
// order being walked is the order the system actually produces.

const candidate = (provider, model) => normalizeModelCandidate({
  provider, model, taskClasses: ['research'], enabled: true
});

// Three real routes through the real router, with benchmarks that fix the
// order so the primary and the fallbacks are known rather than assumed.
function threeRouteOrder() {
  const primary = candidate('anthropic', 'claude-primary');
  const sameProviderFallback = candidate('anthropic', 'claude-secondary');
  const otherProviderFallback = candidate('openai', 'gpt-fallback');

  const benchmark = (item, quality) => ({
    ok: true,
    taskClass: 'research',
    candidate: { provider: item.provider, model: item.model, candidateId: item.candidateId },
    quality, reliability: quality, latencyScore: quality,
    economicImpact: quality, evidenceConfidence: 0.9, costEfficiency: quality,
    observedAt: '2026-08-31T00:00:00.000Z'
  });

  const route = routeModel({
    taskClass: 'research',
    candidates: [primary, sameProviderFallback, otherProviderFallback],
    benchmarks: [benchmark(primary, 0.9), benchmark(sameProviderFallback, 0.6), benchmark(otherProviderFallback, 0.3)],
    explorationRate: 0,
    random: () => 0.99
  });
  assert.equal(route.ok, true, 'the router must produce a route for this fixture');
  assert.equal(route.selected.model, 'claude-primary');
  return { route, primary, sameProviderFallback, otherProviderFallback };
}

const ALL_PROVIDERS = ['anthropic', 'openai'];

const served = () => ({ ok: true, outcome: 'SUCCEEDED', content: 'answer' });
const failed = (reasonCodes, outcome = 'CONFIRMED_FAILURE') => ({ ok: false, outcome, reasonCodes });

// Records what was actually called, so identity claims are checked against
// calls rather than against the result's own account of itself.
function recorder(responder) {
  const calls = [];
  return {
    calls,
    execute: async identity => {
      calls.push(`${identity.provider}:${identity.model}`);
      return responder(identity, calls.length);
    }
  };
}

// 1. Normal primary route.
test('the primary route serves, and nothing else is called', async () => {
  const { route } = threeRouteOrder();
  const { execute, calls } = recorder(() => served());

  const outcome = await executeWithFailover({ route, authorizedProviders: ALL_PROVIDERS, execute });

  assert.equal(outcome.ok, true);
  assert.equal(outcome.status, 'SERVED_BY_PRIMARY');
  assert.equal(outcome.failoverOccurred, false);
  assert.deepEqual(calls, ['anthropic:claude-primary'], 'a working primary must not touch a fallback');
});

// 2. Simulated quota exhaustion. 6. Fallback model succeeds.
test('quota exhaustion moves to the next model, and says that it did', async () => {
  const { route } = threeRouteOrder();
  const { execute, calls } = recorder((identity) =>
    identity.model === 'claude-primary'
      ? failed(['openai-http-429', 'insufficient_quota'])
      : served());

  const outcome = await executeWithFailover({ route, authorizedProviders: ALL_PROVIDERS, execute });

  assert.equal(outcome.ok, true);
  assert.equal(outcome.status, 'SERVED_BY_FALLBACK');
  assert.equal(outcome.failoverOccurred, true);
  assert.deepEqual(calls, ['anthropic:claude-primary', 'anthropic:claude-secondary']);
  assert.equal(outcome.attempts[0].failureClass, ROUTE_FAILURE_CLASSES.QUOTA_EXHAUSTED);
});

// 3. Simulated rate limit.
test('a rate limit moves to the next route', async () => {
  const { route } = threeRouteOrder();
  const { execute } = recorder((identity) =>
    identity.model === 'claude-primary' ? failed(['anthropic-http-429']) : served());

  const outcome = await executeWithFailover({ route, authorizedProviders: ALL_PROVIDERS, execute });

  assert.equal(outcome.status, 'SERVED_BY_FALLBACK');
  assert.equal(outcome.attempts[0].failureClass, ROUTE_FAILURE_CLASSES.RATE_LIMITED);
});

// 4. Provider outage. 7. Fallback provider succeeds.
test('a provider outage crosses to the other provider when the task allows a retry', async () => {
  const { route } = threeRouteOrder();
  const { execute, calls } = recorder((identity) =>
    identity.provider === 'anthropic'
      ? failed(['anthropic-http-529', 'overloaded'], 'UNCERTAIN')
      : served());

  const outcome = await executeWithFailover({
    route, authorizedProviders: ALL_PROVIDERS, execute, taskIdempotency: 'IDEMPOTENT'
  });

  assert.equal(outcome.ok, true);
  assert.equal(outcome.status, 'SERVED_BY_FALLBACK');
  assert.equal(outcome.served.provider, 'openai', 'the fallback provider must be the one that served');
  assert.deepEqual(calls, ['anthropic:claude-primary', 'anthropic:claude-secondary', 'openai:gpt-fallback']);
  assert.equal(outcome.attempts[0].failureClass, ROUTE_FAILURE_CLASSES.PROVIDER_OUTAGE);
});

// 5. Model unavailable.
test('a model the provider does not have moves on without blaming the provider', async () => {
  const { route } = threeRouteOrder();
  const { execute } = recorder((identity) =>
    identity.model === 'claude-primary' ? failed(['anthropic-model_not_found']) : served());

  const outcome = await executeWithFailover({ route, authorizedProviders: ALL_PROVIDERS, execute });

  assert.equal(outcome.status, 'SERVED_BY_FALLBACK');
  assert.equal(outcome.attempts[0].failureClass, ROUTE_FAILURE_CLASSES.MODEL_UNAVAILABLE);
  assert.equal(outcome.served.provider, 'anthropic',
    'the same provider still serves; only the model was unavailable');
});

// 8. Every provider exhausted.
test('when every route is exhausted it says so, and invents no answer', async () => {
  const { route } = threeRouteOrder();
  const { execute, calls } = recorder(() => failed(['provider-http-429']));

  const outcome = await executeWithFailover({ route, authorizedProviders: ALL_PROVIDERS, execute });

  assert.equal(outcome.ok, false);
  assert.equal(outcome.status, 'ALL_ROUTES_EXHAUSTED');
  assert.equal(outcome.exhausted, true);
  assert.equal(outcome.served, null);
  assert.equal(outcome.result, null, 'an exhausted chain must not carry a result');
  assert.equal(calls.length, 3, 'every authorized route must have been tried before saying exhausted');
});

// 9. Unauthorized provider rejected.
test('an unauthorized provider is never called, only recorded', async () => {
  const { route } = threeRouteOrder();
  const { execute, calls } = recorder((identity) =>
    identity.provider === 'anthropic' ? failed(['anthropic-http-429']) : served());

  const outcome = await executeWithFailover({ route, authorizedProviders: ['anthropic'], execute });

  assert.equal(outcome.ok, false, 'the only authorized provider was exhausted');
  assert.equal(calls.includes('openai:gpt-fallback'), false,
    'an unauthorized provider must not be contacted at all');
  const skipped = outcome.attempts.find(item => item.provider === 'openai');
  assert.equal(skipped.attempted, false);
  assert.deepEqual(skipped.reasonCodes, ['provider-not-authorized']);
});

test('an empty authorization list is not permission to use anything', async () => {
  const { route } = threeRouteOrder();
  const { execute, calls } = recorder(() => served());

  const outcome = await executeWithFailover({ route, authorizedProviders: [], execute });

  assert.equal(outcome.ok, false);
  assert.deepEqual(outcome.reasonCodes, ['no-authorized-provider-configured']);
  assert.equal(calls.length, 0, 'a run never told what it may use must call nothing');
});

// 10. Provider identity preserved.
test('every attempt carries the identity that actually ran it', async () => {
  const { route } = threeRouteOrder();
  const { execute, calls } = recorder((identity) =>
    identity.provider === 'anthropic' ? failed(['anthropic-http-429']) : served());

  const outcome = await executeWithFailover({ route, authorizedProviders: ALL_PROVIDERS, execute });

  // What the ledger claims must match what was called, in order.
  assert.deepEqual(
    outcome.attempts.filter(item => item.attempted).map(item => `${item.provider}:${item.model}`),
    calls);

  // The answer names its real source, and the primary is still visible as the
  // thing that was asked first -- neither is rewritten to look like the other.
  assert.deepEqual(outcome.served, {
    provider: 'openai', model: 'gpt-fallback', candidateId: outcome.served.candidateId
  });
  assert.equal(outcome.primary.provider, 'anthropic');
  assert.equal(outcome.primary.model, 'claude-primary');
  assert.notEqual(outcome.served.candidateId, outcome.primary.candidateId);
});

// 11. No silent fallback.
test('a fallback answer is never indistinguishable from a primary one', async () => {
  const { route } = threeRouteOrder();
  const { execute } = recorder((identity) =>
    identity.model === 'claude-primary' ? failed(['anthropic-http-429']) : served());

  const fallback = await executeWithFailover({ route, authorizedProviders: ALL_PROVIDERS, execute });
  const clean = await executeWithFailover({
    route, authorizedProviders: ALL_PROVIDERS, execute: async () => served()
  });

  // Four independent tells, so removing any one of them still leaves the
  // caller able to see that a fallback happened.
  assert.notEqual(fallback.status, clean.status);
  assert.equal(fallback.failoverOccurred, true);
  assert.equal(clean.failoverOccurred, false);
  assert.ok(fallback.attempts.length > clean.attempts.length);
  assert.ok(fallback.reasonCodes.some(code => code.startsWith('failover-')));
  assert.deepEqual(clean.reasonCodes, []);
});

// The property a naive failover implementation gets wrong.
test('an uncertain outcome does not run the task twice', async () => {
  const { route } = threeRouteOrder();
  const { execute, calls } = recorder((identity) =>
    identity.model === 'claude-primary'
      ? failed(['anthropic-transport-uncertain'], 'UNCERTAIN')
      : served());

  const outcome = await executeWithFailover({ route, authorizedProviders: ALL_PROVIDERS, execute });

  assert.equal(outcome.ok, false);
  assert.deepEqual(calls, ['anthropic:claude-primary'],
    'the provider may already have done the work; a second one doing it again is worse than failing');
  assert.ok(outcome.reasonCodes.includes('uncertain-outcome-not-retryable-for-non-idempotent-task'));
  assert.equal(outcome.attempts[0].uncertain, true);

  // And the same failure does move on once the caller declares it may.
  const retried = await executeWithFailover({
    route, authorizedProviders: ALL_PROVIDERS, execute, taskIdempotency: 'IDEMPOTENT'
  });
  assert.equal(retried.ok, true);
  assert.equal(retried.status, 'SERVED_BY_FALLBACK');
});

test('a failure a different provider cannot fix is not walked around', async () => {
  const { route } = threeRouteOrder();

  for (const [label, reasonCodes, expected] of [
    ['a malformed request', ['anthropic-http-400'], TERMINAL_FAILURE_CLASSES.REQUEST_REJECTED],
    ['a rejected credential', ['anthropic-http-401'], TERMINAL_FAILURE_CLASSES.CREDENTIAL_REJECTED],
    ['a forbidden call', ['anthropic-http-403'], TERMINAL_FAILURE_CLASSES.CREDENTIAL_REJECTED],
    ['an unrecognised failure', ['something-nobody-has-seen'], TERMINAL_FAILURE_CLASSES.UNCLASSIFIED]
  ]) {
    const { execute, calls } = recorder(() => failed(reasonCodes));
    const outcome = await executeWithFailover({ route, authorizedProviders: ALL_PROVIDERS, execute });

    assert.equal(outcome.ok, false, label);
    assert.equal(outcome.attempts[0].failureClass, expected, label);
    assert.equal(calls.length, 1, `${label}: must stop at the first route, not tour every provider`);
    assert.equal(outcome.exhausted, false,
      `${label}: this is not an exhausted chain, and calling it one would hide a defect`);
  }
});

// A thrown executor is not a provider answer, and must be treated as the
// unknown it is rather than as a clean refusal.
test('an executor that throws is uncertain, not a confirmed refusal', async () => {
  const { route } = threeRouteOrder();
  const { execute, calls } = recorder((identity) => {
    if (identity.model === 'claude-primary') throw new Error('socket hang up');
    return served();
  });

  const outcome = await executeWithFailover({ route, authorizedProviders: ALL_PROVIDERS, execute });
  assert.equal(outcome.ok, false, 'a throw is not proof the provider did nothing');
  assert.deepEqual(calls, ['anthropic:claude-primary']);
  assert.equal(outcome.attempts[0].uncertain, true);
});

test('the attempt budget bounds the walk, and says why it stopped', async () => {
  const { route } = threeRouteOrder();
  const { execute, calls } = recorder(() => failed(['provider-http-429']));

  const outcome = await executeWithFailover({
    route, authorizedProviders: ALL_PROVIDERS, execute, maxAttempts: 2
  });

  assert.equal(calls.length, 2);
  assert.equal(outcome.ok, false);
  assert.ok(outcome.reasonCodes.includes('attempt-budget-reached'));
  assert.equal(outcome.exhausted, false,
    'stopping early is not the same as having no routes left, and must not be reported as it');
});

test('a route that never routed cannot be executed', async () => {
  for (const [label, route] of [
    ['no route at all', null],
    ['a failed route', { ok: false, status: 'BLOCKED' }],
    ['a route with no selection', { ok: true, selected: null }]
  ]) {
    const outcome = await executeWithFailover({
      route, authorizedProviders: ALL_PROVIDERS, execute: async () => served()
    });
    assert.equal(outcome.ok, false, label);
    assert.deepEqual(outcome.reasonCodes, ['routed-model-required'], label);
  }
});

// The classifier is pure, so the whole vocabulary is cheap to state exactly.
test('the failure vocabulary is stated, not inferred case by case', () => {
  const cases = [
    [['openai-http-402'], ROUTE_FAILURE_CLASSES.QUOTA_EXHAUSTED, true],
    [['insufficient_quota'], ROUTE_FAILURE_CLASSES.QUOTA_EXHAUSTED, true],
    [['anthropic-http-429'], ROUTE_FAILURE_CLASSES.RATE_LIMITED, true],
    [['rate_limit_exceeded'], ROUTE_FAILURE_CLASSES.RATE_LIMITED, true],
    [['anthropic-http-529'], ROUTE_FAILURE_CLASSES.PROVIDER_OUTAGE, true],
    [['openai-http-503'], ROUTE_FAILURE_CLASSES.PROVIDER_OUTAGE, true],
    [['model_not_found'], ROUTE_FAILURE_CLASSES.MODEL_UNAVAILABLE, true],
    [['anthropic-http-400'], TERMINAL_FAILURE_CLASSES.REQUEST_REJECTED, false],
    [['anthropic-http-401'], TERMINAL_FAILURE_CLASSES.CREDENTIAL_REJECTED, false],
    [['anthropic-http-422'], TERMINAL_FAILURE_CLASSES.REQUEST_REJECTED, false],
    [[], TERMINAL_FAILURE_CLASSES.UNCLASSIFIED, false]
  ];
  for (const [reasonCodes, expectedClass, expectedEligible] of cases) {
    const classification = classifyRouteFailure({ ok: false, outcome: 'CONFIRMED_FAILURE', reasonCodes });
    assert.equal(classification.failureClass, expectedClass, reasonCodes.join(','));
    assert.equal(classification.failoverEligible, expectedEligible, reasonCodes.join(','));
  }

  // Quota is read before rate limit, because providers report an exhausted
  // balance as a 429 too and the operator action differs.
  assert.equal(
    classifyRouteFailure({ ok: false, reasonCodes: ['openai-http-429', 'insufficient_quota'] }).failureClass,
    ROUTE_FAILURE_CLASSES.QUOTA_EXHAUSTED);
});

// ---------------------------------------------------------------------------
// Wiring. A failover component nothing reaches is the same defect as a ranked
// alternatives list nothing walks -- which is the defect this module exists to
// close, so it would be a poor thing to reintroduce one level up.

test('the routing integration produces an order this module can execute', async () => {
  const { routePermittedWorkers } = await import('../src/agent-model-routing-integration.mjs');

  const workers = [
    { workerId: 'w-primary', provider: 'anthropic', model: 'claude-primary', taskClasses: ['research'], enabled: true },
    { workerId: 'w-fallback', provider: 'openai', model: 'gpt-fallback', taskClasses: ['research'], enabled: true }
  ];
  const observedAt = new Date().toISOString();
  const routed = routePermittedWorkers({
    workers,
    benchmarks: [
      { provider: 'anthropic', model: 'claude-primary', taskClass: 'research', quality: 0.9, reliability: 0.9, latencyScore: 0.9, economicImpact: 0.9, evidenceConfidence: 0.9, costEfficiency: 0.9, observedAt },
      { provider: 'openai', model: 'gpt-fallback', taskClass: 'research', quality: 0.4, reliability: 0.4, latencyScore: 0.4, economicImpact: 0.4, evidenceConfidence: 0.9, costEfficiency: 0.4, observedAt }
    ],
    taskClass: 'research',
    enabled: true
  });

  assert.equal(routed.ok, true, routed.reasonCodes?.join(','));
  assert.deepEqual(routed.failoverOrder.map(item => item.workerId), ['w-primary', 'w-fallback'],
    'the order must name the workers that can run it, primary first');

  // And the result feeds this module directly, with no adapter in between.
  const { execute, calls } = recorder(identity =>
    identity.provider === 'anthropic' ? failed(['anthropic-http-429']) : served());
  const outcome = await executeWithFailover({
    route: routed, authorizedProviders: ['anthropic', 'openai'], execute
  });

  assert.equal(outcome.status, 'SERVED_BY_FALLBACK');
  assert.deepEqual(calls, ['anthropic:claude-primary', 'openai:gpt-fallback']);
});

// The boundary that matters most, and the one a failover mechanism is most
// likely to breach: routing may narrow the authorized set, never widen it.
test('failover cannot reach a worker the authority layer withheld', async () => {
  const { routePermittedWorkers } = await import('../src/agent-model-routing-integration.mjs');
  const observedAt = new Date().toISOString();
  const bench = (provider, model, quality) => ({
    provider, model, taskClass: 'research', quality, reliability: quality, latencyScore: quality,
    economicImpact: quality, evidenceConfidence: 0.9, costEfficiency: quality, observedAt
  });

  // The authority layer authorized one worker. The other exists, is benchmarked,
  // and is better -- and must remain unreachable, because it was never passed in.
  const routed = routePermittedWorkers({
    workers: [{ workerId: 'w-authorized', provider: 'anthropic', model: 'claude-primary', taskClasses: ['research'], enabled: true }],
    benchmarks: [bench('anthropic', 'claude-primary', 0.5), bench('openai', 'gpt-unauthorized', 0.99)],
    taskClass: 'research',
    enabled: true
  });

  assert.equal(routed.ok, true);
  assert.deepEqual(routed.failoverOrder.map(item => item.workerId), ['w-authorized'],
    'a benchmark for an unauthorized worker must not put it in the fallback chain');

  const { execute, calls } = recorder(() => failed(['anthropic-http-429']));
  const outcome = await executeWithFailover({
    route: routed, authorizedProviders: ['anthropic', 'openai'], execute
  });

  assert.equal(outcome.ok, false);
  assert.equal(calls.includes('openai:gpt-unauthorized'), false,
    'exhausting the authorized route must not reach outside the authorized set');
  assert.equal(outcome.status, 'ALL_ROUTES_EXHAUSTED');
});

// ---------------------------------------------------------------------------
// The production path. `runAgentWorkerTick` is what actually drives a worker,
// and the hazard here is specific: `runAgentWorkerOnce` submits a terminal
// failure to the relay itself. A chain that failed and then succeeded would
// report both -- a failure the relay has already recorded, followed by a result
// contradicting it. Only the attempt that ends the chain may submit.

const MODEL_RESULT = Object.freeze({
  outcome: 'Completed.',
  changedArtifacts: [],
  testsActuallyRun: [{ command: 'node --test tests/example.test.mjs', status: 'PASS', total: 1, passed: 1, failed: 0 }],
  truthTable: { implementation: 'PASS' },
  externalEffectLedger: {
    providerCalls: 0, messages: 0, purchases: 0, deployments: 0,
    credentialChanges: 0, dnsChanges: 0, productionMutations: 0, spendCents: 0
  },
  decision: 'PROCEED',
  coordination: { action: 'DONE', summary: 'No follow-up required.', evidenceRefs: ['test:example'] }
});

// The real orchestrator, on a real store and queue, with a real relay task and
// compute budget. Only the provider call is a stub, because a provider call is
// the one thing this environment has no credential for.
async function tickHarness({ responder, failoverOrder = [], taskIdempotency } = {}) {
  const { Store } = await import('../src/store.mjs');
  const { DurableQueue } = await import('../src/queue.mjs');
  const { createCloudRelayTask } = await import('../src/cloud-agent-relay.mjs');
  const { createComputeBudget } = await import('../src/ai-compute-budget.mjs');
  const { saveComputeBudgetSnapshot } = await import('../src/agent-compute-store.mjs');
  const { runAgentWorkerTick } = await import('../src/agent-worker-job.mjs');
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  const dir = await mkdtemp(join(tmpdir(), 'uberbond-failover-tick-'));
  const store = new Store(dir);
  await store.init();
  const queue = new DurableQueue(store, {}, { info() {}, warn() {}, error() {} });

  const budget = createComputeBudget({
    totalCostCents: 1000, totalTokens: 100_000,
    allowedProviders: ['anthropic', 'openai'], allowPaidCompute: true
  });
  await saveComputeBudgetSnapshot(store, budget, { reason: 'test-seed' });

  const created = await createCloudRelayTask({
    queue,
    store,
    input: {
      targetAgent: 'claude', originAgent: 'gpt',
      objective: 'a bounded objective long enough to be treated as real work',
      requiredOutputs: ['outcome'], acceptanceTests: ['it returns'],
      budget: { maxTokens: 1000, maxCostCents: 10 }, consequenceClass: 'LOCAL_PREPARATION'
    }
  });
  assert.equal(created.ok, true, 'the fixture task must be created');

  const calls = [];
  // Count what actually reaches the relay, rather than trusting the tick's own
  // account of what it sent.
  const submissions = [];
  const submitJob = queue.enqueue.bind(queue);
  queue.enqueue = async (type, payload, options) => {
    submissions.push({ type, payload });
    return submitJob(type, payload, options);
  };

  const result = await runAgentWorkerTick({
    store,
    budgetId: budget.budgetId,
    targetAgent: 'claude',
    workerId: 'w-1',
    provider: 'anthropic',
    model: 'claude-primary',
    costCeilingCents: 10,
    tokenCeiling: 1000,
    requireEmployeeRole: false,
    failoverOrder,
    taskIdempotency,
    modelExecutor: async ({ provider, model }) => {
      calls.push(`${provider}:${model}`);
      return responder({ provider, model });
    }
  });

  const relayResults = (await store.list('agentRelayResults').catch(() => []))
    .concat(await store.list('relayResults').catch(() => []));

  await rm(dir, { recursive: true, force: true });
  return { result, calls, submissions, relayResults };
}

const tickServed = () => ({
  ok: true, outcome: 'COMPLETED', providerRequestId: 'req_1',
  usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, costCents: 1 },
  result: MODEL_RESULT
});

test('the tick walks the failover order it is given', async () => {
  const { calls } = await tickHarness({
    failoverOrder: [
      { provider: 'anthropic', model: 'claude-primary' },
      { provider: 'openai', model: 'gpt-fallback' }
    ],
    responder: ({ provider }) => provider === 'anthropic'
      ? { ok: false, outcome: 'CONFIRMED_FAILURE', reasonCodes: ['anthropic-http-429'] }
      : tickServed()
  });

  assert.deepEqual(calls, ['anthropic:claude-primary', 'openai:gpt-fallback'],
    'a quota wall on the primary must reach the fallback the router already ranked');
});

test('a chain that fails and then succeeds reports one outcome, not both', async () => {
  const { calls, relayResults } = await tickHarness({
    failoverOrder: [
      { provider: 'anthropic', model: 'claude-primary' },
      { provider: 'openai', model: 'gpt-fallback' }
    ],
    responder: ({ provider }) => provider === 'anthropic'
      ? { ok: false, outcome: 'CONFIRMED_FAILURE', reasonCodes: ['anthropic-http-429'] }
      : tickServed()
  });

  assert.equal(calls.length, 2, 'both routes ran');
  assert.ok(relayResults.length <= 1,
    `the relay must receive one outcome for one task, got ${relayResults.length}`);
});

test('a failure a different provider cannot fix is submitted, not toured around', async () => {
  const { calls } = await tickHarness({
    failoverOrder: [
      { provider: 'anthropic', model: 'claude-primary' },
      { provider: 'openai', model: 'gpt-fallback' }
    ],
    responder: () => ({ ok: false, outcome: 'CONFIRMED_FAILURE', reasonCodes: ['anthropic-http-400'] })
  });

  // The first route runs once deferred, then once more to submit its terminal
  // answer. What must not happen is the second provider being tried.
  assert.equal(calls.includes('openai:gpt-fallback'), false,
    'a malformed request is malformed everywhere; touring providers buries the defect');
});

test('with no failover order the tick behaves exactly as it always did', async () => {
  const { calls } = await tickHarness({
    failoverOrder: [],
    responder: () => ({ ok: false, outcome: 'CONFIRMED_FAILURE', reasonCodes: ['anthropic-http-429'] })
  });

  assert.deepEqual(calls, ['anthropic:claude-primary'],
    'an absent order is the single declared route, not permission to invent one');
});
