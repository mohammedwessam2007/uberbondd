import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateGenesisIdeaRegistry } from '../src/perpetual-frontier-genesis.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const docPath = resolve(root, 'docs/PERPETUAL_FRONTIER_GENESIS_CANON.md');
const indexPath = resolve(root, 'artifacts/perpetual-frontier-genesis.json');

const [markdown, indexRaw] = await Promise.all([
  readFile(docPath, 'utf8'),
  readFile(indexPath, 'utf8')
]);

const index = JSON.parse(indexRaw);
const registry = validateGenesisIdeaRegistry(markdown, index.ideaCount);

const requiredPointers = [
  'src/perpetual-frontier-genesis.mjs',
  'scripts/perpetual-frontier-genesis-doctor.mjs',
  'scripts/perpetual-frontier-genesis-tick.mjs',
  'tests/perpetual-frontier-genesis.test.mjs',
  'tests/perpetual-frontier-genesis-tick.test.mjs',
  '.github/workflows/gamechanger-mesh-hourly.yml'
];

const pointerSet = new Set([
  index.firstExecutableLayer?.module,
  index.firstExecutableLayer?.doctor,
  index.firstExecutableLayer?.tick,
  index.firstExecutableLayer?.test,
  index.firstExecutableLayer?.tickTest,
  index.firstExecutableLayer?.hourlyWorkflow
]);
const missingPointers = requiredPointers.filter(path => !pointerSet.has(path));
const missingFiles = [];
for (const relative of requiredPointers) {
  try {
    await access(resolve(root, relative));
  } catch {
    missingFiles.push(relative);
  }
}

const healthy = registry.ok
  && index.schemaVersion === 'uberbond-perpetual-frontier-genesis-1.0.0'
  && index.canonicalDoc === 'docs/PERPETUAL_FRONTIER_GENESIS_CANON.md'
  && index.businessEffectAuthority === 'NONE'
  && index.externalEffectAuthority === 'NONE'
  && missingPointers.length === 0
  && missingFiles.length === 0;

const result = {
  ok: healthy,
  status: healthy ? 'PERPETUAL_FRONTIER_GENESIS_HEALTHY' : 'PERPETUAL_FRONTIER_GENESIS_INVALID',
  ideaCount: registry.observedCount,
  expectedIdeaCount: registry.expectedCount,
  registryReasonCodes: registry.reasonCodes,
  missingPointers,
  missingFiles,
  automatedHourlyPathDeclared: pointerSet.has('.github/workflows/gamechanger-mesh-hourly.yml'),
  businessEffectAuthority: index.businessEffectAuthority,
  externalEffectAuthority: index.externalEffectAuthority,
  canonicalDoc: index.canonicalDoc
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!healthy) process.exitCode = 1;
