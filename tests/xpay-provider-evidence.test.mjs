import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateXPayProviderEvidence, createXPayProviderEvidenceReader } from '../src/xpay-provider-evidence.mjs';
const fixture = (environment = 'test') => ({ environment,
  binding: { sessionId: 'cs_1', merchantId: 'acct_1', amountMinor: 5000, currency: 'EGP',
    intentId: 'ub_intent_1', leadId: 'lead_1', product: 'sku_1' },
  account: { id: 'acct_1', livemode: environment === 'live', livePaymentsEnabled: true,
    apiKey: { type: 'SECRET', mode: environment } },
  session: { id: 'cs_1', object: 'checkout.session', mode: 'payment', merchantId: 'acct_1',
    livemode: environment === 'live', status: 'complete', paymentStatus: 'paid', amountTotal: 5000,
    currency: 'EGP', paymentIntentId: 'pi_1', clientSecret: 'NEVER_RETURN',
    metadata: { product: 'untrusted' }, customer: { email: 'PRIVATE_EMAIL' },
    paymentIntent: { id: 'pi_1', object: 'payment_intent', checkoutSessionId: 'cs_1',
      status: 'SUCCEEDED', amount: 5000, amountReceived: 5000, amountCapturable: 0, currency: 'EGP',
      latestCharge: { id: 'ch_1', object: 'charge', paymentIntentId: 'pi_1', status: 'SUCCEEDED',
        paid: true, captured: true, amount: 5000, amountCaptured: 5000, currency: 'EGP',
        amountRefunded: 0, refunded: false, disputed: false, activeHoldId: null, refunds: [] } } } });
for (const environment of ['test', 'live']) test(`${environment} capture is secret-free evidence, never cleared money`, () => {
  const r = evaluateXPayProviderEvidence(fixture(environment));
  assert.equal(r.ok, true); assert.equal(r.cleared, false); assert.equal(r.commercialTruthEligible, false);
  assert.equal(r.canonicalReceiptRef, undefined);
  assert.equal(r.evidence.chargeId, 'ch_1');
  assert.doesNotMatch(JSON.stringify(r), /NEVER_RETURN|PRIVATE_EMAIL|untrusted/);
});
const cases = [
  ['missing intent', f => { delete f.binding; }],
  ['merchant mismatch', f => { f.account.id = 'acct_wrong'; }],
  ['key mode mismatch', f => { f.account.apiKey.mode = 'live'; }],
  ['publishable key', f => { f.account.apiKey.type = 'PUBLISHABLE'; }],
  ['mode mismatch', f => { f.session.livemode = true; }],
  ['unpaid Fawry', f => { f.session.paymentStatus = 'unpaid'; }],
  ['wrong session', f => { f.session.id = 'cs_wrong'; }],
  ['intent chain mismatch', f => { f.session.paymentIntent.checkoutSessionId = 'cs_wrong'; }],
  ['charge chain mismatch', f => { f.session.paymentIntent.latestCharge.paymentIntentId = 'pi_wrong'; }],
  ['wrong currency', f => { f.session.currency = 'USD'; }],
  ['amount mismatch', f => { f.session.paymentIntent.amountReceived = 4999; }],
  ['string amount', f => { f.session.amountTotal = '5000'; }],
  ['partial capture', f => { f.session.paymentIntent.latestCharge.amountCaptured = 100; }],
  ['pending capture', f => { f.session.paymentIntent.amountCapturable = 5000; }],
  ['refund', f => { f.session.paymentIntent.latestCharge.amountRefunded = 1; }],
  ['dispute', f => { f.session.paymentIntent.latestCharge.disputed = true; }],
  ['hold', f => { f.session.paymentIntent.latestCharge.activeHoldId = 'hold_1'; }],
  ['unknown hold', f => { delete f.session.paymentIntent.latestCharge.activeHoldId; }],
  ['unknown refund', f => { delete f.session.paymentIntent.latestCharge.refunded; }],
  ['refund list', f => { f.session.paymentIntent.latestCharge.refunds = [{ id: 're_1' }]; }]
];
for (const [name, mutate] of cases) test(`refuses ${name}`, () => {
  const f = fixture(); mutate(f); const r = evaluateXPayProviderEvidence(f);
  assert.equal(r.ok, false); assert.equal(r.cleared, false); assert.equal(r.evidence, undefined);
});
test('live approval missing refuses', () => {
  const f = fixture('live'); f.account.livePaymentsEnabled = false;
  assert.equal(evaluateXPayProviderEvidence(f).errorCode, 'xpay-live-payments-not-enabled');
});
test('reader uses only fixed-origin GET with redirect refusal and filters payload', async () => {
  const f = fixture(); const calls = [];
  const read = createXPayProviderEvidenceReader({ environment: 'test', secretKey: 'SECRET_FIXTURE',
    fetchImpl: async (url, options) => { calls.push({ url, options });
      return { ok: true, json: async () => calls.length === 1 ? f.account : f.session }; } });
  const r = await read({ binding: f.binding }); assert.equal(r.ok, true); assert.equal(r.providerCalls, 2);
  assert.deepEqual(calls.map(c => c.url), ['https://api.xpay.app/account', 'https://api.xpay.app/checkout/sessions/cs_1']);
  for (const c of calls) { assert.equal(c.options.method, 'GET'); assert.equal(c.options.redirect, 'error'); }
  assert.doesNotMatch(JSON.stringify(r), /SECRET_FIXTURE|NEVER_RETURN|PRIVATE_EMAIL/);
});
test('account mismatch stops before reading session', async () => {
  const f = fixture(); let count = 0;
  const read = createXPayProviderEvidenceReader({ environment: 'test', secretKey: 'key',
    fetchImpl: async () => { count++; return { ok: true, json: async () => ({ ...f.account, id: 'other' }) }; } });
  assert.equal((await read({ binding: f.binding })).ok, false); assert.equal(count, 1);
});
test('invalid URL identity makes zero calls', async () => {
  let count = 0; const read = createXPayProviderEvidenceReader({ environment: 'test', secretKey: 'key',
    fetchImpl: async () => { count++; } });
  assert.equal((await read({ binding: { sessionId: '../attack' } })).ok, false); assert.equal(count, 0);
});
test('timeout covers body read and does not leak thrown secrets', async () => {
  const f = fixture(); const read = createXPayProviderEvidenceReader({ environment: 'test', secretKey: 'key', timeoutMs: 5,
    fetchImpl: async () => ({ ok: true, json: () => new Promise(() => {}) }) });
  const r = await read({ binding: f.binding }); assert.equal(r.errorCode, 'xpay-provider-evidence-unavailable');
  assert.equal(r.providerCalls, 1);
});
test('network exception is sanitized', async () => {
  const f = fixture(); const read = createXPayProviderEvidenceReader({ environment: 'test', secretKey: 'key',
    fetchImpl: async () => { throw new Error('SECRET_FIXTURE'); } });
  assert.doesNotMatch(JSON.stringify(await read({ binding: f.binding })), /SECRET_FIXTURE/);
});
