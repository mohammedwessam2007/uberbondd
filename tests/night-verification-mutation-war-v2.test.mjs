import test from 'node:test';
import assert from 'node:assert/strict';
import { NIGHT_VERIFICATION_MUTATIONS_V2 } from '../scripts/night-verification-mutation-war-v2.mjs';
import { validateNamedMutationRegistrations, executeMutationWarV3, suiteLoadsModule } from '../scripts/night-verification-mutation-war-v3.mjs';

test('strict Frontier/Open Model mutation registrations bind unique anchors to direct named importing assertions', () => {
  const registrations = validateNamedMutationRegistrations();
  assert.equal(registrations.length, 13);
  for (const item of registrations) {
    assert.equal(item.anchorOccurrences, 1, `${item.id}: unique mutation anchor required`);
    assert.equal(item.importsMutatedModule, true, `${item.id}: killing suite must directly import mutated module`);
    assert.equal(item.assertionPresent, true, `${item.id}: named assertion must exist`);
    assert.equal(item.namedTestPresent, true, `${item.id}: exact named test must exist`);
    assert.equal(item.registrationValid, true, `${item.id}: registration must be valid`);
  }
});

test('mutation registration rejects comment and inert-string module-path decoys', () => {
  const target = '../src/frontier-operator.mjs';
  assert.equal(suiteLoadsModule(`// import x from '${target}'`, target), false);
  assert.equal(suiteLoadsModule(`const decoy = "${target}";`, target), false);
  assert.equal(suiteLoadsModule(`import { evaluateGoal } from '${target}';`, target), true);
  assert.equal(suiteLoadsModule(`await import('${target}')`, target), true);
});

test('strict mutation war only counts a kill when the intended named test itself fails', () => {
  const report = executeMutationWarV3();
  assert.equal(report.results.length, NIGHT_VERIFICATION_MUTATIONS_V2.length);
  for (const result of report.results) {
    assert.equal(result.verdict, 'KILLED', `${result.id}: ${JSON.stringify(result)}`);
    assert.equal(result.baselineStatus, 0, `${result.id}: baseline suite must be green before kill can count`);
    assert.notEqual(result.mutantStatus, 0, `${result.id}: mutated target suite must fail`);
    assert.equal(result.intendedTestFailed, true, `${result.id}: suite red is insufficient unless the intended test is red`);
    assert.equal(result.causalBasis, 'BASELINE_GREEN_SINGLE_MUTATION_NAMED_TEST_RED');
  }
});
