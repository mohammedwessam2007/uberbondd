// Fail-closed admission for declarations that can grant ENFORCED_BY_CODE.
//
// Ordinary implementation manifests may truthfully describe source-only work as
// PARTIAL_CURRENT. Enforcement declarations are different: their only purpose is
// to let a canonical law become ENFORCED_BY_CODE, so a source without a bound
// test is not enough evidence to admit the declaration to the coverage compiler.

export const COVERAGE_ENFORCEMENT_TEST_ADMISSION_VERSION = 'uberbond.coverage-enforcement-test-admission.v1';

const cleanList = value => [...new Set((Array.isArray(value) ? value : [])
  .map(item => String(item ?? '').trim())
  .filter(Boolean))];

export function verifyEnforcementTestAdmission({ enforcement = [] } = {}) {
  const problems = [];
  const entries = Array.isArray(enforcement) ? enforcement : [];

  for (const entry of entries) {
    const concept = String(entry?.concept ?? '').trim() || null;
    const tests = cleanList(entry?.tests);
    if (tests.length === 0) {
      problems.push({
        reason: 'enforcement-entry-requires-test',
        concept,
        boundary: 'SOURCE_PRESENCE_ALONE_CANNOT_GRANT_ENFORCED_BY_CODE'
      });
    }
  }

  return {
    ok: problems.length === 0,
    status: problems.length === 0 ? 'COVERAGE_ENFORCEMENT_TEST_ADMISSION_OK' : 'COVERAGE_ENFORCEMENT_TEST_ADMISSION_REFUSED',
    problems,
    businessEffectAuthority: 'NONE'
  };
}
