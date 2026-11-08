import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { verifyXPayWebhook } from '../src/xpay-webhook-boundary.mjs';
import { createFetchHandler } from '../api/webhooks/xpay.mjs';
import { createPortablePayPalBridge } from '../src/portable-paypal-bridge.mjs';

const now = 1791220000000;
const secret = 'test-fixture-only';
const event = () => ({ id: 'evt_test_one', type: 'checkout.session.completed', livemode: false,
  data: { object: { id: 'cs_test_one', object: 'checkout.session', livemode: false,
    status: 'complete', paymentStatus: 'paid', clientSecret: 'must-not-persist',
    customerDetails: { email: 'private@example.invalid' }, metadata: { lead_id: 'untrusted' } } } });
const sign = (raw, t = Math.floor(now / 1000)) => `t=${t},v1=${crypto.createHmac('sha256', secret).update(`${t}.`).update(raw).digest('hex')}`;
const verify = (value = event(), overrides = {}) => {
  const rawBody = Buffer.from(JSON.stringify(value));
  return verifyXPayWebhook({ rawBody, signature: sign(rawBody), signingSecret: secret, environment: 'test', now, ...overrides });
};

test('signed paid test event is input only, mode-bound and secret-free', () => {
  const result = verify();
  assert.equal(result.ok, true);
  assert.equal(result.event.provider, 'xpay');
  assert.equal(result.event.customData.commercialTruthEligible, false);
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.ok(Object.values(result.externalEffectLedger).every(n => n === 0));
  assert.doesNotMatch(JSON.stringify(result), /must-not-persist|private@example|untrusted/);
});
test('unpaid Fawry completion never asserts cleared revenue', () => {
  const value = event(); value.data.object.paymentStatus = 'unpaid';
  const result = verify(value);
  assert.equal(result.ok, true);
  assert.equal(result.event.customData.providerPaymentStatus, 'unpaid');
  assert.equal(result.event.customData.commercialTruthEligible, false);
});
test('retries share event key; test/live event identities are distinct', () => {
  const first = verify();
  const changed = event(); changed.data.object.updatedAt = 'later';
  assert.equal(first.event.providerEventKey, verify(changed).event.providerEventKey);
  changed.livemode = true; changed.data.object.livemode = true;
  assert.notEqual(first.event.providerEventKey, verify(changed, { environment: 'live' }).event.providerEventKey);
});
for (const [label, overrides] of [
  ['missing secret', { signingSecret: '' }], ['missing mode', { environment: undefined }],
  ['wrong mode', { environment: 'live' }], ['missing signature', { signature: null }],
  ['malformed signature', { signature: 't=abc,v1=bad' }],
  ['duplicate timestamp', { signature: 't=1,t=1,v1=' + 'a'.repeat(64) }],
  ['altered body', { rawBody: Buffer.from('{}') }],
  ['old delivery', { now: now + 301000 }], ['future delivery', { now: now - 301000 }],
  ['invalid clock', { now: NaN }], ['oversized body', { rawBody: Buffer.alloc(1024 * 1024 + 1) }]
]) test(`refuses ${label}`, () => assert.equal(verify(event(), overrides).ok, false));
test('authenticated malformed JSON refused without throwing', () => {
  const rawBody = Buffer.from('{');
  assert.equal(verifyXPayWebhook({ rawBody, signature: sign(rawBody), signingSecret: secret, environment: 'test', now }).ok, false);
});
test('missing or conflicting object mode fails closed', () => {
  for (const mode of [undefined, true]) {
    const value = event(); value.data.object.livemode = mode;
    assert.equal(verify(value).ok, false);
  }
});
test('unsupported event and missing identity fail closed', () => {
  const value = event(); value.type = 'customer.updated'; assert.equal(verify(value).ok, false);
  delete value.id; assert.equal(verify(value).ok, false);
});
const env = { DATABASE_URL: 'fixture', XPAY_WEBHOOK_SECRET: secret, XPAY_WEBHOOK_ENVIRONMENT: 'test' };
const request = () => {
  const raw = Buffer.from(JSON.stringify(event()));
  return new Request('https://example.invalid/api/webhooks/xpay', { method: 'POST', body: raw,
    headers: { 'xpay-signature': sign(raw) } });
};
test('route acknowledges only after durable inbox persistence; never clears', async () => {
  let persisted;
  const handler = createFetchHandler({ env, now: () => now, getPool: () => ({}),
    persistVerifiedBillingEvent: async (_, value) => { persisted = value; return { status: 'WEBHOOK_PERSISTED', duplicate: false }; } });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.equal(persisted.provider, 'xpay');
  assert.equal((await response.json()).commercialTruthEligible, false);
});
test('persistence failure yields retryable 503, no false success', async () => {
  const handler = createFetchHandler({ env, now: () => now, getPool: () => ({}),
    persistVerifiedBillingEvent: async () => { throw new Error('secret-db-detail'); } });
  const response = await handler(request());
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /secret-db-detail/);
});
test('duplicate is successful receipt without new financial effects', async () => {
  const handler = createFetchHandler({ env, now: () => now, getPool: () => ({}),
    persistVerifiedBillingEvent: async () => ({ status: 'WEBHOOK_DUPLICATE', duplicate: true }) });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).duplicate, true);
});
test('unconfigured route does not read body or access database', async () => {
  const response = await createFetchHandler({ env: {} })(request());
  assert.equal(response.status, 503);
});
test('portable XPay route preserves raw bytes and PayPal isolation', async () => {
  let observed;
  const handler = createPortablePayPalBridge({ coreHandler: () => assert.fail('wrong route'),
    handlers: { webhook: () => assert.fail('paypal must not receive XPay'),
      xpayWebhook: async req => { observed = Buffer.from(await req.arrayBuffer()); return new Response('ack'); } } });
  const raw = Buffer.from('{ "preserve" : true }');
  const res = { writeHead(status) { this.status = status; }, end() {} };
  await handler({ method: 'POST', url: '/api/webhooks/xpay', headers: {},
    [Symbol.asyncIterator]: () => Readable.from(raw)[Symbol.asyncIterator]() }, res);
  assert.equal(res.status, 200); assert.deepEqual(observed, raw);
});
