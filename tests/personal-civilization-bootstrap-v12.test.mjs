import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateUberBondBootstrap, LIFE_NORTH_STAR_REQUIRED_PATHS } from '../src/uberbond-brain-context.mjs';

test('canonical bootstrap v1.2 validates the Personal Civilization North Star without amputating memory v2', async () => {
  const bootstrap = JSON.parse(await readFile(new URL('../UBERBOND_BOOTSTRAP.json', import.meta.url), 'utf8'));
  const result = validateUberBondBootstrap(bootstrap);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.bootstrap.schemaVersion, 'uberbond-bootstrap-1.2.0');
  assert.equal(result.bootstrap.memoryIndexPath, 'artifacts/uberbond-memory-index.json');
  assert.equal(result.bootstrap.masterMemoryPath, 'docs/UBERBOND_MASTER_MEMORY.md');
  for (const path of LIFE_NORTH_STAR_REQUIRED_PATHS) assert.ok(result.bootstrap.canonPointers.includes(path), path);
});

test('bootstrap v1.2 fails closed if any life North Star canonical pointer is amputated', async () => {
  const bootstrap = JSON.parse(await readFile(new URL('../UBERBOND_BOOTSTRAP.json', import.meta.url), 'utf8'));
  bootstrap.canonPointers = bootstrap.canonPointers.filter((path) => path !== 'docs/PERSONAL_CIVILIZATION_ENGINE_NORTH_STAR.md');
  const result = validateUberBondBootstrap(bootstrap);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('life-north-star-canon-pointers-required'));
});

test('legacy 1.1 memory-backed bootstrap remains supported for historical fixtures', () => {
  const result = validateUberBondBootstrap({
    schemaVersion: 'uberbond-bootstrap-1.1.0',
    project: 'UberBond',
    generatedAt: '2026-09-07T00:00:00Z',
    objective: 'historical compatibility fixture',
    canonPointers: ['UBERBOND_CANON.md', 'UBERBOND_BOOTSTRAP.json', 'docs/DISTRIBUTION_OS_CANON.md', 'docs/UBERBOND_MASTER_MEMORY.md', 'artifacts/uberbond-memory-index.json'],
    goals: ['preserve history'],
    externalProofGates: [],
    startupProtocol: ['read canon'],
    truthHierarchy: ['CURRENT_REPOSITORY_CANON'],
    productFamilies: [],
    memoryIndexPath: 'artifacts/uberbond-memory-index.json',
    masterMemoryPath: 'docs/UBERBOND_MASTER_MEMORY.md',
    continuity: { handoffPath: 'docs/CURRENT_HANDOFF.json', startupInstruction: 'read it', updateInstruction: 'update it', chatImportInstruction: 'import carefully' }
  });
  assert.equal(result.ok, true, JSON.stringify(result));
});
