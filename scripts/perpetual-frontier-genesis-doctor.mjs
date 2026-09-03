import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateGenesisIdeaRegistry } from '../src/perpetual-frontier-genesis.mjs';

const root = resolve(new URL('..', import.meta.url).pathname);
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
  'tests/perpetual-frontier-genesis.test.mjs'
];

const pointerSet = new Set([
  index.firstExecutableLayer?.module,
  index.firstExecutableLayer?.doctor,
  index.firstExecutableLayer?.test
]);
const missingPointers = requiredPointers.filter(path => !pointerSet.has(path));

const healthy = registry.ok
  && index.schemaVersion === 'uberbond-perpetual-frontier-genesis-1.0.0'
  && index.canonicalDoc === 'docs/PERPETUAL_FRONTIER_GENESIS_CANON.md'
  && index.businessEffectAuthority === 'NONE'
  && index.externalEffectAuthority === 'NONE'
  && missingPointers.length === 0;

const result = {
  ok: healthy,
  status: healthy ? 'PERPETUAL_FRONTIER_GENESIS_HEALTHY' : 'PERPETUAL_FRONTIER_GENESIS_INVALID',
  ideaCount: registry.observedCount,
  expectedIdeaCount: registry.expectedCount,
  registryReasonCodes: registry.reasonCodes,
  missingPointers,
  businessEffectAuthority: index.businessEffectAuthority,
  externalEffectAuthority: index.externalEffectAuthority,
  canonicalDoc: index.canonicalDoc
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!healthy) process.exitCode = 1;
