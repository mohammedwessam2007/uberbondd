#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGrowthSafeUberBondRepositoryDeepAtlas } from '../src/uberbond-repository-deep-atlas-growth-safe.mjs';
import { persistRedactedAtlasJson } from '../src/uberbond-repository-deep-atlas-persistence.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const featureGenome = JSON.parse(await readFile(resolve(root, 'artifacts/uberbond-feature-genome-latest.json'), 'utf8'));
const result = buildGrowthSafeUberBondRepositoryDeepAtlas({ root, featureGenome });
if (!result.ok) {
  process.stderr.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(2);
}
const output = resolve(root, process.argv[2] || 'artifacts/cognitive/uberbond-repository-deep-atlas-latest.json');
// Atomic, bounded-memory persistence with complete-leaf redaction.
await persistRedactedAtlasJson({ value: result, output });
process.stdout.write(`${JSON.stringify({
  ok: true,
  status: result.status,
  atlasDigest: result.atlasDigest,
  repositoryArtifacts: result.repositoryArtifactCount,
  parsedTextFiles: result.parsedTextFileCount,
  artifactOnlyFiles: result.artifactOnlyFileCount,
  deepFeatures: result.deepFeatureCount,
  classCounts: result.classCounts,
  structuralDetailCappedFiles: result.structuralDetailCappedFiles?.length || 0,
  truncatedFiles: result.truncatedFiles?.length || 0,
  output,
  businessEffectAuthority: 'NONE'
}, null, 2)}\n`);