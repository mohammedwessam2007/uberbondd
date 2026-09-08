import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CANONICAL_MAIN_SHA = '2ab84160b129520f15028246e12f7431a26d6d8a';
const liteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(liteRoot, '..');

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: repoRoot, stdio: 'inherit', encoding: 'utf8', env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
function output(command, args) {
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: 'utf8' });
  if (result.error || result.status !== 0) return null;
  return String(result.stdout || '').trim();
}

const diagnosticHead = output('git', ['rev-parse', 'HEAD']);
const changedPaths = (output('git', ['diff', '--name-only', CANONICAL_MAIN_SHA, 'HEAD']) || '')
  .split('\n').map(value => value.trim()).filter(Boolean);
const sourceEquivalentToCanonicalMain = Boolean(diagnosticHead)
  && changedPaths.length > 0
  && changedPaths.every(file => file.startsWith('lite/'));

if (!sourceEquivalentToCanonicalMain) {
  console.error(JSON.stringify({
    ok: false,
    status: 'C11_C12_DIAGNOSTIC_SOURCE_EQUIVALENCE_REFUSED',
    canonicalMainSha: CANONICAL_MAIN_SHA,
    diagnosticHead,
    changedPaths
  }, null, 2));
  process.exit(2);
}

// Generate readiness first so its workingTreeClean measurement observes the
// pristine checkout rather than artifacts written by the coverage generator.
run('node', ['scripts/system-readiness.mjs'], {
  ...process.env,
  UBERBOND_CANONICAL_HEAD: CANONICAL_MAIN_SHA,
  UBERBOND_CANONICAL_BRANCH: 'main'
});
run('node', ['scripts/sovereign-coverage-matrix.mjs']);
run('node', ['--test',
  'tests/sovereign-coverage-matrix.test.mjs',
  'tests/reachability-ratchet.test.mjs'
]);

const readiness = JSON.parse(await readFile(path.join(repoRoot, 'artifacts/system-readiness.json'), 'utf8'));
const coverage = JSON.parse(await readFile(path.join(repoRoot, 'artifacts/sovereign/implementation-coverage-matrix.json'), 'utf8'));

const levelCounts = {};
for (const capability of readiness.capabilities || []) {
  levelCounts[String(capability.level)] = (levelCounts[String(capability.level)] || 0) + 1;
}
const reachability = readiness.measurements?.reachability || {};
const receipt = {
  ok: true,
  status: 'C11_C12_CANONICAL_DIAGNOSTIC_EXECUTED',
  canonicalMainSha: CANONICAL_MAIN_SHA,
  diagnosticHead,
  diagnosticBranch: 'sol/c11-c12-vercel-diagnostic-20260909',
  sourceEquivalentToCanonicalMain,
  sourceEquivalenceRule: 'ALL_COMMITTED_DIAGNOSTIC_DELTA_IS_UNDER_LITE_AND_OUTSIDE_CANONICAL_COVERAGE_READINESS_INPUT_SURFACES',
  changedPaths,
  readiness: {
    generatedForHead: readiness.repository?.head || null,
    generatedForBranch: readiness.repository?.branch || null,
    sourceModules: readiness.repository?.sourceModules ?? null,
    testSuites: readiness.repository?.testSuites ?? null,
    checkoutWasCleanAtMeasurement: readiness.repository?.workingTreeClean ?? null,
    capabilityCount: Array.isArray(readiness.capabilities) ? readiness.capabilities.length : null,
    levelCounts,
    cappedForMissingExternalEvidence: (readiness.capabilities || []).filter(row => row.cappedByMissingExternalEvidence).length,
    reachability: {
      srcModules: reachability.srcModules ?? null,
      production: reachability.reachableFromProduction ?? null,
      unattendedOperatorOnly: reachability.reachableFromUnattendedOperatorScriptsOnly ?? null,
      founderInteractiveOnly: reachability.reachableFromFounderInteractiveOnly ?? null,
      unreachable: reachability.noEntryPointAtAll ?? null,
      partitionExact: reachability.partitionExact ?? null,
      allClassified: reachability.allClassified ?? null,
      unclassifiedCount: Array.isArray(reachability.unclassified) ? reachability.unclassified.length : null,
      staleClassificationCount: Array.isArray(reachability.staleClassifications) ? reachability.staleClassifications.length : null,
      founderInteractiveClassificationViolationCount: Array.isArray(reachability.founderInteractiveClassificationViolations) ? reachability.founderInteractiveClassificationViolations.length : null
    }
  },
  coverage: {
    generatedSourceCommit: coverage.sourceCommit || null,
    status: coverage.status || null,
    counts: coverage.counts || null
  },
  executedCommands: [
    'node scripts/system-readiness.mjs',
    'node scripts/sovereign-coverage-matrix.mjs',
    'node --test tests/sovereign-coverage-matrix.test.mjs tests/reachability-ratchet.test.mjs'
  ],
  truthBoundary: 'This proves exact-source-equivalent repository generation and bounded tests on the Vercel preview builder. It does not prove named production runtime, external outcomes, customers, revenue, ASI, or elapsed autonomy.',
  businessEffectAuthority: 'NONE'
};
console.log(`UBERBOND_C11_C12_RECEIPT ${JSON.stringify(receipt)}`);
