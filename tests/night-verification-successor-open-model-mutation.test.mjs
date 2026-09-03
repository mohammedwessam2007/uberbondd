import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SUCCESSOR_OPEN_MODEL_MUTATION,
  validateSuccessorOpenModelMutation,
  executeSuccessorOpenModelMutation
} from '../scripts/night-verification-successor-open-model-mutation.mjs';

test('OPENMODEL-07 registration binds the absent-identity guard to its named hostile test', () => {
  const registration = validateSuccessorOpenModelMutation();
  assert.equal(registration.id, 'OPENMODEL-07');
  assert.equal(registration.anchorOccurrences, 1);
  assert.equal(registration.directModuleImport, true);
  assert.equal(registration.namedTestPresent, true);
  assert.equal(registration.assertionPresent, true);
  assert.equal(registration.registrationValid, true);
  assert.equal(SUCCESSOR_OPEN_MODEL_MUTATION.testName, 'Open Model runtime must not report successful completion when provider model identity is absent');
});

test('OPENMODEL-07 is killed only by the named absent-identity hostile assertion after a green baseline', () => {
  const report = executeSuccessorOpenModelMutation();
  assert.equal(report.verdict, 'KILLED', JSON.stringify(report));
  assert.equal(report.baselineStatus, 0);
  assert.notEqual(report.mutantStatus, 0);
  assert.equal(report.intendedTestFailed, true);
  assert.equal(report.causalBasis, 'BASELINE_GREEN_SINGLE_MUTATION_NAMED_TEST_RED');
});
