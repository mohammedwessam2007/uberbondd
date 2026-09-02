import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { applyMutation, classifySuiteRun } from './mutation-verdict.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const MUTATIONS = [
  {
    id: 'WALL-01',
    guard: 'An uncertain provider outcome cannot regain identical-retry eligibility',
    file: 'src/wallbreaker.mjs',
    find: "  const inferredRetrySafety = RETRYABLE_FAILURES.has(failureClass) && input.outcomeUncertain !== true;",
    replace: "  const inferredRetrySafety = RETRYABLE_FAILURES.has(failureClass);",
    suites: ['tests/wallbreaker-retry-safety.test.mjs']
  },
  {
    id: 'WALL-02',
    guard: 'Unsafe provider failures explicitly forbid blind identical retry',
    file: 'src/wallbreaker.mjs',
    find: "  if (failure.failureClass === 'PROVIDER_FAILURE' && !failure.safeToRetrySameMechanism) forbidden.push('blind-identical-retry');",
    replace: "  if (false) forbidden.push('blind-identical-retry');",
    suites: ['tests/wallbreaker-retry-safety.test.mjs']
  },
  {
    id: 'WALL-03',
    guard: 'Authority blocks forbid permission circumvention and terms bypass',
    file: 'src/wallbreaker.mjs',
    find: "  if (failure.failureClass === 'AUTHORITY_BLOCK') forbidden.push('circumvent-permission', 'bypass-terms', 'impersonate-authority');",
    replace: "  if (false) forbidden.push('circumvent-permission', 'bypass-terms', 'impersonate-authority');",
    suites: ['tests/wallbreaker.test.mjs']
  }
];

function runSuites(root, suites) {
  const run = spawnSync(process.execPath, ['--test', ...suites], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, OMNIA_V9_TEST_DATABASE_URL: '' }
  });
  return { status: run.status, output: `${run.stdout || ''}\n${run.stderr || ''}` };
}

const results = [];
for (const mutation of MUTATIONS) {
  const root = mkdtempSync(join(tmpdir(), `uberbond-night-mut-${mutation.id}-`));
  try {
    for (const dir of ['src', 'tests', 'scripts', 'config']) {
      cpSync(join(repoRoot, dir), join(root, dir), { recursive: true });
    }
    cpSync(join(repoRoot, 'package.json'), join(root, 'package.json'));
    cpSync(join(repoRoot, 'node_modules'), join(root, 'node_modules'), { recursive: true, dereference: false });

    const applied = applyMutation(root, mutation);
    if (!applied.applied) {
      results.push({ ...mutation, verdict: applied.reason === 'anchor-ambiguous' ? 'ANCHOR_AMBIGUOUS' : 'ANCHOR_NOT_FOUND' });
      continue;
    }
    const syntax = spawnSync(process.execPath, ['--check', join(root, mutation.file)], { encoding: 'utf8' });
    if (syntax.status !== 0) {
      results.push({ ...mutation, verdict: 'MUTANT_DID_NOT_PARSE' });
      continue;
    }
    results.push({ ...mutation, verdict: classifySuiteRun(runSuites(root, mutation.suites)) });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const killed = results.filter(item => item.verdict === 'KILLED');
const skipped = results.filter(item => item.verdict === 'NO_ASSERTIONS_RAN' || item.verdict === 'SUITE_DID_NOT_RUN');
const failed = results.filter(item => item.verdict !== 'KILLED' && !skipped.includes(item));
for (const item of results) console.log(`${item.verdict.padEnd(22)} ${item.id.padEnd(10)} ${item.guard}`);
console.log(`night-verification-mutation-extension — ${results.length} mutations, ${killed.length} killed, ${failed.length} failed, ${skipped.length} unexecuted`);
process.exit(killed.length === results.length ? 0 : 1);
