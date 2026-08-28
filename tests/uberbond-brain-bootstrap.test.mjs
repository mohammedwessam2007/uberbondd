import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadUberBondBrainFromRepository, formatUberBondBrainPacket } from '../scripts/uberbond-brain-bootstrap.mjs';

const sourceRoot = path.resolve(new URL('..', import.meta.url).pathname);
const sourceCommit = 'b894a4cfae8acddd6170095f2373f339ff65f15c';

function buildFixture(mutator = null) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'uberbond-brain-fixture-'));
  const bootstrap = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'UBERBOND_BOOTSTRAP.json'), 'utf8'));
  const memory = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'artifacts/uberbond-memory-index.json'), 'utf8'));
  const handoff = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'docs/CURRENT_HANDOFF.json'), 'utf8'));
  mutator?.({ bootstrap, memory, handoff });
  for (const relative of new Set(['UBERBOND_BOOTSTRAP.json', ...bootstrap.canonPointers])) {
    const absolute = path.join(root, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    if (relative === 'UBERBOND_BOOTSTRAP.json') fs.writeFileSync(absolute, JSON.stringify(bootstrap, null, 2));
    else if (relative === bootstrap.memoryIndexPath) fs.writeFileSync(absolute, JSON.stringify(memory, null, 2));
    else if (relative === bootstrap.continuity.handoffPath) fs.writeFileSync(absolute, JSON.stringify(handoff, null, 2));
    else fs.writeFileSync(absolute, `fixture for ${relative}\n`);
  }
  return root;
}

test('one-command loader validates actual bootstrap and memory into a zero-effect startup packet', () => {
  const root = buildFixture();
  const packet = loadUberBondBrainFromRepository({ rootDir: root, sourceCommit, handoffFileCommit: sourceCommit, now: '2026-08-28T20:00:00Z' });
  assert.equal(packet.project, 'UberBond');
  assert.equal(packet.sourceCommit, sourceCommit);
  assert.match(packet.contextDigest, /^[a-f0-9]{64}$/);
  assert.match(packet.memoryDigest, /^[a-f0-9]{64}$/);
  assert.equal(packet.namedInitiativeCount, 31);
  assert.ok(packet.namedInitiatives.some(item => item.name === 'Kilimanjaro'));
  assert.ok(packet.unresolvedNames.some(item => item.name === 'Everest'));
  assert.equal(packet.businessEffectAuthority, 'NONE');
  assert.equal(packet.externalEffectLedger.providerCalls, 0);
});

test('handoff is explicitly downgraded when its file commit differs from current source', () => {
  const root = buildFixture();
  const packet = loadUberBondBrainFromRepository({ rootDir: root, sourceCommit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', handoffFileCommit: sourceCommit });
  assert.equal(packet.currentHandoff.freshAgainstSourceCommit, false);
  assert.match(packet.currentHandoff.authority, /RECONCILE_AGAINST_LIVE_GITHUB/);
});

test('freshness follows the actual handoff file commit rather than its historical source-main basis', () => {
  const root = buildFixture(({ handoff }) => { handoff.sourceMainShaAtMissionStart = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'; });
  const packet = loadUberBondBrainFromRepository({ rootDir: root, sourceCommit, handoffFileCommit: sourceCommit });
  assert.equal(packet.currentHandoff.freshAgainstSourceCommit, true);
  assert.equal(packet.currentHandoff.handoffFileCommit, sourceCommit);
  assert.match(packet.currentHandoff.authority, /REQUIRES_GITHUB_DEDUPE/);
});

test('missing declared canon file fails instead of bootstrapping a partial company memory', () => {
  const root = buildFixture();
  fs.unlinkSync(path.join(root, 'docs/UBERBOND_MASTER_MEMORY.md'));
  assert.throws(() => loadUberBondBrainFromRepository({ rootDir: root, sourceCommit, handoffFileCommit: sourceCommit }), error => {
    assert.equal(error.message, 'declared-canon-file-missing');
    assert.ok(error.missingPaths.includes('docs/UBERBOND_MASTER_MEMORY.md'));
    return true;
  });
});

test('memory corruption fails closed through the canonical context validator', () => {
  const root = buildFixture(({ memory }) => { memory.unresolvedNames = []; });
  assert.throws(() => loadUberBondBrainFromRepository({ rootDir: root, sourceCommit, handoffFileCommit: sourceCommit }), error => {
    assert.equal(error.message, 'project-context-validation-failed');
    assert.ok(error.reasonCodes.includes('valid-memory-index-required'));
    return true;
  });
});

test('unsafe canon pointers are rejected before filesystem traversal', () => {
  const root = buildFixture(({ bootstrap }) => { bootstrap.canonPointers.push('../outside.md'); });
  assert.throws(() => loadUberBondBrainFromRepository({ rootDir: root, sourceCommit, handoffFileCommit: sourceCommit }), /unsafe-canon-pointer/);
});

test('malformed handoff cannot silently become current execution state', () => {
  const root = buildFixture(({ handoff }) => { delete handoff.activeMission; });
  assert.throws(() => loadUberBondBrainFromRepository({ rootDir: root, sourceCommit, handoffFileCommit: sourceCommit }), /handoff-core-fields-invalid/);
});

test('human summary stays bounded and names unresolved memory without dumping the corpus', () => {
  const root = buildFixture();
  const packet = loadUberBondBrainFromRepository({ rootDir: root, sourceCommit, handoffFileCommit: sourceCommit });
  const output = formatUberBondBrainPacket(packet);
  assert.match(output, /initiatives: 31/);
  assert.match(output, /unresolved: Everest/);
  assert.ok(output.length < 1200);
  assert.doesNotMatch(output, /canonicalCommercialOffers/);
});
