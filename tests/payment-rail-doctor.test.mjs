import test from 'node:test';
import assert from 'node:assert/strict';

import {
  IMPLEMENTED_PAYMENT_RAILS,
  PAYMENT_RAIL_STATES,
  UNIMPLEMENTED_PAYMENT_RAILS,
  diagnosePaymentRail,
  isPaymentRailLiveReady,
  summarizePaymentRail
} from '../src/payment-rail-doctor.mjs';
import { containsSecretValue } from '../src/secret-patterns.mjs';

const AT = new Date('2026-09-02T00:00:00.000Z');
const CANARY = 'NOT_A_REAL_CREDENTIAL_0000000000000000';

const SANDBOX_ENV = Object.freeze({
  LEMONSQUEEZY_WEBHOOK_SECRET: CANARY,
  DATABASE_URL: `postgresql://user:${CANARY}@db.example.test:5432/uberbond`,
  FULL_AUDIT_CHECKOUT_URL: 'https://uberbond.lemonsqueezy.com/checkout/buy/abc'
});

const LIVE_ENV = Object.freeze({
  ...SANDBOX_ENV,
  LEMONSQUEEZY_API_KEY: CANARY,
  APP_BASE_URL: 'https://app.uberbond.cloud'
});

const freshReceipt = (overrides = {}) => ({
  provider: 'lemon_squeezy',
  providerEventId: 'evt_lemon_1',
  evidenceClass: 'PROVIDER_ORIGIN',
  outcome: 'RECONCILED',
  durable: true,
  verifiedAt: '2026-08-30T00:00:00.000Z',
  ...overrides
});

const freshKyc = (overrides = {}) => ({
  ownerAttested: true,
  attestedAt: '2026-08-01T00:00:00.000Z',
  evidenceRefs: ['doc:merchant-onboarding-confirmation'],
  ...overrides
});

// A receipt is stale past seven days, so this one is verification that has
// expired rather than verification that failed.
const staleReceipt = () => freshReceipt({ verifiedAt: '2026-08-20T00:00:00.000Z' });

test('with nothing configured, the sandbox rail says exactly what is missing', () => {
  const report = diagnosePaymentRail({ env: {}, mode: 'SANDBOX', at: AT });
  assert.equal(report.state, 'SANDBOX_CONFIG_MISSING');
  assert.equal(isPaymentRailLiveReady(report), false);
  assert.ok(report.reasonCodes.some(code => code.includes('webhookSigningSecret')));
});

test('a fully configured sandbox is ready, and readiness is not liveness', () => {
  const report = diagnosePaymentRail({ env: SANDBOX_ENV, mode: 'SANDBOX', at: AT });
  assert.equal(report.state, 'READY_FOR_SANDBOX');
  assert.equal(isPaymentRailLiveReady(report), false, 'a sandbox rail reported itself able to take real money');
});

test('a sandbox verification that failed is not the same as one never attempted', () => {
  const failed = diagnosePaymentRail({
    env: SANDBOX_ENV, mode: 'SANDBOX', at: AT,
    verificationReceipt: freshReceipt({ outcome: 'FAILED' })
  });
  assert.equal(failed.state, 'SANDBOX_VERIFICATION_FAILED');
  assert.notEqual(failed.state, 'SANDBOX_CONFIG_MISSING');
});

test('live needs its own credentials, and their absence is named', () => {
  const report = diagnosePaymentRail({ env: SANDBOX_ENV, mode: 'LIVE', at: AT });
  assert.equal(report.state, 'LIVE_CREDENTIAL_MISSING');
  assert.equal(isPaymentRailLiveReady(report), false);
});

test('LIVE_READY is unreachable from environment variables alone', () => {
  // The whole point of this doctor. Every variable present, nothing observed.
  const envOnly = diagnosePaymentRail({ env: LIVE_ENV, mode: 'LIVE', at: AT });
  assert.notEqual(envOnly.state, 'LIVE_READY',
    'setting five variables was enough to claim money can clear');
  assert.equal(isPaymentRailLiveReady(envOnly), false);

  const noKyc = diagnosePaymentRail({ env: LIVE_ENV, mode: 'LIVE', at: AT, verificationReceipt: freshReceipt() });
  assert.equal(noKyc.state, 'LIVE_KYC_REQUIRED');

  const ready = diagnosePaymentRail({
    env: LIVE_ENV, mode: 'LIVE', at: AT,
    verificationReceipt: freshReceipt(),
    kycAttestation: freshKyc()
  });
  assert.equal(ready.state, 'LIVE_READY');
  assert.equal(isPaymentRailLiveReady(ready), true);
});

test('a verification receipt that has gone stale stops proving anything', () => {
  const stale = diagnosePaymentRail({
    env: LIVE_ENV, mode: 'LIVE', at: AT,
    verificationReceipt: staleReceipt(),
    kycAttestation: freshKyc()
  });
  assert.notEqual(stale.state, 'LIVE_READY', 'a twelve-day-old verification still counted as current');

  const unwitnessed = diagnosePaymentRail({
    env: LIVE_ENV, mode: 'LIVE', at: AT,
    verificationReceipt: freshReceipt({ providerEventId: '' }),
    kycAttestation: freshKyc()
  });
  assert.notEqual(unwitnessed.state, 'LIVE_READY', 'a receipt naming no provider event counted as verification');
});

test('an unattested or unevidenced KYC claim does not clear the live gate', () => {
  for (const kyc of [freshKyc({ ownerAttested: false }), freshKyc({ evidenceRefs: [] })]) {
    const report = diagnosePaymentRail({
      env: LIVE_ENV, mode: 'LIVE', at: AT, verificationReceipt: freshReceipt(), kycAttestation: kyc
    });
    assert.notEqual(report.state, 'LIVE_READY');
  }
});

test('PayPal is reported as absent rather than omitted', () => {
  const report = diagnosePaymentRail({ env: SANDBOX_ENV, mode: 'SANDBOX', at: AT });
  assert.deepEqual([...IMPLEMENTED_PAYMENT_RAILS], ['lemon_squeezy']);
  assert.equal(UNIMPLEMENTED_PAYMENT_RAILS.paypal, 'PAYPAL_RAIL_NOT_IMPLEMENTED');
  assert.ok(JSON.stringify(report).includes('PAYPAL_RAIL_NOT_IMPLEMENTED'),
    'a rail the docs mention and the code lacks must be visible as a gap');
});

test('the doctor reads presence and never reports a value', () => {
  const report = diagnosePaymentRail({
    env: LIVE_ENV, mode: 'LIVE', at: AT, verificationReceipt: freshReceipt(), kycAttestation: freshKyc()
  });
  const printed = JSON.stringify({ ...report, summary: summarizePaymentRail(report) });
  assert.equal(printed.includes(CANARY), false, 'an environment value reached the report');
  assert.equal(containsSecretValue(printed), false);
});

test('every reported state is one the vocabulary declares', () => {
  const reports = [
    diagnosePaymentRail({ env: {}, mode: 'SANDBOX', at: AT }),
    diagnosePaymentRail({ env: SANDBOX_ENV, mode: 'SANDBOX', at: AT }),
    diagnosePaymentRail({ env: SANDBOX_ENV, mode: 'LIVE', at: AT }),
    diagnosePaymentRail({ env: LIVE_ENV, mode: 'LIVE', at: AT, verificationReceipt: freshReceipt() }),
    diagnosePaymentRail({ env: LIVE_ENV, mode: 'LIVE', at: AT, verificationReceipt: freshReceipt(), kycAttestation: freshKyc() })
  ];
  for (const report of reports) {
    assert.ok(PAYMENT_RAIL_STATES.includes(report.state), `undeclared state ${report.state}`);
    assert.equal(report.businessEffectAuthority, 'NONE');
  }
});
