import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { normalizeNeuralCapabilityObservation } from '../src/neural-exocortex-genome.mjs';
import { writeNeuralHarvestBatch, compactNeuralExocortexCorpus, readNeuralFinalManifest } from '../src/neural-exocortex-store.mjs';

function cap(repo, family, stars, when) {
  return normalizeNeuralCapabilityObservation({ repositoryFullName: repo, sourceUrl: `https://github.com/${repo}`, family, description: `${family} ai`, stars, licenseSpdx: 'MIT', pushedAt: when, observedAt: when }).capability;
}

test('external store dedupes repeated capability identities before final selection', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'neural-store-'));
  try {
    const a1 = cap('x/a', 'reasoning', 10, '2026-01-01T00:00:00Z');
    const a2 = cap('x/a', 'reasoning', 100, '2026-02-01T00:00:00Z');
    const b = cap('x/b', 'memory', 20, '2026-01-01T00:00:00Z');
    await writeNeuralHarvestBatch({ rootDir: dir, repositories: [], capabilities: [a1,b], manifest: { batchId: 'one' } });
    await writeNeuralHarvestBatch({ rootDir: dir, repositories: [], capabilities: [a2], manifest: { batchId: 'two' } });
    const result = await compactNeuralExocortexCorpus({ rootDir: dir, target: 2, shardCount: 16 });
    assert.equal(result.ok, true);
    assert.equal(result.manifest.observedCapabilityRows, 3);
    assert.equal(result.manifest.distinctCapabilityRecords, 2);
    assert.equal(result.manifest.retainedCapabilityRecords, 2);
    assert.equal(result.manifest.immutableProgramTarget, 1_000_000);
    const manifest = await readNeuralFinalManifest(dir);
    assert.equal(manifest.distinctCapabilityRecords, 2);
    const body = await readFile(path.join(dir, 'final', 'capabilities.jsonl'), 'utf8');
    assert.equal(body.trim().split('\n').length, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('final compaction protects rare neural faculties before filling by global prior', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'neural-diversity-'));
  try {
    const reasoning = [
      cap('x/r1', 'reasoning', 100000, '2026-09-01T00:00:00Z'),
      cap('x/r2', 'reasoning', 90000, '2026-09-01T00:00:00Z'),
      cap('x/r3', 'reasoning', 80000, '2026-09-01T00:00:00Z'),
      cap('x/r4', 'reasoning', 70000, '2026-09-01T00:00:00Z'),
      cap('x/r5', 'reasoning', 60000, '2026-09-01T00:00:00Z')
    ];
    const rare = cap('x/rare-causal', 'causal', 0, '2018-01-01T00:00:00Z');
    rare.neuralPrior = { ...rare.neuralPrior, score: 0.000001 };
    await writeNeuralHarvestBatch({ rootDir: dir, repositories: [], capabilities: [...reasoning, rare], manifest: { batchId: 'diverse' } });
    const result = await compactNeuralExocortexCorpus({ rootDir: dir, target: 4, shardCount: 16 });
    assert.equal(result.manifest.retainedCapabilityRecords, 4);
    assert.equal(result.manifest.protectedPerFamily, 1);
    assert.match(result.manifest.selectionLaw, /DIVERSITY_PROTECTED/);
    const rows = (await readFile(path.join(dir, 'final', 'capabilities.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(rows.some(row => row.family === 'causal'), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
