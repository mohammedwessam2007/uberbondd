#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUberBondRepositoryDeepAtlas } from '../src/uberbond-repository-deep-atlas.mjs';
import { redactSecrets } from '../src/secret-patterns.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const featureGenome = JSON.parse(await readFile(resolve(root, 'artifacts/uberbond-feature-genome-latest.json'), 'utf8'));
const result = buildUberBondRepositoryDeepAtlas({ root, featureGenome });
if (!result.ok) {
  process.stderr.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(2);
}
const output = resolve(root, process.argv[2] || 'artifacts/cognitive/uberbond-repository-deep-atlas-latest.json');
await mkdir(dirname(output), { recursive: true });

// Persistence is a separate trust boundary from extraction. Individual
// extractors already clean their string surfaces, but a future metadata field
// must not be able to bypass that discipline merely because it was added after
// the extractor-level tests. Scrub the complete serialized object immediately
// before disk write using the repository's canonical credential vocabulary.
//
// The fixture marker is also authority-bearing: the repository-wide secret
// sweep interprets it as an explicit exemption. The atlas may observe that
// marker in source but may never reproduce it into its own durable artifact,
// or the generated artifact would accidentally exempt itself from scanning.
const fixtureMarker = ['secret-scanner', 'fixtures', 'intentional'].join('-');
const persisted = redactSecrets(JSON.stringify(result, null, 2))
  .replaceAll(fixtureMarker, 'secret-scanner-fixture-marker-redacted');

await writeFile(output, `${persisted}\n`, 'utf8');
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
