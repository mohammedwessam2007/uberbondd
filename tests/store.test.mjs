import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store, ConflictError } from '../src/store.mjs';

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-store-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

test('JSON repository is asynchronous and transaction rollback is atomic', async () => {
  const store = await tempStore();
  await assert.rejects(
    store.transaction(async tx => {
      await tx.add('campaigns', { id: 'camp_1', name: 'One', approved: true, autoSend: false, createdAt: new Date().toISOString() });
      throw new Error('rollback');
    }),
    /rollback/
  );
  assert.equal(await store.count('campaigns'), 0);
});

test('JSON repository enforces domain, suppression, reply, payment and slot uniqueness', async () => {
  const store = await tempStore();
  await store.add('prospects', { id: 'p1', domain: 'example.com', website: 'https://example.com', status: 'queued' });
  await assert.rejects(store.add('prospects', { id: 'p2', domain: 'example.com', website: 'https://example.com/x', status: 'queued' }), ConflictError);
  await store.add('suppressions', { id: 's1', value: 'no@example.com' });
  await assert.rejects(store.add('suppressions', { id: 's2', value: 'NO@example.com' }), ConflictError);
  await store.add('replies', { id: 'r1', gmailId: 'gmail-1' });
  await assert.rejects(store.add('replies', { id: 'r2', gmailId: 'gmail-1' }), ConflictError);
  await store.add('accounts', { id: 'a1', slot: 'A' });
  await assert.rejects(store.add('accounts', { id: 'a2', slot: 'A' }), ConflictError);
  await store.add('orders', { id: 'o1', providerEventId: 'evt-1' });
  await assert.rejects(store.add('orders', { id: 'o2', providerEventId: 'evt-1' }), ConflictError);
  await store.add('offers', { id: 'offer-1', prospectId: 'p1', type: 'diagnostic', currency: 'usd', status: 'draft' });
  await assert.rejects(store.add('offers', { id: 'offer-2', prospectId: 'p1', type: 'diagnostic', currency: 'USD', status: 'draft' }), ConflictError);
  assert.equal((await store.get('offers', 'offer-1')).currency, 'USD');
  await store.add('deliveries', { id: 'delivery-1', orderId: 'o1', prospectId: 'p1', status: 'delivery-queued' });
  await assert.rejects(store.add('deliveries', { id: 'delivery-2', orderId: 'o1', prospectId: 'p1', status: 'delivery-queued' }), ConflictError);
});

test('JSON repository transaction can create circular lead/prospect pair safely', async () => {
  const store = await tempStore();
  await store.add('campaigns', { id: 'camp', approved: true, autoSend: false });
  await store.transaction(async tx => {
    await tx.add('leads', { id: 'lead', prospectId: 'pros', status: 'queued' });
    await tx.add('prospects', { id: 'pros', domain: 'pair.test', website: 'https://pair.test', campaignId: 'camp', leadId: 'lead', status: 'queued' });
  });
  assert.equal((await store.get('leads', 'lead')).prospectId, 'pros');
  assert.equal((await store.get('prospects', 'pros')).leadId, 'lead');
});

test('targeted prospect claiming does not consume an unrelated queued prospect', async () => {
  const store = await tempStore();
  await store.add('prospects', { id: 'old', domain: 'old.test', website: 'https://old.test', status: 'queued', createdAt: '2026-01-01T00:00:00.000Z' });
  await store.add('prospects', { id: 'target', domain: 'target.test', website: 'https://target.test', status: 'queued', createdAt: '2026-02-01T00:00:00.000Z' });
  const claimed = await store.claimProspect('target');
  assert.equal(claimed.id, 'target');
  assert.equal((await store.get('prospects', 'target')).status, 'claimed');
  assert.equal((await store.get('prospects', 'old')).status, 'queued');
});

test('prospect claiming respects deferred crawl timestamps', async () => {
  const store = await tempStore();
  await store.add('prospects', { id: 'future', domain: 'future.test', website: 'https://future.test', status: 'retry', nextCrawlAt: '2999-01-01T00:00:00.000Z' });
  await store.add('prospects', { id: 'due', domain: 'due.test', website: 'https://due.test', status: 'retry', nextCrawlAt: '2020-01-01T00:00:00.000Z' });
  const claimed = await store.claimProspects(10);
  assert.deepEqual(claimed.map(item => item.id), ['due']);
  assert.equal(await store.claimProspect('future'), null);
  assert.equal((await store.get('prospects', 'future')).status, 'retry');
});
