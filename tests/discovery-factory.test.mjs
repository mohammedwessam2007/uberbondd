import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DiscoveryRunner } from '../src/discovery-runner.mjs';
import { importProspects } from '../src/prospect-import.mjs';
import { Store } from '../src/store.mjs';

const date = '2026-07-18T03:00:00.000Z';
const point = (id, name, website, lat = 25.2, lon = 55.3) => ({
  type: 'node', id, lat, lon, tags: { name, amenity: 'clinic', website }
});

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-discovery-factory-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

function testConfig(overrides = {}) {
  return {
    nodeEnv: 'test',
    baseUrl: 'https://control.example.net',
    maxBatch: 25,
    discovery: {
      enabled: true,
      dryRun: false,
      endpoint: 'https://overpass.example.com/api/interpreter',
      campaignId: '',
      bbox: '',
      categories: ['clinic'],
      country: '',
      city: '',
      dailyCap: 100,
      batchesPerRun: 1,
      maxCampaignsPerRun: 10,
      timeoutMs: 1000,
      maxBboxSpan: 5,
      excludedDomains: ['control.example.net'],
      allowReservedDomains: false,
      userAgent: 'UberBondFactoryTest/1.0',
      ...overrides
    }
  };
}

function campaign(id = 'campaign-a', overrides = {}) {
  return {
    id,
    campaignId: id,
    name: 'Discovery campaign',
    approved: true,
    enabled: true,
    dryRun: true,
    countries: ['AE', 'GB'],
    cities: ['Dubai', 'London'],
    boundingBoxes: [[25.05, 54.9, 25.35, 55.55], [51.28, -0.51, 51.69, 0.33]],
    discoveryCategories: ['clinic'],
    dailyDiscoveryCap: 100,
    ...overrides
  };
}

test('prospect imports enforce public websites and retry-safe campaign/source/domain deduplication', async () => {
  const store = await tempStore();
  const config = testConfig();
  const first = await importProspects(store, config, [
    { company: 'Atlas Clinic', website: 'https://atlas.example.com', campaignId: 'campaign-a', sourceProvider: 'openstreetmap-overpass', sourceRecordId: 'node/1' },
    { company: 'Atlas Duplicate', website: 'https://www.atlas.example.com/care', campaignId: 'campaign-a', sourceProvider: 'openstreetmap-overpass', sourceRecordId: 'node/2' },
    { company: 'Directory Listing', website: 'https://linkedin.com/company/atlas', campaignId: 'campaign-a' },
    { company: 'Metadata Target', website: 'http://169.254.169.254/latest/meta-data', campaignId: 'campaign-a' }
  ]);
  assert.equal(first.added.length, 1);
  assert.deepEqual(first.skipped.map(item => item.reason), [
    'duplicate_campaign_domain', 'directory_or_social_profile', 'private_or_internal_website'
  ]);
  assert.equal(first.added[0].campaignDomainKey, 'campaign-a:atlas.example.com');
  assert.equal(first.added[0].crawlQueueStatus, 'queued');

  const sameCampaign = await importProspects(store, config, [
    { company: 'Atlas Again', website: 'https://atlas.example.com/new', campaignId: 'campaign-a' }
  ]);
  assert.equal(sameCampaign.skipped[0].reason, 'duplicate_campaign_domain');
  assert.equal(sameCampaign.existing[0].id, first.added[0].id);

  const sameSource = await importProspects(store, config, [
    { company: 'Atlas Changed URL', website: 'https://changed.example.com', campaignId: 'campaign-a', sourceProvider: 'openstreetmap-overpass', sourceRecordId: 'node/1' }
  ]);
  assert.equal(sameSource.skipped[0].reason, 'duplicate_source_record');

  const otherCampaign = await importProspects(store, config, [
    { company: 'Atlas Other Campaign', website: 'https://atlas.example.com', campaignId: 'campaign-b' }
  ]);
  assert.equal(otherCampaign.skipped[0].reason, 'duplicate_domain');
  assert.equal(await store.count('prospects'), 1);
});

test('campaign discovery resumes across bounding-box batches and queues only stored prospect ids', async () => {
  const store = await tempStore();
  await store.add('campaigns', campaign());
  const payloads = [
    { elements: [
      point(1, 'Atlas Clinic', 'https://atlas.example.com'),
      point(2, 'Directory Only', 'https://instagram.com/atlas')
    ] },
    { elements: [
      point(3, 'London Clinic', 'https://london.example.com', 51.5, -0.1),
      point(4, 'Atlas Duplicate', 'https://www.atlas.example.com/other', 51.51, -0.11)
    ] },
    { elements: [point(1, 'Atlas Clinic', 'https://atlas.example.com')] }
  ];
  let fetchIndex = 0;
  const fetcher = async () => ({ ok: true, status: 200, json: async () => payloads[fetchIndex++] });
  const queued = [];
  const enqueueResearch = async payload => {
    queued.push(payload);
    return { id: `job-${queued.length}` };
  };
  const runner = new DiscoveryRunner(store, testConfig(), {
    fetcher,
    enqueueResearch,
    clock: () => new Date(date)
  });

  const first = await runner.run({ campaignId: 'campaign-a', dryRun: false, maxBatches: 1, limit: 10 });
  assert.equal(first.startCursor, 0);
  assert.equal(first.nextCursor, 1);
  assert.equal(first.importedCount, 1);
  assert.equal(first.queuedCount, 1);
  assert.deepEqual(first.rejectionSummary, { directory_or_social_profile: 1 });
  assert.equal(queued[0].prospectIds.length, 1);
  assert.match(queued[0].dedupeKey, /^research:discovery:campaign-a:2026-07-18:/);

  const second = await runner.run({ campaignId: 'campaign-a', dryRun: false, maxBatches: 1, limit: 10 });
  assert.equal(second.startCursor, 1);
  assert.equal(second.nextCursor, 0);
  assert.equal(second.importedCount, 1);
  assert.equal(second.skippedCount, 1);
  assert.equal(await store.count('prospects'), 2);
  assert.equal(queued[1].prospectIds.length, 2);
  const settingsAfterImport = await store.getSettings();
  assert.equal(settingsAfterImport['discoveryCursor:campaign-a'].nextBatchIndex, 0);

  const preview = await runner.run({ campaignId: 'campaign-a', dryRun: true, cursor: 0, maxBatches: 1, limit: 10 });
  assert.equal(preview.dryRun, true);
  assert.equal(preview.importedCount, 0);
  assert.equal(await store.count('prospects'), 2);
  const settingsAfterPreview = await store.getSettings();
  assert.equal(settingsAfterPreview['discoveryCursor:campaign-a'].nextBatchIndex, 0);
});

test('capacity reservations enforce both global and campaign daily ceilings', async () => {
  const store = await tempStore();
  await store.add('discoveryRuns', { id: 'run-a', runDate: '2026-07-18', campaignId: 'campaign-a', status: 'running', importedCount: 0 });
  assert.equal(await store.reserveDiscoveryCapacity('2026-07-18', 3, 3, 'run-a', { campaignId: 'campaign-a', campaignCap: 2 }), 2);
  await store.add('discoveryRuns', { id: 'run-b', runDate: '2026-07-18', campaignId: 'campaign-b', status: 'running', importedCount: 0 });
  assert.equal(await store.reserveDiscoveryCapacity('2026-07-18', 3, 3, 'run-b', { campaignId: 'campaign-b', campaignCap: 2 }), 1);
  await store.add('discoveryRuns', { id: 'run-c', runDate: '2026-07-18', campaignId: 'campaign-a', status: 'running', importedCount: 0 });
  assert.equal(await store.reserveDiscoveryCapacity('2026-07-18', 3, 1, 'run-c', { campaignId: 'campaign-a', campaignCap: 2 }), 0);
});

test('scheduled discovery selects enabled campaign configurations and ignores disabled ones', async () => {
  const store = await tempStore();
  await store.add('campaigns', campaign('enabled-campaign', { boundingBoxes: [[25.05, 54.9, 25.35, 55.55]], countries: ['AE'], cities: ['Dubai'] }));
  await store.add('campaigns', campaign('disabled-campaign', { approved: false, enabled: false }));
  const fetcher = async () => ({ ok: true, status: 200, json: async () => ({ elements: [point(9, 'Scheduled Clinic', 'https://scheduled.example.com')] }) });
  const runner = new DiscoveryRunner(store, testConfig({ dryRun: true }), { fetcher, clock: () => new Date(date) });
  const result = await runner.run({ scheduled: true });
  assert.equal(result.campaignCount, 1);
  assert.equal(result.results[0].campaignId, 'enabled-campaign');
  assert.equal(result.results[0].dryRun, true);
  assert.equal(await store.count('prospects'), 0);
});
