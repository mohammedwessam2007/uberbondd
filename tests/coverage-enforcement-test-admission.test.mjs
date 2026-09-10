import test from 'node:test';
import assert from 'node:assert/strict';

import { verifyEnforcementTestAdmission } from '../src/coverage-enforcement-test-admission.mjs';

test('source-only enforcement is refused instead of granting a law testless authority evidence', () => {
  const verdict = verifyEnforcementTestAdmission({
    enforcement: [{ concept: 'Capability does not create authority', sources: ['src/wallbreaker.mjs'], tests: [] }]
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.status, 'COVERAGE_ENFORCEMENT_TEST_ADMISSION_REFUSED');
  assert.deepEqual(verdict.problems.map(problem => problem.reason), ['enforcement-entry-requires-test']);
  assert.equal(verdict.problems[0].boundary, 'SOURCE_PRESENCE_ALONE_CANNOT_GRANT_ENFORCED_BY_CODE');
});

test('missing tests property is refused fail-closed', () => {
  const verdict = verifyEnforcementTestAdmission({
    enforcement: [{ concept: 'Prediction is not authority', sources: ['src/wallbreaker.mjs'] }]
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.problems[0].reason, 'enforcement-entry-requires-test');
});

test('blank and duplicate test entries cannot manufacture admission', () => {
  const refused = verifyEnforcementTestAdmission({
    enforcement: [{ concept: 'Unknown remains unknown', sources: ['src/wallbreaker.mjs'], tests: [' ', ''] }]
  });
  assert.equal(refused.ok, false);

  const admitted = verifyEnforcementTestAdmission({
    enforcement: [{ concept: 'Unknown remains unknown', sources: ['src/wallbreaker.mjs'], tests: ['tests/wallbreaker.test.mjs', 'tests/wallbreaker.test.mjs'] }]
  });
  assert.equal(admitted.ok, true);
  assert.equal(admitted.problems.length, 0);
  assert.equal(admitted.businessEffectAuthority, 'NONE');
});

test('empty enforcement is valid because it grants no ENFORCED_BY_CODE authority', () => {
  const verdict = verifyEnforcementTestAdmission({ enforcement: [] });
  assert.equal(verdict.ok, true);
  assert.equal(verdict.status, 'COVERAGE_ENFORCEMENT_TEST_ADMISSION_OK');
});
