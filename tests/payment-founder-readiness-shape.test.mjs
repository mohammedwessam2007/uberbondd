import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveEnvironmentPresence } from '../src/founder-absence-blocker-doctor.mjs';

const SECRET = 'SHAPE_SECRET_MUST_NOT_LEAK';

test('provider-neutral payment readiness preserves generic presence metadata while adding completeness truth', () => {
  const report = deriveEnvironmentPresence({
    PAYPAL_SANDBOX_CLIENT_ID: SECRET,
    PAYPAL_SANDBOX_CLIENT_SECRET: SECRET,
    PAYPAL_SANDBOX_WEBHOOK_ID: 'WH-SHAPE',
    DATABASE_URL: `postgres://user:${SECRET}@db.invalid/uberbond`
  });
  const payment = report.paymentProvider;
  assert.ok(Array.isArray(payment.keys));
  assert.equal(typeof payment.anyPresent, 'boolean');
  assert.equal(typeof payment.allPresent, 'boolean');
  assert.equal(Number.isInteger(payment.presentCount), true);
  assert.equal(payment.paypalSandboxComplete, true);
  assert.equal(payment.anyCompleteBundle, true);
  assert.equal(payment.livePaymentCapable, false);
  assert.equal(payment.providers.paypal.sandboxComplete, true);
  assert.equal(JSON.stringify(report).includes(SECRET), false);
});
