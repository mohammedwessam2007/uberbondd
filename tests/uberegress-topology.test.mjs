import test from 'node:test';
import assert from 'node:assert/strict';
import { compileUberEgressTopology } from '../src/uberegress-topology.mjs';

const NOW = new Date('2026-09-14T21:00:00.000Z');

function relay(overrides = {}) {
  return {
    routeId: 'relay-1',
    type: 'AUTHORIZED_SMTP_RELAY',
    provider: 'authorized-relay',
    status: 'READY',
    authorized: true,
    termsCompatible: true,
    relayAuthenticated: true,
    providerReady: true,
    observedColdDailyCap: 1000,
    observedAt: '2026-09-14T20:30:00.000Z',
    evidenceSource: 'provider-receipt:relay-1',
    ...overrides
  };
}

const bindings = [
  { domain: 'uberbond.agency', routeId: 'relay-1', authorized: true },
  { domain: 'uberbond.cloud', routeId: 'relay-1', authorized: true }
];

test('one shared observed relay is counted once even when both owned roots bind to it', () => {
  const result = compileUberEgressTopology({ routes: [relay()], domainBindings: bindings, now: NOW });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'UBEREGRESS_READY');
  assert.equal(result.totalReadyColdDailyCap, 1000);
  assert.equal(result.topology.readyRouteIds.length, 1);
  assert.deepEqual(result.topology.missingDomainBindings, []);
});

test('stale egress evidence contributes zero capacity', () => {
  const result = compileUberEgressTopology({
    routes: [relay({ observedAt: '2026-01-01T00:00:00.000Z' })],
    domainBindings: bindings,
    now: NOW
  });
  assert.equal(result.totalReadyColdDailyCap, 0);
  assert.equal(result.status, 'UBEREGRESS_BLOCKED');
  assert.ok(result.topology.routeEvaluations[0].reasonCodes.includes('route-evidence-stale-or-undated'));
});

test('unauthorized or terms-incompatible relay contributes zero', () => {
  for (const patch of [{ authorized: false }, { termsCompatible: false }]) {
    const result = compileUberEgressTopology({ routes: [relay(patch)], domainBindings: bindings, now: NOW });
    assert.equal(result.totalReadyColdDailyCap, 0);
  }
});

test('direct-MX route requires physical egress evidence', () => {
  const result = compileUberEgressTopology({
    routes: [{
      routeId: 'mx-1', type: 'SELF_HOSTED_DIRECT_MX', provider: 'sovereign', status: 'READY',
      authorized: true, termsCompatible: true, observedAt: '2026-09-14T20:30:00.000Z',
      observedColdDailyCap: 1000, staticPublicIp: true, ptrVerified: true, tlsReady: true,
      outboundPort25Reachable: false
    }],
    domainBindings: [
      { domain: 'uberbond.agency', routeId: 'mx-1', authorized: true },
      { domain: 'uberbond.cloud', routeId: 'mx-1', authorized: true }
    ],
    now: NOW
  });
  assert.equal(result.totalReadyColdDailyCap, 0);
  assert.ok(result.topology.routeEvaluations[0].reasonCodes.includes('outbound-port25-not-observed-reachable'));
});


test('authorized HTTP relay requires the same observed provider evidence as SMTP', () => {
  const result = compileUberEgressTopology({
    routes: [relay({ type: 'AUTHORIZED_HTTP_RELAY' })],
    domainBindings: bindings,
    now: NOW
  });
  assert.equal(result.status, 'UBEREGRESS_READY');
  assert.equal(result.totalReadyColdDailyCap, 1000);

  const blocked = compileUberEgressTopology({
    routes: [relay({ type: 'AUTHORIZED_HTTP_RELAY', relayAuthenticated: false })],
    domainBindings: bindings,
    now: NOW
  });
  assert.equal(blocked.totalReadyColdDailyCap, 0);
  assert.ok(blocked.topology.routeEvaluations[0].reasonCodes.includes('relay-authentication-not-observed'));
});
