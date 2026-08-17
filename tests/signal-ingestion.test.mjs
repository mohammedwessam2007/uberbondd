import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { ingestSignals } from '../src/signal-ingestion.mjs';

const monday = new Date('2026-07-13T10:00:00.000Z');

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-ingestion-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

function fixture(overrides = {}) {
  return {
    sourceAdapter: 'test-adapter', sourceKind: 'WEB_PAGE', entityType: 'PRODUCT',
    entityIdentity: 'https://example.com/pricing', signalType: 'PRICE_CHANGE',
    observedAt: '2026-07-13T09:00:00.000Z', payload: { price: 49 },
    evidenceClass: 'SYNTHETIC_TEST_FIXTURE',
    ...overrides
  };
}

test('malformed store is denied cleanly, never throws', async () => {
  const result = await ingestSignals({ store: null, signals: [fixture()], date: monday });
  assert.equal(result.ok, false);
});

test('a batch of valid signals is fully accepted and produces an audit receipt per signal', async () => {
  const store = await tempStore();
  const result = await ingestSignals({ store, signals: [fixture({ entityIdentity: 'a' }), fixture({ entityIdentity: 'b' })], date: monday });
  assert.equal(result.ok, true);
  assert.equal(result.counts.accepted, 2);
  const receipts = await store.list('auditLog', { filters: { type: 'market_signal_ingested' } });
  assert.equal(receipts.length, 2);
});

test('malformed signals in a batch are rejected individually without aborting the rest', async () => {
  const store = await tempStore();
  const result = await ingestSignals({ store, signals: [fixture(), { garbage: true }, fixture({ entityIdentity: 'other' })], date: monday });
  assert.equal(result.counts.accepted, 2);
  assert.equal(result.counts.rejected, 1);
});

test('duplicate signals within the same batch are deduped, only the first is accepted', async () => {
  const store = await tempStore();
  const result = await ingestSignals({ store, signals: [fixture(), fixture()], date: monday });
  assert.equal(result.counts.accepted, 1);
  assert.equal(result.counts.duplicates, 1);
});

test('re-ingesting an identical batch across two runs is fully idempotent -- zero new accepted', async () => {
  const store = await tempStore();
  const first = await ingestSignals({ store, signals: [fixture()], date: monday });
  assert.equal(first.counts.accepted, 1);
  const second = await ingestSignals({ store, signals: [fixture()], date: new Date(monday.getTime() + 60_000) });
  assert.equal(second.counts.accepted, 0);
  assert.equal(second.counts.duplicates, 1);
  const receipts = await store.list('auditLog', { filters: { type: 'market_signal_ingested' } });
  assert.equal(receipts.length, 1, 'a replayed batch must never create a second receipt for the same fact');
});

test('contradictory signals (same entity, different payload) both get ingested -- they must coexist, not overwrite', async () => {
  const store = await tempStore();
  const result = await ingestSignals({
    store, signals: [fixture({ payload: { price: 49 } }), fixture({ payload: { price: 99 } })], date: monday
  });
  assert.equal(result.counts.accepted, 2);
});

test('stale signals are flagged but still accepted (visibility, not silent loss)', async () => {
  const store = await tempStore();
  const result = await ingestSignals({
    store, signals: [fixture({ observedAt: '2026-01-01T00:00:00.000Z' })], date: monday, staleAfterMs: 24 * 3600_000
  });
  assert.equal(result.counts.accepted, 1);
  assert.equal(result.counts.stale, 1);
});

test('an empty signals array produces a well-formed empty result, not an error', async () => {
  const store = await tempStore();
  const result = await ingestSignals({ store, signals: [], date: monday });
  assert.equal(result.ok, true);
  assert.deepEqual(result.counts, { accepted: 0, duplicates: 0, rejected: 0, stale: 0 });
});

test('the lookback window bounds cross-run dedupe cost -- explicit, not silently unlimited', async () => {
  const store = await tempStore();
  await ingestSignals({ store, signals: [fixture({ entityIdentity: 'old-one' })], date: monday });
  const result = await ingestSignals({ store, signals: [fixture({ entityIdentity: 'old-one' })], date: monday, lookbackLimit: 0 });
  assert.equal(result.counts.accepted, 1, 'with lookbackLimit 0, no history is consulted so the "duplicate" is re-accepted -- an explicit, documented tradeoff, not a silent bug');
});

test('SYNTHETIC_TEST_FIXTURE evidence class survives ingestion unchanged -- never silently promoted', async () => {
  const store = await tempStore();
  const result = await ingestSignals({ store, signals: [fixture()], date: monday });
  assert.equal(result.accepted[0].evidenceClass, 'SYNTHETIC_TEST_FIXTURE');
});
