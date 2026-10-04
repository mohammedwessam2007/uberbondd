import test from 'node:test';
import assert from 'node:assert/strict';
import {
  demandSignalsFromLeadLedger,
  qualificationObservationsFromStoredProspect,
  snapshot
} from '../src/revenue-singularity-service.mjs';

const NOW = Date.parse('2026-10-04T10:00:00.000Z');
const p = { id: 'p1', demandSignals: [{ kind: 'observed_defect', observedAt: '2026-10-03T09:00:00Z', evidenceRef: 'https://example.com/audit' }] };
const lead = (overrides = {}) => ({
  id: 's1', prospectId: 'p1', type: 'funding', sourceType: 'public_website',
  sourceUrl: 'https://example.com/news/funding', observedAt: '2026-10-03T08:00:00Z',
  expiresAt: '2026-11-03T08:00:00Z', confidence: 0.8, ...overrides
});

test('durable lead signals compose into the narrow Revenue Singularity demand taxonomy', () => {
  const out = demandSignalsFromLeadLedger(p, [
    lead(),
    lead({ id: 's2', type: 'job_listing', sourceUrl: 'https://example.com/jobs/ai' }),
    lead({ id: 's3', type: 'promotion', sourceUrl: 'https://example.com/team' }),
    lead({ id: 's4', type: 'technology', sourceUrl: 'https://example.com/changelog' }),
    lead({ id: 's5', type: 'public_pain_point', sourceUrl: 'https://example.com/status' })
  ], NOW);
  assert.deepEqual(out.map(x => x.kind).sort(), [
    'explicit_demand_hiring', 'observed_defect', 'public_complaint',
    'switch_window_funding', 'switch_window_leadership', 'tech_change'
  ].sort());
  assert.equal(out.every(x => x.evidenceRef.startsWith('https://')), true);
});

test('ambiguous lead intelligence is not upgraded into demand', () => {
  const out = demandSignalsFromLeadLedger({ id: 'p1' }, [
    lead({ type: 'buying_intent' }),
    lead({ type: 'news' }),
    lead({ type: 'website_visit' }),
    lead({ type: 'traffic_surge' }),
    lead({ type: 'relationship_path' }),
    lead({ type: 'form_submission' })
  ], NOW);
  assert.deepEqual(out, []);
});

test('stale, future, low-confidence, non-HTTPS, weak-provenance and wrong-prospect signals stay out', () => {
  const out = demandSignalsFromLeadLedger({ id: 'p1' }, [
    lead({ expiresAt: '2026-10-01T00:00:00Z' }),
    lead({ observedAt: '2026-10-05T00:00:00Z' }),
    lead({ confidence: 0.2 }),
    lead({ sourceUrl: 'http://example.com/nope' }),
    lead({ sourceType: 'csv_import' }),
    lead({ sourceType: 'local_prospect' }),
    lead({ prospectId: 'p2' }),
    lead({ observedAt: 'not-a-date' })
  ], NOW);
  assert.deepEqual(out, []);
});

test('existing prospect demand signal wins dedupe over an equivalent lead-ledger signal', () => {
  const prospect = { id: 'p1', demandSignals: [{ kind: 'switch_window_funding', observedAt: '2026-10-02T00:00:00Z', evidenceRef: 'https://example.com/news/funding' }] };
  const out = demandSignalsFromLeadLedger(prospect, [lead()], NOW);
  assert.equal(out.length, 1);
  assert.equal(out[0].source, undefined);
});

test('bridged demand participates in qualification timing without becoming authority', () => {
  const signals = demandSignalsFromLeadLedger({ id: 'p1' }, [lead()], NOW);
  const observations = qualificationObservationsFromStoredProspect({}, { demandSignals: signals, now: NOW });
  assert.ok(observations.signalStrength.value > 0);
  assert.ok(observations.timing.value > 0);
  assert.equal('outboundAuthority' in observations, false);
});

test('snapshot reads leadSignals alongside the existing revenue collections without mutating them', async () => {
  const rows = { leadSignals: [lead()], prospects: [], outboundEvents: [], replies: [], senderHealth: [], leads: [], suppressions: [], outboundReservations: [], messages: [], providerEvents: [] };
  let writes = 0;
  const store = {
    list: async key => rows[key] || [],
    getSettings: async () => ({}),
    add: async () => { writes += 1; },
    patch: async () => { writes += 1; },
    upsert: async () => { writes += 1; }
  };
  const s = await snapshot(store, NOW);
  assert.equal(s.leadSignals.length, 1);
  assert.equal(s.leadSignals[0].id, 's1');
  assert.equal(writes, 0);
});
