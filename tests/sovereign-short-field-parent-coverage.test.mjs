import test from 'node:test';
import assert from 'node:assert/strict';
import { compileCoverageMatrix } from '../src/sovereign-coverage-matrix.mjs';

const index = {
  sourceFiles: ['src/parent-organ.mjs'],
  testFiles: ['tests/parent-organ.test.mjs'],
  productionReachable: ['src/parent-organ.mjs'],
  operatorReachable: ['src/parent-organ.mjs']
};

const parentManifest = [{
  concept: 'Parent Organ',
  sources: ['src/parent-organ.mjs'],
  tests: ['tests/parent-organ.test.mjs']
}];

test('a short field with no distinctive filename token inherits only a verified parent organ', () => {
  const matrix = compileCoverageMatrix({
    concepts: [
      { name: 'Parent Organ', source: 's', class: 'ORGAN' },
      { name: 'joy', source: 's', class: 'FORECAST_DIMENSION', parent: 'Parent Organ' }
    ],
    repoIndex: index,
    manifest: parentManifest
  });
  assert.equal(matrix.ok, true);
  const joy = matrix.rows.find(row => row.literalNames[0] === 'joy');
  assert.equal(joy.currentEvidence.matchStrength, 'NO_DISTINCTIVE_TOKENS');
  assert.equal(joy.currentState, 'COVERED_BY_PARENT_ORGAN');
});

test('a short field cannot inherit from an unbuilt parent', () => {
  const matrix = compileCoverageMatrix({
    concepts: [
      { name: 'Parent Nobody Built', source: 's', class: 'ORGAN' },
      { name: 'joy', source: 's', class: 'FORECAST_DIMENSION', parent: 'Parent Nobody Built' }
    ],
    repoIndex: index
  });
  assert.equal(matrix.ok, true);
  assert.equal(matrix.rows.find(row => row.literalNames[0] === 'joy').currentState, 'SPEC_ONLY');
});

test('short generic concepts remain UNKNOWN and cannot borrow field semantics', () => {
  const matrix = compileCoverageMatrix({
    concepts: [{ name: 'joy', source: 's', class: 'CONCEPT' }],
    repoIndex: index
  });
  assert.equal(matrix.ok, true);
  assert.equal(matrix.rows[0].currentEvidence.matchStrength, 'NO_DISTINCTIVE_TOKENS');
  assert.equal(matrix.rows[0].currentState, 'UNKNOWN');
});

test('a short unparented field remains SPEC_ONLY rather than becoming covered', () => {
  const matrix = compileCoverageMatrix({
    concepts: [{ name: 'joy', source: 's', class: 'FORECAST_DIMENSION' }],
    repoIndex: index
  });
  assert.equal(matrix.ok, true);
  assert.equal(matrix.rows[0].currentState, 'SPEC_ONLY');
});
