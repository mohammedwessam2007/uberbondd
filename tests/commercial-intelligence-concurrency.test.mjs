// Concurrency and rollback evidence for the PR #6 adversarial-audit repair (item 2 and the merge
// checklist's "concurrent duplicate import creates one canonical opportunity" / "no orphan
// evidence or decisions can survive a failed import"), plus the second-pass audit's items 1 and 4.
//
// Two of these tests run genuinely-concurrent commit-mode imports directly against a real Postgres
// engine (@electric-sql/pglite), which an earlier version of this file could NOT do reliably: two
// Promise.all-fired PostgresStore.transaction() calls sharing one PGlite session used to corrupt
// each other's transaction state ("current transaction is aborted") whenever one of them hit the
// old catch-a-conflict-then-query-again pattern for source evidence -- because a failed statement
// aborts the rest of a Postgres transaction, and the recovery SELECT never actually ran (the exact
// bug the second-pass audit's item 1 named). Now that source-evidence resolution goes through
// store.mjs#findOrCreate (a single atomic INSERT...ON CONFLICT...RETURNING that never raises on a
// conflict at all), genuinely concurrent imports against real Postgres work correctly and
// reliably -- reconfirmed by running the concurrent-shared-evidence test below 5x with no failures
// before relying on it. The remaining JsonStore-based tests are kept: this codebase's own
// server/worker processes call importCommercialIntelligenceBatch from within a single Node
// process, so JsonStore's real internal transaction queue is also a realistic scenario, not a
// downgrade.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { migratedDb } from './postgres-schema.test.mjs';
import { PostgresStore, JsonStore } from '../src/store.mjs';
import { validateCommercialIntelligenceRecord, importCommercialIntelligenceBatch, CANONICAL_AUDIT_EVENTS } from '../src/commercial-intelligence-import.mjs';

function pgliteAsPool(db) {
  return {
    query: (text, params) => db.query(text, params),
    connect: async () => ({ query: (text, params) => db.query(text, params), release: () => {} }),
    end: async () => {}
  };
}

async function pgStore() {
  const db = await migratedDb();
  const store = new PostgresStore({ pool: pgliteAsPool(db) });
  return { db, store };
}

async function jsonStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-ci-concurrency-'));
  const store = new JsonStore(dir);
  await store.init();
  return store;
}

const at = new Date('2026-07-28T12:00:00.000Z');
const cfg = { revenueOs: { minExpectedValueCents: 25000, maxOwnerMinutes: 20, maxEvidenceAgeDays: 30 } };

function opportunityRecord(overrides = {}) {
  return validateCommercialIntelligenceRecord({
    id: 'rec_concurrent_1', record_type: 'opportunity', organization: 'Concurrency Co',
    organization_domain: 'concurrency-example.com', geography: 'US', service_lane: 'website-qa',
    buyer_signal: 'Public RFP for a pre-launch QA pass.',
    source: { url: 'https://concurrency-example.com/rfp', type: 'official-company', captured_at: '2026-07-27T10:00:00.000Z', official: true, confidence: 0.9 },
    contact: { email: 'partners@concurrency-example.com', source_url: 'https://concurrency-example.com/contact', published_officially: true },
    expected_value_cents: 50000, currency: 'USD', owner_minutes: 15, delivery_hours: 4,
    expires_at: '2026-08-10T00:00:00.000Z', risks: [], kill_condition: 'RFP closes with no reply.',
    idempotency_inputs: { organization_domain: 'concurrency-example.com', service_lane: 'website-qa', source_url: 'https://concurrency-example.com/rfp', signal_key: 'rfp-concurrent' },
    ...overrides
  });
}

function sharedEvidenceOpportunity(idx, sharedSource, sharedContact) {
  return validateCommercialIntelligenceRecord({
    id: `shared-opp-${idx}`, record_type: 'opportunity', organization: 'Shared Evidence Co',
    organization_domain: 'shared-evidence-example.com', geography: 'US', service_lane: 'website-qa',
    buyer_signal: `Distinct opportunity #${idx} discovered from the same crawl snapshot.`,
    source: sharedSource, contact: sharedContact,
    expected_value_cents: 50000, currency: 'USD', owner_minutes: 15, delivery_hours: 4,
    expires_at: '2026-08-10T00:00:00.000Z', risks: [], kill_condition: 'closes',
    idempotency_inputs: {
      organization_domain: 'shared-evidence-example.com', service_lane: 'website-qa',
      source_url: sharedSource.url, signal_key: `shared-signal-${idx}`
    }
  });
}

test('JsonStore: two genuinely concurrent (Promise.all) commit-mode imports of the identical opportunity produce exactly one canonical row', async () => {
  const store = await jsonStore();
  const record = opportunityRecord();
  const [first, second] = await Promise.all([
    importCommercialIntelligenceBatch(store, [record], { mode: 'commit', at, cfg }),
    importCommercialIntelligenceBatch(store, [record], { mode: 'commit', at, cfg })
  ]);

  const opportunities = await store.list('opportunities');
  assert.equal(opportunities.length, 1, 'exactly one canonical opportunity must exist after both concurrent attempts');

  const acceptedCounts = [first.acceptedCount, second.acceptedCount].sort();
  const duplicateCounts = [first.rejectedDuplicateCount, second.rejectedDuplicateCount].sort();
  assert.deepEqual(acceptedCounts, [0, 1], 'exactly one of the two concurrent calls must accept the opportunity');
  assert.deepEqual(duplicateCounts, [0, 1], 'exactly one of the two concurrent calls must see it as a duplicate');
  assert.equal((await store.list('sourceEvidence')).length, 1);
  assert.equal((await store.list('policyDecisions')).length, 1);
});

test('JsonStore: ten genuinely concurrent imports of the identical opportunity still produce exactly one canonical row', async () => {
  const store = await jsonStore();
  const record = opportunityRecord();
  const results = await Promise.all(Array.from({ length: 10 }, () => importCommercialIntelligenceBatch(store, [record], { mode: 'commit', at, cfg })));
  assert.equal((await store.list('opportunities')).length, 1);
  assert.equal(results.reduce((sum, r) => sum + r.acceptedCount, 0), 1);
  assert.equal(results.reduce((sum, r) => sum + r.rejectedDuplicateCount, 0), 9);
});

test('real Postgres: a second, sequential commit-mode import of the identical opportunity is rejected by the real unique constraint', async () => {
  const { db, store } = await pgStore();
  try {
    const record = opportunityRecord();
    const first = await importCommercialIntelligenceBatch(store, [record], { mode: 'commit', at, cfg });
    const second = await importCommercialIntelligenceBatch(store, [record], { mode: 'commit', at, cfg });
    assert.equal(first.acceptedCount, 1);
    assert.equal(second.acceptedCount, 0);
    assert.equal(second.rejectedDuplicateCount, 1);
    assert.equal((await store.list('opportunities')).length, 1);
  } finally { await db.close(); }
});

// Second-pass audit item 1's own required test: "a real PostgreSQL test where distinct
// opportunities concurrently share the same evidence identity." Both opportunities reference the
// exact same crawl snapshot (identical url/excerpt/capturedAt/official/confidence/type -- the
// fields computeEvidenceContentHash actually hashes), fired via genuine Promise.all concurrency
// against a real Postgres engine.
test('real Postgres: two distinct opportunities, imported concurrently, that reference the identical evidence snapshot resolve to exactly one shared source_evidence row', async () => {
  const { db, store } = await pgStore();
  try {
    const sharedSource = { url: 'https://shared-evidence-example.com/careers', type: 'official-company', captured_at: '2026-07-27T10:00:00.000Z', official: true, confidence: 0.9, excerpt: 'We are hiring for a QA contractor role.' };
    const sharedContact = { email: 'partners@shared-evidence-example.com', source_url: 'https://shared-evidence-example.com/contact', published_officially: true };
    const [r1, r2] = await Promise.all([
      importCommercialIntelligenceBatch(store, [sharedEvidenceOpportunity(1, sharedSource, sharedContact)], { mode: 'commit', at, cfg }),
      importCommercialIntelligenceBatch(store, [sharedEvidenceOpportunity(2, sharedSource, sharedContact)], { mode: 'commit', at, cfg })
    ]);
    assert.equal(r1.acceptedCount, 1, `expected opportunity 1 to be accepted, got rejectedInvalid: ${JSON.stringify(r1.rejectedInvalid)}`);
    assert.equal(r2.acceptedCount, 1, `expected opportunity 2 to be accepted, got rejectedInvalid: ${JSON.stringify(r2.rejectedInvalid)}`);

    const opportunities = await store.list('opportunities');
    assert.equal(opportunities.length, 2, 'both distinct opportunities must be persisted -- this is not a duplicate-rejection scenario');
    const evidence = await store.list('sourceEvidence');
    assert.equal(evidence.length, 1, 'both opportunities reference the identical crawl snapshot and must share exactly one evidence row, not one each');
    assert.equal(opportunities[0].sourceEvidenceId, opportunities[1].sourceEvidenceId, 'both opportunities must point at the SAME evidence row id');
  } finally { await db.close(); }
});

// Second-pass audit item 1's other required test: no query runs against an aborted transaction.
// store.mjs#findOrCreate is a single INSERT...ON CONFLICT...RETURNING statement, so there is no
// separate catch-then-query step to regress into -- this guards against that pattern reappearing.
test('resolveSourceEvidence contains no catch-then-query pattern (regression guard for the aborted-transaction bug)', async () => {
  const source = await fs.readFile(new URL('../src/commercial-intelligence-import.mjs', import.meta.url), 'utf8');
  assert.ok(source.includes('tx.findOrCreate('), 'source-evidence resolution must use the atomic findOrCreate, not a manual add/catch/query sequence');
  assert.ok(!/catch\s*\(error\)\s*\{[^}]*tx\.findOne/s.test(source), 'no catch block may query the same transaction after an error -- this is exactly the bug that aborts a Postgres transaction');
});

test('real Postgres: store.findOrCreate never throws on a genuine conflict, even under real concurrency (10x Promise.all)', async () => {
  const { db, store } = await pgStore();
  try {
    const item = {
      id: 'ev_direct_1', organizationDomain: 'direct-example.com', sourceUrl: 'https://direct-example.com/page',
      sourceType: 'official-company', status: 'active', contentHash: 'fixed-hash-for-this-test',
      signalKey: 'sig-1', capturedAt: at.toISOString(), expiresAt: null, data: {}
    };
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) =>
      store.findOrCreate('sourceEvidence', { ...item, id: `ev_direct_${i}` }, ['organizationDomain', 'sourceUrl', 'contentHash'])
    ));
    const ids = new Set(results.map(r => r.record.id));
    assert.equal(ids.size, 1, 'every concurrent call must resolve to the same canonical row id');
    assert.equal(results.filter(r => r.inserted).length, 1, 'exactly one call performed the real insert');
    assert.equal((await store.list('sourceEvidence')).length, 1);
  } finally { await db.close(); }
});

// Second-pass audit item 4's own required test: fresh evidence never silently reuses an older,
// stale snapshot's identity.
test('fresh evidence (different excerpt and capture time) never reuses an older snapshot\'s source_evidence row -- both are preserved as history', async () => {
  const store = await jsonStore();
  const staleCapture = validateCommercialIntelligenceRecord({
    id: 'rec_history_1', record_type: 'opportunity', organization: 'History Co', organization_domain: 'history-example.com',
    geography: 'US', service_lane: 'website-qa', buyer_signal: 'Old signal.',
    source: { url: 'https://history-example.com/careers', type: 'official-company', captured_at: '2026-07-20T00:00:00.000Z', official: true, confidence: 0.8, excerpt: 'Old excerpt: hiring a contractor.' },
    contact: { email: 'partners@history-example.com', source_url: 'https://history-example.com/contact', published_officially: true },
    expected_value_cents: 50000, currency: 'USD', owner_minutes: 15, delivery_hours: 4, expires_at: '2026-08-10T00:00:00.000Z',
    risks: [], kill_condition: 'closes',
    idempotency_inputs: { organization_domain: 'history-example.com', service_lane: 'website-qa', source_url: 'https://history-example.com/careers', signal_key: 'history-signal-old' }
  });
  const freshRecapture = validateCommercialIntelligenceRecord({
    id: 'rec_history_2', record_type: 'opportunity', organization: 'History Co', organization_domain: 'history-example.com',
    geography: 'US', service_lane: 'white-label-qa', buyer_signal: 'New signal, re-crawled later.',
    source: { url: 'https://history-example.com/careers', type: 'official-company', captured_at: '2026-07-27T00:00:00.000Z', official: true, confidence: 0.95, excerpt: 'New excerpt: now hiring two contractors, urgent.' },
    contact: { email: 'partners@history-example.com', source_url: 'https://history-example.com/contact', published_officially: true },
    expected_value_cents: 60000, currency: 'USD', owner_minutes: 15, delivery_hours: 4, expires_at: '2026-08-10T00:00:00.000Z',
    risks: [], kill_condition: 'closes',
    idempotency_inputs: { organization_domain: 'history-example.com', service_lane: 'white-label-qa', source_url: 'https://history-example.com/careers', signal_key: 'history-signal-new' }
  });

  const result = await importCommercialIntelligenceBatch(store, [staleCapture, freshRecapture], { mode: 'commit', at: new Date('2026-07-28T12:00:00.000Z'), cfg });
  assert.equal(result.acceptedCount, 2, `expected both to be accepted, got rejectedStale: ${JSON.stringify(result.rejectedStale)}, rejectedInvalid: ${JSON.stringify(result.rejectedInvalid)}`);

  const evidence = await store.list('sourceEvidence');
  assert.equal(evidence.length, 2, 'a genuinely fresher re-crawl (different excerpt and capture time) must get its OWN evidence row, never reuse the older snapshot\'s');
  const opportunities = await store.list('opportunities');
  const oldOpp = opportunities.find(o => o.id === 'rec_history_1');
  const newOpp = opportunities.find(o => o.id === 'rec_history_2');
  assert.notEqual(oldOpp.sourceEvidenceId, newOpp.sourceEvidenceId, 'the fresh opportunity must not be silently attached to the older, stale snapshot');
  const oldEvidence = evidence.find(e => e.id === oldOpp.sourceEvidenceId);
  const newEvidence = evidence.find(e => e.id === newOpp.sourceEvidenceId);
  assert.equal(oldEvidence.capturedAt, staleCapture.source.capturedAt, 'the old snapshot\'s own capture time must be preserved, not overwritten');
  assert.equal(newEvidence.capturedAt, freshRecapture.source.capturedAt);
});

test('real Postgres: a mid-transaction failure rolls back the whole record -- no orphan source evidence survives', async () => {
  const { db, store } = await pgStore();
  try {
    // Pre-seed a row that collides on the opportunities PRIMARY KEY (same id) but NOT on the
    // idempotency-key pre-check (different key), so the import gets past duplicate detection,
    // successfully inserts source evidence inside its transaction, and only THEN fails when the
    // real INSERT into opportunities hits the id collision -- a genuine, real-constraint-driven
    // mid-transaction failure, not a mocked one.
    await store.add('opportunities', {
      id: 'rec_concurrent_1', idempotencyKey: 'opportunity:pre-existing:different:key', serviceLane: 'website-qa',
      stage: 'ready_for_message', expectedValueCents: 0, currency: 'USD', probabilityBps: 0, ownerMinutes: 0, deliveryHours: 0, data: {}
    });
    const evidenceBefore = (await store.list('sourceEvidence')).length;

    const record = opportunityRecord();
    const result = await importCommercialIntelligenceBatch(store, [record], { mode: 'commit', at, cfg });

    assert.equal(result.acceptedCount, 0);
    assert.equal(result.rejectedDuplicateCount, 1, 'the id-collision surfaces as a caught ConflictError, treated as a duplicate result');
    const evidenceAfter = (await store.list('sourceEvidence')).length;
    assert.equal(evidenceAfter, evidenceBefore, 'the source-evidence insert made earlier in the SAME failed transaction must have been rolled back, not left as an orphan');
    assert.equal((await store.list('opportunities')).length, 1, 'still only the one pre-seeded row -- the failed insert never landed');

    const rollbackAudit = await store.list('auditLog', { filters: { type: CANONICAL_AUDIT_EVENTS.TRANSACTION_ROLLED_BACK } });
    assert.equal(rollbackAudit.length, 1);
  } finally { await db.close(); }
});

test('real Postgres: preview mode against a PGlite-backed store still writes zero records of any kind, including audit', async () => {
  const { db, store } = await pgStore();
  try {
    const record = opportunityRecord();
    const result = await importCommercialIntelligenceBatch(store, [record], { at, cfg }); // default mode: preview
    assert.equal(result.durableWrites, false);
    assert.equal(result.acceptedCount, 1);
    assert.equal((await store.list('opportunities')).length, 0);
    assert.equal((await store.list('sourceEvidence')).length, 0);
    assert.equal((await store.list('auditLog')).length, 0, 'preview must write nothing, not even a batch-level audit row');
  } finally { await db.close(); }
});
