import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FRONTIER_FINAL_RETAINED_TARGET,
  FRONTIER_ACTIVE_CORTEX_MAX,
  classifyFrontierSourcePolicy,
  normalizeFrontierIntelligenceRecord,
  extractFrontierMechanismAtoms,
  buildFrontierMillionTournament,
  compileFrontierReproductionExperiment,
  observableChatAssistantMechanismMap
} from '../src/frontier-intelligence-foundry.mjs';

function base(overrides = {}) {
  return {
    name: 'Searchable episodic history',
    sourceUrl: 'https://example.org/frontier-evidence',
    sourceClass: 'OFFICIAL_DOC',
    publicSource: true,
    provenanceTier: 'P0',
    provenanceConfidence: 0.99,
    generatingOrAssistingModel: 'FRONTIER_MODEL',
    mechanismFamily: 'memory',
    mechanism: 'Retrieve task-relevant prior mission evidence after context rollover',
    observableClaim: 'Long-horizon tasks recover prior constraints more accurately than summary-only baseline',
    evidenceRefs: ['official-doc:1'],
    licenseStatus: 'UNKNOWN',
    reproducibility: 'HYPOTHESIS',
    observedAt: '2026-09-14T00:00:00.000Z',
    ...overrides
  };
}

test('frontier source policy rejects leaked or hidden-internal extraction paths', () => {
  const leaked = classifyFrontierSourcePolicy({ sourceClass: 'SYSTEM_CARD', publicSource: true, confidential: true });
  assert.equal(leaked.decision, 'DENY');
  const hidden = classifyFrontierSourcePolicy({ sourceClass: 'PUBLIC_MODEL_RUN', publicSource: true, seeksHiddenChainOfThought: true });
  assert.equal(hidden.decision, 'DENY');
  const bulk = classifyFrontierSourcePolicy({ sourceClass: 'PUBLIC_MODEL_RUN', publicSource: true, bulkProviderOutputHarvest: true, explicitContractualPermission: false });
  assert.equal(bulk.decision, 'DENY');
});

test('public no-license evidence remains evidence-only and never executable by discovery', () => {
  const normalized = normalizeFrontierIntelligenceRecord(base());
  assert.equal(normalized.ok, true);
  assert.equal(normalized.record.policy.decision, 'ALLOW_EVIDENCE');
  assert.equal(normalized.record.policy.reusableCode, false);
  assert.equal(normalized.record.executionAuthority, 'NONE');
  assert.equal(normalized.record.consequenceAuthority, 'NONE');
  assert.equal(normalized.record.promotionState, 'OBSERVED');
});

test('mechanism atomization does not convert a claim into authority', () => {
  const input = base({
    capabilityAtoms: [{ id: 'memory:episodic-recall', verb: 'retrieve', noun: 'episodic-history', description: 'Recover relevant prior evidence', inputs: ['query','event-log'], outputs: ['evidence-pack'] }]
  });
  const result = extractFrontierMechanismAtoms(input);
  assert.equal(result.ok, true);
  assert.equal(result.atoms.length, 1);
  assert.equal(result.atoms[0].executionAuthority, 'NONE');
  assert.match(result.truthBoundary, /DOES_NOT PROVE PERFORMANCE/i);
});

test('frontier tournament dedupes semantic identity and cannot fake final million', () => {
  const a = normalizeFrontierIntelligenceRecord(base()).record;
  const duplicate = normalizeFrontierIntelligenceRecord(base({ sourceUrl: 'https://example.org/duplicate', provenanceConfidence: 0.80 })).record;
  const result = buildFrontierMillionTournament({ records: [a, duplicate], evidenceById: { [a.id]: { efficacy: 1, generality: 1, novelty: 1, composability: 1, reproducibility: 1, frontierRelevance: 1, temporalRelevance: 1 } } });
  assert.equal(result.distinctCapabilityRecords, 1);
  assert.equal(result.retainedCapabilityRecords, 1);
  assert.equal(result.immutableProgramTarget, 1_000_000);
  assert.equal(result.status, 'FRONTIER_FINAL_MILLION_INCOMPLETE');
  assert.ok(result.completionFraction < 0.00001);
  assert.equal(FRONTIER_FINAL_RETAINED_TARGET, 1_000_000);
});

test('reproduction experiment requires baseline donor reconstruction and UberBond mutation', () => {
  const result = compileFrontierReproductionExperiment(base());
  assert.equal(result.ok, true);
  assert.deepEqual(result.experiment.variants.map(x => x.id), ['A','B','C']);
  assert.match(result.experiment.promotionRule, /NO_PROMOTION_FROM_SOURCE_CLAIMS_OR_MODEL_BRAND/);
  assert.equal(result.experiment.executionAuthority, 'NONE');
});

test('observable assistant map is architecture-level and bounded active cortex remains 64', () => {
  const map = observableChatAssistantMechanismMap();
  for (const required of ['MODEL_ROUTING_AND_EFFORT_ALLOCATION','TOOL_PLUGIN_INTERFACE','RETRIEVAL_AND_SOURCE_GROUNDING','VERIFICATION_BEFORE_COMMIT','SAFETY_PERMISSION_AND_AUTHORITY_BOUNDARIES']) assert.equal(map.includes(required), true);
  assert.equal(FRONTIER_ACTIVE_CORTEX_MAX, 64);
});
