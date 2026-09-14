import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileUberOutboundResearchImport,
  reconcileUberOutboundResearchAssets
} from '../src/uberoutbound-research-import.mjs';

const provenance = {
  origin: 'FOUNDER_SUPPLIED_RESEARCH_PACK',
  receiptId: 'receipt-1',
  sourceDigest: 'sha256:fixture'
};

test('accepts a provenance-bound source ledger only as research asset', () => {
  const imported = compileUberOutboundResearchImport({
    assetType: 'SOURCE_LEDGER',
    assetId: 'source-ledger-26',
    sourceArtifactName: 'source_ledger.csv',
    researchCutoff: '2026-09-14',
    expectedRowCount: 1,
    provenance,
    rows: [{
      id: 'gong-fixture',
      title: 'Gong fixture row',
      sourceUrl: 'https://example.com/source',
      sourceDate: '2026-09-14',
      finding: 'Fixture finding',
      evidenceState: 'PROBABLE'
    }]
  });
  assert.equal(imported.state, 'RESEARCH_ASSET_ACCEPTED_FOR_REVIEW');
  assert.equal(imported.promotionState, 'RESEARCH_ASSET_ONLY');
  assert.equal(imported.policyPromotionAuthorized, false);
  assert.equal(imported.experimentPromotionAuthorized, false);
  assert.equal(imported.externalEffectAuthority, 'NONE');
  assert.match(imported.manifestDigest, /^sha256:[a-f0-9]{64}$/);
});

test('rejects provenance-free or under-specified source rows', () => {
  const imported = compileUberOutboundResearchImport({
    assetType: 'SOURCE_LEDGER',
    assetId: 'bad',
    sourceArtifactName: 'bad.csv',
    provenance: {},
    rows: [{ title: 'no source evidence' }]
  });
  assert.equal(imported.state, 'RESEARCH_IMPORT_REJECTED');
  assert.ok(imported.reasonCodes.includes('provenance-origin-required'));
  assert.ok(imported.reasonCodes.includes('provenance-receipt-id-required'));
  assert.ok(imported.reasonCodes.includes('invalid-research-row'));
});

test('rejects row-count mismatch instead of pretending the full downloadable pack was ingested', () => {
  const imported = compileUberOutboundResearchImport({
    assetType: 'HYPOTHESES',
    assetId: 'top-100',
    sourceArtifactName: 'top_100.csv',
    expectedRowCount: 100,
    provenance,
    rows: [{ id: 'h1', hypothesis: 'Fixture hypothesis' }]
  });
  assert.equal(imported.state, 'RESEARCH_IMPORT_REJECTED');
  assert.ok(imported.reasonCodes.includes('expected-row-count-mismatch'));
  assert.equal(imported.inputRowCount, 1);
});

test('duplicate IDs fail closed within one asset', () => {
  const imported = compileUberOutboundResearchImport({
    assetType: 'UNKNOWN_UNKNOWNS',
    assetId: 'unknowns',
    sourceArtifactName: 'unknowns.csv',
    provenance,
    rows: [
      { id: 'u1', title: 'Question one' },
      { id: 'u1', title: 'Question two' }
    ]
  });
  assert.equal(imported.state, 'RESEARCH_IMPORT_REJECTED');
  assert.ok(imported.reasonCodes.includes('duplicate-row-id'));
});

test('reconciliation preserves contradictions instead of averaging them away', () => {
  const a = compileUberOutboundResearchImport({
    assetType: 'CLAIM_MATRIX',
    assetId: 'claims-a',
    sourceArtifactName: 'claims_a.csv',
    provenance: { ...provenance, receiptId: 'a' },
    rows: [{ id: 'claim-1', title: 'CTA claim', claim: 'Offer CTA helps', sourceUrl: 'https://example.com/a', sourceDate: '2026-09-14', evidenceState: 'PROBABLE' }]
  });
  const b = compileUberOutboundResearchImport({
    assetType: 'CLAIM_MATRIX',
    assetId: 'claims-b',
    sourceArtifactName: 'claims_b.csv',
    provenance: { ...provenance, receiptId: 'b' },
    rows: [{ id: 'claim-1', title: 'CTA claim', claim: 'Offer CTA has no effect', sourceUrl: 'https://example.com/b', sourceDate: '2026-09-14', evidenceState: 'UNKNOWN' }]
  });
  const reconciled = reconcileUberOutboundResearchAssets([a, b]);
  assert.equal(reconciled.state, 'RECONCILED_WITH_CONTRADICTIONS');
  assert.equal(reconciled.conflictCount, 1);
  assert.equal(reconciled.promotionState, 'RESEARCH_ASSET_ONLY');
  assert.equal(reconciled.externalEffectAuthority, 'NONE');
});
