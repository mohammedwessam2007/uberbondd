export const COVERAGE_STATE_EVIDENCE_INTEGRITY_VERSION = 'uberbond.coverage-state-evidence-integrity.v1.1';

const STRUCTURAL_CLASSES = new Set(['HIERARCHY', 'ONTOLOGY', 'LOOP_STAGE', 'STRATEGIC_STAGE']);
const ALIAS_CLASSES = new Set(['ALIAS']);
const REFERENCE_CLASSES = new Set(['REFERENCE_SURFACE']);
const FIELD_CLASSES = new Set([
  'FORECAST_DIMENSION', 'FORECAST_OUTPUT', 'FORECAST_REQUIREMENT',
  'FORECAST_MECHANISM', 'CALIBRATION_FIELD', 'DECISION_PACKET_FIELD'
]);
const STRONG_MATCHES = new Set(['EXACT_SLUG', 'DECLARED_AND_VERIFIED']);
const LIVE_REACHABILITY = new Set(['PRODUCTION', 'OPERATOR_ONLY']);
const unique = values => [...new Set(values.filter(Boolean))];

function fail(reasonCodes, extra = {}) {
  return {
    ok: false,
    version: COVERAGE_STATE_EVIDENCE_INTEGRITY_VERSION,
    status: 'COVERAGE_STATE_EVIDENCE_INTEGRITY_REFUSED',
    reasonCodes: unique(reasonCodes),
    businessEffectAuthority: 'NONE',
    ...extra
  };
}

/**
 * Independently validates the semantic entitlement of states in a compiled
 * coverage artifact. This intentionally does not trust how the compiler
 * reached a state: a future extractor/caller may carry attacker-controlled or
 * stale metadata. The final truth tribunal therefore rechecks the minimum
 * evidence shape needed for states that can otherwise overclaim implementation.
 *
 * This verifier never promotes a row. It can only refuse an overclaim.
 */
export function verifyCoverageStateEvidenceIntegrity(coverage = {}) {
  if (!Array.isArray(coverage?.rows)) return fail(['coverage-rows-required']);

  const violations = [];
  for (const row of coverage.rows) {
    const id = String(row?.canonicalId || '').trim() || '<missing-canonical-id>';
    const cls = String(row?.class || 'CONCEPT').trim();
    const state = String(row?.currentState || '').trim();
    const evidence = row?.currentEvidence || {};
    const sources = Array.isArray(evidence.sourceModules) ? evidence.sourceModules.filter(Boolean) : [];
    const tests = Array.isArray(evidence.testModules) ? evidence.testModules.filter(Boolean) : [];

    const add = reason => violations.push({ canonicalId: id, class: cls, currentState: state, reason });

    // These classes are semantic boundaries/categories. No caller-supplied
    // state and no coincidental file match may turn them into implementation.
    if (cls === 'BOUNDARY' && state !== 'OWNER_BOUNDARY') add('owner-boundary-state-overridden');
    if (cls === 'EXTERNAL_GATE' && state !== 'EXTERNAL_BLOCKED') add('external-gate-state-overridden');
    if (cls === 'ELAPSED_TIME' && state !== 'ELAPSED_TIME_REQUIRED') add('elapsed-time-state-overridden');
    if (STRUCTURAL_CLASSES.has(cls) && state !== 'STRUCTURAL_NOT_A_BUILD_TARGET') add('structural-state-overridden');
    if (ALIAS_CLASSES.has(cls) && state !== 'ALIAS_OF_CANONICAL_CONCEPT') add('alias-state-overridden');

    // REFERENCE_ONLY_BY_CANON is deliberately weaker than implementation. It
    // is valid only for a canonical mechanism/vendor/runtime reference and must
    // carry no source/test evidence that could be misread as shipped behavior.
    if (state === 'REFERENCE_ONLY_BY_CANON') {
      if (!REFERENCE_CLASSES.has(cls)) add('reference-only-state-requires-reference-surface-class');
      if (sources.length > 0 || tests.length > 0) add('reference-only-state-must-not-claim-implementation-evidence');
    }

    // Current implementation states must be reconstructable from the row's own
    // evidence, not from a mutable declaredState field upstream.
    if (state === 'VERIFIED_CURRENT') {
      if (sources.length === 0) add('verified-current-requires-source-evidence');
      if (tests.length === 0) add('verified-current-requires-test-evidence');
      if (!LIVE_REACHABILITY.has(evidence.reachability)) add('verified-current-requires-live-reachability');
      if (evidence.matchScope !== 'WHOLE_NAME') add('verified-current-requires-whole-name-evidence');
      if (!STRONG_MATCHES.has(evidence.matchStrength)) add('verified-current-requires-strong-match');
    }

    if (state === 'PARTIAL_CURRENT' && sources.length === 0) {
      add('partial-current-requires-source-evidence');
    }

    if (state === 'COVERED_BY_PARENT_ORGAN' && !FIELD_CLASSES.has(cls)) {
      add('parent-organ-coverage-requires-field-class');
    }
  }

  if (violations.length) {
    return fail(violations.map(v => v.reason), { violations });
  }

  return {
    ok: true,
    version: COVERAGE_STATE_EVIDENCE_INTEGRITY_VERSION,
    status: 'COVERAGE_STATES_INDEPENDENTLY_BOUND_TO_EVIDENCE',
    rowsChecked: coverage.rows.length,
    businessEffectAuthority: 'NONE'
  };
}
