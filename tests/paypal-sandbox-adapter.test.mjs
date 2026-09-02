import test from 'node:test';
import assert from 'node:assert/strict';
import { createPayPalSandboxVerifier } from '../src/paypal-sandbox-adapter.mjs';

test('PayPal verifier refuses without credentials and performs no request', async () => {
  let calls = 0;
  const out = await createPayPalSandboxVerifier({ fetchImpl: async () => { calls += 1; } })({ objectId: 'order-1' });
  assert.deepEqual(out, { cleared: false, terminal: true, errorCode: 'paypal-sandbox-credentials-not-configured' });
  assert.equal(calls, 0);
});

test('PayPal verifier checks OAuth and only clears a completed captured order', async () => {
  const calls = [];
  const verifier = createPayPalSandboxVerifier({ clientId: 'client-id', clientSecret: 'client-secret', fetchImpl: async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/oauth2/token')) return { ok: true, status: 200, async json() { return { access_token: 'opaque-token' }; } };
    return { ok: true, status: 200, async json() { return { id: 'order-1', status: 'COMPLETED', purchase_units: [{ payments: { captures: [{ id: 'cap-1', status: 'COMPLETED' }] } }] }; } };
  } });
  const out = await verifier({ objectId: 'order-1', eventName: 'PAYMENT.CAPTURE.COMPLETED' });
  assert.equal(out.cleared, true);
  assert.equal(out.canonicalReceiptRef, 'paypal:sandbox:order-1');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://api-m.sandbox.paypal.com/v1/oauth2/token');
  assert.equal(JSON.stringify(out).includes('client-secret'), false);
});
