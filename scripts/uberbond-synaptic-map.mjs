#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileUberBondSynapticMap } from '../src/uberbond-synaptic-map.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async relative => JSON.parse(await readFile(resolve(root, relative), 'utf8'));

try {
  const [featureGenome, featureAtomAtlas] = await Promise.all([
    readJson('artifacts/uberbond-feature-genome-latest.json'),
    readJson('artifacts/uberbond-feature-atom-atlas-latest.json')
  ]);
  const result = compileUberBondSynapticMap({ featureGenome, featureAtomAtlas });
  if (!result.ok) {
    process.stderr.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(2);
  }
  const outputRelative = process.argv[2] || 'artifacts/uberbond-synaptic-map-latest.json';
  const output = resolve(root, outputRelative);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({
    ok: true,
    status: result.status,
    mapDigest: result.mapDigest,
    nodes: result.nodeCount,
    edges: result.edgeCount,
    edgeTypeCounts: result.edgeTypeCounts,
    orphanArtifacts: result.orphanArtifacts.length,
    orphanFeatureAtoms: result.orphanFeatureAtoms.length,
    orphanOrgans: result.orphanOrgans.length,
    output,
    businessEffectAuthority: 'NONE'
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, status: 'SYNAPTIC_MAP_OPERATOR_FAILED', reason: error?.message || 'unknown-error', businessEffectAuthority: 'NONE' }, null, 2)}\n`);
  process.exit(2);
}
