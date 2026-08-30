import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// `/webhooks/lemonsqueezy` is the only unauthenticated route that can create
// money, and it is the money's entry point. Its signature check is the entire
// boundary.
//
// The check itself was sound and is left alone -- nine forgery shapes below all
// fail it. Two things around it were not.
//
// A forged signature answered 500. Payment providers RETRY on 5xx, so telling
// Lemon Squeezy "we failed" about a webhook we had permanently and correctly
// rejected meant it would redeliver forever, and providers disable endpoints
// that keep failing. A forgery has to be refused in a way that stops it coming
// back.
//
// And the acknowledgement echoed the whole normalized event, including the
// provider's `attributes` verbatim with `user_email` in them, plus a derived
// `customerEmail`. The recipient is the provider that sent it, so this was never
// disclosure to a third party -- but it put a buyer's address into every
// delivery log and proxy on the path for no reason, and it undid the payload
// minimization the durable side already does.

const SECRET = 'webhook-route-truth-secret';
let handler;
let store;
let dataDir;

test.before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'uberbond-webhook-route-'));
  process.env.PROCESS_ROLE = 'web';
  process.env.STORE_BACKEND = 'json';
  process.env.DATA_DIR = dataDir;
  process.env.APP_BASE_URL = 'http://127.0.0.1:9999';
  process.env.ADMIN_TOKEN = 'a-strong-admin-token-value-000000000000';
  process.env.LEMONSQUEEZY_WEBHOOK_SECRET = SECRET;
  process.env.NODE_ENV = 'test';
  ({ requestHandler: handler } = await import('../server.mjs'));
  const { Store } = await import('../src/store.mjs');
  store = new Store(dataDir);
  await store.init();
});

test.after(async () => {
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

function response() {
  const res = { status: null, body: '' };
  res.writeHead = status => { res.status = status; };
  res.end = body => { res.body = body || ''; };
  return res;
}

async function post(body, signature) {
  const res = response();
  await handler({
    method: 'POST',
    url: '/webhooks/lemonsqueezy',
    headers: signature === undefined ? {} : { 'x-signature': signature },
    async *[Symbol.asyncIterator]() { yield Buffer.from(body); }
  }, res);
  return res;
}

const sign = (body, secret = SECRET) => crypto.createHmac('sha256', secret).update(body).digest('hex');

const eventBody = (objectId, email = 'buyer@example.com') => JSON.stringify({
  meta: { event_name: 'order_created', test_mode: false, custom_data: { lead_id: 'lead-x', prospect_id: 'pros-x', product: 'full' } },
  data: { id: objectId, type: 'orders', attributes: { total: 99900, currency: 'USD', status: 'paid', created_at: '2026-08-30T10:00:00Z', test_mode: false, user_email: email } }
});

const moneyRows = async () => ({
  orders: (await store.list('orders')).length,
  revenue: (await store.list('revenueEvents')).length
});

test('no forged signature creates money, and each is refused with 401', async () => {
  const body = eventBody('evt-forged');
  const before = await moneyRows();
  const accepted = [];
  for (const [label, signature] of [
    ['no x-signature header', undefined],
    ['an empty signature', ''],
    ['a wrong signature', 'deadbeef'],
    ['a signature of a different body', sign('{}')],
    ['a signature made with another secret', sign(body, 'attacker-secret')],
    ['the correct signature uppercased', sign(body).toUpperCase()],
    ['the correct signature with whitespace', ` ${sign(body)} `],
    ['a truncated correct signature', sign(body).slice(0, 32)],
    ['the correct signature plus a suffix', `${sign(body)}00`]
  ]) {
    const res = await post(body, signature);
    if (res.status !== 401) accepted.push(`${label} -> ${res.status}`);
  }
  assert.deepEqual(accepted, [], 'every forgery must be refused with 401');

  const after = await moneyRows();
  assert.deepEqual(after, before, 'no forgery may create an order or a revenue event');
});

// The reason 401 rather than 500 matters is not tidiness.
test('a forgery is refused permanently, in a way a provider will not retry', async () => {
  const body = eventBody('evt-retry-shape');
  const res = await post(body, 'not-a-signature');
  assert.equal(res.status, 401);
  assert.ok(res.status < 500,
    'a 5xx tells a payment provider to redeliver a webhook we permanently rejected');
  assert.match(res.body, /Invalid webhook signature/,
    'and the refusal should say what was wrong, so the provider dashboard is legible');
});

test('a body altered after signing is refused', async () => {
  const body = eventBody('evt-tamper');
  const signature = sign(body);
  const before = await moneyRows();

  const res = await post(body.replace('99900', '9999900'), signature);
  assert.equal(res.status, 401);
  assert.deepEqual(await moneyRows(), before);
});

// The positive control. Without it, everything above is satisfied by a route
// that refuses everything.
test('a correctly signed webhook is accepted and acknowledged', async () => {
  const body = eventBody('evt-genuine');
  const res = await post(body, sign(body));
  assert.equal(res.status, 200);
  const acknowledgement = JSON.parse(res.body);
  assert.equal(acknowledgement.ok, true);
  assert.equal(acknowledgement.duplicate, false);
  assert.equal(acknowledgement.eventName, 'order_created');
  assert.equal(acknowledgement.providerObjectId, 'evt-genuine');
});

test('a replayed webhook is acknowledged as a duplicate rather than counted twice', async () => {
  const body = eventBody('evt-replayed');
  const signature = sign(body);
  await post(body, signature);
  const before = await moneyRows();

  const res = await post(body, signature);
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(res.body).duplicate, true);
  assert.deepEqual(await moneyRows(), before, 'a replay must not create a second row');
});

// The acknowledgement is for the provider. It does not need the buyer's address
// back, and neither does anything between here and there.
test('the acknowledgement carries no buyer address, payload, or secret', async () => {
  const body = eventBody('evt-privacy', 'private-buyer@example.com');
  const res = await post(body, sign(body));
  const acknowledgement = res.body;

  assert.equal(acknowledgement.includes('private-buyer@example.com'), false, 'no buyer address');
  assert.equal(acknowledgement.includes('@'), false, 'no address-shaped value at all');
  assert.equal(acknowledgement.includes(SECRET), false, 'no signing secret');
  assert.equal(acknowledgement.includes('attributes'), false, 'no provider payload echoed back');
  assert.equal(acknowledgement.includes('99900'), false, 'not even the amount needs to come back');

  // And the refusal path must be just as quiet.
  const refused = await post(body, 'wrong');
  assert.equal(refused.body.includes('private-buyer@example.com'), false);
  assert.equal(refused.body.includes(SECRET), false);
});
