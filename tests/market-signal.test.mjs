import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeMarketSignal, isDuplicateSignal, isStaleSignal, computePayloadDigest,
  MARKET_SIGNAL_SCHEMA_VERSION, SOURCE_KINDS, ENTITY_TYPES, SIGNAL_TYPES
} from '../src/market-signal.mjs';

const monday = new Date('2026-07-13T10:00:00.000Z');

function baseSignal(overrides = {}) {
  return {
    sourceAdapter: 'web-page-adapter', sourceKind: 'WEB_PAGE', entityType: 'PRODUCT',
    entityIdentity: 'https://example.com/pricing', signalType: 'PRICE_CHANGE',
    observedAt: '2026-07-13T09:00:00.000Z', payload: { price: 49 },
    evidenceClass: 'VERIFIED_FACT', sourceUrl: 'https://example.com/pricing',
    provenance: 'live-fetch', confidence: 0.9,
    ...overrides
  };
}

test('a well-formed signal normalizes cleanly with a stable schema version', () => {
  const result = normalizeMarketSignal(baseSignal(), { date: monday });
  assert.equal(result.ok, true);
  assert.equal(result.schemaVersion, MARKET_SIGNAL_SCHEMA_VERSION);
  assert.ok(result.signalId);
  assert.equal(result.signalId, result.dedupeKey);
});

test('malformed (non-object) input is rejected cleanly, never throws', () => {
  assert.equal(normalizeMarketSignal(null, { date: monday }).ok, false);
  assert.equal(normalizeMarketSignal(undefined, { date: monday }).ok, false);
  assert.equal(normalizeMarketSignal('a string', { date: monday }).ok, false);
});

test('missing required fields are reported by name', () => {
  const result = normalizeMarketSignal({ sourceAdapter: 'x' }, { date: monday });
  assert.equal(result.ok, false);
  assert.match(result.reason, /^missing-fields:/);
  assert.match(result.reason, /sourceKind/);
});

test('an unknown sourceKind/entityType/signalType is rejected, never silently coerced', () => {
  assert.match(normalizeMarketSignal(baseSignal({ sourceKind: 'CARRIER_PIGEON' }), { date: monday }).reason, /unknown-source-kind/);
  assert.match(normalizeMarketSignal(baseSignal({ entityType: 'GHOST' }), { date: monday }).reason, /unknown-entity-type/);
  assert.match(normalizeMarketSignal(baseSignal({ signalType: 'VIBES' }), { date: monday }).reason, /unknown-signal-type/);
});

test('every declared enum value is actually accepted', () => {
  for (const sourceKind of SOURCE_KINDS) {
    const result = normalizeMarketSignal(baseSignal({ sourceKind, evidenceClass: 'HYPOTHESIS', sourceUrl: undefined }), { date: monday });
    assert.equal(result.ok, true, `sourceKind ${sourceKind} should be accepted`);
  }
  for (const entityType of ENTITY_TYPES) {
    assert.equal(normalizeMarketSignal(baseSignal({ entityType, evidenceClass: 'HYPOTHESIS', sourceUrl: undefined }), { date: monday }).ok, true);
  }
  for (const signalType of SIGNAL_TYPES) {
    assert.equal(normalizeMarketSignal(baseSignal({ signalType, evidenceClass: 'HYPOTHESIS', sourceUrl: undefined }), { date: monday }).ok, true);
  }
});

test('an unparseable observedAt is rejected', () => {
  const result = normalizeMarketSignal(baseSignal({ observedAt: 'not-a-date' }), { date: monday });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid-observedAt');
});

test('an observedAt more than 5 minutes in the future is rejected (no signal from tomorrow)', () => {
  const result = normalizeMarketSignal(baseSignal({ observedAt: '2026-07-14T00:00:00.000Z' }), { date: monday });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'observedAt-in-the-future');
});

test('VERIFIED_FACT without a sourceUrl is rejected -- a verified fact must be traceable', () => {
  const result = normalizeMarketSignal(baseSignal({ sourceUrl: undefined }), { date: monday });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'verified-fact-requires-sourceUrl');
});

test('a SYNTHETIC_TEST_FIXTURE carrying a real sourceUrl is rejected -- no synthetic-to-external promotion', () => {
  const result = normalizeMarketSignal(baseSignal({ evidenceClass: 'SYNTHETIC_TEST_FIXTURE', sourceUrl: 'https://real.example.com' }), { date: monday });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'synthetic-fixture-must-not-carry-a-sourceUrl');
});

test('a SYNTHETIC_TEST_FIXTURE with no sourceUrl normalizes cleanly and provenance is forced to match', () => {
  const result = normalizeMarketSignal(baseSignal({ evidenceClass: 'SYNTHETIC_TEST_FIXTURE', sourceUrl: undefined, provenance: 'whatever-caller-said' }), { date: monday });
  assert.equal(result.ok, true);
  assert.equal(result.provenance, 'SYNTHETIC_TEST_FIXTURE');
  assert.equal(result.sourceUrl, null);
});

test('an untagged evidenceClass defaults to UNRESOLVED, never a fabricated strong tier', () => {
  const result = normalizeMarketSignal(baseSignal({ evidenceClass: 'not-a-real-tier', sourceUrl: undefined }), { date: monday });
  assert.equal(result.ok, true);
  assert.equal(result.evidenceClass, 'UNRESOLVED');
});

test('confidence is clamped into [0,1] and malformed confidence becomes null, not zero', () => {
  const clampedHigh = normalizeMarketSignal(baseSignal({ confidence: 5 }), { date: monday });
  assert.equal(clampedHigh.confidence, 1);
  const clampedLow = normalizeMarketSignal(baseSignal({ confidence: -5 }), { date: monday });
  assert.equal(clampedLow.confidence, 0);
  const malformed = normalizeMarketSignal(baseSignal({ confidence: 'high' }), { date: monday });
  assert.equal(malformed.confidence, null);
});

test('freshnessMs is computed from the injected reference date, never real wall-clock time', () => {
  const result = normalizeMarketSignal(baseSignal({ observedAt: '2026-07-13T08:00:00.000Z' }), { date: monday });
  assert.equal(result.freshnessMs, 2 * 60 * 60 * 1000); // exactly 2h between observedAt and the injected date
});

test('two signals with identical defining fields dedupe to the same key regardless of ingestion time', () => {
  const a = normalizeMarketSignal(baseSignal(), { date: monday });
  const b = normalizeMarketSignal(baseSignal(), { date: new Date('2026-07-14T00:00:00.000Z') });
  assert.equal(isDuplicateSignal(a, b), true);
  assert.notEqual(a.ingestedAt, b.ingestedAt); // different ingestion times...
  assert.equal(a.dedupeKey, b.dedupeKey); // ...same commercial belief
});

test('contradictory signals (same entity, different payload) get different dedupe keys and must coexist', () => {
  const a = normalizeMarketSignal(baseSignal({ payload: { price: 49 } }), { date: monday });
  const b = normalizeMarketSignal(baseSignal({ payload: { price: 99 } }), { date: monday });
  assert.equal(isDuplicateSignal(a, b), false);
});

test('isDuplicateSignal never throws on a failed normalization result', () => {
  const failed = normalizeMarketSignal(null, { date: monday });
  const ok = normalizeMarketSignal(baseSignal(), { date: monday });
  assert.equal(isDuplicateSignal(failed, ok), false);
  assert.equal(isDuplicateSignal(ok, failed), false);
});

test('isStaleSignal respects an injected maxAgeMs and returns null for a failed result', () => {
  const fresh = normalizeMarketSignal(baseSignal({ observedAt: '2026-07-13T09:59:00.000Z' }), { date: monday });
  assert.equal(isStaleSignal(fresh, { maxAgeMs: 60 * 60 * 1000 }), false);
  const stale = normalizeMarketSignal(baseSignal({ observedAt: '2026-06-01T00:00:00.000Z' }), { date: monday });
  assert.equal(isStaleSignal(stale, { maxAgeMs: 60 * 60 * 1000 }), true);
  assert.equal(isStaleSignal(normalizeMarketSignal(null, { date: monday })), null);
});

test('computePayloadDigest is deterministic and order-sensitive to JSON structure', () => {
  const digestA = computePayloadDigest({ a: 1, b: 2 });
  const digestB = computePayloadDigest({ a: 1, b: 2 });
  assert.equal(digestA, digestB);
  const digestC = computePayloadDigest({ a: 2, b: 1 });
  assert.notEqual(digestA, digestC);
});

test('the same reference date produces a byte-identical normalized signal for identical input', () => {
  const a = normalizeMarketSignal(baseSignal(), { date: monday });
  const b = normalizeMarketSignal(baseSignal(), { date: monday });
  assert.deepEqual(a, b);
});

test('the module never performs I/O of its own (pure, no network/file calls)', async () => {
  const fs = await import('node:fs/promises');
  const source = await fs.readFile(new URL('../src/market-signal.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\(|http\.request|https\.request|readFile\(|writeFile\(/);
});
