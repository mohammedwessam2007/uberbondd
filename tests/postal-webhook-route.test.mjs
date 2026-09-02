import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { createFetchHandler } from '../api/webhooks/postal.mjs';
import { createMemoryPostalWebhookLedger } from '../src/omnia-v9/integrations/providers/postal-webhook-ledger.mjs';

const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PUBLIC_KEY = pair.publicKey.export({ type: 'spki', format: 'pem' });
const DATABASE_URL = 'postgresql://user:pw@db.example.test:5432/uberbond';
const TAG = `v9_${'b'.repeat(48)}`;

const body = (overrides = {}) => JSON.stringify({
  event: 'MessageSent',
  timestamp: 1788307200,
  uuid: 'c0ffee00-0000-4000-8000-000000000001',
  payload: {
    message: {
      id: 4242, token: 'route-token-must-not-persist', message_id: '<v9-def@uberbond.agency>',
      to: 'buyer@example.com', from: 'outreach@uberbond.agency', subject: 'Sprint', tag: TAG
    },
    status: 'Sent'
  },
  ...overrides
});

const sign = raw => crypto.sign('sha256', Buffer.from(raw, 'utf8'), pair.privateKey).toString('base64');

function request(raw, signature) {
  return new Request('https://app.uberbond.cloud/api/webhooks/postal', {
    method: 'POST',
    headers: signature == null ? {} : { 'x-postal-signature': signature },
    body: raw
  });
}

function handler({ env = { POSTAL_WEBHOOK_PUBLIC_KEY: PUBLIC_KEY, DATABASE_URL }, ledger = createMemoryPostalWebhookLedger() } = {}) {
  return {
    ledger,
    fetch: createFetchHandler({
      env,
      getPool: () => ({ query: async () => ({ rowCount: 1, rows: [] }) }),
      createLedger: () => ledger,
      now: () => new Date('2026-09-02T00:00:00.000Z')
    })
  };
}

test('an unconfigured route refuses rather than collecting events it can never authenticate', async () => {
  const noKey = handler({ env: { DATABASE_URL } });
  const keyless = await noKey.fetch(request(body(), sign(body())));
  assert.equal(keyless.status, 503);
  assert.equal((await keyless.json()).reasonCodes[0], 'postal-webhook-public-key-not-configured');

  const noDb = handler({ env: { POSTAL_WEBHOOK_PUBLIC_KEY: PUBLIC_KEY } });
  assert.equal((await noDb.fetch(request(body(), sign(body())))).status, 503);
});

test('a signed delivery is accepted, recorded once, and answered as a duplicate on replay', async () => {
  const { fetch, ledger } = handler();
  const raw = body();

  const first = await fetch(request(raw, sign(raw)));
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.equal(firstBody.ok, true);
  assert.equal(firstBody.status, 'PERSISTED');
  assert.equal(firstBody.lifecycle, 'SENT');
  assert.equal(firstBody.businessEffectAuthority, 'NONE');

  const replay = await fetch(request(raw, sign(raw)));
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).status, 'DUPLICATE');
  assert.equal((await ledger.findByTag(TAG)).length, 1);
});

test('an unsigned or forged delivery is refused and quarantined, never reconcilable', async () => {
  const { fetch, ledger } = handler();
  const raw = body();

  const unsigned = await fetch(request(raw, ''));
  assert.equal(unsigned.status, 401);
  const payload = await unsigned.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.quarantineReason, 'UNAUTHENTICATED');

  // Recorded, because knowing an unsigned event arrived is worth more than a
  // silent refusal -- and excluded from anything reconciliation can read.
  const rows = await ledger.lookupForReconciliation({ tag: TAG, messageId: '<v9-def@uberbond.agency>' });
  assert.equal(rows.length, 0, 'a quarantined row was offered to reconciliation');
});

test('a body signed for different bytes does not authenticate', async () => {
  const { fetch } = handler();
  const raw = body();
  const tampered = raw.replace('buyer@example.com', 'attacker@example.com');
  assert.equal((await fetch(request(tampered, sign(raw)))).status, 401);
});

test('an oversized body is refused before it is parsed or stored', async () => {
  const { fetch, ledger } = handler();
  const huge = JSON.stringify({ event: 'MessageSent', payload: { message: { tag: TAG, note: 'x'.repeat(1024 * 1024 + 10) } } });
  const response = await fetch(request(huge, sign(huge)));
  assert.equal(response.status, 413);
  assert.equal((await ledger.findByTag(TAG)).length, 0);
});

test('the route answers without echoing the body, the key or the recipient token', async () => {
  const { fetch } = handler();
  const raw = body();
  const printed = JSON.stringify(await (await fetch(request(raw, sign(raw)))).json());
  assert.equal(printed.includes('route-token-must-not-persist'), false);
  assert.equal(printed.includes('BEGIN PUBLIC KEY'), false);
  assert.equal(printed.includes('buyer@example.com'), false);
});

test('a method other than POST is refused', async () => {
  const { fetch } = handler();
  const response = await fetch(new Request('https://app.uberbond.cloud/api/webhooks/postal', { method: 'GET' }));
  assert.equal(response.status, 405);
});

test('a storage failure is reported as not durably persisted, never as accepted', async () => {
  const failing = createFetchHandler({
    env: { POSTAL_WEBHOOK_PUBLIC_KEY: PUBLIC_KEY, DATABASE_URL },
    getPool: () => ({ query: async () => { throw new Error(`connect failed for ${DATABASE_URL}`); } }),
    createLedger: () => ({ append: async () => { throw new Error(`connect failed for ${DATABASE_URL}`); } }),
    now: () => new Date('2026-09-02T00:00:00.000Z')
  });
  const raw = body();
  const response = await failing(request(raw, sign(raw)));
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.ok(payload.reasonCodes.includes('postal-webhook-not-durably-persisted'));
  // The failure text can carry a connection string with a password in it.
  assert.equal(JSON.stringify(payload).includes('db.example.test'), false);
});
