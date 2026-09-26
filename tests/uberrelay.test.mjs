import test from 'node:test';
import assert from 'node:assert/strict';
import { compileAzureAcsFacts, compileUberRelayRoute } from '../src/uberrelay.mjs';
import { compileUberEgressTopology } from '../src/uberegress-topology.mjs';

const NOW = new Date('2026-09-26T12:00:00.000Z');

function valid(overrides = {}) {
  return {
    routeId: 'relay-acs-1',
    provider: 'authorized-provider',
    purpose: 'COLD_B2B_OUTREACH',
    transport: 'HTTP_API',
    domain: 'uberbond.agency',
    endpoint: 'https://example.communication.azure.com',
    authorized: true,
    termsCompatible: true,
    coldOutreachAuthorized: true,
    authenticated: true,
    providerReady: true,
    customDomainVerified: true,
    reputationObserved: true,
    senderUsernameCount: 100,
    observedDailyCap: 500,
    observedAt: '2026-09-26T11:30:00.000Z',
    evidenceSource: 'provider-receipt:relay-acs-1',
    providerTermsUrl: 'https://provider.example/terms',
    inboundMode: 'EXTERNAL_REPLY_TO',
    now: NOW,
    ...overrides
  };
}

test('Azure ACS sender usernames are not treated as independent mailboxes or quota', () => {
  const facts = compileAzureAcsFacts({ senderUsernameCount: 100, linkedDomainCount: 1 });
  assert.equal(facts.senderUsernameCount, 100);
  assert.equal(facts.semantics.senderUsernamesAreMailboxes, false);
  assert.equal(facts.semantics.senderUsernamesCreateIndependentQuota, false);
  assert.equal(facts.defaultHourlyLimit, 100);
});

test('cold outreach route fails closed without explicit provider-policy authorization', () => {
  const result = compileUberRelayRoute(valid({ coldOutreachAuthorized: false }));
  assert.equal(result.ok, false);
  assert.equal(result.egressRoute.observedColdDailyCap, 0);
  assert.ok(result.reasonCodes.includes('cold-outreach-provider-authorization-required'));
});

test('identity count never multiplies the observed egress cap', () => {
  const result = compileUberRelayRoute(valid({ senderUsernameCount: 100, observedDailyCap: 500 }));
  assert.equal(result.ok, true);
  assert.equal(result.providerProfile.senderUsernameCount, 100);
  assert.equal(result.egressRoute.observedColdDailyCap, 500);
});

test('HTTP relay evidence plugs into UberEgress without creating extra capacity', () => {
  const relay = compileUberRelayRoute(valid());
  const topology = compileUberEgressTopology({
    routes: [relay.egressRoute],
    domainBindings: [
      { domain: 'uberbond.agency', routeId: 'relay-acs-1', authorized: true },
      { domain: 'uberbond.cloud', routeId: 'relay-acs-1', authorized: true }
    ],
    now: NOW
  });
  assert.equal(topology.status, 'UBEREGRESS_READY');
  assert.equal(topology.totalReadyColdDailyCap, 500);
});

test('stale or reputation-unobserved evidence contributes zero', () => {
  for (const patch of [
    { reputationObserved: false },
    { observedAt: '2026-09-01T00:00:00.000Z' }
  ]) {
    const result = compileUberRelayRoute(valid(patch));
    assert.equal(result.ok, false);
    assert.equal(result.egressRoute.observedColdDailyCap, 0);
  }
});

test('UberRelay receipts never expose credentials', () => {
  const result = compileUberRelayRoute(valid({
    endpoint: 'https://example.communication.azure.com'
  }));
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('password'), false);
  assert.equal(serialized.includes('apiKey'), false);
  assert.equal(serialized.includes('connectionString'), false);
});
