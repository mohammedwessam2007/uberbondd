import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { normalizeUberBondCommandCenterStatus } from '../src/uberbond-command-center-normalizer.mjs';

async function rootWithRegistry() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'uberbond-command-normalizer-'));
  await mkdir(path.join(root, 'config'), { recursive: true });
  await writeFile(path.join(root, 'config', 'frontier-model-candidates.json'), JSON.stringify({ candidates: [
    { id: 'astra', canonicalModel: 'gpt-6-astra', provider: 'openai', configured: false, availabilityTruth: 'VERIFY_BEFORE_RUNTIME' }
  ] }));
  return root;
}

test('normalizer rejoins canonical model id without inventing callability', async t => {
  const root = await rootWithRegistry();
  t.after(() => rm(root, { recursive: true, force: true }));
  const status = {
    frontierModelRegistry: { candidates: [{ id: 'astra', label: 'GPT-6 Astra', provider: 'openai', model: null, state: 'CANDIDATE_ONLY' }] }
  };
  const normalized = await normalizeUberBondCommandCenterStatus(status, { root });
  assert.equal(normalized.frontierModelRegistry.candidates[0].model, 'gpt-6-astra');
  assert.equal(normalized.frontierModelRegistry.candidates[0].configured, false);
  assert.equal(normalized.frontierModelRegistry.candidates[0].availabilityTruth, 'VERIFY_BEFORE_RUNTIME');
  assert.equal(normalized.frontierModelRegistry.candidates[0].state, 'CANDIDATE_ONLY');
});

test('normalizer names GENESIS evidence maturity separately from primitive maturity', async t => {
  const root = await rootWithRegistry();
  t.after(() => rm(root, { recursive: true, force: true }));
  const status = {
    genesisImplementationLedger: {
      ideaCount: 275,
      maturityCounts: { IMPLEMENTED_PRIMITIVE: 201, PARTIAL_PRIMITIVE: 74 },
      implementationStatusCounts: { OBSERVED_INTERNAL_RUNTIME_RECEIPT: 20, SOURCE_AND_TEST_PRESENT: 255 }
    }
  };
  const normalized = await normalizeUberBondCommandCenterStatus(status, { root });
  assert.deepEqual(normalized.genesisImplementationLedger.primitiveMaturityCounts, { IMPLEMENTED_PRIMITIVE: 201, PARTIAL_PRIMITIVE: 74 });
  assert.deepEqual(normalized.genesisImplementationLedger.evidenceStatusCounts, { OBSERVED_INTERNAL_RUNTIME_RECEIPT: 20, SOURCE_AND_TEST_PRESENT: 255 });
  assert.equal(normalized.genesisImplementationLedger.maturityCounts.OBSERVED_INTERNAL_RUNTIME_RECEIPT, 20);
  assert.equal(normalized.genesisImplementationLedger.implementationStatusCounts.IMPLEMENTED_PRIMITIVE, 201);
});
