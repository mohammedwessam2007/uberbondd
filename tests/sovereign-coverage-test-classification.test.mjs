import test from 'node:test';
import assert from 'node:assert/strict';
import { repoIndex } from '../scripts/sovereign-coverage-matrix.mjs';

test('coverage evidence test class contains only executable .test.mjs suites', () => {
  const index = repoIndex();
  assert.ok(index.testFiles.length > 0);
  assert.equal(index.testFiles.every(file => file.startsWith('tests/') && file.endsWith('.test.mjs')), true);
  assert.equal(index.testFiles.includes('tests/helpers/frontier-synthetic-provenance.mjs'), false);
});
