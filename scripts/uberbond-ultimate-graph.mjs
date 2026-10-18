#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileUberBondUltimateGraph } from '../src/uberbond-ultimate-graph.mjs';
import { persistRedactedAtlasJson } from '../src/uberbond-repository-deep-atlas-persistence.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async relative => JSON.parse(await readFile(resolve(root, relative), 'utf8'));
const [featureGenome, featureAtomAtlas, synapticMap, repositoryDeepAtlas] = await Promise.all([
  readJson('artifacts/uberbond-feature-genome-latest.json'),
  readJson('artifacts/uberbond-feature-atom-atlas-latest.json'),
  readJson('artifacts/uberbond-synaptic-map-latest.json'),
  readJson('artifacts/cognitive/uberbond-repository-deep-atlas-latest.json')
]);
const result = compileUberBondUltimateGraph({ featureGenome, featureAtomAtlas, synapticMap, repositoryDeepAtlas });
if (!result.ok) {
  process.stderr.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(2);
}
const output = resolve(root, process.argv[2] || 'artifacts/cognitive/uberbond-ultimate-graph-latest.json');
await persistRedactedAtlasJson({ value: result, output });
process.stdout.write(`${JSON.stringify({
  ok: true,
  status: result.status,
  graphDigest: result.graphDigest,
  repositoryArtifacts: result.repositoryArtifactCount,
  featureAtoms: result.featureAtomCount,
  deepFeatures: result.deepFeatureCount,
  nodes: result.nodeCount,
  edges: result.edgeCount,
  orphanNodes: result.orphanNodes.length,
  missingArtifacts: result.missingArtifacts.length,
  missingFeatureAtoms: result.missingFeatureAtoms.length,
  missingDeepFeatures: result.missingDeepFeatures.length,
  output,
  businessEffectAuthority: 'NONE'
}, null, 2)}\n`);
