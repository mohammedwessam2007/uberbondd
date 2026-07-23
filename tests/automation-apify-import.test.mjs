import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { mapApifyItem, importApifyExport, parseApifyExport, pollApifyTask, ApifyImportError } from '../src/automation/apify-import.mjs';

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-apify-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

const cfg = { baseUrl: 'http://localhost:8080', discovery: {} };

test('mapApifyItem maps common Apify business-scraper fields with source attribution', () => {
  const mapped = mapApifyItem({ title: 'Acme HVAC', website: 'https://acmehvac.example.com', categoryName: 'HVAC contractor', city: 'Phoenix', countryCode: 'US', placeId: 'abc123' }, 'camp_1');
  assert.equal(mapped.company, 'Acme HVAC');
  assert.equal(mapped.sourceProvider, 'apify');
  assert.equal(mapped.sourceRecordId, 'abc123');
  assert.equal(mapped.campaignId, 'camp_1');
  assert(mapped.sourceAttribution.length > 0);
});

test('a JSON dataset export imports and deduplicates through the existing prospect-import pipeline', async () => {
  const store = await tempStore();
  const items = JSON.stringify([
    { title: 'Acme HVAC', website: 'https://acmehvac.example.com', placeId: 'p1' },
    { title: 'Acme HVAC dup', website: 'https://acmehvac.example.com', placeId: 'p1' }
  ]);
  const result = await importApifyExport(store, cfg, items, 'camp_1');
  assert.equal(result.added.length, 1);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].reason, 'duplicate_campaign_domain');
});

test('a CSV dataset export imports the same way', async () => {
  const store = await tempStore();
  const csv = 'title,website,placeId\nBeta HVAC,https://betahvac.example.com,p2\n';
  const result = await importApifyExport(store, cfg, csv, 'camp_1', { format: 'csv' });
  assert.equal(result.added.length, 1);
  assert.equal(result.added[0].sourceProvider, 'apify');
});

test('malformed JSON export fails closed instead of importing garbage', () => {
  assert.throws(() => parseApifyExport('not json', 'json'), ApifyImportError);
  assert.throws(() => parseApifyExport('{"not":"an array"}', 'json'), ApifyImportError);
});

test('scheduled polling refuses to run unless explicitly enabled with credentials', async () => {
  const store = await tempStore();
  await assert.rejects(pollApifyTask(store, { apify: { enabled: false } }, 'camp_1', {}), ApifyImportError);
  await assert.rejects(pollApifyTask(store, { apify: { enabled: true } }, 'camp_1', {}), ApifyImportError);
  await assert.rejects(
    pollApifyTask(store, { apify: { enabled: true, token: 't', taskId: 'x' } }, 'camp_1', {}),
    /apify-fetcher-not-provided/
  );
});

test('scheduled polling with an injected fetcher never performs real network I/O and still imports', async () => {
  const store = await tempStore();
  const fetchDatasetItems = async () => [{ title: 'Gamma HVAC', website: 'https://gammahvac.example.com', placeId: 'p3' }];
  const result = await pollApifyTask(store, { ...cfg, apify: { enabled: true, token: 't', taskId: 'x' } }, 'camp_1', { fetchDatasetItems });
  assert.equal(result.added.length, 1);
});
