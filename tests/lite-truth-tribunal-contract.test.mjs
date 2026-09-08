import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source=readFileSync(resolve('lite/scripts/build-visual-cortex.mjs'),'utf8');

test('private-lite regenerates readiness and canonical coverage before visual graph synthesis',()=>{
  const readiness=source.indexOf("['node', ['scripts/system-readiness.mjs']]");
  const coverage=source.indexOf("['node', ['scripts/sovereign-coverage-matrix.mjs']]");
  const featureGenome=source.indexOf("['node', ['scripts/uberbond-feature-genome.mjs']]");
  assert.ok(readiness>=0);
  assert.ok(coverage>readiness);
  assert.ok(featureGenome>coverage);
});

test('truth tribunal executes coverage and current-reality hostile suites',()=>{
  for(const path of [
    'tests/sovereign-coverage-matrix.test.mjs',
    'tests/current-reality-freeze.test.mjs',
    'tests/current-reality-freeze-integration.test.mjs'
  ]) assert.match(source,new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});

test('build surfaces current-reality freeze without using stale handoff as a deployment kill switch',()=>{
  assert.match(source,/buildCurrentRealityFreeze\(\{ rootDir: repoRoot \}\)/);
  assert.doesNotMatch(source,/current-reality-freeze\.mjs[^\n]*--verify/);
  assert.match(source,/stale handoff is also evidence to surface/);
});

test('truth summary preserves repository vs runtime vs external evidence classes',()=>{
  assert.match(source,/runtimeTruth:/);
  assert.match(source,/externalOutcomeTruth:/);
  assert.match(source,/BUILD_MEASURES_REPOSITORY_PROVABLE_TRUTH_ONLY__NAMED_RUNTIME_AND_EXTERNAL_OUTCOMES_REQUIRE_SEPARATE_EVIDENCE/);
  assert.match(source,/businessEffectAuthority: 'NONE'/);
});

test('truth summary publishes no invented whole-system percentage',()=>{
  assert.doesNotMatch(source,/wholeSystemPercent|fullSystemPercent|completionPercent|asiPercent/);
  assert.match(source,/byState:/);
  assert.match(source,/rows:/);
});
