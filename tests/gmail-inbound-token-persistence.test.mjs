// P1-09 hostile tests: refreshed OAuth token persistence through the dedicated inboundAccounts
// CAS repository, driven through the real Gmail reader (not just the raw store methods -- those
// are covered separately in tests/inbound-accounts-store.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { createGmailInboundReader, sealInboundTokens, openInboundTokens, GmailInboundError } from '../src/gmail-inbound.mjs';

const KEY = Buffer.alloc(32, 3).toString('hex');

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-token-persist-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

async function approvedAccount(store, overrides = {}) {
  const created = await store.createInboundAccount({
    provider: 'gmail', accountIdentity: 'owner@example.com', approvalStatus: 'approved', active: true,
    encryptedTokens: sealInboundTokens({ access_token: 'expired-token', refresh_token: 'refresh-abc', expires_at: Date.now() - 1000 }, KEY),
    ...overrides
  });
  assert.equal(created.ok, true);
  return created.account;
}

function readerAccountFor(storeAccount) {
  return { id: storeAccount.id, tokenVersion: storeAccount.tokenVersion, tokens: storeAccount.encryptedTokens };
}

function jsonHeaders(extra = {}) {
  const map = new Map(Object.entries(extra));
  return { get: name => (map.has(name.toLowerCase()) ? map.get(name.toLowerCase()) : null) };
}
function jsonResponse(body) {
  const text = JSON.stringify(body);
  return { ok: true, status: 200, headers: jsonHeaders({ 'content-length': String(Buffer.byteLength(text)) }), text: async () => text };
}

test('GM-07: one expired token refresh persists exactly once through the CAS repository', async () => {
  const store = await tempStore();
  const account = await approvedAccount(store);
  let tokenCalls = 0;
  const fakeFetch = async url => {
    if (String(url).includes('oauth2.googleapis.com')) { tokenCalls += 1; return jsonResponse({ access_token: 'fresh-token', expires_in: 3600 }); }
    return jsonResponse({ emailAddress: 'owner@example.com' });
  };
  const reader = createGmailInboundReader({ clientId: 'x', clientSecret: 'y', redirectUri: 'https://example.com/cb', allowNetwork: true, fetch: fakeFetch, accounts: store });
  const result = await reader.getProfile(readerAccountFor(account), KEY);
  assert.equal(tokenCalls, 1);
  assert.equal(result.tokenRefreshed, true);
  assert.equal(result.tokenPersisted, true);
  const stored = await store.readInboundAccount(account.id);
  assert.equal(stored.tokenVersion, 1);
  const decrypted = openInboundTokens(stored.encryptedTokens, KEY);
  assert.equal(decrypted.access_token, 'fresh-token');
});

test('GM-09: two concurrent refreshers -- exactly one persists, the loser reloads safely rather than overwriting', async () => {
  const store = await tempStore();
  const account = await approvedAccount(store);
  const fakeFetch = async url => {
    if (String(url).includes('oauth2.googleapis.com')) return jsonResponse({ access_token: `fresh-${Math.random().toString(36).slice(2)}`, expires_in: 3600 });
    return jsonResponse({ emailAddress: 'owner@example.com' });
  };
  const reader = createGmailInboundReader({ clientId: 'x', clientSecret: 'y', redirectUri: 'https://example.com/cb', allowNetwork: true, fetch: fakeFetch, accounts: store });
  const readerAccount = readerAccountFor(account);
  const [first, second] = await Promise.all([
    reader.getProfile(readerAccount, KEY),
    reader.getProfile(readerAccount, KEY)
  ]);
  const persistedCount = [first, second].filter(r => r.tokenPersisted).length;
  assert.equal(persistedCount, 1, 'both refreshers raced from the same stale version -- only one may win the CAS');
  const stored = await store.readInboundAccount(account.id);
  assert.equal(stored.tokenVersion, 1, 'version must advance exactly once even though both refreshed');
  // The loser's own in-memory access token still worked for its own in-flight request (both
  // requests to the Gmail API itself succeed) -- losing the CAS only means its refresh wasn't
  // durably saved, which is the safe outcome, not a thrown error.
  assert.equal(first.data.emailAddress, 'owner@example.com');
  assert.equal(second.data.emailAddress, 'owner@example.com');
});

test('a stale expectedVersion (account already refreshed by someone else) is rejected, not silently overwritten', async () => {
  const store = await tempStore();
  const account = await approvedAccount(store);
  // Simulate someone else having already refreshed and persisted once.
  await store.replaceInboundAccountTokenCAS({ accountId: account.id, expectedVersion: 0, encryptedTokens: sealInboundTokens({ access_token: 'already-fresh', refresh_token: 'refresh-abc', expires_at: Date.now() - 1000 }, KEY) });
  const fakeFetch = async url => {
    if (String(url).includes('oauth2.googleapis.com')) return jsonResponse({ access_token: 'fresh-token', expires_in: 3600 });
    return jsonResponse({ emailAddress: 'owner@example.com' });
  };
  const reader = createGmailInboundReader({ clientId: 'x', clientSecret: 'y', redirectUri: 'https://example.com/cb', allowNetwork: true, fetch: fakeFetch, accounts: store });
  // Caller still holds the stale version=0 account object (as if it read it before the other refresh).
  const result = await reader.getProfile(readerAccountFor(account), KEY);
  assert.equal(result.tokenPersisted, false);
  const stored = await store.readInboundAccount(account.id);
  assert.equal(stored.tokenVersion, 1, 'the earlier persisted refresh must not be clobbered by the stale-version attempt');
});

test('provider omitting a new refresh token preserves the existing one', async () => {
  const store = await tempStore();
  const account = await approvedAccount(store);
  const fakeFetch = async url => {
    if (String(url).includes('oauth2.googleapis.com')) return jsonResponse({ access_token: 'fresh-token', expires_in: 3600 }); // no refresh_token field
    return jsonResponse({ emailAddress: 'owner@example.com' });
  };
  const reader = createGmailInboundReader({ clientId: 'x', clientSecret: 'y', redirectUri: 'https://example.com/cb', allowNetwork: true, fetch: fakeFetch, accounts: store });
  await reader.getProfile(readerAccountFor(account), KEY);
  const stored = await store.readInboundAccount(account.id);
  const decrypted = openInboundTokens(stored.encryptedTokens, KEY);
  assert.equal(decrypted.refresh_token, 'refresh-abc', 'must preserve the original refresh token when the provider omits a new one');
});

test('a rotated refresh token from the provider is retained', async () => {
  const store = await tempStore();
  const account = await approvedAccount(store);
  const fakeFetch = async url => {
    if (String(url).includes('oauth2.googleapis.com')) return jsonResponse({ access_token: 'fresh-token', refresh_token: 'rotated-refresh-xyz', expires_in: 3600 });
    return jsonResponse({ emailAddress: 'owner@example.com' });
  };
  const reader = createGmailInboundReader({ clientId: 'x', clientSecret: 'y', redirectUri: 'https://example.com/cb', allowNetwork: true, fetch: fakeFetch, accounts: store });
  await reader.getProfile(readerAccountFor(account), KEY);
  const stored = await store.readInboundAccount(account.id);
  const decrypted = openInboundTokens(stored.encryptedTokens, KEY);
  assert.equal(decrypted.refresh_token, 'rotated-refresh-xyz');
});

test('abort during refresh means the (still in-flight) token is never persisted', async () => {
  const store = await tempStore();
  const account = await approvedAccount(store);
  const controller = new AbortController();
  const fakeFetch = (url, options) => {
    if (String(url).includes('oauth2.googleapis.com')) {
      return new Promise((resolve, reject) => {
        options.signal?.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
      });
    }
    return Promise.resolve(jsonResponse({ emailAddress: 'owner@example.com' }));
  };
  const reader = createGmailInboundReader({ clientId: 'x', clientSecret: 'y', redirectUri: 'https://example.com/cb', allowNetwork: true, fetch: fakeFetch, accounts: store });
  setTimeout(() => controller.abort(), 20);
  await assert.rejects(() => reader.getProfile(readerAccountFor(account), KEY, { signal: controller.signal }));
  const stored = await store.readInboundAccount(account.id);
  assert.equal(stored.tokenVersion, 0, 'nothing was ever persisted for an aborted refresh');
});

test('an oversized/invalid token-endpoint response fails safely without persisting anything', async () => {
  const store = await tempStore();
  const account = await approvedAccount(store);
  const fakeFetch = async url => {
    if (String(url).includes('oauth2.googleapis.com')) return { ok: true, status: 200, headers: jsonHeaders(), text: async () => '{not valid json' };
    return jsonResponse({ emailAddress: 'owner@example.com' });
  };
  const reader = createGmailInboundReader({ clientId: 'x', clientSecret: 'y', redirectUri: 'https://example.com/cb', allowNetwork: true, fetch: fakeFetch, accounts: store });
  await assert.rejects(() => reader.getProfile(readerAccountFor(account), KEY), error => {
    assert.equal(error.code, 'gmail-inbound-invalid-json');
    return true;
  });
  const stored = await store.readInboundAccount(account.id);
  assert.equal(stored.tokenVersion, 0);
});

test('secret-free error paths: a failed token refresh never leaks token material in its error', async () => {
  const store = await tempStore();
  const account = await approvedAccount(store);
  const fakeFetch = async url => {
    if (String(url).includes('oauth2.googleapis.com')) return { ok: false, status: 401, headers: jsonHeaders(), text: async () => 'irrelevant' };
    return jsonResponse({ emailAddress: 'owner@example.com' });
  };
  const reader = createGmailInboundReader({ clientId: 'x', clientSecret: 'y', redirectUri: 'https://example.com/cb', allowNetwork: true, fetch: fakeFetch, accounts: store });
  await assert.rejects(() => reader.getProfile(readerAccountFor(account), KEY), error => {
    assert.ok(error instanceof GmailInboundError);
    const serialized = `${error.message} ${error.code} ${JSON.stringify(error)}`;
    assert.ok(!serialized.includes('refresh-abc'));
    assert.ok(!serialized.includes('expired-token'));
    return true;
  });
});
