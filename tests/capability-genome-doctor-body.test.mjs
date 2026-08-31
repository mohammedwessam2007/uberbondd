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
const repositoryCorpus = {
  schemaVersion: 'uberbond.capability-genome.corpus-state.v1', corpusKind: 'WORLD_REPOSITORY_CANDIDATE_METADATA', sourceId: 'github-public-capability-search', evidenceClass: 'MEASURED_IMPORT',
  observedAt: '2026-08-31T15:20:00.000Z', providerCalls: 3, distinctRepositoryCandidates: 30, skillBodiesImported: 0, capabilityRecordsNormalized: 0, batchId: 'repo-pilot'
};
const body = (hash, overrides = {}) => ({
  repositoryFullName: 'anthropics/skills', sourceCommit: '3b3fad96af16a10759d930941b4520ba0c40edae', gitBlobSha: '47c72c607bdb5dd81bdea5de2b5e4f3992a5fd59',
  skillPath: 'skills/brand-guidelines/SKILL.md', contentSha256: hash, byteLength: 2235,
  sourceUrl: 'https://github.com/anthropics/skills/blob/3b3fad96af16a10759d930941b4520ba0c40edae/skills/brand-guidelines/SKILL.md', trustState: 'UNTRUSTED_DISCOVERED', promotionAuthority: 'NONE', ...overrides
});
const bodyCorpus = {
  schemaVersion: 'uberbond.capability-genome.corpus-state.v1', bodyImportVersion: 'capability-genome-body-import-1.0.0', corpusKind: 'WORLD_SKILL_BODY_EVIDENCE', sourceId: 'github-public-capability-search', evidenceClass: 'MEASURED_IMPORT',
  observedAt: '2026-08-31T16:10:00.000Z', providerCalls: 2, repositoryCount: 1, skillBodiesImported: 1, distinctSkillBodyContentCount: 1, duplicateSkillBodyArtifacts: 0,
  capabilityRecordsNormalized: 0, approvedCapabilities: 0, activeCapabilities: 0, storageMode: 'SOURCE_PINNED_REFERENCE_ONLY', bodyEvidenceDigest: 'a'.repeat(64),
  bodies: [body('1'.repeat(64))]
};

test('doctor reports repository candidates and real skill bodies as separate truth layers', () => {
  const result = inspectCapabilityGenome({ sourceRegistry, atomTaxonomy, corpusState: repositoryCorpus, bodyCorpusState: bodyCorpus, capabilityRecords: [] });
  assert.equal(result.ok, true);
  assert.equal(result.state.worldRepositoryCandidateCount, 30);
  assert.equal(result.state.worldSkillBodyCount, 1);
  assert.equal(result.state.distinctSkillBodyContentCount, 1);
  assert.equal(result.state.worldCapabilityRecordsNormalized, 0);
  assert.equal(result.state.approvedCapabilityCount, 0);
  assert.equal(result.state.activeCapabilityCount, 0);
  assert.equal(result.state.worldRepositoryProviderCalls, 3);
  assert.equal(result.state.worldSkillBodyProviderCalls, 2);
  assert.equal(result.state.worldCorpusProviderCalls, 5);
  assert.match(result.state.corpusTruth, /SKILL_BODY_IMPORT_PRESENT/);
});

test('body evidence cannot manufacture normalization or promotion truth', () => {
  const normalizedLie = inspectCapabilityGenome({ sourceRegistry, atomTaxonomy, corpusState: repositoryCorpus, bodyCorpusState: { ...bodyCorpus, capabilityRecordsNormalized: 1 }, capabilityRecords: [] });
  assert.equal(normalizedLie.ok, false);
  assert.ok(normalizedLie.reasonCodes.includes('skill-body-evidence-cannot-claim-normalized-capabilities'));

  const promotionLie = inspectCapabilityGenome({ sourceRegistry, atomTaxonomy, corpusState: repositoryCorpus, bodyCorpusState: { ...bodyCorpus, approvedCapabilities: 1 }, capabilityRecords: [] });
  assert.equal(promotionLie.ok, false);
  assert.ok(promotionLie.reasonCodes.includes('skill-body-evidence-cannot-claim-promotion'));
});

test('body evidence must remain pinned, hashed, untrusted, and zero-authority', () => {
  const corrupted = structuredClone(bodyCorpus);
  corrupted.bodies[0].sourceCommit = 'main';
  corrupted.bodies[0].trustState = 'APPROVED';
  const result = inspectCapabilityGenome({ sourceRegistry, atomTaxonomy, corpusState: repositoryCorpus, bodyCorpusState: corrupted, capabilityRecords: [] });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('body-evidence-must-remain-untrusted-zero-authority'));
  assert.ok(result.reasonCodes.includes('valid-pinned-body-evidence-required'));
});
