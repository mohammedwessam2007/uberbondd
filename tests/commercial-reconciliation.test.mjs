import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { normalizeMarketSignal } from '../src/market-signal.mjs';
import {
  reconcileCommercialEvidence,
  logCommercialReconciliation,
  COMMERCIAL_RECONCILIATION_POLICY_VERSION
} from '../src/commercial-reconciliation.mjs';
import { createJobHandlers } from '../src/job-handlers.mjs';

const referenceDate = new Date('2026-08-18T10:00:00.000Z');

function baseSignal(overrides = {}) {
  return {
    sourceAdapter: 'test',
    sourceKind: 'WEB_PAGE',
    entityType: 'PRODUCT',
    entityIdentity: 'https://example.test/pricing',
    signalType: 'PRICE_CHANGE',
    observedAt: '2026-08-18T09:00:00.000Z',
    payload: { price: 49 },
    evidenceClass: 'BUYER_SIGNAL',
    provenance: 'test-fixture',
    sourceUrl: 'https://example.test/pricing',
    verificationState: 'SOURCE_REACHABLE',
    ...overrides
  };
}

function candidate(overrides = {}) {
  return { id: 'reconcile-candidate', name: 'Reconcile Candidate', category: 'test', priceHint: 49, ...overrides };
}

test('dry-run reconciliation composes ingestion, genome, and tournament without writing', async () => {
  const result = await reconcileCommercialEvidence({
    signals: [baseSignal()],
    candidate: candidate(),
    date: referenceDate,
    persist: false,
    tournamentLimit: 5
  });
  assert.equal(result.ok, true);
  assert.equal(result.policyVersion, COMMERCIAL_RECONCILIATION_POLICY_VERSION);
  assert.equal(result.status, 'RECONCILED');
  assert.equal(result.ingestion.acceptedCount, 1);
  assert.equal(result.genome.candidateId, 'reconcile-candidate');
  assert.equal(result.tournament.registryCount, 439);
  assert.equal(result.tournament.returnedCount, 5);
  assert.equal(result.localAuditWrites, 0);
  assert.equal(result.externalEffectLedger.providerCalls, 0);
});

test('persisted reconciliation reuses auditLog for all four compact receipts', async () => {
  const calls = [];
  const store = {
    list: async () => [],
    log: async (type, detail) => { calls.push({ type, detail }); return { id: type }; }
  };
  const result = await reconcileCommercialEvidence({
    store,
    signals: [baseSignal()],
    candidate: candidate(),
    date: referenceDate,
    persist: true,
    tournamentLimit: 3
  });
  assert.equal(result.ok, true);
  assert.equal(result.localAuditWrites, 4);
  assert.deepEqual(calls.map(call => call.type), [
    'market_signal_ingest',
    'business_genome_extraction',
    'commercial_opportunity_tournament',
    'commercial_evidence_reconciliation'
  ]);
  const reconciliation = calls.at(-1).detail;
  assert.equal(reconciliation.candidateId, 'reconcile-candidate');
  assert.equal(reconciliation.registryCount, 439);
  assert.equal(Object.prototype.hasOwnProperty.call(reconciliation, 'signals'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(reconciliation, 'payload'), false);
  assert.equal(reconciliation.externalEffectLedger.spendCents, 0);
});

test('job handler runs the same reconciliation path and fails closed without a usable signal', async () => {
  const calls = [];
  const handlers = createJobHandlers({
    cfg: {},
    store: { list: async () => [], log: async (type, detail) => { calls.push({ type, detail }); return { id: type }; } }
  });
  const result = await handlers['prometheus.commercial.reconcile']({
    signals: [],
    candidate: candidate(),
    date: referenceDate,
    persist: true
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'REVIEW_REQUIRED');
  assert.ok(result.reasonCodes.includes('no-usable-signals'));
  assert.equal(calls.at(-1).type, 'commercial_evidence_reconciliation');
  assert.equal(calls.at(-1).detail.externalEffectLedger.messages, 0);
});

test('reconciliation logger stores lineage only and has no I/O of its own', async () => {
  const calls = [];
  const result = await reconcileCommercialEvidence({ signals: [baseSignal()], candidate: candidate(), date: referenceDate });
  await logCommercialReconciliation({ log: async (type, detail) => { calls.push({ type, detail }); return { id: 'audit-1' }; } }, result);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, 'commercial_evidence_reconciliation');
  assert.equal(calls[0].detail.policyVersion, COMMERCIAL_RECONCILIATION_POLICY_VERSION);
  assert.equal(Object.prototype.hasOwnProperty.call(calls[0].detail, 'rawSignals'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(calls[0].detail, 'payload'), false);
});

test('reconciliation module is local-only by source inspection', async () => {
  const source = await fs.readFile(new URL('../src/commercial-reconciliation.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\(|http\.request|https\.request|readFile\(|writeFile\(/);
});
