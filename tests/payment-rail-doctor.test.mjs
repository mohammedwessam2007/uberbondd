import test from 'node:test';
import assert from 'node:assert/strict';

import {
  IMPLEMENTED_PAYMENT_RAILS,
  PAYMENT_RAIL_STATES,
  UNIMPLEMENTED_PAYMENT_RAILS,
  diagnosePaymentRail,
  isPaymentRailLiveReady,
  readPaymentRailEnvPresence,
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
const PAYPAL_SANDBOX_ENV = Object.freeze({
  PAYPAL_SANDBOX_CLIENT_ID: CANARY,
  PAYPAL_SANDBOX_CLIENT_SECRET: `${CANARY}_SECRET`,
  PAYPAL_SANDBOX_WEBHOOK_ID: 'WH-TEST-NOT-REAL',
  DATABASE_URL: `postgresql://user:${CANARY}@db.example.test:5432/uberbond`
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
const staleReceipt = () => freshReceipt({ verifiedAt: '2026-08-20T00:00:00.000Z' });

test('implemented rail inventory reflects source: Lemon Squeezy plus PayPal sandbox', () => {
  assert.deepEqual([...IMPLEMENTED_PAYMENT_RAILS], ['lemon_squeezy', 'paypal']);
  assert.equal(UNIMPLEMENTED_PAYMENT_RAILS.paypal, 'PAYPAL_SANDBOX_IMPLEMENTED__LIVE_RAIL_NOT_PROVEN');
});

test('with nothing configured, Lemon sandbox says exactly what is missing', () => {
  const report = diagnosePaymentRail({ env: {}, provider: 'lemon_squeezy', mode: 'SANDBOX', at: AT });
  assert.equal(report.state, 'SANDBOX_CONFIG_MISSING');
  assert.equal(isPaymentRailLiveReady(report), false);
  assert.ok(report.reasonCodes.some(code => code.includes('webhookSigningSecret')));
});

test('a fully configured Lemon sandbox is ready, and readiness is not liveness', () => {
  const report = diagnosePaymentRail({ env: SANDBOX_ENV, provider: 'lemon_squeezy', mode: 'SANDBOX', at: AT });
  assert.equal(report.state, 'READY_FOR_SANDBOX');
  assert.equal(isPaymentRailLiveReady(report), false);
});

test('PayPal sandbox requires the complete credential bundle, not one stray fragment', () => {
  for (const env of [
    { PAYPAL_SANDBOX_CLIENT_ID: CANARY, DATABASE_URL: 'postgres://present' },
    { PAYPAL_SANDBOX_CLIENT_SECRET: CANARY, DATABASE_URL: 'postgres://present' },
    { PAYPAL_SANDBOX_WEBHOOK_ID: 'WH-X', DATABASE_URL: 'postgres://present' },
    { PAYPAL_SANDBOX_CLIENT_ID: CANARY, PAYPAL_SANDBOX_CLIENT_SECRET: CANARY, DATABASE_URL: 'postgres://present' }
  ]) {
    const report = diagnosePaymentRail({ env, provider: 'paypal', mode: 'SANDBOX', at: AT });
    assert.equal(report.state, 'SANDBOX_CONFIG_MISSING');
    assert.equal(isPaymentRailLiveReady(report), false);
  }
  const inventory = readPaymentRailEnvPresence({ PAYPAL_SANDBOX_CLIENT_ID: CANARY });
  assert.equal(inventory.paypal.anyCredentialFragmentPresent, true);
  assert.equal(inventory.paypal.sandboxBundleComplete, false);
});

test('mixed fragments from different providers cannot assemble a fake complete rail', () => {
  const env = {
    LEMONSQUEEZY_WEBHOOK_SECRET: CANARY,
    PAYPAL_SANDBOX_CLIENT_ID: CANARY,
    PAYPAL_SANDBOX_CLIENT_SECRET: CANARY,
    DATABASE_URL: 'postgres://present'
  };
  assert.equal(diagnosePaymentRail({ env, provider: 'lemon_squeezy', mode: 'SANDBOX', at: AT }).state, 'SANDBOX_CONFIG_MISSING');
  assert.equal(diagnosePaymentRail({ env, provider: 'paypal', mode: 'SANDBOX', at: AT }).state, 'SANDBOX_CONFIG_MISSING');
});

test('complete PayPal sandbox is READY_FOR_SANDBOX but can never become LIVE_READY', () => {
  const sandbox = diagnosePaymentRail({ env: PAYPAL_SANDBOX_ENV, provider: 'paypal', mode: 'SANDBOX', at: AT });
  assert.equal(sandbox.state, 'READY_FOR_SANDBOX');
  assert.equal(isPaymentRailLiveReady(sandbox), false);

  const liveAttempt = diagnosePaymentRail({
    env: PAYPAL_SANDBOX_ENV,
    provider: 'paypal',
    mode: 'LIVE',
    at: AT,
    verificationReceipt: freshReceipt({ provider: 'paypal', providerEventId: 'paypal-order-1' }),
    kycAttestation: freshKyc()
  });
  assert.equal(liveAttempt.state, 'LIVE_CREDENTIAL_MISSING');
  assert.ok(liveAttempt.reasonCodes.includes('paypal-live-rail-not-implemented'));
  assert.equal(isPaymentRailLiveReady(liveAttempt), false);
});

test('a sandbox verification that failed is not the same as one never attempted', () => {
  const failed = diagnosePaymentRail({ env: SANDBOX_ENV, mode: 'SANDBOX', at: AT, verificationReceipt: freshReceipt({ outcome: 'FAILED' }) });
  assert.equal(failed.state, 'SANDBOX_VERIFICATION_FAILED');
});

test('provider identity mismatch fails closed', () => {
  const mismatch = diagnosePaymentRail({
    env: PAYPAL_SANDBOX_ENV,
    provider: 'paypal',
    mode: 'SANDBOX',
    at: AT,
    verificationReceipt: freshReceipt()
  });
  assert.equal(mismatch.state, 'SANDBOX_VERIFICATION_FAILED');
  assert.ok(mismatch.reasonCodes.includes('verification-receipt-provider-mismatch'));
});

test('live Lemon needs its own credentials, and environment alone never proves liveness', () => {
  const missing = diagnosePaymentRail({ env: SANDBOX_ENV, provider: 'lemon_squeezy', mode: 'LIVE', at: AT });
  assert.equal(missing.state, 'LIVE_CREDENTIAL_MISSING');

  const envOnly = diagnosePaymentRail({ env: LIVE_ENV, provider: 'lemon_squeezy', mode: 'LIVE', at: AT });
  assert.notEqual(envOnly.state, 'LIVE_READY');
  const noKyc = diagnosePaymentRail({ env: LIVE_ENV, provider: 'lemon_squeezy', mode: 'LIVE', at: AT, verificationReceipt: freshReceipt() });
  assert.equal(noKyc.state, 'LIVE_KYC_REQUIRED');
  const ready = diagnosePaymentRail({ env: LIVE_ENV, provider: 'lemon_squeezy', mode: 'LIVE', at: AT, verificationReceipt: freshReceipt(), kycAttestation: freshKyc() });
  assert.equal(ready.state, 'LIVE_READY');
  assert.equal(isPaymentRailLiveReady(ready), true);
});

test('fake or stale provider receipts do not clear the live gate', () => {
  for (const receipt of [staleReceipt(), freshReceipt({ providerEventId: '' }), freshReceipt({ providerEventId: 'synthetic:fake' }), freshReceipt({ evidenceClass: 'SYNTHETIC' })]) {
    const report = diagnosePaymentRail({ env: LIVE_ENV, provider: 'lemon_squeezy', mode: 'LIVE', at: AT, verificationReceipt: receipt, kycAttestation: freshKyc() });
    assert.notEqual(report.state, 'LIVE_READY');
  }
});

test('an unattested or unevidenced KYC claim does not clear the live gate', () => {
  for (const kyc of [freshKyc({ ownerAttested: false }), freshKyc({ evidenceRefs: [] })]) {
    const report = diagnosePaymentRail({ env: LIVE_ENV, provider: 'lemon_squeezy', mode: 'LIVE', at: AT, verificationReceipt: freshReceipt(), kycAttestation: kyc });
    assert.notEqual(report.state, 'LIVE_READY');
  }
});

test('invalid provider and wrong mode fail closed', () => {
  assert.equal(diagnosePaymentRail({ env: LIVE_ENV, provider: 'unknown', mode: 'LIVE', at: AT }).ok, false);
  assert.equal(diagnosePaymentRail({ env: LIVE_ENV, provider: 'lemon_squeezy', mode: 'MAYBE', at: AT }).ok, false);
});

test('the doctor reads presence and never reports any credential value', () => {
  for (const [provider, env] of [['lemon_squeezy', LIVE_ENV], ['paypal', PAYPAL_SANDBOX_ENV]]) {
    const report = diagnosePaymentRail({ env, provider, mode: 'SANDBOX', at: AT });
    const printed = JSON.stringify({ ...report, summary: summarizePaymentRail(report) });
    assert.equal(printed.includes(CANARY), false, 'an environment value reached the report');
    assert.equal(containsSecretValue(printed), false);
  }
});

test('every reported state is one the vocabulary declares and authority remains NONE', () => {
  const reports = [
    diagnosePaymentRail({ env: {}, provider: 'lemon_squeezy', mode: 'SANDBOX', at: AT }),
    diagnosePaymentRail({ env: SANDBOX_ENV, provider: 'lemon_squeezy', mode: 'SANDBOX', at: AT }),
    diagnosePaymentRail({ env: LIVE_ENV, provider: 'lemon_squeezy', mode: 'LIVE', at: AT, verificationReceipt: freshReceipt(), kycAttestation: freshKyc() }),
    diagnosePaymentRail({ env: PAYPAL_SANDBOX_ENV, provider: 'paypal', mode: 'SANDBOX', at: AT })
  ];
  for (const report of reports) {
    assert.ok(PAYMENT_RAIL_STATES.includes(report.state), `undeclared state ${report.state}`);
    assert.equal(report.businessEffectAuthority, 'NONE');
  }
});
