import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildCurrentRealityFreeze } from '../scripts/current-reality-freeze.mjs';

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function writeJson(root, relative, value) {
  const path = join(root, relative);
  mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

test('real git history distinguishes truth-only advancement from relevant source drift', () => {
  const root = mkdtempSync(join(tmpdir(), 'uberbond-reality-freeze-'));
  try {
    git(root, ['init', '-b', 'main']);
    git(root, ['config', 'user.email', 'freeze-test@example.invalid']);
    git(root, ['config', 'user.name', 'UberBond Freeze Test']);

    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src/base.mjs'), 'export const base = true;\n');
    git(root, ['add', '.']);
    git(root, ['commit', '-m', 'base source']);
    const base = git(root, ['rev-parse', 'HEAD']);

    writeJson(root, 'docs/CURRENT_HANDOFF.json', {
      activeMission: `continue from exact current main ${base}`,
      sourceCommit: base,
      currentTruth: { main: base },
      latestOrchestrationCheckpoint: { observedMain: base }
    });
    writeJson(root, 'artifacts/system-readiness.json', { repository: { head: base } });
    writeJson(root, 'artifacts/sovereign/implementation-coverage-matrix.json', { sourceCommit: base });
    writeJson(root, 'artifacts/work/astra-orchestrator-state-2026-09-08.json', {
      checkpoint: { observedMain: base }
    });
    git(root, ['add', '.']);
    git(root, ['commit', '-m', 'truth snapshot']);

    const truthOnly = buildCurrentRealityFreeze({ rootDir: root });
    assert.equal(truthOnly.ok, true);
    assert.equal(truthOnly.status, 'CURRENT_REALITY_FROZEN');
    assert.ok(truthOnly.handoff.presentTenseMainClaims.every(row => row.status === 'CURRENT_SOURCE_EQUIVALENT'));
    assert.ok(truthOnly.generatedArtifacts.every(row => row.status === 'CURRENT_SOURCE_EQUIVALENT'));

    writeFileSync(join(root, 'src/changed.mjs'), 'export const changed = true;\n');
    git(root, ['add', '.']);
    git(root, ['commit', '-m', 'relevant source change']);

    const drifted = buildCurrentRealityFreeze({ rootDir: root });
    assert.equal(drifted.ok, false);
    assert.equal(drifted.status, 'CURRENT_REALITY_REFUSED__PRESENT_TENSE_SOURCE_CHANGED');
    assert.deepEqual(
      drifted.handoff.stalePresentTenseClaims.map(row => row.pointer).sort(),
      ['activeMission.currentMain', 'currentTruth.main']
    );
    assert.deepEqual(drifted.staleGeneratedArtifactIds.sort(), ['sovereign-coverage', 'system-readiness']);
    assert.equal(drifted.closureBoundary.sourceTruth, 'REFUSED_SOURCE_CHANGED');
    assert.equal(drifted.closureBoundary.runtimeTruth, 'NOT_INFERRED_FROM_REPOSITORY_FREEZE');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
