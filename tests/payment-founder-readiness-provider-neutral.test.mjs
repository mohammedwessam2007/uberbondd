import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveEnvironmentPresence,
  RAGNAROK_BLOCKER_LEDGER
} from '../src/founder-absence-blocker-doctor.mjs';

const SECRET = 'THIS_IS_A_TEST_SECRET_THAT_MUST_NEVER_APPEAR';

function paymentPresence(env) {
  return deriveEnvironmentPresence(env).paymentProvider;
}

test('one PayPal sandbox fragment cannot resolve payment-provider readiness', () => {
  const presence = paymentPresence({ PAYPAL_SANDBOX_CLIENT_ID: SECRET });
  assert.equal(presence.anyCompleteBundle, false);
  assert.equal(presence.paypalSandboxComplete, false);
});

test('mixed fragments across Lemon Squeezy and PayPal cannot assemble one provider bundle', () => {
  const presence = paymentPresence({
    LEMONSQUEEZY_WEBHOOK_SECRET: SECRET,
    PAYPAL_SANDBOX_CLIENT_ID: SECRET,
    PAYPAL_SANDBOX_CLIENT_SECRET: SECRET,
    DATABASE_URL: 'postgres://present'
  });
  assert.equal(presence.anyCompleteBundle, false);
  assert.equal(presence.paypalSandboxComplete, false);
  assert.equal(presence.lemonSqueezyComplete, false);
});

test('complete PayPal sandbox bundle is recognized as sandbox configuration only', () => {
  const presence = paymentPresence({
    PAYPAL_SANDBOX_CLIENT_ID: SECRET,
    PAYPAL_SANDBOX_CLIENT_SECRET: SECRET,
    PAYPAL_SANDBOX_WEBHOOK_ID: 'WH-NOT-REAL',
    DATABASE_URL: 'postgres://present'
  });
  assert.equal(presence.paypalSandboxComplete, true);
  assert.equal(presence.anyCompleteBundle, true);
  assert.equal(presence.livePaymentCapable, false,
    'sandbox credential completeness became permission or proof to take live money');
});

test('payment founder action is provider-neutral and prefers the current PayPal verification path without calling sandbox live', () => {
  const row = RAGNAROK_BLOCKER_LEDGER.find(item => item.id === 'zero-payment-provider-account');
  assert.ok(row);
  assert.match(row.ownerAction.action, /PayPal/i);
  assert.match(row.ownerAction.action, /sandbox/i);
  assert.match(row.ownerAction.action, /live|KYC|provider/i);
  assert.doesNotMatch(row.ownerAction.action, /Create the Lemon Squeezy store/i);
});

test('founder readiness exposes only names and booleans, never credential values', () => {
  const report = deriveEnvironmentPresence({
    PAYPAL_SANDBOX_CLIENT_ID: SECRET,
    PAYPAL_SANDBOX_CLIENT_SECRET: SECRET,
    PAYPAL_SANDBOX_WEBHOOK_ID: 'WH-NOT-REAL',
    DATABASE_URL: `postgres://user:${SECRET}@db.test/uberbond`
  });
  assert.equal(JSON.stringify(report).includes(SECRET), false);
});
