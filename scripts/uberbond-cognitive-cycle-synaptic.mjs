#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateSynapticCycleBinding, augmentCognitiveCycleWithSynapticMap } from '../src/uberbond-synaptic-cycle-binding.mjs';
import { validateUltimateGraphCycleBinding, augmentCognitiveCycleWithUltimateGraph } from '../src/uberbond-ultimate-graph-cycle-binding.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
function flagValue(flag) {
  const index = argv.indexOf(flag);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : null;
}
function withoutFlags(flags) {
  const blocked = new Set(flags);
  const out = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (!blocked.has(argv[i])) { out.push(argv[i]); continue; }
    if (argv[i + 1] && !argv[i + 1].startsWith('--')) i += 1;
  }
  return out;
}
async function readJson(relativeOrAbsolute) {
  const target = resolve(root, relativeOrAbsolute);
  return JSON.parse(await readFile(target, 'utf8'));
}

const synapticPath = flagValue('--synaptic-map');
const ultimateGraphPath = flagValue('--ultimate-graph');
const featureGenomePath = flagValue('--feature-genome');
const outputPath = flagValue('--output') || 'artifacts/uberbond-cognitive-cycle-latest.json';
if (!synapticPath || !ultimateGraphPath || !featureGenomePath) {
  process.stderr.write(`${JSON.stringify({
    ok: false,
    status: 'WHOLE_REPOSITORY_CYCLE_INPUT_REQUIRED',
    reasonCodes: [
      !featureGenomePath ? 'feature-genome-path-required' : null,
      !synapticPath ? 'synaptic-map-path-required' : null,
      !ultimateGraphPath ? 'ultimate-graph-path-required' : null
    ].filter(Boolean),
    businessEffectAuthority: 'NONE'
  }, null, 2)}\n`);
  process.exit(2);
}

let featureGenome;
let synapticMap;
let ultimateGraph;
try {
  [featureGenome, synapticMap, ultimateGraph] = await Promise.all([
    readJson(featureGenomePath),
    readJson(synapticPath),
    readJson(ultimateGraphPath)
  ]);
} catch {
  process.stderr.write(`${JSON.stringify({ ok: false, status: 'WHOLE_REPOSITORY_CYCLE_INPUT_UNREADABLE', businessEffectAuthority: 'NONE' }, null, 2)}\n`);
  process.exit(2);
}
const synapticBinding = validateSynapticCycleBinding({ featureGenome, synapticMap });
if (!synapticBinding.ok) {
  process.stderr.write(`${JSON.stringify(synapticBinding, null, 2)}\n`);
  process.exit(2);
}
const ultimateBinding = validateUltimateGraphCycleBinding({ featureGenome, synapticMap, ultimateGraph });
if (!ultimateBinding.ok) {
  process.stderr.write(`${JSON.stringify(ultimateBinding, null, 2)}\n`);
  process.exit(2);
}

const childArgs = withoutFlags(['--synaptic-map', '--ultimate-graph']);
const child = spawnSync(process.execPath, [resolve(root, 'scripts/uberbond-cognitive-cycle.mjs'), ...childArgs], {
  cwd: root,
  env: process.env,
  encoding: 'utf8'
});
if (child.status !== 0) {
  if (child.stdout) process.stdout.write(child.stdout);
  if (child.stderr) process.stderr.write(child.stderr);
  process.exit(child.status ?? 2);
}

let receipt;
try {
  receipt = await readJson(outputPath);
} catch {
  process.stderr.write(`${JSON.stringify({ ok: false, status: 'COGNITIVE_CYCLE_RECEIPT_UNREADABLE_AFTER_BASE_CYCLE', businessEffectAuthority: 'NONE' }, null, 2)}\n`);
  process.exit(2);
}
const synapticAugmented = augmentCognitiveCycleWithSynapticMap({ receipt, featureGenome, synapticMap });
if (!synapticAugmented.ok && synapticAugmented.status === 'SYNAPTIC_CYCLE_AUGMENTATION_REFUSED') {
  process.stderr.write(`${JSON.stringify(synapticAugmented, null, 2)}\n`);
  process.exit(2);
}
const augmented = augmentCognitiveCycleWithUltimateGraph({
  receipt: synapticAugmented,
  featureGenome,
  synapticMap,
  ultimateGraph
});
if (!augmented.ok && augmented.status === 'ULTIMATE_GRAPH_CYCLE_AUGMENTATION_REFUSED') {
  process.stderr.write(`${JSON.stringify(augmented, null, 2)}\n`);
  process.exit(2);
}
await writeFile(resolve(root, outputPath), `${JSON.stringify(augmented, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({
  ok: true,
  status: 'UBERBOND_COGNITIVE_CYCLE_WITH_ULTIMATE_GRAPH_COMPILED',
  graphDigest: augmented?.graph?.graphDigest || null,
  featureGenomeDigest: featureGenome.genomeDigest || null,
  synapticMapDigest: augmented?.synapticMap?.mapDigest || null,
  synapticNodes: augmented?.synapticMap?.nodeCount || 0,
  synapticEdges: augmented?.synapticMap?.edgeCount || 0,
  ultimateGraphDigest: augmented?.ultimateGraph?.graphDigest || null,
  repositoryArtifacts: augmented?.ultimateGraph?.repositoryArtifactCount || 0,
  featureAtoms: augmented?.ultimateGraph?.featureAtomCount || 0,
  deepFeatures: augmented?.ultimateGraph?.deepFeatureCount || 0,
  ultimateNodes: augmented?.ultimateGraph?.nodeCount || 0,
  ultimateEdges: augmented?.ultimateGraph?.edgeCount || 0,
  orphanUltimateNodes: augmented?.ultimateGraph?.orphanNodeCount || 0,
  output: resolve(root, outputPath),
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE'
}, null, 2)}\n`);
