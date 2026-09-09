import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { extractConcepts } from '../scripts/sovereign-coverage-matrix.mjs';
import { inferSemanticRequirementClass } from '../src/semantic-requirement-tribunal.mjs';

test('canonical Personal Civilization source types only its explicit far-future donor list as open-ended frontier', () => {
  const { concepts, missingSources } = extractConcepts();
  assert.deepEqual(missingSources, []);

  const frontier = concepts.filter(row => row.source === 'personal-civilization' && row.sourceList === 'farFutureConceptualDonors');
  assert.equal(frontier.length, 20, 'canon currently names exactly twenty far-future conceptual donors');
  assert.ok(frontier.every(row => row.class === 'OPEN_ENDED_FRONTIER'));

  const lifeOrgans = concepts.filter(row => row.source === 'personal-civilization' && row.sourceList === 'canonicalLifeSystems');
  assert.equal(lifeOrgans.length, 14);
  assert.ok(lifeOrgans.every(row => row.class === 'PERSONAL_CIVILIZATION_ORGAN'),
    'ordinary Personal Civilization organs must remain finite build candidates rather than inheriting frontier status');

  const economicDonors = concepts.filter(row => row.source === 'personal-civilization' && row.sourceList === 'economicInventionSystems');
  assert.ok(economicDonors.length > 0);
  assert.ok(economicDonors.every(row => row.class === 'ECONOMIC_DONOR'),
    'frontier typing must not spread to neighboring donor or invention lists');
});

test('human evaluation dimensions remain accounted review criteria rather than nineteen imaginary software organs', () => {
  const { concepts } = extractConcepts();
  const review = concepts.filter(row => row.source === 'personal-civilization' && row.sourceList === 'evaluationDimensions');
  assert.equal(review.length, 19);
  assert.ok(review.every(row => row.class === 'EVALUATION_CRITERION'));

  const lifeDecisionDimensions = concepts.filter(row => row.source === 'personal-civilization' && row.sourceList === 'lifeDecisionDimensions');
  assert.equal(lifeDecisionDimensions.length, 20);
  assert.ok(lifeDecisionDimensions.every(row => row.class === 'FORECAST_DIMENSION'),
    'actual Value Manifold outputs must stay field requirements and cannot be swept into human review criteria');
});

test('semantic inference excludes only canonically typed frontier/review rows and keeps an ordinary missing organ finite', () => {
  assert.equal(
    inferSemanticRequirementClass({ class: 'OPEN_ENDED_FRONTIER', currentState: 'SPEC_ONLY' }),
    'OPEN_ENDED_FRONTIER'
  );
  assert.equal(
    inferSemanticRequirementClass({ class: 'EVALUATION_CRITERION', currentState: 'SPEC_ONLY' }),
    'STRUCTURAL_CONSTITUTION'
  );
  assert.equal(
    inferSemanticRequirementClass({ class: 'CONCEPT', currentState: 'SPEC_ONLY' }),
    'FINITE_BEHAVIOR',
    'SPEC_ONLY by itself must never escape the finite engineering denominator'
  );
  assert.equal(
    inferSemanticRequirementClass({ class: 'PERSONAL_CIVILIZATION_ORGAN', currentState: 'PARTIAL_CURRENT' }),
    'FINITE_BEHAVIOR',
    'PARTIAL_CURRENT life organs remain real finite debt'
  );
});

test('production semantic generator has explicit bounded contracts for the two non-finite canonical classes', () => {
  const generator = readFileSync('scripts/semantic-requirement-tribunal.mjs', 'utf8');
  assert.match(generator, /requirementClass==='OPEN_ENDED_FRONTIER'/);
  assert.match(generator, /far-future conceptual donor/i);
  assert.match(generator, /requirementClass==='STRUCTURAL_CONSTITUTION'/);
  assert.match(generator, /review criterion/i);
  assert.match(generator, /inferSemanticRequirementClass\(row,null\)/,
    'production generator must derive the class from the canonical row rather than a free-form classification manifest');
});
