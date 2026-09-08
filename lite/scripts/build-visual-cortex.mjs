import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCurrentRealityFreeze } from '../../scripts/current-reality-freeze.mjs';

const liteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(liteRoot, '..');

// C11/C12 truth regeneration is intentionally first. The private-lite Vercel
// project is a real cloned checkout and already executes deterministic Node
// steps. Reusing that substrate means every successful future build measures
// current repository truth before it renders the visual cortex. These steps do
// not infer provider/customer/runtime outcomes; they regenerate only the
// repository-provable layers and fail closed if their own generators/tests fail.
const steps = [
  ['node', ['scripts/system-readiness.mjs']],
  ['node', ['scripts/sovereign-coverage-matrix.mjs']],
  ['node', ['--test',
    'tests/sovereign-coverage-matrix.test.mjs',
    'tests/current-reality-freeze.test.mjs',
    'tests/current-reality-freeze-integration.test.mjs'
  ]],
  ['node', ['scripts/uberbond-feature-genome.mjs']],
  ['node', ['scripts/uberbond-feature-atom-atlas.mjs']],
  ['node', ['scripts/uberbond-synaptic-map.mjs']],
  ['node', ['scripts/uberbond-repository-deep-atlas.mjs']],
  ['node', ['scripts/uberbond-ultimate-graph.mjs']],
  ['node', ['--check', 'public/uberbond.js']],
  ['node', ['--check', 'public/uberbond-graph.js']],
  ['node', ['--test',
    'tests/uberbond-repository-deep-atlas.test.mjs',
    'tests/uberbond-repository-deep-atlas-growth-safe.test.mjs',
    'tests/uberbond-ultimate-graph.test.mjs',
    'tests/ultimate-graph-api.test.mjs',
    'tests/command-center-owner-auth-hostile.test.mjs'
  ]]
];

for (const [command, args] of steps) {
  const result = spawnSync(command, args, { cwd: repoRoot, stdio: 'inherit', env: process.env });
  if (result.error) {
    console.error(`lite visual-cortex build step failed to start: ${command} ${args.join(' ')}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const dataDir = path.join(liteRoot, 'data');
await mkdir(dataDir, { recursive: true });
await copyFile(
  path.join(repoRoot, 'artifacts/cognitive/uberbond-ultimate-graph-latest.json'),
  path.join(dataDir, 'uberbond-ultimate-graph-latest.json')
);

// The freeze runs after generators so it can classify the freshly regenerated
// readiness/coverage artifacts against this exact Git HEAD. The build checkout
// is expected to be dirty at this point because generators have written their
// measured outputs, so workingTreeClean is reported rather than promoted into a
// build failure. A stale handoff is also evidence to surface, not something to
// hide by making the visual deployment disappear.
const freeze = buildCurrentRealityFreeze({ rootDir: repoRoot });
const readiness = JSON.parse(await readFile(path.join(repoRoot, 'artifacts/system-readiness.json'), 'utf8'));
const coverage = JSON.parse(await readFile(path.join(repoRoot, 'artifacts/sovereign/implementation-coverage-matrix.json'), 'utf8'));
const truthSummary = {
  schemaVersion: 'uberbond.lite-private-current-truth-summary.v1',
  sourceCommit: readiness?.repository?.head || coverage?.sourceCommit || freeze?.head?.sha || null,
  sourceBranch: readiness?.repository?.branch || freeze?.head?.branch || null,
  readiness: {
    capabilityCount: Array.isArray(readiness?.capabilities) ? readiness.capabilities.length : null,
    sourceModules: readiness?.repository?.sourceModules ?? null,
    testSuites: readiness?.repository?.testSuites ?? null,
    reachability: readiness?.measurements?.reachability || null,
    maxRepositoryProvableLevel: readiness?.truthBoundary?.maxLevelProvableFromRepositoryAlone ?? null
  },
  coverage: {
    status: coverage?.status || null,
    rows: coverage?.counts?.rows ?? null,
    extractedConcepts: coverage?.counts?.extractedConcepts ?? null,
    byState: coverage?.counts?.byState || null,
    byLane: coverage?.counts?.byLane || null
  },
  currentRealityFreeze: {
    ok: freeze?.ok === true,
    status: freeze?.status || null,
    sourceTruth: freeze?.closureBoundary?.sourceTruth || null,
    generatedTruth: freeze?.closureBoundary?.generatedTruth || null,
    runtimeTruth: freeze?.closureBoundary?.runtimeTruth || 'NOT_INFERRED',
    externalOutcomeTruth: freeze?.closureBoundary?.externalOutcomeTruth || 'NOT_INFERRED',
    staleGeneratedArtifactIds: freeze?.staleGeneratedArtifactIds || [],
    unknownGeneratedArtifactIds: freeze?.unknownGeneratedArtifactIds || [],
    reasonCodes: freeze?.reasonCodes || []
  },
  businessEffectAuthority: 'NONE',
  truthBoundary: 'BUILD_MEASURES_REPOSITORY_PROVABLE_TRUTH_ONLY__NAMED_RUNTIME_AND_EXTERNAL_OUTCOMES_REQUIRE_SEPARATE_EVIDENCE'
};
await writeFile(path.join(dataDir, 'current-truth-summary.json'), `${JSON.stringify(truthSummary, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: 'C11_C12_LITE_TRUTH_TRIBUNAL_COMPLETE', ...truthSummary }, null, 2));

const publicDir = path.join(liteRoot, 'public');
await mkdir(publicDir, { recursive: true });
for (const file of ['uberbond.css', 'uberbond.js', 'uberbond-graph.css', 'uberbond-graph.js']) {
  await copyFile(path.join(repoRoot, 'public', file), path.join(publicDir, file));
}
const html = await readFile(path.join(repoRoot, 'public', 'uberbond.html'), 'utf8');
await writeFile(
  path.join(publicDir, 'uberbond.html'),
  html.replace('<html lang="en">', '<html lang="en" data-uberbond-auth-mode="deployment-protected">'),
  'utf8'
);

const graph = JSON.parse(await readFile(path.join(dataDir, 'uberbond-ultimate-graph-latest.json'), 'utf8'));
console.log(JSON.stringify({
  ok: graph?.ok === true,
  status: 'LITE_PRIVATE_VISUAL_CORTEX_BUILD_COMPLETE',
  graphDigest: graph?.graphDigest || null,
  repositoryArtifactCount: graph?.repositoryArtifactCount ?? null,
  featureAtomCount: graph?.featureAtomCount ?? null,
  deepFeatureCount: graph?.deepFeatureCount ?? null,
  nodeCount: graph?.nodeCount ?? null,
  edgeCount: graph?.edgeCount ?? null,
  orphanNodeCount: Array.isArray(graph?.orphanNodes) ? graph.orphanNodes.length : null,
  externalEffectAuthority: 'NONE'
}));