import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFrontierIntelligenceRecord } from '../src/frontier-intelligence-foundry.mjs';
import { frontierRecordsToNeuralReferences, selectFrontierCapabilityGenomeBackedCortex } from '../src/frontier-intelligence-neural-bridge.mjs';

const frontier = normalizeFrontierIntelligenceRecord({
  name: 'Evidence-aware verifier',
  sourceUrl: 'https://example.org/frontier/verifier',
  sourceClass: 'OFFICIAL_DOC',
  publicSource: true,
  provenanceTier: 'P0',
  provenanceConfidence: 0.99,
  generatingOrAssistingModel: 'FRONTIER_MODEL',
  mechanismFamily: 'verification',
  mechanism: 'Verify candidate output before accepting completion',
  observableClaim: 'False accepts fall when verification is mandatory',
  evidenceRefs: ['doc:1'],
  licenseStatus: 'UNKNOWN',
  reproducibility: 'HYPOTHESIS',
  observedAt: '2026-09-14T00:00:00.000Z'
}).record;

test('frontier records enter neural space only as reference candidates', () => {
  const refs = frontierRecordsToNeuralReferences([frontier]);
  assert.equal(refs.length, 1);
  assert.equal(refs[0].promotionState, 'REFERENCE_ONLY');
  assert.equal(refs[0].executionAuthority, 'NONE');
  assert.equal(refs[0].consequenceAuthority, 'NONE');
  assert.equal(refs[0].neuralPrior.provenanceOnly, true);
  assert.ok(refs[0].neuralPrior.score <= 0.25);
});

test('frontier provenance cannot bypass canonical Capability Genome admission', () => {
  const result = selectFrontierCapabilityGenomeBackedCortex({
    mission: 'verify a high-stakes result',
    frontierRecords: [frontier],
    canonicalCapabilities: [],
    securityEvidenceByCapability: {},
    benchmarkEvidenceByCapability: {},
    authorizedPermissions: []
  });
  assert.equal(result.selected.length, 0);
  assert.equal(result.frontierReferenceCount, 1);
  assert.match(result.truthBoundary, /NEVER_CREATES_EXECUTABILITY/);
});
