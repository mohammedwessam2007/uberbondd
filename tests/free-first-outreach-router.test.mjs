import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EXPERIMENTAL_COLD_ROUTES,
  FREE_FIRST_PROVIDER_REGISTRY,
  coldRouteReadiness,
  freeCapacitySnapshot,
  providerEligibility,
  remainingQuota,
  routeFreeFirst
} from '../src/free-first-outreach-router.mjs';

test('September 2026 free-tier baseline is exactly 75,100 messages and 2,503.33/day normalized', () => {
  const snapshot = freeCapacitySnapshot({ date: new Date('2026-09-01T00:00:00.000Z') });
  assert.equal(snapshot.providerCount, 16);
  assert.equal(snapshot.monthDays, 30);
  assert.equal(snapshot.monthlyCapacity, 75100);
  assert.equal(snapshot.normalizedDailyCapacity, 75100 / 30);
  assert.equal(snapshot.coldMonthlyCapacity, 0);
  assert.equal(snapshot.coldNormalizedDailyCapacity, 0);
});

test('cold B2B never spills into opt-in free providers', () => {
  for (const record of FREE_FIRST_PROVIDER_REGISTRY) {
    const eligibility = providerEligibility(record, {
      purpose: 'COLD_B2B',
      date: new Date('2026-09-01T12:00:00.000Z')
    });
    assert.equal(eligibility.ok, false, `${record.id} unexpectedly accepted cold B2B`);
    assert.equal(eligibility.reason, 'COLD_PROHIBITED');
  }
  const route = routeFreeFirst({ purpose: 'COLD_B2B', date: new Date('2026-09-01T12:00:00.000Z') });
  assert.deepEqual(route, {
    ok: false,
    status: 'NO_FREE_COLD_ROUTE',
    purpose: 'COLD_B2B',
    policyVersion: 'free-first-outreach-1.0.0'
  });
});

test('permissioned traffic selects an actually eligible zero-cost route', () => {
  const route = routeFreeFirst({ purpose: 'OPT_IN_MARKETING', date: new Date('2026-09-01T12:00:00.000Z') });
  assert.equal(route.ok, true);
  assert.equal(route.status, 'FREE_ROUTE_SELECTED');
  assert.equal(route.costCents, 0);
  assert.equal(route.provider, 'sendpulse');
  assert.ok(route.quota.planningDailyRemaining > 0);
});

test('monthly cap beats headline daily cap when it is the tighter constraint', () => {
  const smtp2go = FREE_FIRST_PROVIDER_REGISTRY.find(record => record.id === 'smtp2go');
  const quota = remainingQuota(smtp2go, {
    date: new Date('2026-09-01T12:00:00.000Z'),
    usage: { smtp2go: { dailyUsed: 0, monthlyUsed: 0 } }
  });
  assert.equal(quota.dailyRemaining, 200);
  assert.equal(quota.monthlyRemaining, 1000);
  assert.equal(quota.planningDailyRemaining, 1000 / 30);
});

test('quota exhaustion makes a provider ineligible instead of silently over-sending', () => {
  const brevo = FREE_FIRST_PROVIDER_REGISTRY.find(record => record.id === 'brevo');
  const result = providerEligibility(brevo, {
    purpose: 'TRANSACTIONAL',
    date: new Date('2026-09-01T12:00:00.000Z'),
    usage: { brevo: { dailyUsed: 300, monthlyUsed: 300 } }
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'QUOTA_EXHAUSTED');
});

test('stale provider policy fails closed', () => {
  const brevo = FREE_FIRST_PROVIDER_REGISTRY.find(record => record.id === 'brevo');
  const result = providerEligibility(brevo, {
    purpose: 'TRANSACTIONAL',
    date: new Date('2026-10-01T00:00:00.000Z')
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'POLICY_STALE');
});

test('self-hosted free cold route remains experimental until every external proof exists', () => {
  const route = EXPERIMENTAL_COLD_ROUTES[0];
  const readiness = coldRouteReadiness(route, Object.fromEntries(route.blockers.map(key => [key, true])));
  assert.equal(readiness.ok, false);
  assert.equal(readiness.status, 'EXPERIMENTAL_NOT_PRODUCTION');
  assert.equal(readiness.fixedDailyCapacity, null);
  assert.deepEqual(readiness.missing, []);
});
