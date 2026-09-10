import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = resolve(root, 'scripts/sandwich-method-plan.mjs');
const head = () => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim().toLowerCase();
const target = authority => ({
  targetId: 'synthetic-stronger-system',
  targetRevision: 'r1',
  statement: 'Synthetic target used only to exercise the Sandwich Method planner.',
  authority,
  invariants: ['capability never creates authority'],
  nodes: [
    { id: 'truth', label: 'Synthetic exact-current truth', state: 'VERIFIED_CURRENT', foldClass: 'INTERNAL_SOURCE', requires: [], evidenceRefs: ['synthetic://truth'], executionRequirementIds: ['synthetic-truth'], leverage: 1, effort: 1, uncertainty: 0 },
    { id: 'next', label: 'Synthetic internal next fold', state: 'MISSING', foldClass: 'INTERNAL_SOURCE', requires: ['truth'], evidenceRefs: [], executionRequirementIds: ['synthetic-next'], leverage: 2, effort: 1, uncertainty: 0.2 }
  ]
});

test('planner binds a public synthetic target to exact current git head', () => {
  const dir = mkdtempSync(join(tmpdir(), 'uberbond-sandwich-public-'));
  const file = join(dir, 'target.json');
  writeFileSync(file, JSON.stringify(target('CANONICAL_REPOSITORY')));
  const run = spawnSync(process.execPath, [script, '--target', file], { cwd: root, encoding: 'utf8' });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  const report = JSON.parse(run.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.status, 'SANDWICH_FOLD_READY');
  assert.equal(report.sourceCommit, head());
  assert.equal(report.sandwich.nextFold.id, 'next');
  assert.equal(report.externalEffectAuthority, 'NONE');
});

test('founder-private target never emits its full plan to ordinary stdout', () => {
  const dir = mkdtempSync(join(tmpdir(), 'uberbond-sandwich-private-'));
  const file = join(dir, 'target.json');
  const output = join(dir, 'private-plan.json');
  writeFileSync(file, JSON.stringify(target('FOUNDER_AUTHORIZED_PRIVATE')));

  const refused = spawnSync(process.execPath, [script, '--target', file], { cwd: root, encoding: 'utf8' });
  assert.equal(refused.status, 2);
  assert.match(refused.stdout, /founder-private-plan-requires-explicit-output-outside-repository/);

  const run = spawnSync(process.execPath, [script, '--target', file, '--output', output], { cwd: root, encoding: 'utf8' });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  const publicReceipt = JSON.parse(run.stdout);
  assert.equal(publicReceipt.privateTarget, true);
  assert.equal(publicReceipt.nextFoldPresent, true);
  assert.equal(publicReceipt.sandwich, undefined);
  assert.match(publicReceipt.privacyBoundary, /NOT_EMITTED_TO_STDOUT/);

  const full = JSON.parse(readFileSync(output, 'utf8'));
  assert.equal(full.sandwich.nextFold.id, 'next');
  if (process.platform !== 'win32') assert.equal(statSync(output).mode & 0o777, 0o600);
});
