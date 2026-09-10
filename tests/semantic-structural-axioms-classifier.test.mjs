import test from 'node:test';
import assert from 'node:assert/strict';
import { inferSemanticRequirementClass } from '../src/semantic-requirement-tribunal.mjs';

const triad = [
  'total-north-star:mohamed-provides-will',
  'total-north-star:uberbond-provides-intelligence',
  'total-north-star:reality-provides-feedback'
];

test('irreducible North Star relationship is structural rather than three invented software behaviors', () => {
  for (const canonicalId of triad) {
    assert.equal(
      inferSemanticRequirementClass({ canonicalId, currentState: 'VERIFIED_CURRENT' }),
      'STRUCTURAL_CONSTITUTION',
      canonicalId
    );
  }
});

test('structural triad admission is exact and does not swallow neighboring executable requirements', () => {
  for (const canonicalId of [
    'total-north-star:mohamed-provides-will-validator',
    'total-north-star:uberbond-provides-intelligence-router',
    'total-north-star:reality-provides-feedback-loop'
  ]) {
    assert.equal(
      inferSemanticRequirementClass({ canonicalId, currentState: 'VERIFIED_CURRENT' }),
      'FINITE_BEHAVIOR',
      canonicalId
    );
  }
});

test('external and owner boundaries still outrank structural identity', () => {
  assert.equal(
    inferSemanticRequirementClass({ canonicalId: triad[0], currentState: 'OWNER_BOUNDARY' }),
    'EXTERNAL'
  );
  assert.equal(
    inferSemanticRequirementClass({ canonicalId: triad[2], currentState: 'EXTERNAL_BLOCKED' }),
    'EXTERNAL'
  );
});
