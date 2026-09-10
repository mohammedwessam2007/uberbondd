// Thin fail-closed admission wrapper around the preserved no-drop compiler.
// The preserved base remains byte-identical to the exact current-main compiler;
// this layer adds one invariant only: a declaration capable of granting
// ENFORCED_BY_CODE must bind at least one test. Ordinary source-only manifests
// remain legal and continue to resolve to PARTIAL_CURRENT in the base compiler.

export * from './sovereign-coverage-matrix-base.mjs';

import * as base from './sovereign-coverage-matrix-base.mjs';
import { verifyEnforcementTestAdmission } from './coverage-enforcement-test-admission.mjs';

export function compileCoverageMatrix(args = {}) {
  // Preserve the base compiler's stricter/more specific validation precedence
  // for missing files, unknown concepts, malformed gates, and all other existing
  // refusal classes. The new guard only evaluates a matrix the base considered
  // otherwise valid, so it cannot mask an older diagnostic.
  const compiled = base.compileCoverageMatrix(args);
  if (!compiled?.ok) return compiled;

  const admission = verifyEnforcementTestAdmission({ enforcement: args?.enforcement });
  if (!admission.ok) {
    return {
      ok: false,
      status: 'COVERAGE_ENFORCEMENT_INVALID',
      reasonCodes: [...new Set(admission.problems.map(problem => problem.reason))],
      problems: admission.problems,
      businessEffectAuthority: 'NONE'
    };
  }

  return compiled;
}
