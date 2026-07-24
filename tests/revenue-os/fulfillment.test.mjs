import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../../revenue-os/src/store.mjs';
import {
  createFulfillmentJob, computeFulfillmentMetrics, recordFulfillmentMetrics,
  recommendRecurrenceActions, RECURRENCE_ACTIONS, FulfillmentError
} from '../../revenue-os/src/fulfillment.mjs';

async function harness() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ros-fulfillment-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

async function seedPayment(store, overrides = {}) {
  return store.add('payments', { status: 'VERIFIED', amountCents: 25000, currency: 'USD', verifiedAt: new Date().toISOString(), data: {}, ...overrides });
}

// --- "only independently confirmed payment may create a fulfillment job" ---

test('createFulfillmentJob refuses every payment status except VERIFIED', async () => {
  const store = await harness();
  for (const status of ['NOT_REQUESTED', 'REQUEST_READY', 'REQUESTED_EXTERNALLY', 'CUSTOMER_REPORTED', 'PENDING_VERIFICATION', 'MISMATCH', 'BLOCKED', 'FAILED']) {
    const payment = await seedPayment(store, { status });
    await assert.rejects(
      () => createFulfillmentJob(store, { payment, organizationDomain: 'fulfillment-fixture.invalid', offerKey: 'FOUNDING_AGENCY_REVENUE_LEAK_DIAGNOSTIC' }),
      FulfillmentError,
      `status ${status} should not be able to create a fulfillment job`
    );
  }
  assert.equal((await store.list('diagnosticProjects')).length, 0);
});

test('hostile: a customer-reported payment with no independent verification cannot create a fulfillment job', async () => {
  const store = await harness();
  const payment = await seedPayment(store, { status: 'CUSTOMER_REPORTED' });
  await assert.rejects(() => createFulfillmentJob(store, { payment, organizationDomain: 'x.invalid', offerKey: 'FOUNDING_AGENCY_REVENUE_LEAK_DIAGNOSTIC' }), FulfillmentError);
});

test('createFulfillmentJob succeeds for a VERIFIED payment and creates a PAID-status project', async () => {
  const store = await harness();
  const payment = await seedPayment(store);
  const project = await createFulfillmentJob(store, { payment, organizationDomain: 'fulfillment-fixture.invalid', offerKey: 'FOUNDING_AGENCY_REVENUE_LEAK_DIAGNOSTIC', siteUrls: ['https://fulfillment-fixture.invalid'] });
  assert.equal(project.status, 'PAID');
  assert.equal(project.paymentId, payment.id);
  assert.ok(project.data.paidAt);
  assert.deepEqual(project.data.siteUrls, ['https://fulfillment-fixture.invalid']);
});

test('createFulfillmentJob is idempotent on payment.id -- a second call returns the same project, never a duplicate', async () => {
  const store = await harness();
  const payment = await seedPayment(store);
  const first = await createFulfillmentJob(store, { payment, organizationDomain: 'fulfillment-fixture.invalid', offerKey: 'FOUNDING_AGENCY_REVENUE_LEAK_DIAGNOSTIC' });
  const second = await createFulfillmentJob(store, { payment, organizationDomain: 'fulfillment-fixture.invalid', offerKey: 'FOUNDING_AGENCY_REVENUE_LEAK_DIAGNOSTIC' });
  assert.equal(second.id, first.id);
  assert.equal((await store.list('diagnosticProjects')).length, 1);
});

test('hostile: createFulfillmentJob requires organizationDomain and offerKey even with a verified payment', async () => {
  const store = await harness();
  const payment = await seedPayment(store);
  await assert.rejects(() => createFulfillmentJob(store, { payment, offerKey: 'FOUNDING_AGENCY_REVENUE_LEAK_DIAGNOSTIC' }), FulfillmentError);
  await assert.rejects(() => createFulfillmentJob(store, { payment, organizationDomain: 'x.invalid' }), FulfillmentError);
  await assert.rejects(() => createFulfillmentJob(store, {}), FulfillmentError);
});

// --- fulfillment metrics: time, cost, margin, false positives, refunds, repeat orders, owner minutes ---

test('computeFulfillmentMetrics computes actual hours against SLA, margin, and false-positive rate from known inputs', () => {
  const project = { data: { paidAt: new Date('2026-01-01T00:00:00.000Z').toISOString() } };
  const deliveredAtMs = Date.parse('2026-01-01T18:00:00.000Z');
  const metrics = computeFulfillmentMetrics(project, {
    deliveredAtMs, revenueCents: 25000, directCostCents: 5000, ownerMinutes: 12,
    falsePositiveCount: 1, totalIncidentCount: 4, refunded: false, isRepeatOrder: true, slaHoursMax: 24
  });
  assert.equal(metrics.actualFulfillmentHours, 18);
  assert.equal(metrics.withinSla, true);
  assert.equal(metrics.marginCents, 20000);
  assert.equal(metrics.marginRate, 0.8);
  assert.equal(metrics.falsePositiveRateValue, 0.25);
  assert.equal(metrics.ownerMinutes, 12);
  assert.equal(metrics.isRepeatOrder, true);
  assert.equal(metrics.refunded, false);
});

test('computeFulfillmentMetrics flags a delivery that missed its own SLA', () => {
  const project = { data: { paidAt: new Date('2026-01-01T00:00:00.000Z').toISOString() } };
  const deliveredAtMs = Date.parse('2026-01-03T00:00:00.000Z'); // 48h later
  const metrics = computeFulfillmentMetrics(project, { deliveredAtMs, slaHoursMax: 24 });
  assert.equal(metrics.actualFulfillmentHours, 48);
  assert.equal(metrics.withinSla, false);
});

test('computeFulfillmentMetrics reports null (not a false zero) for metrics it cannot compute from missing inputs', () => {
  const project = { data: { paidAt: new Date().toISOString() } };
  const metrics = computeFulfillmentMetrics(project, {});
  assert.equal(metrics.actualFulfillmentHours, null);
  assert.equal(metrics.withinSla, null);
  assert.equal(metrics.marginCents, null);
  assert.equal(metrics.marginRate, null);
  assert.equal(metrics.falsePositiveRateValue, null);
});

test('recordFulfillmentMetrics persists computed metrics onto the project and mirrors isRepeatOrder as a top-level-readable field', async () => {
  const store = await harness();
  const payment = await seedPayment(store);
  const project = await createFulfillmentJob(store, { payment, organizationDomain: 'fulfillment-fixture.invalid', offerKey: 'FOUNDING_AGENCY_REVENUE_LEAK_DIAGNOSTIC' });
  const updated = await recordFulfillmentMetrics(store, project.id, { deliveredAtMs: Date.now(), revenueCents: 25000, directCostCents: 4000, ownerMinutes: 15, isRepeatOrder: true });
  assert.ok(updated.data.fulfillmentMetrics);
  assert.equal(updated.data.fulfillmentMetrics.marginCents, 21000);
  assert.equal(updated.data.isRepeatOrder, true);
});

test('recordFulfillmentMetrics throws for an unknown project id', async () => {
  const store = await harness();
  await assert.rejects(() => recordFulfillmentMetrics(store, 'not-a-real-id', {}), FulfillmentError);
});

// --- recurrence recommendations: additional sites, referrals, repeat work, monitoring ---

test('recommendRecurrenceActions returns nothing for a project that has not been delivered yet', () => {
  const result = recommendRecurrenceActions({ status: 'CHECKS_RUNNING' }, {});
  assert.deepEqual(result.recommendations, []);
  assert.equal(result.reason, 'project-not-yet-delivered');
});

test('recommendRecurrenceActions recommends implementation and monitoring for a freshly delivered project with neither offered yet', () => {
  const result = recommendRecurrenceActions({ status: 'DELIVERED' }, { implementationOffered: false, monitoringOffered: false });
  const actions = result.recommendations.map(r => r.action);
  assert.ok(actions.includes('offer_implementation'));
  assert.ok(actions.includes('offer_monitoring'));
});

test('recommendRecurrenceActions omits an action already offered, and adds additional-sites/referral recommendations when applicable', () => {
  const result = recommendRecurrenceActions({ status: 'ACCEPTED' }, { implementationOffered: true, monitoringOffered: true, additionalSitesKnown: 2, monthsSinceDelivery: 2 });
  const actions = result.recommendations.map(r => r.action);
  assert.ok(!actions.includes('offer_implementation'));
  assert.ok(!actions.includes('offer_monitoring'));
  assert.ok(actions.includes('offer_additional_sites'));
  assert.ok(actions.includes('request_referral'));
});

test('every recommendation action is drawn from the fixed RECURRENCE_ACTIONS vocabulary', () => {
  const result = recommendRecurrenceActions({ status: 'CLOSED' }, { additionalSitesKnown: 1, monthsSinceDelivery: 3 });
  for (const rec of result.recommendations) assert.ok(RECURRENCE_ACTIONS.includes(rec.action));
});

test('recommendRecurrenceActions never itself activates implementation or monitoring -- capability scan', async () => {
  const content = await fs.readFile(new URL('../../revenue-os/src/fulfillment.mjs', import.meta.url), 'utf8');
  const importLines = content.split('\n').filter(line => line.trim().startsWith('import '));
  assert.ok(importLines.every(line => !line.includes('implementation.mjs') && !line.includes('monitoring.mjs')), 'fulfillment.mjs must only recommend, never call the activation functions itself');
});
