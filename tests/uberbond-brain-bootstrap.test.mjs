import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  loadUberBondBrainFromRepository,
  formatUberBondBrainPacket,
  MEMORY_RECONCILIATION_PATH,
  MASTER_MEMORY_RECONCILIATION_PATH,
  EXTERNAL_CAPABILITY_REGISTRY_PATH,
  CAPABILITY_GENOME_SOURCE_REGISTRY_PATH,
  CAPABILITY_GENOME_ATOM_TAXONOMY_PATH,
  EVENT_HORIZON_PATH
} from '../scripts/uberbond-brain-bootstrap.mjs';

const sourceRoot = path.resolve(new URL('..', import.meta.url).pathname);
const sourceCommit = 'b894a4cfae8acddd6170095f2373f339ff65f15c';

function buildFixture(mutator = null) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'uberbond-brain-fixture-'));
  const bootstrap = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'UBERBOND_BOOTSTRAP.json'), 'utf8'));
  const memory = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'artifacts/uberbond-memory-index.json'), 'utf8'));
  const reconciliation = JSON.parse(fs.readFileSync(path.join(sourceRoot, MEMORY_RECONCILIATION_PATH), 'utf8'));
  const handoff = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'docs/CURRENT_HANDOFF.json'), 'utf8'));
  const externalCapabilities = JSON.parse(fs.readFileSync(path.join(sourceRoot, EXTERNAL_CAPABILITY_REGISTRY_PATH), 'utf8'));
  const capabilityGenomeSources = JSON.parse(fs.readFileSync(path.join(sourceRoot, CAPABILITY_GENOME_SOURCE_REGISTRY_PATH), 'utf8'));
  const capabilityGenomeAtoms = JSON.parse(fs.readFileSync(path.join(sourceRoot, CAPABILITY_GENOME_ATOM_TAXONOMY_PATH), 'utf8'));
  const eventHorizon = JSON.parse(fs.readFileSync(path.join(sourceRoot, EVENT_HORIZON_PATH), 'utf8'));
  mutator?.({ bootstrap, memory, reconciliation, handoff, externalCapabilities, capabilityGenomeSources, capabilityGenomeAtoms, eventHorizon });
  for (const relative of new Set([
    'UBERBOND_BOOTSTRAP.json',
    MEMORY_RECONCILIATION_PATH,
    MASTER_MEMORY_RECONCILIATION_PATH,
    EXTERNAL_CAPABILITY_REGISTRY_PATH,
    CAPABILITY_GENOME_SOURCE_REGISTRY_PATH,
    CAPABILITY_GENOME_ATOM_TAXONOMY_PATH,
    ...bootstrap.canonPointers
  ])) {
    const absolute = path.join(root, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    if (relative === 'UBERBOND_BOOTSTRAP.json') fs.writeFileSync(absolute, JSON.stringify(bootstrap, null, 2));
    else if (relative === bootstrap.memoryIndexPath) fs.writeFileSync(absolute, JSON.stringify(memory, null, 2));
    else if (relative === MEMORY_RECONCILIATION_PATH) fs.writeFileSync(absolute, JSON.stringify(reconciliation, null, 2));
    else if (relative === MASTER_MEMORY_RECONCILIATION_PATH) fs.writeFileSync(absolute, 'source-backed Everest -> SUMMIT 100 -> BLACK SKY -> Reality Activation reconciliation\n');
    else if (relative === bootstrap.continuity.handoffPath) fs.writeFileSync(absolute, JSON.stringify(handoff, null, 2));
    else if (relative === EXTERNAL_CAPABILITY_REGISTRY_PATH) fs.writeFileSync(absolute, JSON.stringify(externalCapabilities, null, 2));
    else if (relative === CAPABILITY_GENOME_SOURCE_REGISTRY_PATH) fs.writeFileSync(absolute, JSON.stringify(capabilityGenomeSources, null, 2));
    else if (relative === CAPABILITY_GENOME_ATOM_TAXONOMY_PATH) fs.writeFileSync(absolute, JSON.stringify(capabilityGenomeAtoms, null, 2));
    else if (relative === EVENT_HORIZON_PATH) fs.writeFileSync(absolute, JSON.stringify(eventHorizon, null, 2));
    else fs.writeFileSync(absolute, `fixture for ${relative}\n`);
  }
  return root;
}

test('one-command loader validates actual bootstrap, reconciled memory, and external capability pack into a zero-effect startup packet', () => {
  const root = buildFixture();
  const packet = loadUberBondBrainFromRepository({ rootDir: root, sourceCommit, now: '2026-08-29T05:05:00Z' });
  assert.equal(packet.project, 'UberBond');
  assert.equal(packet.sourceCommit, sourceCommit);
  assert.match(packet.contextDigest, /^[a-f0-9]{64}$/);
  assert.match(packet.memoryDigest, /^[a-f0-9]{64}$/);
  assert.match(packet.memoryReconciliationDigest, /^[a-f0-9]{64}$/);
  assert.match(packet.externalCapabilityDigest, /^[a-f0-9]{64}$/);
  assert.equal(packet.externalCapabilityCount, 8);
  assert.equal(packet.capabilityGenome.health, 'FOUNDATION_HEALTHY');
  assert.equal(packet.capabilityGenome.sourceCount, 10);
  assert.equal(packet.capabilityGenome.rawCandidateCount, 8);
  assert.equal(packet.capabilityGenome.activeCapabilityCount, 0);
  assert.equal(packet.capabilityGenome.corpusTruth, 'SEED_SUPPLIER_REGISTRY_ONLY__NO_WORLD_CORPUS_IMPORTED');
  assert.equal(packet.wallbreaker.status, 'PROJECT_INTEGRATED_PLANNING_PRIMITIVE');
  assert.equal(packet.wallbreaker.policyVersion, 'wallbreaker-1.1.1');
  assert.equal(packet.wallbreaker.businessEffectAuthority, 'NONE');
  assert.equal(packet.eventHorizon.health, 'EVENT_HORIZON_HEALTHY');
  assert.equal(packet.eventHorizon.champion.id, 'lead-path-evidence-sprint');
  assert.equal(packet.eventHorizon.strongestChallenger.id, 'gcc-einvoice-exception-evidence');
  assert.equal(packet.eventHorizon.commercialTruth.clearedRevenueUsd, 0);
  assert.equal(packet.eventHorizon.businessEffectAuthority, 'NONE');
  assert.deepEqual(new Set(packet.externalCapabilities.map(item => item.id)), new Set([
    'find-skills',
    'claude-code-setup',
    'task-observer',
    'claude-mem',
    'headroom',
    'omniroute',
    'strix',
    'agent-reach'
  ]));
  assert.equal(packet.namedInitiativeCount, 34);
  assert.ok(packet.namedInitiatives.some(item => item.name === 'Kilimanjaro'));
  assert.equal(packet.namedInitiatives.find(item => item.name === 'Everest')?.status, 'CANONICAL_LINEAGE');
  assert.ok(packet.namedInitiatives.some(item => item.name === 'SUMMIT 100'));
  assert.ok(packet.namedInitiatives.some(item => item.name === 'BLACK SKY'));
  assert.deepEqual(packet.historicalLineageCorrection, ['Everest', 'SUMMIT 100', 'BLACK SKY', 'Reality Activation']);
  assert.ok(packet.unresolvedNames.some(item => item.name === 'Unreconstructed Owner-Recalled UberBond Programs'));
  assert.ok(!packet.unresolvedNames.some(item => item.name === 'Everest'));
  assert.equal(packet.businessEffectAuthority, 'NONE');
  assert.equal(packet.externalEffectLedger.providerCalls, 0);
});

test('brain fails closed when the external capability registry is corrupted', () => {
  const root = buildFixture(({ externalCapabilities }) => {
    externalCapabilities.entries[0].authority = 'DO_WHATEVER';
  });
  assert.throws(() => loadUberBondBrainFromRepository({ rootDir: root, sourceCommit }), error => {
    assert.equal(error.message, 'external-capability-registry-invalid');
    assert.ok(error.reasonCodes.includes('invalid-capability-entry'));
    return true;
  });
});

test('brain fails closed when the capability genome source registry is corrupted', () => {
  const root = buildFixture(({ capabilityGenomeSources }) => {
    capabilityGenomeSources.sources[1].id = capabilityGenomeSources.sources[0].id;
  });
  assert.throws(() => loadUberBondBrainFromRepository({ rootDir: root, sourceCommit }), error => {
    assert.equal(error.message, 'capability-genome-health-failed');
    assert.ok(error.reasonCodes.includes('unique-source-id-required'));
    return true;
  });
});

test('brain fails closed when Event Horizon invents commercial truth', () => {
  const root = buildFixture(({ eventHorizon }) => {
    eventHorizon.commercialTruth.clearedRevenueUsd = 1;
  });
  assert.throws(() => loadUberBondBrainFromRepository({ rootDir: root, sourceCommit }), error => {
    assert.equal(error.message, 'event-horizon-health-failed');
    assert.ok(error.reasonCodes.includes('unsupported-commercial-outcome'));
    return true;
  });
});

test('brain fails closed when the declared external capability registry disappears', () => {
  const root = buildFixture();
  fs.unlinkSync(path.join(root, EXTERNAL_CAPABILITY_REGISTRY_PATH));
  assert.throws(() => loadUberBondBrainFromRepository({ rootDir: root, sourceCommit }), error => {
    assert.equal(error.message, 'declared-canon-file-missing');
    assert.ok(error.missingPaths.includes(EXTERNAL_CAPABILITY_REGISTRY_PATH));
    return true;
  });
});

test('handoff is explicitly downgraded when its source basis differs from current commit', () => {
  const root = buildFixture();
  const packet = loadUberBondBrainFromRepository({ rootDir: root, sourceCommit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' });
  assert.equal(packet.currentHandoff.freshAgainstSourceCommit, false);
  assert.match(packet.currentHandoff.authority, /RECONCILE_AGAINST_LIVE_GITHUB/);
});

test('matching handoff still remains a hint that requires GitHub dedupe', () => {
  const root = buildFixture(({ handoff }) => {
    handoff.sourceCommit = sourceCommit;
    handoff.sourceMainShaAtMissionStart = sourceCommit;
  });
  const packet = loadUberBondBrainFromRepository({ rootDir: root, sourceCommit });
  assert.equal(packet.currentHandoff.freshAgainstSourceCommit, true);
  assert.match(packet.currentHandoff.authority, /REQUIRES_GITHUB_DEDUPE/);
});

test('missing declared master-memory file fails instead of bootstrapping partial company memory', () => {
  const root = buildFixture();
  fs.unlinkSync(path.join(root, 'docs/UBERBOND_MASTER_MEMORY.md'));
  assert.throws(() => loadUberBondBrainFromRepository({ rootDir: root, sourceCommit }), error => {
    assert.equal(error.message, 'declared-canon-file-missing');
    assert.ok(error.missingPaths.includes('docs/UBERBOND_MASTER_MEMORY.md'));
    return true;
  });
});

test('missing reconciliation overlay fails instead of reviving stale Everest memory', () => {
  const root = buildFixture();
  fs.unlinkSync(path.join(root, MEMORY_RECONCILIATION_PATH));
  assert.throws(() => loadUberBondBrainFromRepository({ rootDir: root, sourceCommit }), /memory-reconciliation-read-failed/);
});

test('memory reconciliation corruption fails closed through canonical context validation', () => {
  const root = buildFixture(({ reconciliation }) => { reconciliation.unresolvedNames = []; });
  assert.throws(() => loadUberBondBrainFromRepository({ rootDir: root, sourceCommit }), error => {
    assert.equal(error.message, 'project-context-validation-failed');
    assert.ok(error.reasonCodes.includes('valid-memory-index-required'));
    return true;
  });
});

test('unsafe canon pointers are rejected before filesystem traversal', () => {
  const root = buildFixture(({ bootstrap }) => { bootstrap.canonPointers.push('../outside.md'); });
  assert.throws(() => loadUberBondBrainFromRepository({ rootDir: root, sourceCommit }), /unsafe-canon-pointer/);
});

test('malformed handoff cannot silently become current execution state', () => {
  const root = buildFixture(({ handoff }) => { delete handoff.activeMission; });
  assert.throws(() => loadUberBondBrainFromRepository({ rootDir: root, sourceCommit }), /handoff-core-fields-invalid/);
});

test('human summary stays bounded and exposes capability assimilation without dumping the corpus', () => {
  const root = buildFixture();
  const packet = loadUberBondBrainFromRepository({ rootDir: root, sourceCommit });
  const output = formatUberBondBrainPacket(packet);
  assert.match(output, /external capabilities: 8 \([a-f0-9]{64}\)/);
  // The genome line gained world-repos, skill-bodies and a corpus label when the
  // bounded harvest landed, and this anchor still expected the fields to be
  // adjacent. Asserted field by field now, so adding another measurement does
  // not break the test while removing one still does -- and so the summary can
  // never quietly stop distinguishing measured seeds from an imported world
  // corpus, which is the distinction the whole line exists to carry.
  assert.match(output, /capability genome: FOUNDATION_HEALTHY;/);
  assert.match(output, /sources=10;/);
  assert.match(output, /measured-seeds=8;/);
  assert.match(output, /world-repos=\d+;/);
  assert.match(output, /skill-bodies=\d+;/);
  assert.match(output, /active=0;/);
  assert.match(output, /corpus=[A-Z_]+/);
  assert.match(output, /initiatives: 34/);
  assert.match(output, /lineage: Everest -> SUMMIT 100 -> BLACK SKY -> Reality Activation/);
  assert.match(output, /unresolved: Unreconstructed Owner-Recalled UberBond Programs/);
  assert.ok(output.length < 1600);
  assert.doesNotMatch(output, /canonicalCommercialOffers/);
});
