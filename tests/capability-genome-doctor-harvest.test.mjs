import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectCapabilityGenome } from '../src/capability-genome-doctor.mjs';

const sourceRegistry = {
  schemaVersion: 'uberbond.capability-genome.sources.v1',
  sources: [{
    id: 'github-public-capability-search', sourceClass: 'GITHUB_API', accessMode: 'API', effectClass: 'DISCOVERY_ONLY',
    url: 'https://docs.github.com/en/rest/search/search', prohibited: ['CAPTCHA_BYPASS', 'PRIVATE_SESSION'], countEvidence: { class: 'UNKNOWN', count: 0 }
  }]
};
const atomTaxonomy = { schemaVersion: 'uberbond.capability-genome.atoms.v1', atoms: [{ id: 'research.search-public', verb: 'search', noun: 'public', description: 'search public data', sideEffectClass: 'READ_ONLY' }] };
const corpusState = {
  schemaVersion: 'uberbond.capability-genome.corpus-state.v1', corpusKind: 'WORLD_REPOSITORY_CANDIDATE_METADATA', sourceId: 'github-public-capability-search', evidenceClass: 'MEASURED_IMPORT',
  observedAt: '2026-08-31T15:20:00.000Z', providerCalls: 3, distinctRepositoryCandidates: 30, skillBodiesImported: 0, capabilityRecordsNormalized: 0, approvedCapabilities: 999, activeCapabilities: 999, batchId: 'pilot'
};

test('doctor reports measured repository candidates without converting them to skills or approvals', () => {
  const result = inspectCapabilityGenome({ sourceRegistry, atomTaxonomy, corpusState, capabilityRecords: [] });
  assert.equal(result.ok, true);
  assert.equal(result.state.worldRepositoryCandidateCount, 30);
  assert.equal(result.state.worldSkillBodyCount, 0);
  assert.equal(result.state.worldCapabilityRecordsNormalized, 0);
  assert.equal(result.state.approvedCapabilityCount, 0);
  assert.equal(result.state.activeCapabilityCount, 0);
  assert.equal(result.state.corpusTruth, 'MEASURED_WORLD_REPOSITORY_CANDIDATES_PRESENT__SKILL_BODIES_NOT_IMPORTED');
  assert.match(result.state.promotionTruthSource, /CAPABILITY_RECORD/);
});

test('malformed corpus counts fail closed instead of becoming measured truth', () => {
  const result = inspectCapabilityGenome({ sourceRegistry, atomTaxonomy, corpusState: { ...corpusState, distinctRepositoryCandidates: -1 }, capabilityRecords: [] });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('nonnegative-corpus-counts-required'));
});

test('repository metadata receipts cannot manufacture skill-body or normalized-capability imports', () => {
  const result = inspectCapabilityGenome({ sourceRegistry, atomTaxonomy, corpusState: { ...corpusState, skillBodiesImported: 1, capabilityRecordsNormalized: 1 }, capabilityRecords: [] });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('repository-metadata-corpus-cannot-claim-body-or-capability-import'));
});

test('approved and active counts come only from lifecycle records, never corpus metadata counters', () => {
  const capabilityRecords = [
    { id: 'a', canonicalIdentity: 'cap:a', sourceHash: 'x', promotionState: 'APPROVED' },
    { id: 'b', canonicalIdentity: 'cap:b', sourceHash: 'y', promotionState: 'ACTIVE' }
  ];
  const result = inspectCapabilityGenome({ sourceRegistry, atomTaxonomy, corpusState, capabilityRecords });
  assert.equal(result.state.approvedCapabilityCount, 1);
  assert.equal(result.state.activeCapabilityCount, 1);
});
