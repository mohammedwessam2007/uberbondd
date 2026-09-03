import { readFileSync, writeFileSync, cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

export const NIGHT_VERIFICATION_MUTATIONS_V2 = Object.freeze([
  {
    id: 'FRONTIER-01', file: 'src/frontier-operator.mjs',
    find: '  const complete = missing.length === 0 && failed.length === 0 && uncertain.length === 0;',
    replace: '  const complete = missing.length === 0 && failed.length === 0;',
    suite: 'tests/frontier-expansion.test.mjs', importNeedle: "../src/frontier-operator.mjs",
    assertionNeedle: 'assert.equal(result.complete, false);'
  },
  {
    id: 'FRONTIER-02', file: 'src/frontier-operator.mjs',
    find: '    parallelExecutionAuthorized: false', replace: '    parallelExecutionAuthorized: true',
    suite: 'tests/frontier-expansion.test.mjs', importNeedle: "../src/frontier-operator.mjs",
    assertionNeedle: 'assert.equal(result.parallelExecutionAuthorized, false);'
  },
  {
    id: 'FRONTIER-03', file: 'src/frontier-operator.mjs',
    find: "    schedulingAuthority: 'NONE'", replace: "    schedulingAuthority: 'SCHEDULE'",
    suite: 'tests/frontier-expansion.test.mjs', importNeedle: "../src/frontier-operator.mjs",
    assertionNeedle: "assert.equal(valid.schedulingAuthority, 'NONE');"
  },
  {
    id: 'FRONTIER-04', file: 'src/frontier-context-spine.mjs',
    find: '      if (!dependency || !includeWithDependencies(dependency, nextTrail)) return false;',
    replace: '      if (dependency && !includeWithDependencies(dependency, nextTrail)) return false;',
    suite: 'tests/frontier-parity-autonomy.test.mjs', importNeedle: "../src/frontier-context-spine.mjs",
    assertionNeedle: 'assert.equal(result.ok, false);'
  },
  {
    id: 'FRONTIER-05', file: 'src/frontier-artifact-verifier.mjs',
    find: '  const complete = missing.length === 0 && failed.length === 0 && uncertain.length === 0;',
    replace: '  const complete = missing.length === 0 && failed.length === 0;',
    suite: 'tests/frontier-parity-autonomy.test.mjs', importNeedle: "../src/frontier-artifact-verifier.mjs",
    assertionNeedle: 'assert.equal(result.complete, false);'
  },
  {
    id: 'FRONTIER-06', file: 'src/frontier-artifact-verifier.mjs',
    find: '  const pass = missing.length === 0 && failed.length === 0 && uncertain.length === 0;',
    replace: '  const pass = failed.length === 0 && uncertain.length === 0;',
    suite: 'tests/frontier-parity-autonomy.test.mjs', importNeedle: "../src/frontier-artifact-verifier.mjs",
    assertionNeedle: 'assert.equal(result.pass, false);'
  },
  {
    id: 'FRONTIER-07', file: 'src/frontier-worker-compiler.mjs',
    find: '    selfCertificationAllowed: false,', replace: '    selfCertificationAllowed: true,',
    suite: 'tests/frontier-parity-autonomy.test.mjs', importNeedle: "../src/frontier-worker-compiler.mjs",
    assertionNeedle: 'assert.equal(result.manifest.selfCertificationAllowed, false);'
  },
  {
    id: 'OPENMODEL-01', file: 'src/open-model-universe.mjs',
    find: "  if (PERMISSIVE_LICENSES.has(license)) return { license, class: 'PERMISSIVE', automaticCommercialEligibility: false };",
    replace: "  if (PERMISSIVE_LICENSES.has(license)) return { license, class: 'PERMISSIVE', automaticCommercialEligibility: true };",
    suite: 'tests/open-model-universe-runtime.test.mjs', importNeedle: "../src/open-model-universe.mjs",
    assertionNeedle: 'assert.equal(result.automaticCommercialEligibility, false);'
  },
  {
    id: 'OPENMODEL-02', file: 'src/open-model-universe.mjs',
    find: "      admissionState: privateModel ? 'REJECT_PRIVATE_DISCOVERY' : gated ? 'GATED_REVIEW_REQUIRED' : 'DISCOVERED_UNSCREENED',",
    replace: "      admissionState: gated ? 'GATED_REVIEW_REQUIRED' : 'DISCOVERED_UNSCREENED',",
    suite: 'tests/open-model-universe-runtime.test.mjs', importNeedle: "../src/open-model-universe.mjs",
    assertionNeedle: "assert.equal(result.discovery.admissionState, 'REJECT_PRIVATE_DISCOVERY');"
  },
  {
    id: 'OPENMODEL-03', file: 'src/open-model-universe.mjs',
    find: '  const runtimeCostKnown = runtimeObservation.runtimeCostKnown === true;', replace: '  const runtimeCostKnown = true;',
    suite: 'tests/open-model-universe-runtime.test.mjs', importNeedle: "../src/open-model-universe.mjs",
    assertionNeedle: "assert.ok(result.reasonCodes.includes('runtime-cost-observation-required'));"
  },
  {
    id: 'OPENMODEL-04', file: 'src/open-model-foundry.mjs',
    find: "  if (['OPEN_WEIGHT', 'LOCAL_RUNTIME', 'HOSTED_OPEN_WEIGHT'].includes(supplyType) && !runtimeCostKnown) reasonCodes.push('open-or-local-runtime-cost-must-be-known');",
    replace: "  if (false) reasonCodes.push('open-or-local-runtime-cost-must-be-known');",
    suite: 'tests/frontier-expansion.test.mjs', importNeedle: "../src/open-model-foundry.mjs",
    assertionNeedle: "assert.ok(result.reasonCodes.includes('open-or-local-runtime-cost-must-be-known'));"
  },
  {
    id: 'OPENMODEL-05', file: 'src/open-model-foundry.mjs',
    find: "    if (!supply.permissionEligible) reasons.push('permission-not-eligible');", replace: "    if (false) reasons.push('permission-not-eligible');",
    suite: 'tests/frontier-expansion.test.mjs', importNeedle: "../src/open-model-foundry.mjs",
    assertionNeedle: 'assert.equal(result.rejected.length, 2);'
  },
  {
    id: 'OPENMODEL-06', file: 'src/open-model-runtime-executor.mjs',
    find: "    if (task.consequenceClass && task.consequenceClass !== 'LOCAL_PREPARATION') return failure(['open-model-worker-only-accepts-local-preparation']);",
    replace: "    if (false) return failure(['open-model-worker-only-accepts-local-preparation']);",
    suite: 'tests/open-model-universe-runtime.test.mjs', importNeedle: "../src/open-model-runtime-executor.mjs",
    assertionNeedle: "assert.ok(result.reasonCodes.includes('open-model-worker-only-accepts-local-preparation'));"
  }
]);

function runSuite(root, suite) {
  const result = spawnSync(process.execPath, ['--test', suite], {
    cwd: root, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' }
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

export function validateMutationRegistrations(root = repoRoot) {
  return NIGHT_VERIFICATION_MUTATIONS_V2.map(mutation => {
    const source = readFileSync(join(root, mutation.file), 'utf8');
    const suite = readFileSync(join(root, mutation.suite), 'utf8');
    const anchorOccurrences = source.split(mutation.find).length - 1;
    const importsMutatedModule = suite.includes(mutation.importNeedle);
    const assertionPresent = suite.includes(mutation.assertionNeedle);
    return {
      id: mutation.id,
      anchorOccurrences,
      importsMutatedModule,
      assertionPresent,
      registrationValid: anchorOccurrences === 1 && importsMutatedModule && assertionPresent
    };
  });
}

export function executeMutationWar(root = repoRoot) {
  const registrations = validateMutationRegistrations(root);
  const invalidRegistrations = registrations.filter(item => !item.registrationValid);
  if (invalidRegistrations.length) return { registrations, results: invalidRegistrations.map(item => ({ id: item.id, verdict: 'INVALID_REGISTRATION' })) };

  const baselineBySuite = new Map();
  for (const mutation of NIGHT_VERIFICATION_MUTATIONS_V2) {
    if (!baselineBySuite.has(mutation.suite)) baselineBySuite.set(mutation.suite, runSuite(root, mutation.suite));
  }

  const results = [];
  for (const mutation of NIGHT_VERIFICATION_MUTATIONS_V2) {
    const baseline = baselineBySuite.get(mutation.suite);
    if (baseline.status !== 0) {
      results.push({ id: mutation.id, verdict: 'BASELINE_NOT_GREEN', baselineStatus: baseline.status });
      continue;
    }
    const mutantRoot = mkdtempSync(join(tmpdir(), 'uberbond-night-v2-'));
    try {
      copyRepoSubset(mutantRoot);
      const path = join(mutantRoot, mutation.file);
      const source = readFileSync(path, 'utf8');
      const occurrences = source.split(mutation.find).length - 1;
      if (occurrences !== 1) {
        results.push({ id: mutation.id, verdict: occurrences === 0 ? 'ANCHOR_NOT_FOUND' : 'ANCHOR_AMBIGUOUS' });
        continue;
      }
      writeFileSync(path, source.replace(mutation.find, mutation.replace));
      const syntax = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
      if (syntax.status !== 0) {
        results.push({ id: mutation.id, verdict: 'INVALID_MUTANT_SYNTAX', syntaxStatus: syntax.status });
        continue;
      }
      const mutant = runSuite(mutantRoot, mutation.suite);
      results.push({
        id: mutation.id,
        verdict: mutant.status === 0 ? 'SURVIVED' : 'KILLED',
        baselineStatus: baseline.status,
        mutantStatus: mutant.status,
        causalBasis: mutant.status === 0 ? 'TARGET_SUITE_STILL_GREEN' : 'BASELINE_GREEN_SINGLE_MUTATION_TARGET_SUITE_RED'
      });
    } finally {
      rmSync(mutantRoot, { recursive: true, force: true });
    }
  }
  return { registrations, results };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = executeMutationWar();
  console.log(JSON.stringify(report, null, 2));
  const valid = report.results.length === NIGHT_VERIFICATION_MUTATIONS_V2.length;
  const allKilled = valid && report.results.every(item => item.verdict === 'KILLED');
  process.exit(allKilled ? 0 : 1);
}
