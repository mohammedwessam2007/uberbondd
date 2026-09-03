import { readFileSync, writeFileSync, cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { NIGHT_VERIFICATION_MUTATIONS_V2 } from './night-verification-mutation-war-v2.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

export const MUTATION_TEST_NAMES = Object.freeze({
  'FRONTIER-01': 'uncertain proof cannot become goal success',
  'FRONTIER-02': 'overlapping worker ownership requires serialization',
  'FRONTIER-03': 'persistent loop requires bounded stop conditions and stays plan-only',
  'FRONTIER-04': 'context spine rejects a selected root whose declared dependency is absent',
  'FRONTIER-05': 'artifact completion refuses missing and uncertain checks',
  'FRONTIER-06': 'visual verification cannot pass with an uncovered dimension',
  'FRONTIER-07': 'canonical worker compiler keeps providers interchangeable and forbids self certification',
  'OPENMODEL-01': 'open-model classification never treats license text as automatic commercial authority',
  'OPENMODEL-02': 'private models are discovered as rejected candidates rather than runnable supplies',
  'OPENMODEL-03': 'foundry admission blocks missing license, revision, runtime cost, or observed weights',
  'OPENMODEL-04': 'open weights are rejected when runtime cost is unknown',
  'OPENMODEL-05': 'model ranking excludes revoked and permission-ineligible suppliers',
  'OPENMODEL-06': 'open-model executor enforces local-preparation consequence class'
});

function runSuite(root, suite) {
  const result = spawnSync(process.execPath, ['--test', suite], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NODE_OPTIONS: '' }
  });
  return { status: result.status, output: `${result.stdout || ''}${result.stderr || ''}` };
}

function copyRepoSubset(root) {
  for (const item of ['src', 'tests', 'scripts', 'config', 'api']) {
    try { cpSync(join(repoRoot, item), join(root, item), { recursive: true }); } catch {}
  }
  for (const file of ['package.json', 'package-lock.json', 'server.mjs', 'worker.mjs']) {
    try { cpSync(join(repoRoot, file), join(root, file)); } catch {}
  }
  try { cpSync(join(repoRoot, 'node_modules'), join(root, 'node_modules'), { recursive: true, dereference: false }); } catch {}
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function namedTestFailed(output, testName) {
  const escaped = escapeRegex(testName);
  return new RegExp(`(?:^|\\n)not ok \\d+ - ${escaped}(?:\\n|$)`, 'm').test(output)
    || new RegExp(`(?:^|\\n)not ok \\d+ - ${escaped}\\b`, 'm').test(output);
}

export function validateNamedMutationRegistrations(root = repoRoot) {
  return NIGHT_VERIFICATION_MUTATIONS_V2.map(mutation => {
    const testName = MUTATION_TEST_NAMES[mutation.id] || null;
    const suite = readFileSync(join(root, mutation.suite), 'utf8');
    const source = readFileSync(join(root, mutation.file), 'utf8');
    const anchorOccurrences = source.split(mutation.find).length - 1;
    const importsMutatedModule = suite.includes(mutation.importNeedle);
    const assertionPresent = suite.includes(mutation.assertionNeedle);
    const namedTestPresent = Boolean(testName) && suite.includes(`test('${testName}'`);
    return {
      id: mutation.id,
      testName,
      anchorOccurrences,
      importsMutatedModule,
      assertionPresent,
      namedTestPresent,
      registrationValid: anchorOccurrences === 1 && importsMutatedModule && assertionPresent && namedTestPresent
    };
  });
}

export function executeMutationWarV3(root = repoRoot) {
  const registrations = validateNamedMutationRegistrations(root);
  const invalid = registrations.filter(item => !item.registrationValid);
  if (invalid.length) {
    return { registrations, results: invalid.map(item => ({ id: item.id, verdict: 'INVALID_REGISTRATION' })) };
  }

  const baselineBySuite = new Map();
  for (const mutation of NIGHT_VERIFICATION_MUTATIONS_V2) {
    if (!baselineBySuite.has(mutation.suite)) baselineBySuite.set(mutation.suite, runSuite(root, mutation.suite));
  }

  const results = [];
  for (const mutation of NIGHT_VERIFICATION_MUTATIONS_V2) {
    const baseline = baselineBySuite.get(mutation.suite);
    const testName = MUTATION_TEST_NAMES[mutation.id];
    if (baseline.status !== 0) {
      results.push({ id: mutation.id, verdict: 'BASELINE_NOT_GREEN', baselineStatus: baseline.status, testName });
      continue;
    }

    const mutantRoot = mkdtempSync(join(tmpdir(), 'uberbond-night-v3-'));
    try {
      copyRepoSubset(mutantRoot);
      const path = join(mutantRoot, mutation.file);
      const source = readFileSync(path, 'utf8');
      const occurrences = source.split(mutation.find).length - 1;
      if (occurrences !== 1) {
        results.push({ id: mutation.id, verdict: occurrences === 0 ? 'ANCHOR_NOT_FOUND' : 'ANCHOR_AMBIGUOUS', testName });
        continue;
      }
      writeFileSync(path, source.replace(mutation.find, mutation.replace));
      const syntax = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
      if (syntax.status !== 0) {
        results.push({ id: mutation.id, verdict: 'INVALID_MUTANT_SYNTAX', syntaxStatus: syntax.status, testName });
        continue;
      }

      const mutant = runSuite(mutantRoot, mutation.suite);
      if (mutant.status === 0) {
        results.push({ id: mutation.id, verdict: 'SURVIVED', baselineStatus: baseline.status, mutantStatus: 0, testName, causalBasis: 'TARGET_SUITE_STILL_GREEN' });
        continue;
      }
      const intendedTestFailed = namedTestFailed(mutant.output, testName);
      results.push({
        id: mutation.id,
        verdict: intendedTestFailed ? 'KILLED' : 'UNRELATED_SUITE_FAILURE',
        baselineStatus: baseline.status,
        mutantStatus: mutant.status,
        testName,
        intendedTestFailed,
        causalBasis: intendedTestFailed
          ? 'BASELINE_GREEN_SINGLE_MUTATION_NAMED_TEST_RED'
          : 'SUITE_RED_BUT_NAMED_TEST_FAILURE_NOT_EVIDENCED'
      });
    } finally {
      rmSync(mutantRoot, { recursive: true, force: true });
    }
  }
  return { registrations, results };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = executeMutationWarV3();
  console.log(JSON.stringify(report, null, 2));
  const allKilled = report.results.length === NIGHT_VERIFICATION_MUTATIONS_V2.length
    && report.results.every(item => item.verdict === 'KILLED');
  process.exit(allKilled ? 0 : 1);
}
