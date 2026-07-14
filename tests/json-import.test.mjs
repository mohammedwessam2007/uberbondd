import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { importJsonDatabase } from '../src/json-import.mjs';

test('JSON import validates, writes, and reruns idempotently', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-import-'));
  const source = path.join(dir, 'source.json');
  await fs.writeFile(source, JSON.stringify({
    version: 4,
    campaigns: [{ id: 'c1', name: 'Campaign', approved: true, autoSend: false }],
    prospects: [{ id: 'p1', domain: 'example.com', website: 'https://example.com', campaignId: 'c1', status: 'queued' }],
    settings: { globalPause: false }
  }));
  const store = new Store(path.join(dir, 'store'));
  await store.init();
  const first = await importJsonDatabase(store, source);
  assert.equal(first.totals.written, 3);
  const second = await importJsonDatabase(store, source);
  assert.equal(second.totals.updated, 2);
  assert.equal(second.settings.written, 1);
  assert.equal(await store.count('prospects'), 1);
});

test('JSON import dry run performs no writes', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-import-dry-'));
  const source = path.join(dir, 'source.json');
  await fs.writeFile(source, JSON.stringify({ prospects: [{ id: 'p1', domain: 'example.com', website: 'https://example.com' }], settings: {} }));
  const store = new Store(path.join(dir, 'store'));
  await store.init();
  const report = await importJsonDatabase(store, source, { dryRun: true });
  assert.equal(report.dryRun, true);
  assert.equal(await store.count('prospects'), 0);
});
