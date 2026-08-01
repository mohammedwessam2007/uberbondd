import test from 'node:test';
import assert from 'node:assert/strict';
import { JsonStore } from '../src/store.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

async function makeStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'canon-cost-ledger-'));
  const store = new JsonStore(dir);
  await store.init();
  return store;
}

test('P1-010 acceptance: concurrent reservations cannot exceed the daily budget', async () => {
  const store = await makeStore();
  const attempts = Array.from({ length: 20 }, () => store.reserveCostBudget('2026-08-01', 'model', 100, 500));
  const results = await Promise.all(attempts);
  const succeeded = results.filter(r => r.ok);
  const failed = results.filter(r => !r.ok);
  assert.equal(succeeded.length, 5); // 5 * 100 = 500 budget, exactly exhausted
  assert.equal(failed.length, 15);
  assert.ok(failed.every(r => r.reason === 'budget-exceeded'));
  const entries = await store.list('costLedgerEntries');
  assert.equal(entries.length, 1);
  assert.equal(entries[0].reservedCents, 500);
});

test('separate categories and dates have independent budgets', async () => {
  const store = await makeStore();
  const model = await store.reserveCostBudget('2026-08-01', 'model', 400, 500);
  const infra = await store.reserveCostBudget('2026-08-01', 'infra', 400, 500);
  const nextDay = await store.reserveCostBudget('2026-08-02', 'model', 400, 500);
  assert.equal(model.ok, true);
  assert.equal(infra.ok, true);
  assert.equal(nextDay.ok, true);
  const entries = await store.list('costLedgerEntries');
  assert.equal(entries.length, 3);
});

test('a single reservation exceeding the whole budget is rejected without partial reservation', async () => {
  const store = await makeStore();
  const result = await store.reserveCostBudget('2026-08-01', 'model', 600, 500);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'budget-exceeded');
  const entries = await store.list('costLedgerEntries');
  assert.equal(entries.length, 0);
});
