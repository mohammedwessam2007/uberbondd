import test from 'node:test';
import assert from 'node:assert/strict';

import { verifyEnforcementManifestAdmission } from '../src/enforcement-manifest-admission.mjs';

const exists = new Set(['src/law.mjs', 'tests/law.test.mjs']);
const fileExists = file => exists.has(file);

test('source plus test is admitted without creating authority', () => {
  const verdict = verifyEnforcementManifestAdmission({
    entries: [{ concept: 'Capability does not create authority', sources: ['src/law.mjs'], tests: ['tests/law.test.mjs'] }],
    fileExists
  });
  assert.equal(verdict.ok, true);
  assert.equal(verdict.status, 'ENFORCEMENT_MANIFEST_ADMISSION_VERIFIED');
  assert.equal(verdict.businessEffectAuthority, 'NONE');
  assert.equal(verdict.externalEffectAuthority, 'NONE');
});

test('source-only enforcement is refused', () => {
  const verdict = verifyEnforcementManifestAdmission({
    entries: [{ concept: 'Capability does not create authority', sources: ['src/law.mjs'], tests: [] }],
    fileExists
  });
  assert.equal(verdict.ok, false);
  assert.ok(verdict.problems.some(problem => problem.reason === 'enforcement-entry-test-required'));
});

test('test-only enforcement is refused', () => {
  const verdict = verifyEnforcementManifestAdmission({
    entries: [{ concept: 'Capability does not create authority', sources: [], tests: ['tests/law.test.mjs'] }],
    fileExists
  });
  assert.equal(verdict.ok, false);
  assert.ok(verdict.problems.some(problem => problem.reason === 'enforcement-entry-source-required'));
});

test('missing declared files are refused', () => {
  const verdict = verifyEnforcementManifestAdmission({
    entries: [{ concept: 'Capability does not create authority', sources: ['src/missing.mjs'], tests: ['tests/missing.test.mjs'] }],
    fileExists
  });
  assert.equal(verdict.ok, false);
  assert.ok(verdict.problems.some(problem => problem.reason === 'enforcement-source-missing'));
  assert.ok(verdict.problems.some(problem => problem.reason === 'enforcement-test-missing'));
});

test('blank concept cannot become an enforcement declaration', () => {
  const verdict = verifyEnforcementManifestAdmission({
    entries: [{ concept: '', sources: ['src/law.mjs'], tests: ['tests/law.test.mjs'] }],
    fileExists
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.problems[0].reason, 'enforcement-entry-concept-required');
});
