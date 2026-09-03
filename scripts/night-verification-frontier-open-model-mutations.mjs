import { readFileSync, writeFileSync, cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

export const FRONTIER_OPEN_MODEL_MUTATIONS = Object.freeze([
  {
    id: 'FRONTIER-01',
    guard: 'Uncertain proof cannot complete a goal',
    file: 'src/frontier-operator.mjs',
    find: '  const complete = missing.length === 0 && failed.length === 0 && uncertain.length === 0;',
    replace: '  const complete = missing.length === 0 && failed.length === 0;',
    suites: ['tests/frontier-expansion.test.mjs'],
    assertionNeedle: "assert.equal(result.complete, false);"
  },
  {
    id: 'FRONTIER-02',
    guard: 'Overlapping ownership never authorizes parallel execution',
    file: 'src/frontier-operator.mjs',
    find: '    parallelExecutionAuthorized: false',
    replace: '    parallelExecutionAuthorized: true',
    suites: ['tests/frontier-expansion.test.mjs'],
    assertionNeedle: 'assert.equal(result.parallelExecutionAuthorized, false);'
  },
  {
    id: 'FRONTIER-03',
    guard: 'A persistent-loop plan grants no scheduling authority',
    file: 'src/frontier-operator.mjs',
    find: "    schedulingAuthority: 'NONE'",
    replace: "    schedulingAuthority: 'SCHEDULE'",
    suites: ['tests/frontier-expansion.test.mjs'],
    assertionNeedle: "assert.equal(valid.schedulingAuthority, 'NONE');"
  },
  {
    id: 'OPENMODEL-01',
    guard: 'A permissive license never creates automatic commercial eligibility',
    file: 'src/open-model-universe.mjs',
    find: "  if (PERMISSIVE_LICENSES.has(license)) return { license, class: 'PERMISSIVE', automaticCommercialEligibility: false };",
    replace: "  if (PERMISSIVE_LICENSES.has(license)) return { license, class: 'PERMISSIVE', automaticCommercialEligibility: true };",
    suites: ['tests/open-model-universe-runtime.test.mjs'],
    assertionNeedle: 'assert.equal(result.automaticCommercialEligibility, false);'
  },
  {
    id: 'OPENMODEL-02',
    guard: 'Private models remain rejected discovery candidates',
    file: 'src/open-model-universe.mjs',
    find: "      admissionState: privateModel ? 'REJECT_PRIVATE_DISCOVERY' : gated ? 'GATED_REVIEW_REQUIRED' : 'DISCOVERED_UNSCREENED',",
    replace: "      admissionState: gated ? 'GATED_REVIEW_REQUIRED' : 'DISCOVERED_UNSCREENED',",
    suites: ['tests/open-model-universe-runtime.test.mjs'],
    assertionNeedle: "assert.equal(result.discovery.admissionState, 'REJECT_PRIVATE_DISCOVERY');"
  },
  {
    id: 'OPENMODEL-03',
    guard: 'Foundry admission requires observed runtime cost',
    file: 'src/open-model-universe.mjs',
    find: '  const runtimeCostKnown = runtimeObservation.runtimeCostKnown === true;',
    replace: '  const runtimeCostKnown = true;',
    suites: ['tests/open-model-universe-runtime.test.mjs'],
    assertionNeedle: "assert.ok(result.reasonCodes.includes('runtime-cost-observation-required'));"
  },
  {
    id: 'OPENMODEL-04',
    guard: 'Open or local model supply with unknown runtime cost is invalid',
    file: 'src/open-model-foundry.mjs',
    find: "  if (['OPEN_WEIGHT', 'LOCAL_RUNTIME', 'HOSTED_OPEN_WEIGHT'].includes(supplyType) && !runtimeCostKnown) reasonCodes.push('open-or-local-runtime-cost-must-be-known');",
    replace: "  if (false) reasonCodes.push('open-or-local-runtime-cost-must-be-known');",
    suites: ['tests/frontier-expansion.test.mjs'],
    assertionNeedle: "assert.ok(result.reasonCodes.includes('open-or-local-runtime-cost-must-be-known'));"
  },
  {
    id: 'OPENMODEL-05',
    guard: 'Permission-ineligible model supplies cannot enter ranking',
    file: 'src/open-model-foundry.mjs',
    find: "    if (!supply.permissionEligible) reasons.push('permission-not-eligible');",
    replace: "    if (false) reasons.push('permission-not-eligible');",
    suites: ['tests/frontier-expansion.test.mjs'],
    assertionNeedle: 'assert.equal(result.rejected.length, 2);'
  },
  {
    id: 'OPENMODEL-06',
    guard: 'Open-model workers remain local-preparation only',
    file: 'src/open-model-runtime-executor.mjs',
    find: "    if (task.consequenceClass && task.consequenceClass !== 'LOCAL_PREPARATION') return failure(['open-model-worker-only-accepts-local-preparation']);",
    replace: "    if (false) return failure(['open-model-worker-only-accepts-local-preparation']);",
    suites: ['tests/open-model-universe-runtime.test.mjs'],
    assertionNeedle: "assert.ok(result.reasonCodes.includes('open-model-worker-only-accepts-local-preparation'));"
  }
]);

function apply(root, mutation) {
  const path = join(root, mutation.file);
  const source = readFileSync(path, 'utf8');
  const occurrences = source.split(mutation.find).length - 1;
  if (occurrences !== 1) return { ok: false, verdict: occurrences === 0 ? 'ANCHOR_NOT_FOUND' : 'ANCHOR_AMBIGUOUS' };
  writeFileSync(path, source.replace(mutation.find, mutation.replace));
  return { ok: true };
}

function run(root, suites) {
  const result = spawnSync(process.execPath, ['--test', ...suites], { cwd: root, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' } });
  return { status: result.status, output: `${result.stdout || ''}${result.stderr || ''}` };
}

export function validateRegistrations(root = repoRoot) {
  return FRONTIER_OPEN_MODEL_MUTATIONS.map(mutation => {
    const source = readFileSync(join(root, mutation.file), 'utf8');
    const occurrences = source.split(mutation.find).length - 1;
    const suiteEvidence = mutation.suites.map(suite => {
      const text = readFileSync(join(root, suite), 'utf8');
      return { suite, assertionNeedlePresent: text.includes(mutation.assertionNeedle) };
    });
    return {
      id: mutation.id,
      anchorOccurrences: occurrences,
      suiteEvidence,
      registrationValid: occurrences === 1 && suiteEvidence.every(item => item.assertionNeedlePresent)
    };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const staticResults = validateRegistrations();
  const invalid = staticResults.filter(item => !item.registrationValid);
  if (invalid.length) {
    console.error(JSON.stringify({ phase: 'registration-integrity', invalid }, null, 2));
    process.exit(2);
  }

  const results = [];
  for (const mutation of FRONTIER_OPEN_MODEL_MUTATIONS) {
    const root = mkdtempSync(join(tmpdir(), 'uberbond-frontier-open-model-mutant-'));
    try {
      for (const item of ['src', 'tests', 'scripts', 'config', 'api']) {
        try { cpSync(join(repoRoot, item), join(root, item), { recursive: true }); } catch { /* optional in trimmed trees */ }
      }
      for (const file of ['package.json', 'package-lock.json', 'server.mjs', 'worker.mjs']) {
        try { cpSync(join(repoRoot, file), join(root, file)); } catch { /* optional */ }
      }
      try { cpSync(join(repoRoot, 'node_modules'), join(root, 'node_modules'), { recursive: true, dereference: false }); } catch { /* npm ci may be the execution environment */ }
      const applied = apply(root, mutation);
      if (!applied.ok) { results.push({ id: mutation.id, verdict: applied.verdict }); continue; }
      const syntax = spawnSync(process.execPath, ['--check', join(root, mutation.file)], { encoding: 'utf8' });
      if (syntax.status !== 0) { results.push({ id: mutation.id, verdict: 'MUTANT_DID_NOT_PARSE' }); continue; }
      const testRun = run(root, mutation.suites);
      results.push({ id: mutation.id, verdict: testRun.status === 0 ? 'SURVIVED' : 'KILLED', suiteStatus: testRun.status });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
  console.log(JSON.stringify({ staticResults, results }, null, 2));
  process.exit(results.every(item => item.verdict === 'KILLED') ? 0 : 1);
}
