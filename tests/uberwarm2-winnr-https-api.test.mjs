import test from 'node:test';
import assert from 'node:assert/strict';
import { createWinnrApiClient } from '../src/uberwinnr-adapter.mjs';

const createFixture = () => {
  const calls = [];
  const client = createWinnrApiClient({
    token: 'wnr_test_only_not_real', authorized: true, termsCompatible: true,
    evidenceRef: 'owner-proof:synthetic-fixture',
    fetchImpl: async (url, opts) => {
      calls.push({ url, method: opts.method, body: opts.body, headers: opts.headers });
      return { ok: true, status: 200, headers: { get: () => null },
        text: async () => JSON.stringify({
          data: { message_id: '<provider-fake@test.invalid>' }
        }) };
    }
  });
  return { client, calls };
};

const exact = Object.freeze({ userId: 'eu_ownerpilot1', to: 'seed@owned.example',
  subject: 'Owner-controlled test', body: 'One explicitly approved fixture' });

test('Winnr HTTPS mailbox transport is denied until explicit write approval', async () => {
  const { client, calls } = createFixture();
  assert.equal(client.ok, true);
  const result = await client.sendOwnerSeedViaHttps(exact);
  assert.equal(result.ok, false);
  assert.equal(result.status, 'UBERWINNR_WRITE_REFUSED');
  assert.equal(result.providerCalls, 0);
  assert.equal(calls.length, 0);
});

test('Winnr HTTPS transport invokes the documented one-mailbox path once', async () => {
  const { client, calls } = createFixture();
  const result = await client.sendOwnerSeedViaHttps({ ...exact, writeAuthorized: true });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'UBERWINNR_WRITE_CONFIRMED');
  assert.equal(result.providerCalls, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].url, 'https://api.winnr.app/v1/email-users/eu_ownerpilot1/inbox/send');
  assert.deepEqual(JSON.parse(calls[0].body), { to: exact.to, subject: exact.subject, body: exact.body });
  assert.equal(result.receipt.method, 'POST');
  assert.ok(result.receipt.responseDigest.startsWith('sha256:'));
});

test('Winnr HTTPS sender refuses multiline receiver, malformed identity and oversized content before IO', async () => {
  const { client, calls } = createFixture();
  for (const input of [
    { ...exact, to: 'a@b.com,b@c.com', writeAuthorized: true },
    { ...exact, to: 'a@b.com\nBcc:someone@x.com', writeAuthorized: true },
    { ...exact, userId: '../other', writeAuthorized: true },
    { ...exact, body: 'x'.repeat(1100), writeAuthorized: true },
    { ...exact, subject: '', writeAuthorized: true }
  ]) {
    const r = await client.sendOwnerSeedViaHttps(input);
    assert.equal(r.ok, false);
    assert.equal(r.providerCalls, 0);
  }
  assert.equal(calls.length, 0);
});

test('provider exception after POST remains uncertain and never automatically retries', async () => {
  let count = 0;
  const client = createWinnrApiClient({
    token: 'wnr_test_only_not_real', authorized: true, termsCompatible: true,
    evidenceRef: 'synthetic',
    fetchImpl: async () => { count += 1; throw Error('simulated network timeout'); }
  });
  const result = await client.sendOwnerSeedViaHttps({ ...exact, writeAuthorized: true });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'UBERWINNR_WRITE_OUTCOME_UNCERTAIN');
  assert.equal(result.automaticRetryAuthorized, false);
  assert.equal(count, 1);
});

test('Winnr API seed helper is not an owner-send authorization system', () => {
  const { client } = createFixture();
  assert.equal(typeof client.sendOwnerSeedViaHttps, 'function');
  assert.equal(client.authorizedSeedProbe, undefined);
  assert.equal(client.senderHealthCleared, undefined);
});
