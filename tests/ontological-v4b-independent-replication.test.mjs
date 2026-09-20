import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  runOntologicalV4BIndependentReplication
} from '../src/ontological-v4b-independent-replication.mjs';

test('independent v4b replication matches the frozen primary metrics', () => {
  const result = runOntologicalV4BIndependentReplication();
  assert.equal(result.ok, true);
  assert.equal(result.status, 'V4B_INDEPENDENT_REPLICATION_MATCHED');
  assert.equal(result.comparison.allMatch, true);
  assert.deepEqual(result.comparison.mismatches, []);
});

test('independent v4b replication uses a distinct computational path', () => {
  const result = runOntologicalV4BIndependentReplication();
  assert.equal(result.importsPrimaryV4BModule, false);
  assert.equal(result.implementationPath.targetLabels, 'SMALLEST_PRIME_FACTOR_SIEVE');
  assert.equal(result.implementationPath.baseOntology, 'BOOLEAN_VECTOR_SIGNATURES');
  assert.equal(result.implementationPath.structuralSearch, 'INDEPENDENT_STATE_MACHINE_INTERPRETER');
});

test('replication source does not import the primary v4b implementation', async () => {
  const source = await fs.readFile(
    new URL('../src/ontological-v4b-independent-replication.mjs', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(source, /from ['"].*ontological-structural-synthesis-canary-v4b/);
});

test('replication retains no external effect authority', () => {
  const result = runOntologicalV4BIndependentReplication();
  assert.equal(result.externalEffectAuthority, 'NONE');
  assert.match(result.promotionBoundary, /NARROW_SOFTWARE_DEMONSTRATED_REVIEW_ONLY/);
});
