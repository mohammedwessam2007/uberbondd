import test from 'node:test';
import assert from 'node:assert/strict';

import {
  IMPLEMENTED_PAYMENT_RAILS,
  PAYMENT_RAIL_IMPLEMENTATION_STATUS,
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

const LEMON_SANDBOX = Object.freeze({
  LEMONSQUEEZY_WEBHOOK_SECRET: CANARY,
  DATABASE_URL: `postgresql://user:${CANARY}@db.example.test:5432/uberbond`,
  FULL_AUDIT_CHECKOUT_URL: 'https://uberbond.lemonsqueezy.com/checkout/buy/abc'
});
const LEMON_LIVE = Object.freeze({
  ...LEMON_SANDBOX,
  LEMONSQUEEZY_API_KEY: CANARY,
  APP_BASE_URL: 'https://app.uberbond.cloud'
});
const PAYPAL_SANDBOX = Object.freeze({
  PAYPAL_SANDBOX_CLIENT_ID: CANARY,
  PAYPAL_SANDBOX_CLIENT_SECRET: `${CANARY}_SECRET`,
  PAYPAL_SANDBOX_WEBHOOK_ID: 'WH-TEST-NOT-REAL',
  DATABASE_URL: `postgresql://user:${CANARY}@db.example.test:5432/uberbond`
});
const PAYPAL_LIVE = Object.freeze({
  PAYPAL_ENVIRONMENT: 'live',
  PAYPAL_LIVE_CLIENT_ID: CANARY,
  PAYPAL_LIVE_CLIENT_SECRET: `${CANARY}_LIVE_SECRET`,
  PAYPAL_LIVE_WEBHOOK_ID: 'WH-LIVE-NOT-REAL',
  DATABASE_URL: `postgresql://user:${CANARY}@db.example.test:5432/uberbond`,
  APP_BASE_URL: 'https://app.uberbond.cloud'
});

const receipt = (provider = 'lemon_squeezy', overrides = {}) => ({
  provider,
  providerEventId: provider === 'paypal' ? 'WH-PROVIDER-EVENT-123' : 'evt_lemon_1',
  evidenceClass: 'PROVIDER_ORIGIN',
  outcome: 'RECONCILED',
  durable: true,
  verifiedAt: '2026-08-30T00:00:00.000Z',
  ...overrides
});
const kyc = (overrides = {}) => ({
  ownerAttested: true,
  attestedAt: '2026-08-01T00:00:00.000Z',
  evidenceRefs: ['provider:merchant-verification'],
  ...overrides
});

test('inventory truth says PayPal provider-origin live is implemented, not commercially proven', () => {
  assert.deepEqual([...IMPLEMENTED_PAYMENT_RAILS], ['lemon_squeezy', 'paypal']);
  assert.equal(PAYMENT_RAIL_IMPLEMENTATION_STATUS.paypal.liveCapable, true);
  assert.equal(PAYMENT_RAIL_IMPLEMENTATION_STATUS.paypal.liveProviderOriginImplemented, true);
  assert.match(UNIMPLEMENTED_PAYMENT_RAILS.paypal, /LIVE_IMPLEMENTED/);
});

test('Lemon Squeezy sandbox and live semantics remain intact through the facade', () => {
  assert.equal(diagnosePaymentRail({ env: {}, provider: 'lemon_squeezy', mode: 'SANDBOX', at: AT }).state, 'SANDBOX_CONFIG_MISSING');
  assert.equal(diagnosePaymentRail({ env: LEMON_SANDBOX, provider: 'lemon_squeezy', mode: 'SANDBOX', at: AT }).state, 'READY_FOR_SANDBOX');
  const ready = diagnosePaymentRail({ env: LEMON_LIVE, provider: 'lemon_squeezy', mode: 'LIVE', at: AT, verificationReceipt: receipt(), kycAttestation: kyc() });
  assert.equal(ready.state, 'LIVE_READY');
  assert.equal(isPaymentRailLiveReady(ready), true);
});

test('PayPal sandbox still requires a complete sandbox bundle and never becomes live', () => {
  const partial = diagnosePaymentRail({ env: { PAYPAL_SANDBOX_CLIENT_ID: CANARY, DATABASE_URL: 'postgres://present' }, provider: 'paypal', mode: 'SANDBOX', at: AT });
  assert.equal(partial.state, 'SANDBOX_CONFIG_MISSING');
  const sandbox = diagnosePaymentRail({ env: PAYPAL_SANDBOX, provider: 'paypal', mode: 'SANDBOX', at: AT });
  assert.equal(sandbox.state, 'READY_FOR_SANDBOX');
  assert.equal(isPaymentRailLiveReady(sandbox), false);
});

test('PayPal LIVE refuses sandbox credentials and reports the exact missing live bundle', () => {
  const report = diagnosePaymentRail({ env: PAYPAL_SANDBOX, provider: 'paypal', mode: 'LIVE', at: AT });
  assert.equal(report.state, 'LIVE_CREDENTIAL_MISSING');
  assert.equal(isPaymentRailLiveReady(report), false);
  assert.ok(report.reasonCodes.includes('payment-rail-credential-missing:liveEnvironment'));
  assert.ok(report.reasonCodes.includes('payment-rail-credential-missing:liveClientId'));
  assert.ok(report.reasonCodes.includes('payment-rail-credential-missing:httpsWebhookDestination'));
});

test('complete PayPal LIVE configuration is still not payment or liveness proof', () => {
  const envOnly = diagnosePaymentRail({ env: PAYPAL_LIVE, provider: 'paypal', mode: 'LIVE', at: AT });
  assert.equal(envOnly.state, 'LIVE_VERIFICATION_REQUIRED');
  assert.equal(isPaymentRailLiveReady(envOnly), false);
  assert.ok(envOnly.reconciliationChain.includes('POST /api/webhooks/paypal'));
  assert.ok(envOnly.reconciliationChain.includes('src/paypal-payment-truth.mjs:canonical-witness-triad'));
});

test('PayPal LIVE requires provider-matched fresh reconciliation evidence and KYC', () => {
  const mismatch = diagnosePaymentRail({ env: PAYPAL_LIVE, provider: 'paypal', mode: 'LIVE', at: AT, verificationReceipt: receipt('lemon_squeezy'), kycAttestation: kyc() });
  assert.equal(mismatch.state, 'LIVE_VERIFICATION_REQUIRED');
  assert.ok(mismatch.reasonCodes.includes('verification-receipt-provider-mismatch'));

  const noKyc = diagnosePaymentRail({ env: PAYPAL_LIVE, provider: 'paypal', mode: 'LIVE', at: AT, verificationReceipt: receipt('paypal') });
  assert.equal(noKyc.state, 'LIVE_KYC_REQUIRED');

  const ready = diagnosePaymentRail({ env: PAYPAL_LIVE, provider: 'paypal', mode: 'LIVE', at: AT, verificationReceipt: receipt('paypal'), kycAttestation: kyc() });
  assert.equal(ready.state, 'LIVE_READY');
  assert.equal(isPaymentRailLiveReady(ready), true);
  assert.equal(ready.commercialTruth.clearedRevenueCents, 0);
});

test('fake, synthetic, stale or non-provider-origin receipts never clear either live rail', () => {
  const bad = [
    receipt('paypal', { verifiedAt: '2026-08-20T00:00:00.000Z' }),
    receipt('paypal', { providerEventId: 'synthetic:fake' }),
    receipt('paypal', { evidenceClass: 'SYNTHETIC' }),
    receipt('paypal', { outcome: 'FAILED' })
  ];
  for (const verificationReceipt of bad) {
    const report = diagnosePaymentRail({ env: PAYPAL_LIVE, provider: 'paypal', mode: 'LIVE', at: AT, verificationReceipt, kycAttestation: kyc() });
    assert.notEqual(report.state, 'LIVE_READY');
  }
});

test('presence inventory distinguishes PayPal sandbox completeness from live completeness', () => {
  const sandbox = readPaymentRailEnvPresence(PAYPAL_SANDBOX).paypal;
  assert.equal(sandbox.sandboxBundleComplete, true);
  assert.equal(sandbox.liveBundleComplete, false);
  const live = readPaymentRailEnvPresence(PAYPAL_LIVE).paypal;
  assert.equal(live.liveBundleComplete, true);
});

test('reports and summaries never disclose credential values', () => {
  for (const [provider, env, mode] of [
    ['lemon_squeezy', LEMON_LIVE, 'LIVE'],
    ['paypal', PAYPAL_SANDBOX, 'SANDBOX'],
    ['paypal', PAYPAL_LIVE, 'LIVE']
  ]) {
    const report = diagnosePaymentRail({ env, provider, mode, at: AT });
    const printed = JSON.stringify({ report, summary: summarizePaymentRail(report) });
    assert.equal(printed.includes(CANARY), false);
    assert.equal(containsSecretValue(printed), false);
    assert.ok(PAYMENT_RAIL_STATES.includes(report.state));
    assert.equal(report.businessEffectAuthority, 'NONE');
  }
});
