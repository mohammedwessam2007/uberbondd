import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { recordCommercialMemory, queryCommercialMemory, detectContradictions } from '../src/commercial-memory.mjs';

const monday = new Date('2026-07-13T10:00:00.000Z');

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-memory-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

test('recording without a hypothesis is rejected cleanly', async () => {
  const store = await tempStore();
  const result = await recordCommercialMemory(store, { date: monday });
  assert.equal(result.ok, false);
});

test('a recorded memory round-trips through query by hypothesis', async () => {
  const store = await tempStore();
  await recordCommercialMemory(store, { hypothesis: 'H1', outcomeType: 'CLEARED_PAYMENT', context: { segment: 'clinics' }, date: monday });
  const results = await queryCommercialMemory(store, { hypothesis: 'H1' });
  assert.equal(results.length, 1);
  assert.equal(results[0].outcomeType, 'CLEARED_PAYMENT');
});

test('query filters by segment and channel from context, not just hypothesis', async () => {
  const store = await tempStore();
  await recordCommercialMemory(store, { hypothesis: 'H1', context: { segment: 'clinics', channel: 'seo' }, outcomeType: 'CLEARED_PAYMENT', date: monday });
  await recordCommercialMemory(store, { hypothesis: 'H1', context: { segment: 'dentists', channel: 'seo' }, outcomeType: 'CLEARED_PAYMENT', date: monday });
  const results = await queryCommercialMemory(store, { hypothesis: 'H1', segment: 'clinics' });
  assert.equal(results.length, 1);
  assert.equal(results[0].context.segment, 'clinics');
});

test('queryCommercialMemory on a malformed store returns an empty array, never throws', async () => {
  const results = await queryCommercialMemory(null, { hypothesis: 'H1' });
  assert.deepEqual(results, []);
});

test('detectContradictions is silent when all outcomes for a hypothesis agree', () => {
  const contradictions = detectContradictions([
    { hypothesis: 'H1', outcomeType: 'CLEARED_PAYMENT' },
    { hypothesis: 'H1', outcomeType: 'ACCEPTED_DELIVERY' }
  ]);
  assert.equal(contradictions.length, 0);
});

test('detectContradictions flags a hypothesis with both positive and negative real outcomes', () => {
  const contradictions = detectContradictions([
    { hypothesis: 'H1', outcomeType: 'CLEARED_PAYMENT' },
    { hypothesis: 'H1', outcomeType: 'REFUND_OR_DISPUTE' }
  ]);
  assert.equal(contradictions.length, 1);
  assert.equal(contradictions[0].hypothesis, 'H1');
  assert.equal(contradictions[0].records.length, 2);
});

test('a single lucky outcome never becomes universal doctrine -- one record alone is never a contradiction and is honestly a thin sample', () => {
  const contradictions = detectContradictions([{ hypothesis: 'H1', outcomeType: 'CLEARED_PAYMENT' }]);
  assert.equal(contradictions.length, 0);
});

test('records with no outcomeType are ignored by contradiction detection', () => {
  const contradictions = detectContradictions([{ hypothesis: 'H1' }, { hypothesis: 'H1', outcomeType: 'CLEARED_PAYMENT' }]);
  assert.equal(contradictions.length, 0);
});

test('different hypotheses never contaminate each other\'s contradiction detection', () => {
  const contradictions = detectContradictions([
    { hypothesis: 'H1', outcomeType: 'CLEARED_PAYMENT' },
    { hypothesis: 'H2', outcomeType: 'REFUND_OR_DISPUTE' }
  ]);
  assert.equal(contradictions.length, 0);
});
