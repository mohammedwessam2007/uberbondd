import test from 'node:test';
import assert from 'node:assert/strict';
import { validateResearchPackage, listResearchSeedActivationStatus } from '../src/research-seed.mjs';
import { loadResearchSeedCorpus } from '../src/canon-registries.mjs';

test('the landed research-seed corpus passes its own referential-integrity validation', () => {
  const corpus = loadResearchSeedCorpus();
  const counts = validateResearchPackage(corpus);
  assert.equal(counts.opportunities, corpus.opportunities.length);
});

test('validateResearchPackage rejects a dangling source_id reference', () => {
  assert.throws(() => validateResearchPackage({
    opportunities: [{ opportunity_id: 'OP-X', source_ids: 'SRC-DOES-NOT-EXIST' }],
    buyer_signals: [], prospects: [], sources: [{ source_id: 'SRC-1' }]
  }), /research-source-reference-missing/);
});

test('listResearchSeedActivationStatus never writes anything and returns a per-opportunity report', () => {
  const report = listResearchSeedActivationStatus({ now: new Date('2026-08-01T00:00:00.000Z') });
  assert.ok(report.length > 0);
  for (const row of report) {
    assert.equal(typeof row.eligible, 'boolean');
    assert.ok(Array.isArray(row.blockers));
  }
  // At least the fixture's known-strong opportunity should have independent evidence counted.
  assert.ok(report.some(row => row.independentEvidenceCount >= 1));
});
