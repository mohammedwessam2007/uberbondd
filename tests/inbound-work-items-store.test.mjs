import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { Store, PostgresStore } from '../src/store.mjs';
import { keyedHash, encryptJson } from '../src/crypto.mjs';

const KEY = 'b'.repeat(64);

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-work-items-'));
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

function sampleItem(overrides = {}) {
  return {
    messageKey: keyedHash(overrides.gmailId || 'gmail-1', KEY),
    accountKey: keyedHash('acct-1', KEY),
    threadKey: keyedHash('thread-1', KEY),
    encryptedProviderRef: encryptJson({ accountId: 'acct-1', gmailId: overrides.gmailId || 'gmail-1', threadId: 'thread-1' }, KEY),
    classificationCode: 'reply',
    confidenceBucket: 'high',
    prospectId: null,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    ...overrides
  };
}

test('createInboundWorkItem persists the keyed/encrypted shape, never the raw identifiers', async () => {
  const store = await tempStore();
  const created = await store.createInboundWorkItem(sampleItem());
  assert.equal(created.ok, true);
  const serialized = JSON.stringify(created.item);
  assert.ok(!serialized.includes('gmail-1'));
  assert.ok(!serialized.includes('thread-1'));
  assert.ok(!serialized.includes('acct-1'));
  assert.equal(created.item.classificationCode, 'reply');
  assert.equal(created.item.confidenceBucket, 'high');
});

test('duplicate messageKey is rejected -- durable dedupe by keyed hash', async () => {
  const store = await tempStore();
  const item = sampleItem();
  await store.createInboundWorkItem(item);
  const second = await store.createInboundWorkItem(item);
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'duplicate-message');
});

test('missing messageKey is rejected up front', async () => {
  const store = await tempStore();
  const result = await store.createInboundWorkItem({ ...sampleItem(), messageKey: '' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing-message-key');
});

test('findInboundWorkItemByMessageKey supports the dedupe lookup pattern classify-and-suppress relies on', async () => {
  const store = await tempStore();
  const messageKey = keyedHash('gmail-2', KEY);
  assert.equal(await store.findInboundWorkItemByMessageKey(messageKey), null);
  await store.createInboundWorkItem(sampleItem({ gmailId: 'gmail-2' }));
  const found = await store.findInboundWorkItemByMessageKey(messageKey);
  assert.ok(found);
  assert.equal(found.messageKey, messageKey);
});

test('PRIV-06: deleteExpiredInboundWorkItems enforces the retention TTL', async () => {
  const store = await tempStore();
  await store.createInboundWorkItem(sampleItem({ gmailId: 'expired', expiresAt: new Date(Date.now() - 1000).toISOString() }));
  await store.createInboundWorkItem(sampleItem({ gmailId: 'fresh', expiresAt: new Date(Date.now() + 86400000).toISOString() }));
  const swept = await store.deleteExpiredInboundWorkItems();
  assert.equal(swept.ok, true);
  assert.equal(swept.deleted, 1);
  const remaining = await store.list('inboundWorkItems');
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].messageKey, keyedHash('fresh', KEY));
});

test('STORE-06: generic add/upsert/patch reject inboundWorkItems on the JSON backend', async () => {
  const store = await tempStore();
  const created = await store.createInboundWorkItem(sampleItem());
  await assert.rejects(store.add('inboundWorkItems', sampleItem({ gmailId: 'gmail-x' })), { code: 'PROTECTED_COLLECTION' });
  await assert.rejects(store.upsert('inboundWorkItems', { id: created.item.id, ...sampleItem() }), { code: 'PROTECTED_COLLECTION' });
  await assert.rejects(store.patch('inboundWorkItems', created.item.id, { classificationCode: 'bounce' }), { code: 'PROTECTED_COLLECTION' });
  const unchanged = await store.get('inboundWorkItems', created.item.id);
  assert.equal(unchanged.classificationCode, 'reply');
});

test('STORE-06: generic add/upsert/patch reject inboundWorkItems on the PostgreSQL backend', async () => {
  const { db, store } = await tempPostgresStore();
  try {
    const created = await store.createInboundWorkItem(sampleItem());
    assert.equal(created.ok, true);
    await assert.rejects(store.add('inboundWorkItems', sampleItem({ gmailId: 'pg-gmail-x' })), { code: 'PROTECTED_COLLECTION' });
    await assert.rejects(store.patch('inboundWorkItems', created.item.id, { classificationCode: 'bounce' }), { code: 'PROTECTED_COLLECTION' });
    const unchanged = await store.get('inboundWorkItems', created.item.id);
    assert.equal(unchanged.classificationCode, 'reply');
  } finally { await db.close(); }
});

test('duplicate messageKey is rejected on the real PostgreSQL backend too (unique index, not just app logic)', async () => {
  const { db, store } = await tempPostgresStore();
  try {
    const item = sampleItem();
    const first = await store.createInboundWorkItem(item);
    assert.equal(first.ok, true);
    const second = await store.createInboundWorkItem(item);
    assert.equal(second.ok, false);
    assert.equal(second.reason, 'duplicate-message');
  } finally { await db.close(); }
});
