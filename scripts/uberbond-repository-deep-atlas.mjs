#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUberBondRepositoryDeepAtlas } from '../src/uberbond-repository-deep-atlas.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const featureGenome = JSON.parse(await readFile(resolve(root, 'artifacts/uberbond-feature-genome-latest.json'), 'utf8'));
const result = buildUberBondRepositoryDeepAtlas({ root, featureGenome });
if (!result.ok) {
  process.stderr.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(2);
}
const output = resolve(root, process.argv[2] || 'artifacts/cognitive/uberbond-repository-deep-atlas-latest.json');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({
  ok: true,
  status: result.status,
  atlasDigest: result.atlasDigest,
  repositoryArtifacts: result.repositoryArtifactCount,
  parsedTextFiles: result.parsedTextFileCount,
  artifactOnlyFiles: result.artifactOnlyFileCount,
  deepFeatures: result.deepFeatureCount,
  classCounts: result.classCounts,
  truncatedFiles: result.truncatedFiles.length,
  output,
  businessEffectAuthority: 'NONE'
}, null, 2)}\n`);
