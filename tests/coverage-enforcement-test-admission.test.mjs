import test from 'node:test';
import assert from 'node:assert/strict';

import { compileCoverageMatrix } from '../src/sovereign-coverage-matrix.mjs';

const law = { name: 'Capability does not create authority', class: 'AUTHORITY_LAW', source: 's' };
const index = {
  sourceFiles: ['src/wallbreaker.mjs'],
  testFiles: ['tests/wallbreaker.test.mjs'],
  productionReachable: ['src/wallbreaker.mjs'],
  operatorReachable: ['src/wallbreaker.mjs']
};

test('source-only enforcement cannot grant ENFORCED_BY_CODE', () => {
  const matrix = compileCoverageMatrix({
    concepts: [law],
    repoIndex: index,
    enforcement: [{ concept: law.name, sources: ['src/wallbreaker.mjs'], tests: [] }]
  });
  assert.equal(matrix.ok, false);
  assert.equal(matrix.status, 'COVERAGE_ENFORCEMENT_INVALID');
  assert.deepEqual(matrix.reasonCodes, ['enforcement-entry-requires-test']);
  assert.equal(matrix.rows, undefined);
});

test('enforcement with a verified source and test remains admissible', () => {
  const matrix = compileCoverageMatrix({
    concepts: [law],
    repoIndex: index,
    enforcement: [{ concept: law.name, sources: ['src/wallbreaker.mjs'], tests: ['tests/wallbreaker.test.mjs'] }]
  });
  assert.equal(matrix.ok, true);
  assert.equal(matrix.rows[0].currentState, 'ENFORCED_BY_CODE');
});
