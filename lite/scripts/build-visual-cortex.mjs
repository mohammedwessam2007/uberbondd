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
    // Visual Cortex integrity / privacy boundary.
    'tests/uberbond-repository-deep-atlas.test.mjs',
    'tests/uberbond-repository-deep-atlas-bounded.test.mjs',
    'tests/uberbond-ultimate-graph.test.mjs',
    'tests/ultimate-graph-api.test.mjs',
    'tests/command-center-owner-auth-hostile.test.mjs',

    // High-ROI Sovereign multiplier invariants. These are deliberately focused
    // rather than a second copy of the 4k+ deterministic suite: the full Vercel
    // project remains the terminal siege gate, while the private-lite preview
    // gives every branch an independently executable proof that the newest
    // decision/epistemic organs still parse, compose and preserve authority.
    'tests/decision-information-theory.test.mjs',
    'tests/sovereign-control-decision-information.test.mjs',
    'tests/causal-intervention-ladder.test.mjs',
    'tests/ontological-crisis-protocol.test.mjs',
    'tests/epistemic-immune-system.test.mjs',
    'tests/universal-ignorance-map.test.mjs',
    'tests/reflexivity-engine.test.mjs',

    // Cash-path continuation boundary. A preview may never become green while
    // paid research can bypass QA or fabricate customer acceptance.
    'tests/first-cash-prospect-completion.test.mjs'
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
