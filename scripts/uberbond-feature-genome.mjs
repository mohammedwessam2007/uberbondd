#!/usr/bin/env node
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUberBondFeatureGenome, validateUberBondFeatureGenome } from '../src/uberbond-feature-genome.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, process.argv[2] || 'artifacts/uberbond-feature-genome-latest.json');
const genome = buildUberBondFeatureGenome({ root, sourceRevision: process.env.GITHUB_SHA || null });
const integrity = validateUberBondFeatureGenome(genome);
if (!genome.ok || !integrity.ok) {
  process.stderr.write(`${JSON.stringify({ genome, integrity }, null, 2)}\n`);
  process.exit(2);
}
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(genome, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({
  ok: true,
  status: genome.status,
  genomeDigest: genome.genomeDigest,
  repositoryArtifacts: genome.repositoryArtifactCount,
  dependencyEdges: genome.sourceDependencyEdgeCount,
  operatorScripts: genome.operatorScriptCount,
  readinessCapabilities: genome.readinessCapabilityCount,
  reachabilityModules: genome.reachabilityModuleCount,
  activationGates: genome.activationGateCount,
  totalBrainAtoms: genome.totalBrainAtomCount,
  genesisIdeas: genome.genesisIdeaCount,
  donorLineages: genome.donorLineageCount,
  semanticReviewQueue: genome.fallbackArtifactCount,
  output,
  businessEffectAuthority: 'NONE'
}, null, 2)}\n`);
