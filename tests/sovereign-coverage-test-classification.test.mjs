import test from 'node:test';
import assert from 'node:assert/strict';
import { repoIndex } from '../scripts/sovereign-coverage-matrix.mjs';

test('coverage evidence test class contains only executable .test.mjs suites', () => {
  const index = repoIndex();
  assert.ok(index.testFiles.length > 0);
  assert.equal(index.testFiles.every(file => file.startsWith('tests/') && file.endsWith('.test.mjs')), true);
  assert.equal(index.testFiles.includes('tests/helpers/frontier-synthetic-provenance.mjs'), false);
});


test('coverage repo index never re-admits deliberately gated modules as operator reachable', () => {
  const index = repoIndex();
  const classification = JSON.parse(readFileSync('config/reachability-classification.json', 'utf8'));
  const gated = new Set(Object.keys(classification.modules || {}));
  const leaked = index.operatorReachable.filter(file => gated.has(file));
  assert.deepEqual(leaked, []);
  assert.equal(index.operatorReachable.includes('src/overnight/control/automation-acquisition-frontier.mjs'), false);
});
