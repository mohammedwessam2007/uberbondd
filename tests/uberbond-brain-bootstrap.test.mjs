import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  loadUberBondBrainFromRepository,
  formatUberBondBrainPacket,
  MEMORY_RECONCILIATION_PATH,
  MASTER_MEMORY_RECONCILIATION_PATH
} from '../scripts/uberbond-brain-bootstrap.mjs';

const sourceRoot = path.resolve(new URL('..', import.meta.url).pathname);
const sourceCommit = 'b894a4cfae8acddd6170095f2373f339ff65f15c';

function buildFixture(mutator = null) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'uberbond-brain-fixture-'));
  const bootstrap = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'UBERBOND_BOOTSTRAP.json'), 'utf8'));
  const memory = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'artifacts/uberbond-memory-index.json'), 'utf8'));
  const reconciliation = JSON.parse(fs.readFileSync(path.join(sourceRoot, MEMORY_RECONCILIATION_PATH), 'utf8'));
  const handoff = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'docs/CURRENT_HANDOFF.json'), 'utf8'));
  mutator?.({ bootstrap, memory, reconciliation, handoff });
  for (const relative of new Set([
    'UBERBOND_BOOTSTRAP.json',
    MEMORY_RECONCILIATION_PATH,
    MASTER_MEMORY_RECONCILIATION_PATH,
    ...bootstrap.canonPointers
  ])) {
    const absolute = path.join(root, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    if (relative === 'UBERBOND_BOOTSTRAP.json') fs.writeFileSync(absolute, JSON.stringify(bootstrap, null, 2));
    else if (relative === bootstrap.memoryIndexPath) fs.writeFileSync(absolute, JSON.stringify(memory, null, 2));
    else if (relative === MEMORY_RECONCILIATION_PATH) fs.writeFileSync(absolute, JSON.stringify(reconciliation, null, 2));
    else if (relative === MASTER_MEMORY_RECONCILIATION_PATH) fs.writeFileSync(absolute, 'source-backed Everest -> SUMMIT 100 -> BLACK SKY -> Reality Activation reconciliation\n');
    else if (relative === bootstrap.continuity.handoffPath) fs.writeFileSync(absolute, JSON.stringify(handoff, null, 2));
    else fs.writeFileSync(absolute, `fixture for ${relative}\n`);
  }
  return root;
}

test('one-command loader validates actual bootstrap and reconciled memory into a zero-effect startup packet', () => {
  const root = buildFixture();
  const packet = loadUberBondBrainFromRepository({ rootDir: root, sourceCommit, now: '2026-08-29T05:05:00Z' });
  assert.equal(packet.project, 'UberBond');
  assert.equal(packet.sourceCommit, sourceCommit);
  assert.match(packet.contextDigest, /^[a-f0-9]{64}$/);
  assert.match(packet.memoryDigest, /^[a-f0-9]{64}$/);
  assert.match(packet.memoryReconciliationDigest, /^[a-f0-9]{64}$/);
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

test('human summary stays bounded and names corrected lineage without dumping the corpus', () => {
  const root = buildFixture();
  const packet = loadUberBondBrainFromRepository({ rootDir: root, sourceCommit });
  const output = formatUberBondBrainPacket(packet);
  assert.match(output, /initiatives: 34/);
  assert.match(output, /lineage: Everest -> SUMMIT 100 -> BLACK SKY -> Reality Activation/);
  assert.match(output, /unresolved: Unreconstructed Owner-Recalled UberBond Programs/);
  assert.ok(output.length < 1400);
  assert.doesNotMatch(output, /canonicalCommercialOffers/);
});
