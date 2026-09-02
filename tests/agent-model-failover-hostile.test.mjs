import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ROUTE_FAILURE_CLASSES,
  TERMINAL_FAILURE_CLASSES,
  classifyRouteFailure,
  executeWithFailover
} from '../src/agent-model-failover.mjs';
import { routeModel, normalizeModelCandidate } from '../src/agent-model-router.mjs';

// Adversarial companion to tests/agent-model-failover.test.mjs. That suite
// proves the chain walks its order. This one attacks it: the failures that must
// NOT move to another provider, and the ways an exhausted chain must stop.
//
// Routes come from the real router, so the order under attack is the order the
// system actually produces rather than a list written to suit the test.

const candidate = (provider, model) => normalizeModelCandidate({
  provider, model, taskClasses: ['research'], enabled: true
});

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
  return route;
}

const ALL_PROVIDERS = ['anthropic', 'openai'];
const served = () => ({ ok: true, outcome: 'SUCCEEDED', content: 'answer' });
const failed = (reasonCodes, outcome = 'CONFIRMED_FAILURE') => ({ ok: false, outcome, reasonCodes });

function recorder(handler) {
  const calls = [];
  return {
    calls,
    execute: async identity => {
      calls.push(`${identity.provider}/${identity.model}`);
      return handler(identity, calls.length);
    }
  };
}

test('a rejected credential is terminal and is not tried on another provider', async () => {
  const { calls, execute } = recorder(() => failed(['anthropic-http-401']));
  const result = await executeWithFailover({
    route: threeRouteOrder(), authorizedProviders: ALL_PROVIDERS, execute
  });
  assert.equal(result.ok, false);
  assert.equal(calls.length, 1,
    'a dead credential was carried to another provider, which is how a broken key stops getting fixed');
  assert.equal(classifyRouteFailure(failed(['anthropic-http-401'])).failureClass, TERMINAL_FAILURE_CLASSES.CREDENTIAL_REJECTED);
  assert.equal(classifyRouteFailure(failed(['anthropic-http-401'])).failoverEligible, false);
});

test('a malformed request is malformed everywhere and stops at the first route', async () => {
  const { calls, execute } = recorder(() => failed(['openai-http-400']));
  const result = await executeWithFailover({
    route: threeRouteOrder(), authorizedProviders: ALL_PROVIDERS, execute
  });
  assert.equal(result.ok, false);
  assert.equal(calls.length, 1, 'a bad request was re-sent to every provider before anyone looked at it');
  assert.equal(classifyRouteFailure(failed(['openai-http-400'])).failureClass, TERMINAL_FAILURE_CLASSES.REQUEST_REJECTED);
});

test('a failure nobody classified is terminal rather than fanned out', async () => {
  const { calls, execute } = recorder(() => failed(['something-nobody-has-seen-before']));
  await executeWithFailover({ route: threeRouteOrder(), authorizedProviders: ALL_PROVIDERS, execute });
  assert.equal(calls.length, 1, 'an unrecognised failure became a bill on every provider');
  assert.equal(classifyRouteFailure(failed(['something-nobody-has-seen-before'])).failureClass,
    TERMINAL_FAILURE_CLASSES.UNCLASSIFIED);
});

test('quota, rate limit and outage each move to the next route', async () => {
  for (const [reason, expected] of [
    ['anthropic-insufficient_quota', ROUTE_FAILURE_CLASSES.QUOTA_EXHAUSTED],
    ['anthropic-http-429', ROUTE_FAILURE_CLASSES.RATE_LIMITED],
    ['anthropic-http-503', ROUTE_FAILURE_CLASSES.PROVIDER_OUTAGE]
  ]) {
    const classified = classifyRouteFailure(failed([reason]));
    assert.equal(classified.failureClass, expected, `${reason} classified as ${classified.failureClass}`);
    assert.equal(classified.failoverEligible, true);

    const { calls, execute } = recorder(identity => (identity.model === 'claude-primary' ? failed([reason]) : served()));
    const result = await executeWithFailover({
      route: threeRouteOrder(), authorizedProviders: ALL_PROVIDERS, execute
    });
    assert.equal(result.ok, true, `${reason} did not fail over`);
    assert.equal(result.failoverOccurred, true);
    assert.ok(calls.length > 1);
  }
});

test('an uncertain outcome is not re-sent unless the caller declared the task idempotent', async () => {
  // The provider may already have done the work and billed for it. Re-sending
  // is a second real effect, not a retry.
  const notIdempotent = recorder(() => failed(['anthropic-http-429'], 'UNCERTAIN'));
  const blocked = await executeWithFailover({
    route: threeRouteOrder(), authorizedProviders: ALL_PROVIDERS,
    execute: notIdempotent.execute, taskIdempotency: 'NOT_IDEMPOTENT'
  });
  assert.equal(blocked.ok, false);
  assert.equal(notIdempotent.calls.length, 1,
    'an uncertain non-idempotent call was repeated on another provider');

  const idempotent = recorder(identity => (identity.model === 'claude-primary' ? failed(['anthropic-http-429'], 'UNCERTAIN') : served()));
  const allowed = await executeWithFailover({
    route: threeRouteOrder(), authorizedProviders: ALL_PROVIDERS,
    execute: idempotent.execute, taskIdempotency: 'IDEMPOTENT'
  });
  assert.equal(allowed.ok, true);
  assert.ok(idempotent.calls.length > 1, 'an explicitly idempotent task refused to fail over');
});

test('when every route is exhausted the chain stops and says so', async () => {
  const { calls, execute } = recorder(() => failed(['anthropic-http-429']));
  const result = await executeWithFailover({
    route: threeRouteOrder(), authorizedProviders: ALL_PROVIDERS, execute
  });
  assert.equal(result.ok, false);
  assert.equal(result.exhausted, true);
  assert.equal(result.status, 'ALL_ROUTES_EXHAUSTED');
  // Three routes, three attempts, no loop.
  assert.equal(calls.length, 3);
  assert.equal(new Set(calls).size, calls.length, 'a route was attempted twice');
});

test('an unauthorized provider is skipped even when the router ranked it first', async () => {
  const { calls, execute } = recorder(() => served());
  const result = await executeWithFailover({
    route: threeRouteOrder(), authorizedProviders: ['openai'], execute
  });
  assert.equal(result.ok, true);
  assert.ok(calls.every(call => call.startsWith('openai/')),
    `an unauthorized provider was called: ${calls.join(', ')}`);
});

test('a run with no authorized provider refuses rather than choosing one', async () => {
  const { calls, execute } = recorder(() => served());
  const result = await executeWithFailover({ route: threeRouteOrder(), authorizedProviders: [], execute });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('no-authorized-provider-configured'));
  assert.equal(calls.length, 0, 'a provider was called by a run that was never authorized to use one');
});

test('the attempt budget bounds the walk even with routes left', async () => {
  const { calls, execute } = recorder(() => failed(['anthropic-http-429']));
  const result = await executeWithFailover({
    route: threeRouteOrder(), authorizedProviders: ALL_PROVIDERS, execute, maxAttempts: 2
  });
  assert.equal(result.ok, false);
  assert.equal(calls.length, 2);
  assert.equal(result.exhausted, false, 'a budget stop was reported as having tried everything');
});

test('the result names the route that actually served, not the one first requested', async () => {
  const { execute } = recorder(identity => (identity.provider === 'anthropic' ? failed(['anthropic-http-503']) : served()));
  const route = threeRouteOrder();
  const result = await executeWithFailover({ route, authorizedProviders: ALL_PROVIDERS, execute });
  assert.equal(result.ok, true);
  assert.equal(result.served.provider, 'openai');
  assert.notEqual(result.served.model, route.selected.model,
    'the receipt reported the requested model while a different one did the work');
});
