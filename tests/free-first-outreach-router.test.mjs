import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateFreeCapacity,
  freeCapacityForDays,
  selectFreeRoute,
  validateFreeProvider
} from '../src/free-first-outreach-router.mjs';
import providers from '../artifacts/outreach/free-first-provider-registry-2026-09-01.json' with { type: 'json' };

const registry = providers.providers;

test('report-derived permanent free pool equals 75,100 messages per 30 days', () => {
  const result = aggregateFreeCapacity({ providers: registry, days: 30 });
  assert.equal(result.ok, true);
  assert.equal(result.capacity, 75100);
  assert.equal(result.effectiveDaily, 75100 / 30);
});

test('cold B2B cannot leak into opt-in-only free ESP pool', () => {
  const result = selectFreeRoute({ purpose: 'COLD_B2B', providers: registry, at: '2026-09-01T00:00:00.000Z' });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('no-proven-free-cold-b2b-provider-route'));
  assert.equal(result.evaluations.some(row => row.eligible), false);
});

test('consent-gated marketing requires consent evidence', () => {
  const noConsent = selectFreeRoute({ purpose: 'OPT_IN_MARKETING', providers: registry, at: '2026-09-01T00:00:00.000Z' });
  assert.equal(noConsent.ok, false);
  const withConsent = selectFreeRoute({ purpose: 'OPT_IN_MARKETING', providers: registry, consentEvidence: true, at: '2026-09-01T00:00:00.000Z' });
  assert.equal(withConsent.ok, true);
  assert.equal(withConsent.route.costCents, 0);
  assert.equal(withConsent.route.executionAuthority, 'NONE');
});

test('monthly quota beats misleading headline daily cap', () => {
  const smtp2go = registry.find(row => row.id === 'smtp2go-free');
  const capacity = freeCapacityForDays(smtp2go, 30);
  assert.equal(capacity.ok, true);
  assert.equal(capacity.capacity, 1000);
  assert.equal(capacity.effectiveDaily, 1000 / 30);
});

test('free route refuses after provider monthly quota is exhausted', () => {
  const result = selectFreeRoute({
    purpose: 'TRANSACTIONAL',
    providers: [registry.find(row => row.id === 'resend-free')],
    usageByProvider: { 'resend-free': { monthlyUsed: 3000 } },
    at: '2026-09-01T00:00:00.000Z'
  });
  assert.equal(result.ok, false);
  assert.ok(result.evaluations[0].reasonCodes.includes('provider-free-quota-exhausted'));
});

test('live mode requires actual provider activation and domain authentication', () => {
  const provider = registry.find(row => row.id === 'resend-free');
  const blocked = selectFreeRoute({ purpose: 'TRANSACTIONAL', providers: [provider], mode: 'LIVE', at: '2026-09-01T00:00:00.000Z' });
  assert.equal(blocked.ok, false);
  assert.ok(blocked.evaluations[0].reasonCodes.includes('provider-not-configured'));
  const ready = selectFreeRoute({
    purpose: 'TRANSACTIONAL',
    providers: [provider],
    mode: 'LIVE',
    providerStates: { 'resend-free': { configured: true, active: true, domainAuthenticated: true, providerHealthy: true } },
    at: '2026-09-01T00:00:00.000Z'
  });
  assert.equal(ready.ok, true);
});

test('stale policy evidence removes provider from routing without changing application code', () => {
  const provider = registry.find(row => row.id === 'resend-free');
  const result = selectFreeRoute({ purpose: 'TRANSACTIONAL', providers: [provider], at: '2026-12-01T00:00:00.000Z', maxPolicyAgeDays: 45 });
  assert.equal(result.ok, false);
  assert.ok(result.evaluations[0].reasonCodes.includes('provider-policy-evidence-stale'));
});

test('account-farming multiplication is structurally rejected', () => {
  const provider = structuredClone(registry[0]);
  provider.organizationAccountLimit = 4;
  const result = validateFreeProvider(provider);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('single-legitimate-organization-allocation-required'));
});
