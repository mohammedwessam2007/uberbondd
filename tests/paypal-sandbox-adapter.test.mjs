import test from 'node:test';
import assert from 'node:assert/strict';
import { createPayPalSandboxVerifier } from '../src/paypal-sandbox-adapter.mjs';

test('PayPal verifier refuses without credentials and performs no request', async () => {
  let calls = 0;
  const out = await createPayPalSandboxVerifier({ fetchImpl: async () => { calls += 1; } })({ objectId: 'order-1' });
  assert.equal(out.cleared, false);
  assert.equal(out.environment, 'SANDBOX');
  assert.equal(out.economicEligible, false);
  assert.equal(out.terminal, true);
  assert.equal(out.errorCode, 'paypal-sandbox-credentials-not-configured');
  assert.equal(calls, 0);
});

test('completed PayPal Sandbox order proves integration only and never clears commercial truth', async () => {
  const calls = [];
  const verifier = createPayPalSandboxVerifier({ clientId: 'client-id', clientSecret: 'client-secret', fetchImpl: async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/oauth2/token')) return { ok: true, status: 200, async json() { return { access_token: 'opaque-token' }; } };
    return { ok: true, status: 200, async json() { return { id: 'order-1', status: 'COMPLETED', purchase_units: [{ payments: { captures: [{ id: 'cap-1', status: 'COMPLETED', amount: { value: '450.00', currency_code: 'USD' } }] } }] }; } };
  } });
  const out = await verifier({ objectId: 'order-1', eventName: 'PAYMENT.CAPTURE.COMPLETED' });
  assert.equal(out.sandboxVerified, true);
  assert.equal(out.cleared, false);
  assert.equal(out.economicEligible, false);
  assert.equal(out.commercialTruthEligible, false);
  assert.equal(out.environment, 'SANDBOX');
  assert.equal(out.sandboxReceiptRef, 'paypal:sandbox:order-1');
  assert.equal(out.amount, '450.00');
  assert.equal(out.currency, 'USD');
  assert.equal(out.errorCode, 'paypal-sandbox-verification-only');
  assert.equal('canonicalReceiptRef' in out, false);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://api-m.sandbox.paypal.com/v1/oauth2/token');
  assert.equal(JSON.stringify(out).includes('client-secret'), false);
});

test('PayPal Sandbox refuses provider order identity mismatch', async () => {
  const verifier = createPayPalSandboxVerifier({ clientId: 'id', clientSecret: 'secret', fetchImpl: async url => {
    if (url.endsWith('/oauth2/token')) return { ok: true, status: 200, async json() { return { access_token: 'token' }; } };
    return { ok: true, status: 200, async json() { return { id: 'different-order', status: 'COMPLETED', purchase_units: [] }; } };
  } });
  const out = await verifier({ objectId: 'order-1' });
  assert.equal(out.cleared, false);
  assert.equal(out.errorCode, 'paypal-order-id-mismatch');
  assert.equal(out.economicEligible, false);
});

test('PayPal Sandbox refuses contradictory capture amount/currency evidence', async () => {
  const verifier = createPayPalSandboxVerifier({ clientId: 'id', clientSecret: 'secret', fetchImpl: async url => {
    if (url.endsWith('/oauth2/token')) return { ok: true, status: 200, async json() { return { access_token: 'token' }; } };
    return { ok: true, status: 200, async json() { return { id: 'order-1', status: 'COMPLETED', purchase_units: [{ payments: { captures: [
      { id: 'cap-1', status: 'COMPLETED', amount: { value: '450.00', currency_code: 'USD' } },
      { id: 'cap-2', status: 'COMPLETED', amount: { value: '450.00', currency_code: 'EUR' } }
    ] } }] }; } };
  } });
  const out = await verifier({ objectId: 'order-1' });
  assert.equal(out.cleared, false);
  assert.equal(out.sandboxVerified, true);
  assert.equal(out.errorCode, 'paypal-capture-amount-currency-disagreement');
});
