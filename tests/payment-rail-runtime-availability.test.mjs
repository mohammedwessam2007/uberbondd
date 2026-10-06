import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnosePaymentRail, summarizePaymentRail } from '../src/payment-rail-doctor.mjs';
import { paymentRailsFromSnapshot } from '../src/revenue-singularity-service.mjs';

const now = new Date('2026-10-06T12:00:00.000Z');
const emptySnapshot = { leads: [], orders: [], revenueEvents: [], auditLog: [], now: now.getTime() };

test('permanently deactivated PayPal stays implemented but emits no owner recovery action', () => {
  const report = diagnosePaymentRail({
    provider: 'paypal', mode: 'LIVE', at: now,
    env: { UBERBOND_PAYPAL_ACCOUNT_STATE: 'PERMANENTLY_DEACTIVATED' }
  });
  assert.equal(report.ok, true);
  assert.equal(report.state, 'PROVIDER_UNAVAILABLE');
  assert.equal(report.accountState, 'PERMANENTLY_DEACTIVATED');
  assert.ok(report.implementedRails.includes('paypal'));
  assert.deepEqual(report.reasonCodes, ['provider-account-permanently-deactivated']);
  const summary = summarizePaymentRail(report);
  assert.equal(summary.liveReady, false);
  assert.deepEqual(summary.ownerActionQueue, []);
});

test('non-current Lemon Squeezy path emits no setup chores', () => {
  const report = diagnosePaymentRail({
    provider: 'lemon_squeezy', mode: 'LIVE', at: now,
    env: { UBERBOND_LEMON_SQUEEZY_ACCOUNT_STATE: 'NOT_CURRENT_COMMERCIAL_PATH' }
  });
  assert.equal(report.state, 'PROVIDER_UNAVAILABLE');
  assert.deepEqual(report.reasonCodes, ['provider-not-current-commercial-path']);
  assert.deepEqual(summarizePaymentRail(report).ownerActionQueue, []);
});

test('Revenue Terminal suppresses zombie payment actions while preserving implementation inventory', () => {
  const rails = paymentRailsFromSnapshot(emptySnapshot, {
    UBERBOND_PAYPAL_ACCOUNT_STATE: 'PERMANENTLY_DEACTIVATED',
    UBERBOND_LEMON_SQUEEZY_ACCOUNT_STATE: 'NOT_CURRENT_COMMERCIAL_PATH'
  });
  assert.deepEqual(rails.map(r => r.provider), ['lemon_squeezy', 'paypal']);
  for (const rail of rails) {
    assert.equal(rail.state, 'PROVIDER_UNAVAILABLE');
    assert.equal(rail.liveReady, false);
    assert.deepEqual(rail.ownerActionQueue, []);
  }
});

test('availability override is LIVE-only and cannot rewrite sandbox diagnostics', () => {
  const report = diagnosePaymentRail({
    provider: 'paypal', mode: 'SANDBOX', at: now,
    env: { UBERBOND_PAYPAL_ACCOUNT_STATE: 'PERMANENTLY_DEACTIVATED' }
  });
  assert.notEqual(report.state, 'PROVIDER_UNAVAILABLE');
});
