import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const liteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(liteRoot, '..');

const steps = [
  ['node', ['scripts/uberbond-feature-genome.mjs']],
  ['node', ['scripts/uberbond-feature-atom-atlas.mjs']],
  ['node', ['scripts/uberbond-synaptic-map.mjs']],
  ['node', ['scripts/uberbond-repository-deep-atlas.mjs']],
  ['node', ['scripts/uberbond-ultimate-graph.mjs']],
  ['node', ['--check', 'public/uberbond.js']],
  ['node', ['--check', 'public/uberbond-graph.js']],
  ['node', ['--test',
    'tests/uberbond-repository-deep-atlas.test.mjs',
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
