import test from 'node:test';
import assert from 'node:assert/strict';
import { NIGHT_VERIFICATION_MUTATIONS_V2, validateMutationRegistrations, executeMutationWar } from '../scripts/night-verification-mutation-war-v2.mjs';

test('strict Frontier/Open Model mutation registrations bind unique anchors to direct importing assertions', () => {
  const registrations = validateMutationRegistrations();
  assert.equal(registrations.length, 13);
  for (const item of registrations) {
    assert.equal(item.anchorOccurrences, 1, `${item.id}: unique mutation anchor required`);
    assert.equal(item.importsMutatedModule, true, `${item.id}: killing suite must directly import mutated module`);
    assert.equal(item.assertionPresent, true, `${item.id}: named assertion must exist`);
    assert.equal(item.registrationValid, true, `${item.id}: registration must be valid`);
  }
});

test('strict mutation war requires green baseline, parseable mutant and target-suite causal failure', () => {
  const report = executeMutationWar();
  assert.equal(report.results.length, NIGHT_VERIFICATION_MUTATIONS_V2.length);
  for (const result of report.results) {
    assert.equal(result.verdict, 'KILLED', `${result.id}: ${JSON.stringify(result)}`);
    assert.equal(result.baselineStatus, 0, `${result.id}: baseline suite must be green before kill can count`);
    assert.notEqual(result.mutantStatus, 0, `${result.id}: mutated target suite must fail`);
    assert.equal(result.causalBasis, 'BASELINE_GREEN_SINGLE_MUTATION_TARGET_SUITE_RED');
  }
});
