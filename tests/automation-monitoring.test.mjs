import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertMonitoringConsent, cancelMonitoringSubscription, handleMonitoringPaymentFailure,
  buildMonitoringEnrollmentRecord, MonitoringError
} from '../src/automation/monitoring.mjs';

test('monitoring without consent is rejected', () => {
  assert.throws(() => assertMonitoringConsent({}), MonitoringError);
  assert.throws(() => assertMonitoringConsent({ explicitOptIn: true }), MonitoringError);
  assert.throws(() => assertMonitoringConsent({ explicitOptIn: true, consentedAt: '2026-01-01T00:00:00Z' }), MonitoringError);
});

test('full consent passes', () => {
  assert.equal(assertMonitoringConsent({ explicitOptIn: true, consentedAt: '2026-01-01T00:00:00Z', priceAcknowledged: true }), true);
});

test('cancellation clears nextRunAt and stops billing immediately, no retention window', () => {
  const subscription = { id: 'sub_1', status: 'active', nextRunAt: '2026-02-01T00:00:00Z' };
  const cancelled = cancelMonitoringSubscription(subscription, 'customer-requested');
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.nextRunAt, null);
});

test('cancelling an already-inactive subscription is rejected', () => {
  assert.throws(() => cancelMonitoringSubscription({ status: 'cancelled' }), MonitoringError);
});

test('payment failure stops scheduling without any retry charge and without hidden fields', () => {
  const subscription = { id: 'sub_1', status: 'active', nextRunAt: '2026-02-01T00:00:00Z' };
  const failed = handleMonitoringPaymentFailure(subscription);
  assert.equal(failed.status, 'payment_failed');
  assert.equal(failed.nextRunAt, null);
  assert.equal(Object.keys(failed).some(key => /charge|retry/i.test(key)), false);
});

test('enrollment record requires a monitoring-type offer and explicit consent', () => {
  const consent = { explicitOptIn: true, consentedAt: '2026-01-01T00:00:00Z', priceAcknowledged: true };
  assert.throws(() => buildMonitoringEnrollmentRecord({ offer: { type: 'diagnostic' }, consent }), MonitoringError);
  const record = buildMonitoringEnrollmentRecord({ lead: { id: 'lead_1' }, offer: { id: 'offer_1', type: 'monitoring', prospectId: 'p1' }, consent });
  assert.equal(record.offerId, 'offer_1');
  assert.equal(record.consent.explicitOptIn, true);
});
