import test from 'node:test';
import assert from 'node:assert/strict';

import { extractConcepts } from '../scripts/sovereign-coverage-matrix.mjs';
import { compileCoverageMatrix } from '../src/sovereign-coverage-matrix.mjs';

const emptyIndex = {
  sourceFiles: [],
  testFiles: [],
  productionReachable: [],
  operatorReachable: []
};

test('far-future conceptual donors remain preserved memory, not finite build obligations', () => {
  const { concepts, missingSources } = extractConcepts();
  assert.deepEqual(missingSources, []);
  const donors = concepts.filter(row => row.source === 'personal-civilization' && row.sourceList === 'farFutureConceptualDonors');
  assert.ok(donors.length > 0, 'canonical far-future donor list must remain present');
  assert.ok(donors.every(row => row.class === 'NAMED_INITIATIVE'), 'far-future donor rows must use donor semantics');

  const matrix = compileCoverageMatrix({ concepts: donors, repoIndex: emptyIndex });
  assert.equal(matrix.ok, true);
  assert.ok(matrix.rows.every(row => row.currentState === 'HISTORICAL_DONOR_PRESERVED'));
});

test('human evaluation dimensions are evaluation ontology, not fake module outputs', () => {
  const { concepts } = extractConcepts();
  const criteria = concepts.filter(row => row.source === 'personal-civilization' && row.sourceList === 'evaluationDimensions');
  assert.ok(criteria.length > 0, 'canonical evaluation dimensions must remain present');
  assert.ok(criteria.every(row => row.class === 'ONTOLOGY'), 'human review criteria must be structural ontology');

  const matrix = compileCoverageMatrix({ concepts: criteria, repoIndex: emptyIndex });
  assert.equal(matrix.ok, true);
  assert.ok(matrix.rows.every(row => row.currentState === 'STRUCTURAL_NOT_A_BUILD_TARGET'));
});

test('near-term supporting cognitive systems remain genuine finite concepts', () => {
  const { concepts } = extractConcepts();
  const systems = concepts.filter(row => row.source === 'personal-civilization' && row.sourceList === 'supportingCognitiveTechnicalSystems');
  assert.ok(systems.length > 0, 'supporting cognitive systems must remain present');
  assert.ok(systems.every(row => row.class === 'CONCEPT'), 'supporting cognitive systems must not be hidden as donors');

  const matrix = compileCoverageMatrix({ concepts: systems, repoIndex: emptyIndex });
  assert.equal(matrix.ok, true);
  assert.ok(matrix.rows.every(row => row.currentState === 'SPEC_ONLY'), 'genuine unbuilt concepts must stay in the finite residue');
});
