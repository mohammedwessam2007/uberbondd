import { readFileSync, writeFileSync, cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

export const SUCCESSOR_OPEN_MODEL_MUTATION = Object.freeze({
  id: 'OPENMODEL-07',
  file: 'src/open-model-runtime-executor.mjs',
  find: "    if (!observedModel) {\n      return failure(['open-model-runtime-model-identity-unverified'], 'CONFIRMED_FAILURE', {\n        configuredModel: model,\n        observedModel: null,\n        identityVerification: 'UNVERIFIED'\n      });\n    }",
  replace: "    // OPENMODEL-07 hostile mutation: absent provider identity is allowed through.",
  suite: 'tests/night-verification-frontier-open-model.test.mjs',
  modulePath: '../src/open-model-runtime-executor.mjs',
  testName: 'Open Model runtime must not report successful completion when provider model identity is absent',
  assertionNeedle: "assert.ok(result.reasonCodes.includes('open-model-runtime-model-identity-unverified'));"
});

const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function suiteImportsModule(source, modulePath) {
  const escaped = escapeRegex(modulePath);
  return [
    new RegExp(`\\bfrom\\s*['\"]${escaped}['\"]`),
    new RegExp(`\\bimport\\s*['\"]${escaped}['\"]`),
    new RegExp(`\\bimport\\s*\\(\\s*['\"]${escaped}['\"]\\s*\\)`)
  ].some(pattern => pattern.test(source));
}

function namedTestFailed(output, testName) {
  const escaped = escapeRegex(testName);
  return new RegExp(`(?:^|\\n)not ok \\d+ - ${escaped}(?:\\n|$)`, 'm').test(output)
    || new RegExp(`(?:^|\\n)not ok \\d+ - ${escaped}\\b`, 'm').test(output);
}

function runSuite(root, suite) {
  const result = spawnSync(process.execPath, ['--test', suite], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NODE_OPTIONS: '' }
  });
  return { status: result.status, output: `${result.stdout || ''}${result.stderr || ''}` };
}

function copySubset(root) {
  for (const item of ['src', 'tests', 'scripts', 'config', 'api']) {
    try { cpSync(join(repoRoot, item), join(root, item), { recursive: true }); } catch {}
  }
  for (const file of ['package.json', 'package-lock.json', 'server.mjs', 'worker.mjs']) {
    try { cpSync(join(repoRoot, file), join(root, file)); } catch {}
  }
  try { cpSync(join(repoRoot, 'node_modules'), join(root, 'node_modules'), { recursive: true, dereference: false }); } catch {}
}

export function validateSuccessorOpenModelMutation(root = repoRoot) {
  const mutation = SUCCESSOR_OPEN_MODEL_MUTATION;
  const source = readFileSync(join(root, mutation.file), 'utf8');
  const suite = readFileSync(join(root, mutation.suite), 'utf8');
  const anchorOccurrences = source.split(mutation.find).length - 1;
  const directModuleImport = suiteImportsModule(suite, mutation.modulePath);
  const namedTestPresent = suite.includes(`test('${mutation.testName}'`);
  const assertionPresent = suite.includes(mutation.assertionNeedle);
  return {
    id: mutation.id,
    anchorOccurrences,
    directModuleImport,
    namedTestPresent,
    assertionPresent,
    registrationValid: anchorOccurrences === 1 && directModuleImport && namedTestPresent && assertionPresent
  };
}

export function executeSuccessorOpenModelMutation(root = repoRoot) {
  const mutation = SUCCESSOR_OPEN_MODEL_MUTATION;
  const registration = validateSuccessorOpenModelMutation(root);
  if (!registration.registrationValid) return { registration, verdict: 'INVALID_REGISTRATION' };

  const baseline = runSuite(root, mutation.suite);
  if (baseline.status !== 0) return { registration, verdict: 'BASELINE_NOT_GREEN', baselineStatus: baseline.status };

  const mutantRoot = mkdtempSync(join(tmpdir(), 'uberbond-openmodel07-'));
  try {
    copySubset(mutantRoot);
    const path = join(mutantRoot, mutation.file);
    const source = readFileSync(path, 'utf8');
    const occurrences = source.split(mutation.find).length - 1;
    if (occurrences !== 1) return { registration, verdict: occurrences === 0 ? 'ANCHOR_NOT_FOUND' : 'ANCHOR_AMBIGUOUS' };
    writeFileSync(path, source.replace(mutation.find, mutation.replace));
    const syntax = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
    if (syntax.status !== 0) return { registration, verdict: 'INVALID_MUTANT_SYNTAX', syntaxStatus: syntax.status };

    const mutant = runSuite(mutantRoot, mutation.suite);
    if (mutant.status === 0) return { registration, verdict: 'SURVIVED', baselineStatus: 0, mutantStatus: 0, causalBasis: 'TARGET_SUITE_STILL_GREEN' };
    const intendedTestFailed = namedTestFailed(mutant.output, mutation.testName);
    return {
      registration,
      verdict: intendedTestFailed ? 'KILLED' : 'UNRELATED_SUITE_FAILURE',
      baselineStatus: 0,
      mutantStatus: mutant.status,
      intendedTestFailed,
      causalBasis: intendedTestFailed ? 'BASELINE_GREEN_SINGLE_MUTATION_NAMED_TEST_RED' : 'SUITE_RED_BUT_NAMED_TEST_FAILURE_NOT_EVIDENCED'
    };
  } finally {
    rmSync(mutantRoot, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = executeSuccessorOpenModelMutation();
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.verdict === 'KILLED' ? 0 : 1);
}
