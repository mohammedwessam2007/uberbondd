import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMarketSignal } from '../src/market-signal.mjs';
import { extractGenomeCandidate, logGenomeExtraction } from '../src/genome-extraction.mjs';
import { compileBusinessGenome, scoreOpportunity } from '../src/opportunity-registry.mjs';
import { createJobHandlers } from '../src/job-handlers.mjs';

const monday = new Date('2026-07-13T10:00:00.000Z');

function priceSignal(overrides = {}) {
  return normalizeMarketSignal({
    sourceAdapter: 'test', sourceKind: 'WEB_PAGE', entityType: 'PRODUCT', entityIdentity: 'https://x.example/pricing',
    signalType: 'PRICE_CHANGE', observedAt: '2026-07-13T09:00:00.000Z', payload: { price: 49 },
    evidenceClass: 'SYNTHETIC_TEST_FIXTURE', ...overrides
  }, { date: monday });
}

test('missing id is rejected cleanly', () => {
  const result = extractGenomeCandidate({ signals: [priceSignal()] });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'malformed-input-missing-id');
});

test('no usable signals is rejected cleanly', () => {
  const result = extractGenomeCandidate({ signals: [], id: 'cand-1' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no-usable-signals');
});

test('a failed normalization result mixed into signals is ignored, not fatal', () => {
  const result = extractGenomeCandidate({ signals: [priceSignal(), { ok: false }], id: 'cand-1' });
  assert.equal(result.ok, true);
  assert.equal(result.candidate.evidenceRefs.length, 1);
});

test('evidenceRefs points at the real signal ids, traceable back to source', () => {
  const signal = priceSignal();
  const result = extractGenomeCandidate({ signals: [signal], id: 'cand-1' });
  assert.deepEqual(result.candidate.evidenceRefs, [signal.signalId]);
});

test('the candidate inherits the WEAKEST evidence tier among its signals, never the strongest', () => {
  const strong = priceSignal({ evidenceClass: 'VERIFIED_FACT', sourceUrl: 'https://x.example/pricing' });
  const weak = normalizeMarketSignal({
    sourceAdapter: 'test', sourceKind: 'WEB_PAGE', entityType: 'PRODUCT', entityIdentity: 'https://x.example/other',
    signalType: 'FEATURE_CHANGE', observedAt: '2026-07-13T09:00:00.000Z', evidenceClass: 'HYPOTHESIS'
  }, { date: monday });
  const result = extractGenomeCandidate({ signals: [strong, weak], id: 'cand-1' });
  assert.equal(result.candidate.signalSourceEvidenceClass, 'HYPOTHESIS');
});

test('price is populated only when a PRICE_CHANGE signal and an explicit priceHint are both present', () => {
  const withPrice = extractGenomeCandidate({ signals: [priceSignal()], id: 'cand-1', priceHint: 49 });
  assert.equal(withPrice.candidate.price.value, 49);
  assert.equal(withPrice.candidate.price.claimType, 'SYNTHETIC_TEST_FIXTURE');

  const withoutHint = extractGenomeCandidate({ signals: [priceSignal()], id: 'cand-2' });
  assert.equal(withoutHint.candidate.price, undefined, 'price must never be fabricated from a signal type alone without an explicit value');
});

test('an extracted candidate composes directly with compileBusinessGenome/scoreOpportunity -- the seam is real', () => {
  const result = extractGenomeCandidate({ signals: [priceSignal()], id: 'cand-1', name: 'Test Candidate', category: 'test', priceHint: 49 });
  assert.equal(result.ok, true);
  const genome = compileBusinessGenome(result.candidate);
  assert.equal(genome.ok, true);
  const scored = scoreOpportunity({ candidate: result.candidate, date: monday });
  assert.equal(scored.ok, true);
  // Only `price` is populated from signals -- every other tournament
  // criterion is honestly missing, so the composite score must reflect
  // that scarcity rather than a fabricated high confidence.
  assert.ok(scored.missingCriteria.length >= 12);
  assert.ok(scored.confidence < 0.2);
});

test('non-numeric priceHint is ignored rather than coerced into a fabricated number', () => {
  const result = extractGenomeCandidate({ signals: [priceSignal()], id: 'cand-1', priceHint: 'fifty dollars' });
  assert.equal(result.candidate.price, undefined);
});

test('genome extraction emits one compact lineage receipt without raw signal payloads', async () => {
  const signal = priceSignal();
  const result = extractGenomeCandidate({ signals: [signal], id: 'cand-receipt', name: 'Receipt Candidate', category: 'test', priceHint: 49 });
  const calls = [];
  await logGenomeExtraction({ log: async (type, detail) => { calls.push({ type, detail }); return { id: 'audit-genome-1' }; } }, result);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, 'business_genome_extraction');
  assert.equal(calls[0].detail.candidateId, 'cand-receipt');
  assert.deepEqual(calls[0].detail.evidenceRefs, [signal.signalId]);
  assert.equal(calls[0].detail.externalEffectLedger.providerCalls, 0);
  assert.equal('signals' in calls[0].detail, false);
  assert.equal('payload' in calls[0].detail, false);
});

test('prometheus.genome.extract handler composes and audits locally', async () => {
  const calls = [];
  const handlers = createJobHandlers({
    cfg: {},
    store: { log: async (type, detail) => { calls.push({ type, detail }); return { id: 'audit-handler-1' }; } }
  });
  const result = await handlers['prometheus.genome.extract']({
    signals: [priceSignal()],
    id: 'cand-handler',
    name: 'Handler Candidate',
    category: 'test',
    priceHint: 49
  });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, 'business_genome_extraction');
  assert.equal(calls[0].detail.candidateId, 'cand-handler');
  assert.equal(calls[0].detail.externalEffectLedger.messages, 0);
});
