import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectCapabilityGenome } from '../src/capability-genome-doctor.mjs';
import { normalizePublicSkillBody } from '../src/capability-genome-body-import.mjs';
import { normalizeSkillBodyIntoCapability } from '../src/capability-genome-body-normalize.mjs';
import { transitionCapability } from '../src/capability-genome-admission.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const atomTaxonomy = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/capability-genome/capability-atoms.json'), 'utf8'));
const evidenceTerms = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/capability-genome/atom-evidence-terms.json'), 'utf8'));

const sourceRegistry = {
  schemaVersion: 'uberbond.capability-genome.sources.v1',
  sources: [{
    id: 'github-public-capability-search', sourceClass: 'GITHUB_API', accessMode: 'API', effectClass: 'DISCOVERY_ONLY',
    url: 'https://docs.github.com/en/rest/search/search', prohibited: ['CAPTCHA_BYPASS', 'PRIVATE_SESSION'], countEvidence: { class: 'UNKNOWN', count: 0 }
  }]
};

function record(content, skillPath = 'skills/example/SKILL.md') {
  const imported = normalizePublicSkillBody({
    repositoryFullName: 'example-org/skills',
    sourceCommit: '3b3fad96af16a10759d930941b4520ba0c40edae',
    gitBlobSha: '47c72c607bdb5dd81bdea5de2b5e4f3992a5fd59',
    skillPath, content, observedAt: '2026-09-01T00:00:00.000Z'
  });
  const result = normalizeSkillBodyIntoCapability({
    bodyEvidence: imported.bodyEvidence, content, atoms: atomTaxonomy.atoms, evidenceTerms, now: new Date('2026-09-01T00:00:00.000Z')
  });
  assert.equal(result.ok, true, JSON.stringify(result.reasonCodes));
  return result.capability;
}

const first = record('# Find\n\nHelps you find a skill for a task.\n');
const second = record('# Brand\n\nApplies brand colors to a deck.\n', 'skills/brand/SKILL.md');

const manifest = (overrides = {}) => ({
  schemaVersion: 'uberbond.capability-genome.normalized-records.v1',
  observedAt: '2026-09-01T00:00:00.000Z',
  capabilityRecordsNormalized: 2,
  dedupedCapabilities: 0, securityReviewedCapabilities: 0, eligibleCapabilities: 0, approvedCapabilities: 0, activeCapabilities: 0,
  ...overrides
});

const inspect = (capabilityRecords, normalizedRecordState) =>
  inspectCapabilityGenome({ sourceRegistry, atomTaxonomy, capabilityRecords, normalizedRecordState });

test('normalized records are counted, and every later rung still reports zero', () => {
  const result = inspect([first, second], manifest());
  assert.equal(result.ok, true, JSON.stringify(result.reasonCodes));
  assert.equal(result.state.worldCapabilityRecordsNormalized, 2);
  assert.equal(result.state.capabilityRecordCount, 2);
  assert.equal(result.state.approvedCapabilityCount, 0);
  assert.equal(result.state.activeCapabilityCount, 0);
  assert.match(result.state.corpusTruth, /NOT_DEDUPED_NOT_SECURITY_REVIEWED_NOT_ELIGIBLE_NOT_PROMOTED/);
});

test('a manifest cannot declare more records than it carries', () => {
  // The inflation the harvest law is written against: a headline number that
  // nothing behind it supports.
  const result = inspect([first], manifest({ capabilityRecordsNormalized: 200 }));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('declared-normalized-count-must-match-actual-records'));
});

test('a normalization manifest cannot claim a rung it has not reached', () => {
  for (const key of ['dedupedCapabilities', 'securityReviewedCapabilities', 'eligibleCapabilities', 'approvedCapabilities', 'activeCapabilities']) {
    const result = inspect([first, second], manifest({ [key]: 1 }));
    assert.equal(result.ok, false, key);
    assert.ok(result.reasonCodes.includes('normalized-record-corpus-cannot-claim-later-promotion'), key);
  }
});

test('a record promoted past NORMALIZED does not belong to the normalization corpus', () => {
  const promoted = transitionCapability(first, 'DEDUPED', { reasonCodes: ['x'] }).capability;
  const result = inspect([promoted, second], manifest());
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('normalized-record-corpus-records-must-be-normalized'));
});

test('a hand-written object cannot be counted as a capability', () => {
  // The doctor is what reports how many capabilities exist, so it revalidates
  // rather than trusting whoever assembled the list.
  const result = inspect([{ id: 'capability:made-up', promotionState: 'NORMALIZED' }], manifest({ capabilityRecordsNormalized: 1 }));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('valid-normalized-capability-records-required'));
});

test('the committed normalization receipt passes the doctor it feeds', () => {
  const receiptPath = path.join(root, 'artifacts/capability-genome/pilot/normalized-capability-records-2026-09-01.json');
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  const result = inspectCapabilityGenome({
    sourceRegistry: JSON.parse(fs.readFileSync(path.join(root, 'artifacts/capability-genome/source-registry.json'), 'utf8')),
    atomTaxonomy,
    capabilityRecords: receipt.capabilities,
    normalizedRecordState: receipt
  });
  assert.equal(result.ok, true, JSON.stringify(result.reasonCodes));
  assert.equal(result.state.worldCapabilityRecordsNormalized, 2);
  // The receipt is derived metadata about public bodies, never a copy of them.
  assert.equal(receipt.capabilities.every(item => item.promotionState === 'NORMALIZED'), true);
  assert.equal(receipt.approvedCapabilities, 0);
  assert.equal(receipt.activeCapabilities, 0);
});

test('an approved record is never counted as a normalized one', () => {
  // The counter used to read the list length, so a promoted record would have
  // been reported at the rung it left behind.
  const approved = { ...structuredClone(first), promotionState: 'APPROVED' };
  const result = inspectCapabilityGenome({ sourceRegistry, atomTaxonomy, capabilityRecords: [approved] });
  assert.equal(result.ok, true, JSON.stringify(result.reasonCodes));
  assert.equal(result.state.worldCapabilityRecordsNormalized, 0);
  assert.equal(result.state.capabilityRecordCount, 1);
  assert.equal(result.state.approvedCapabilityCount, 1);
  assert.doesNotMatch(result.state.corpusTruth, /RECORDS_NORMALIZED/);
});
