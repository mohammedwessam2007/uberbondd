import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  compileVercelImmutableInstallPlan,
  parsePorcelainPaths
} from '../scripts/vercel-immutable-install.mjs';
import { truthInputDirtyPaths } from '../src/current-truth-regeneration.mjs';

test('root and lite Vercel projects install through the immutable lockfile gate', () => {
  const root = JSON.parse(readFileSync('vercel.json', 'utf8'));
  const lite = JSON.parse(readFileSync('lite/vercel.json', 'utf8'));

  assert.equal(root.installCommand, 'node scripts/vercel-immutable-install.mjs');
  assert.equal(lite.installCommand, 'node ../scripts/vercel-immutable-install.mjs');
  assert.doesNotMatch(root.installCommand, /npm\s+install/);
  assert.doesNotMatch(lite.installCommand, /npm\s+install/);
});

test('immutable Vercel install uses npm ci with dev dependencies from repository root', () => {
  const plan = compileVercelImmutableInstallPlan({ cwd: '/repo' });
  assert.equal(plan.cwd, '/repo');
  assert.equal(plan.command === 'npm' || plan.command === 'npm.cmd', true);
  assert.deepEqual([...plan.args], ['ci', '--include=dev']);
  assert.deepEqual([...plan.protectedFiles], ['package.json', 'package-lock.json']);
  assert.match(plan.mutationPolicy, /CLEAN_BEFORE_AND_AFTER_INSTALL/);
});

test('package-lock remains protected exact-source truth rather than provider workspace dirt', () => {
  assert.deepEqual(
    truthInputDirtyPaths(['.vercel/project.json', 'package-lock.json', 'node_modules/x']),
    ['package-lock.json']
  );
});

test('porcelain classifier reports only actual tracked package paths', () => {
  assert.deepEqual(
    parsePorcelainPaths(' M package-lock.json\n M package.json\n'),
    ['package-lock.json', 'package.json']
  );
  assert.deepEqual(parsePorcelainPaths(''), []);
});

test('installer has no lockfile-reset or dirty-checkout escape hatch', () => {
  const body = readFileSync('scripts/vercel-immutable-install.mjs', 'utf8');
  assert.match(body, /\['ci', '--include=dev'\]/);
  assert.match(body, /package-truth-dirty-before-install/);
  assert.match(body, /package-truth-mutated-by-install/);
  assert.doesNotMatch(body, /git\s+(?:checkout|restore|reset)/);
  assert.doesNotMatch(body, /npm\s+install/);
  assert.doesNotMatch(body, /--force/);
});
