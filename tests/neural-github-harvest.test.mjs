import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compileNeuralGithubPartitions,
  refineNeuralGithubPartition,
  executeNeuralGithubPartitions
} from '../src/neural-github-harvest.mjs';

const atlasEntry = {
  family: 'reasoning',
  familyWeight: 1,
  seed: 'reasoning agent',
  starBand: [0, 2],
  query: 'reasoning agent stars:0..2'
};

test('neural GitHub partitions bind family and date provenance', () => {
  const plan = compileNeuralGithubPartitions({ atlasEntries: [atlasEntry], startDate: '2026-09-01', endDate: '2026-09-14' });
  assert.equal(plan.ok, true);
  assert.equal(plan.partitions.length, 1);
  assert.equal(plan.partitions[0].family, 'reasoning');
  assert.match(plan.partitions[0].query, /created:2026-09-01\.\.2026-09-14/);
  assert.equal(plan.hardObservableCapPerPartition, 1000);
});

test('saturated multi-day partition splits by date before claiming coverage', () => {
  const plan = compileNeuralGithubPartitions({ atlasEntries: [atlasEntry], startDate: '2026-09-01', endDate: '2026-09-14' });
  const partition = plan.partitions[0];
  const refined = refineNeuralGithubPartition(partition, { reportedTotalCount: 5000, searchCapExceeded: true });
  assert.equal(refined.status, 'NEURAL_PARTITION_SPLIT_BY_DATE');
  assert.equal(refined.partitions.length, 2);
  assert.ok(refined.partitions.every(item => item.refinementDepth === 1));
});

test('saturated one-day partition splits by repository size', () => {
  const plan = compileNeuralGithubPartitions({ atlasEntries: [atlasEntry], startDate: '2026-09-14', endDate: '2026-09-14' });
  const refined = refineNeuralGithubPartition(plan.partitions[0], { reportedTotalCount: 5000, searchCapExceeded: true });
  assert.equal(refined.status, 'NEURAL_PARTITION_SPLIT_BY_SIZE');
  assert.ok(refined.partitions.length >= 5);
  assert.ok(refined.partitions.every(item => Array.isArray(item.sizeBand)));
});

test('still-saturated one-day size leaf remains unresolved instead of being counted complete', () => {
  const plan = compileNeuralGithubPartitions({ atlasEntries: [atlasEntry], startDate: '2026-09-14', endDate: '2026-09-14' });
  const sizeSplit = refineNeuralGithubPartition(plan.partitions[0], { reportedTotalCount: 5000, searchCapExceeded: true });
  const leaf = sizeSplit.partitions[0];
  const final = refineNeuralGithubPartition(leaf, { reportedTotalCount: 5000, searchCapExceeded: true });
  assert.equal(final.status, 'NEURAL_PARTITION_SATURATED_LEAF_UNRESOLVED');
  assert.ok(final.unresolved);
  assert.match(final.truthBoundary, /MUST_NOT_BE_COUNTED_AS_EXHAUSTIVELY_HARVESTED/);
});

test('read-only executor preserves family metadata and rejects private results', async () => {
  const plan = compileNeuralGithubPartitions({ atlasEntries: [atlasEntry], startDate: '2026-09-14', endDate: '2026-09-14' });
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({
      total_count: 2,
      incomplete_results: false,
      items: [
        { id: 1, full_name: 'public/reasoner', html_url: 'https://github.com/public/reasoner', private: false, visibility: 'public', stargazers_count: 10, forks_count: 2, description: 'reasoning agent' },
        { id: 2, full_name: 'private/secret', html_url: 'https://github.com/private/secret', private: true, visibility: 'private' }
      ]
    })
  });
  const result = await executeNeuralGithubPartitions({ partitions: plan.partitions, fetchImpl, maxProviderCalls: 2 });
  assert.equal(result.ok, true);
  assert.equal(result.observedRepositories, 1);
  assert.equal(result.receipts[0].repositories[0].family, 'reasoning');
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.equal(result.consequenceAuthority, 'NONE');
});
