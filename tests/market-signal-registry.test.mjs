import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { ingestMarketSignals, MARKET_SIGNAL_REGISTRY_POLICY_VERSION } from '../src/market-signal-registry.mjs';

const referenceDate = new Date('2026-08-18T10:00:00.000Z');

function baseSignal(overrides = {}) {
  return {
    sourceAdapter: 'web-page-adapter',
    sourceKind: 'WEB_PAGE',
    entityType: 'PRODUCT',
    entityIdentity: 'https://example.com/pricing',
    signalType: 'PRICE_CHANGE',
    observedAt: '2026-08-18T09:00:00.000Z',
    payload: { price: 49 },
    evidenceClass: 'VERIFIED_FACT',
    provenance: 'controlled-public-fetch',
    sourceUrl: 'https://example.com/pricing',
    verificationState: 'CONTENT_MATCHED',
    confidence: 0.9,
    ...overrides
  };
}

test('empty or unconfigured adapter input is a truthful zero-signal result', async () => {
  const result = await ingestMarketSignals({ date: referenceDate });
  assert.equal(result.ok, true);
  assert.equal(result.policyVersion, MARKET_SIGNAL_REGISTRY_POLICY_VERSION);
  assert.equal(result.inputCount, 0);
  assert.equal(result.accepted.length, 0);
  assert.equal(result.localAuditWrites, 0);
  assert.equal(result.externalEffectLedger.providerCalls, 0);
});

test('normalizes a bounded batch without persistence by default', async () => {
  const result = await ingestMarketSignals({
    signals: [baseSignal()],
    date: referenceDate
  });
  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.accepted.length, 1);
  assert.equal(result.accepted[0].status, 'ACCEPTED');
  assert.equal(result.localAuditWrites, 0);
});

test('duplicate facts are suppressed within the same batch', async () => {
  const result = await ingestMarketSignals({
    signals: [baseSignal(), baseSignal()],
    date: referenceDate
  });
  assert.equal(result.accepted.length, 1);
  assert.equal(result.duplicates.length, 1);
  assert.equal(result.duplicates[0].status, 'DUPLICATE');
});

test('a previously persisted dedupe key is replay-safe', async () => {
  const calls = [];
  const first = await ingestMarketSignals({
    signals: [baseSignal()],
    date: referenceDate
  });
  const store = {
    list: async () => [{
      type: 'market_signal_ingest',
      detail: { dedupeKey: first.accepted[0].dedupeKey }
    }],
    log: async (...args) => calls.push(args)
  };
  const result = await ingestMarketSignals({
    store,
    persist: true,
    signals: [baseSignal()],
    date: referenceDate
  });
  assert.equal(result.accepted.length, 0);
  assert.equal(result.duplicates.length, 1);
  assert.equal(calls.length, 0);
});

test('contradictory signals coexist and are explicitly flagged', async () => {
  const result = await ingestMarketSignals({
    signals: [
      baseSignal({ payload: { price: 49 } }),
      baseSignal({ payload: { price: 99 } })
    ],
    date: referenceDate
  });
  assert.equal(result.accepted.length, 2);
  assert.equal(result.contradictionCount, 1);
  assert.equal(result.accepted[1].contradictsExisting, true);
});

test('stale signals are accepted for history but remain visibly stale', async () => {
  const result = await ingestMarketSignals({
    signals: [baseSignal({ observedAt: '2026-06-01T09:00:00.000Z' })],
    date: referenceDate
  });
  assert.equal(result.accepted.length, 1);
  assert.equal(result.accepted[0].status, 'ACCEPTED_STALE');
  assert.equal(result.accepted[0].stale, true);
});

test('invalid and synthetic-to-external signals are rejected by the canonical normalizer', async () => {
  const result = await ingestMarketSignals({
    signals: [
      { sourceAdapter: 'x' },
      baseSignal({ evidenceClass: 'SYNTHETIC_TEST_FIXTURE', sourceUrl: 'https://real.example.com' })
    ],
    date: referenceDate
  });
  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected.length, 2);
  assert.match(result.rejected[0].reason, /missing-fields/);
  assert.equal(result.rejected[1].reason, 'synthetic-fixture-must-not-carry-a-sourceUrl');
});

test('batch caps prevent combinatorial task creation', async () => {
  const result = await ingestMarketSignals({
    signals: [baseSignal({ entityIdentity: 'a' }), baseSignal({ entityIdentity: 'b' }), baseSignal({ entityIdentity: 'c' })],
    maxBatch: 2,
    date: referenceDate
  });
  assert.equal(result.inputCount, 3);
  assert.equal(result.processedCount, 2);
  assert.equal(result.truncated, true);
  assert.equal(result.accepted.length, 2);
});

test('persistence uses only the existing audit writer and stores no raw payload', async () => {
  const calls = [];
  const store = {
    list: async () => [],
    log: async (type, detail) => {
      calls.push({ type, detail });
      return { id: 'audit-1' };
    }
  };
  const result = await ingestMarketSignals({
    store,
    persist: true,
    signals: [baseSignal()],
    date: referenceDate
  });
  assert.equal(result.ok, true);
  assert.equal(result.dryRun, false);
  assert.equal(result.localAuditWrites, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, 'market_signal_ingest');
  assert.equal(Object.prototype.hasOwnProperty.call(calls[0].detail, 'payload'), false);
  assert.ok(calls[0].detail.payloadDigest);
});

test('persistence fails closed when the audit writer is absent', async () => {
  const result = await ingestMarketSignals({
    persist: true,
    signals: [baseSignal()],
    date: referenceDate
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'store-log-required-for-persistence');
});

test('the registry performs no network or filesystem I/O of its own', async () => {
  const source = await fs.readFile(new URL('../src/market-signal-registry.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\(|http\.request|https\.request|readFile\(|writeFile\(/);
});
