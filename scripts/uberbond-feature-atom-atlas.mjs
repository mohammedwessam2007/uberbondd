#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUberBondFeatureAtomAtlas } from '../src/uberbond-feature-atom-atlas.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
  const featureGenome = JSON.parse(await readFile(resolve(root, 'artifacts/uberbond-feature-genome-latest.json'), 'utf8'));
  const atlas = buildUberBondFeatureAtomAtlas({ root, featureGenome });
  if (!atlas.ok) {
    process.stderr.write(`${JSON.stringify(atlas, null, 2)}\n`);
    process.exit(2);
  }
  const outputRelative = process.argv[2] || 'artifacts/uberbond-feature-atom-atlas-latest.json';
  const output = resolve(root, outputRelative);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(atlas, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({
    ok: true,
    status: atlas.status,
    atlasDigest: atlas.atlasDigest,
    featureAtoms: atlas.atomCount,
    exportedCodeFeatures: atlas.classCounts.exportedCodeFeatures,
    operatorCommands: atlas.classCounts.operatorCommands,
    genesisIdeas: atlas.classCounts.genesisIdeas,
    readinessCapabilities: atlas.classCounts.readinessCapabilities,
    activationGates: atlas.classCounts.activationGates,
    totalBrainMemoryAtoms: atlas.classCounts.totalBrainMemoryAtoms,
    historicalDonors: atlas.classCounts.historicalDonors,
    genesisMaturityCounts: atlas.genesisMaturityCounts,
    genesisImplementationStatusCounts: atlas.genesisImplementationStatusCounts,
    output,
    businessEffectAuthority: 'NONE'
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, status: 'FEATURE_ATOM_ATLAS_OPERATOR_FAILED', reason: error?.message || 'unknown-error', businessEffectAuthority: 'NONE' }, null, 2)}\n`);
  process.exit(2);
}
