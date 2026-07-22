import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { Store, PostgresStore } from '../src/store.mjs';
import { encryptJson } from '../src/crypto.mjs';

const KEY = Buffer.alloc(32, 9).toString('hex');

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-inbound-accounts-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

async function tempPostgresStore() {
  const db = new PGlite();
  const migrations = (await fs.readdir(new URL('../migrations/', import.meta.url))).filter(name => name.endsWith('.sql')).sort();
  for (const migration of migrations) await db.exec(await fs.readFile(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
  const client = { query: (...args) => db.query(...args), release() {} };
  const pool = { query: (...args) => db.query(...args), connect: async () => client };
  return { db, store: new PostgresStore({ pool }) };
}

function fakeTokens() {
  return encryptJson({ access_token: 'live-token', refresh_token: 'refresh-token', expires_at: Date.now() + 3600000 }, KEY);
}

test('createInboundAccount defaults to pending/inactive unless explicitly created approved', async () => {
  const store = await tempStore();
  const result = await store.createInboundAccount({ provider: 'gmail', accountIdentity: 'owner@example.com', encryptedTokens: fakeTokens() });
  assert.equal(result.ok, true);
  assert.equal(result.account.approvalStatus, 'pending');
  assert.equal(result.account.active, false);
  assert.equal(result.account.tokenVersion, 0);
  const approved = await (await tempStore()).createInboundAccount({ provider: 'gmail', accountIdentity: 'owner2@example.com', approvalStatus: 'approved', active: true, encryptedTokens: fakeTokens() });
  assert.equal(approved.account.approvalStatus, 'approved');
  assert.equal(approved.account.active, true);
});

test('duplicate (provider, accountIdentity) is rejected', async () => {
  const store = await tempStore();
  await store.createInboundAccount({ provider: 'gmail', accountIdentity: 'dup@example.com', encryptedTokens: fakeTokens() });
  const second = await store.createInboundAccount({ provider: 'gmail', accountIdentity: 'dup@example.com', encryptedTokens: fakeTokens() });
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'duplicate-account');
});

test('missing account identity is rejected up front', async () => {
  const store = await tempStore();
  const result = await store.createInboundAccount({ provider: 'gmail', encryptedTokens: fakeTokens() });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing-account-identity');
});

test('listApprovedActiveInboundAccounts returns only approved+active accounts', async () => {
  const store = await tempStore();
  await store.createInboundAccount({ provider: 'gmail', accountIdentity: 'pending@example.com', encryptedTokens: fakeTokens() });
  await store.createInboundAccount({ provider: 'gmail', accountIdentity: 'approved@example.com', approvalStatus: 'approved', active: true, encryptedTokens: fakeTokens() });
  const inactive = await store.createInboundAccount({ provider: 'gmail', accountIdentity: 'inactive@example.com', approvalStatus: 'approved', active: true, encryptedTokens: fakeTokens() });
  await store.disableInboundAccount(inactive.account.id);
  const list = await store.listApprovedActiveInboundAccounts();
  assert.equal(list.length, 1);
  assert.equal(list[0].accountIdentity, 'approved@example.com');
});

test('STORE-05: generic add/upsert/patch reject inboundAccounts on the JSON backend', async () => {
  const store = await tempStore();
  const created = await store.createInboundAccount({ provider: 'gmail', accountIdentity: 'guarded@example.com', approvalStatus: 'approved', active: true, encryptedTokens: fakeTokens() });
  await assert.rejects(store.add('inboundAccounts', { id: 'x', provider: 'gmail', accountIdentity: 'x@example.com' }), { code: 'PROTECTED_COLLECTION' });
  await assert.rejects(store.upsert('inboundAccounts', { id: created.account.id, provider: 'gmail', accountIdentity: 'guarded@example.com', active: false }), { code: 'PROTECTED_COLLECTION' });
  await assert.rejects(store.patch('inboundAccounts', created.account.id, { active: false }), { code: 'PROTECTED_COLLECTION' });
  const unchanged = await store.readInboundAccount(created.account.id);
  assert.equal(unchanged.active, true);
});

test('STORE-05: generic add/upsert/patch reject inboundAccounts on the PostgreSQL backend', async () => {
  const { db, store } = await tempPostgresStore();
  try {
    const created = await store.createInboundAccount({ provider: 'gmail', accountIdentity: 'pg-guarded@example.com', approvalStatus: 'approved', active: true, encryptedTokens: fakeTokens() });
    assert.equal(created.ok, true);
    await assert.rejects(store.add('inboundAccounts', { id: 'pg-x', provider: 'gmail', accountIdentity: 'pg-x@example.com' }), { code: 'PROTECTED_COLLECTION' });
    await assert.rejects(store.patch('inboundAccounts', created.account.id, { active: false }), { code: 'PROTECTED_COLLECTION' });
    const unchanged = await store.readInboundAccount(created.account.id);
    assert.equal(unchanged.active, true);
  } finally { await db.close(); }
});

test('GM-07/09: token CAS -- one refresh persists, a stale expected version is rejected', async () => {
  const store = await tempStore();
  const created = await store.createInboundAccount({ provider: 'gmail', accountIdentity: 'cas@example.com', approvalStatus: 'approved', active: true, encryptedTokens: fakeTokens() });
  const refreshed = await store.replaceInboundAccountTokenCAS({ accountId: created.account.id, expectedVersion: 0, encryptedTokens: fakeTokens(), tokenExpiresAt: new Date().toISOString() });
  assert.equal(refreshed.ok, true);
  assert.equal(refreshed.account.tokenVersion, 1);
  const stale = await store.replaceInboundAccountTokenCAS({ accountId: created.account.id, expectedVersion: 0, encryptedTokens: fakeTokens() });
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, 'version-conflict');
  const current = await store.readInboundAccount(created.account.id);
  assert.equal(current.tokenVersion, 1);
});

test('GM-09: concurrent refresh CAS -- exactly one winner, real PostgreSQL', async () => {
  const { db, store } = await tempPostgresStore();
  try {
    const created = await store.createInboundAccount({ provider: 'gmail', accountIdentity: 'pg-concurrent@example.com', approvalStatus: 'approved', active: true, encryptedTokens: fakeTokens() });
    const [first, second] = await Promise.all([
      store.replaceInboundAccountTokenCAS({ accountId: created.account.id, expectedVersion: 0, encryptedTokens: fakeTokens() }),
      store.replaceInboundAccountTokenCAS({ accountId: created.account.id, expectedVersion: 0, encryptedTokens: fakeTokens() })
    ]);
    const outcomes = [first, second];
    assert.equal(outcomes.filter(r => r.ok).length, 1);
    assert.equal(outcomes.filter(r => !r.ok && r.reason === 'version-conflict').length, 1);
    const finalAccount = await store.readInboundAccount(created.account.id);
    assert.equal(finalAccount.tokenVersion, 1, 'version must advance exactly once, not twice');
  } finally { await db.close(); }
});

test('disableInboundAccount revokes approval and clears active, and the account drops out of the approved-active list', async () => {
  const store = await tempStore();
  const created = await store.createInboundAccount({ provider: 'gmail', accountIdentity: 'revoke@example.com', approvalStatus: 'approved', active: true, encryptedTokens: fakeTokens() });
  assert.equal((await store.listApprovedActiveInboundAccounts()).length, 1);
  const disabled = await store.disableInboundAccount(created.account.id);
  assert.equal(disabled.ok, true);
  assert.equal(disabled.account.active, false);
  assert.equal(disabled.account.approvalStatus, 'revoked');
  assert.equal((await store.listApprovedActiveInboundAccounts()).length, 0);
});

test('readInboundAccount / replaceInboundAccountTokenCAS on a missing account is reported, not thrown', async () => {
  const store = await tempStore();
  assert.equal(await store.readInboundAccount('nope'), null);
  const result = await store.replaceInboundAccountTokenCAS({ accountId: 'nope', expectedVersion: 0, encryptedTokens: fakeTokens() });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'not-found');
});

test('token material never appears as plaintext anywhere in a created/refreshed account record', async () => {
  const store = await tempStore();
  const created = await store.createInboundAccount({ provider: 'gmail', accountIdentity: 'secret@example.com', approvalStatus: 'approved', active: true, encryptedTokens: fakeTokens() });
  const serialized = JSON.stringify(created.account);
  assert.ok(!serialized.includes('live-token'));
  assert.ok(!serialized.includes('refresh-token'));
  const refreshed = await store.replaceInboundAccountTokenCAS({ accountId: created.account.id, expectedVersion: 0, encryptedTokens: fakeTokens() });
  assert.ok(!JSON.stringify(refreshed.account).includes('live-token'));
});
