import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLiveLeadGenerationSnapshot, buildLiveLeadHandoff } from '../src/leadgen-live-snapshot.mjs';

const rows = {
  prospects: [{ id: 'p1', company: 'Example', website: 'https://example.com', source: 'owner_import' }],
  suppressions: [{ value: 'blocked@example.com' }],
  leadLists: [{ id: 'list1' }],
  leadSearches: [{ id: 'search1', updatedAt: '2026-09-17T00:00:00Z' }],
  leadSignals: [{ id: 'signal1', prospectId: 'p1', type: 'news', title: 'News', excerpt: 'A public update.', sourceType: 'public_website', observedAt: '2026-09-17T00:00:00Z', expiresAt: '2026-10-17T00:00:00Z' }],
  leadEnrichmentRuns: [{ id: 'run1', createdAt: '2026-09-17T00:00:00Z' }]
};

const store = { list: async collection => rows[collection] || [] };

test('live lead generation reads durable searches, signals and enrichment runs', async () => {
  const snapshot = await buildLiveLeadGenerationSnapshot({ store, now: new Date('2026-09-17T01:00:00Z') });
  assert.equal(snapshot.stats.savedSearches, 1);
  assert.equal(snapshot.stats.activeSignals, 1);
  assert.equal(snapshot.stats.enrichmentRuns, 1);
  assert.equal(snapshot.runtime.sourceSignals, 1);
  assert.equal(snapshot.providerCalls, 0);
});

test('live handoff uses durable signal records without mutation', async () => {
  const handoff = await buildLiveLeadHandoff({ store, query: { requireEvidence: false, requireContact: false, skipOwned: false, minScore: 0 } });
  assert.equal(handoff.liveSource, 'durable-prospects');
  assert.equal(handoff.mutatesRecords, false);
  assert.equal(handoff.providerCalls, 0);
  assert.equal(handoff.externalEffects, 0);
});
