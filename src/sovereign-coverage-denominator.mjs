import { COVERAGE_STATES } from './sovereign-coverage-matrix.mjs';

export const SOVEREIGN_COVERAGE_DENOMINATOR_VERSION = 'uberbond.sovereign-coverage-denominator.v1';

const stateSet = new Set(COVERAGE_STATES);
const nni = value => Number.isSafeInteger(Number(value)) && Number(value) >= 0;
const stableObject = object => Object.fromEntries(Object.entries(object || {}).sort(([a], [b]) => a.localeCompare(b)));

export function verifyCoverageDenominatorConservation(coverage = {}) {
  const rows = Array.isArray(coverage?.rows) ? coverage.rows : [];
  const reasons = [];
  const histogram = {};

  if (!rows.length) reasons.push('coverage-materialized-rows-required');
  if (!nni(coverage?.counts?.rows)) reasons.push('coverage-row-denominator-required');
  if (!nni(coverage?.counts?.extractedConcepts)) reasons.push('coverage-concept-denominator-required');

  for (const row of rows) {
    const state = String(row?.currentState || '').trim();
    if (!stateSet.has(state)) {
      reasons.push('coverage-row-state-must-be-canonical');
      continue;
    }
    histogram[state] = (histogram[state] || 0) + 1;
  }

  const declaredRows = Number(coverage?.counts?.rows);
  const extractedConcepts = Number(coverage?.counts?.extractedConcepts);
  if (nni(declaredRows) && declaredRows !== rows.length) reasons.push('coverage-materialized-rows-must-match-denominator');
  if (nni(extractedConcepts) && extractedConcepts !== rows.length) reasons.push('coverage-extracted-concepts-must-match-materialized-rows');

  const declaredByState = coverage?.counts?.byState;
  if (!declaredByState || typeof declaredByState !== 'object' || Array.isArray(declaredByState)) {
    reasons.push('coverage-state-counts-required');
  } else {
    for (const value of Object.values(declaredByState)) {
      if (!nni(value)) reasons.push('coverage-state-counts-must-be-nonnegative-integers');
    }
    const normalizedDeclared = stableObject(Object.fromEntries(
      Object.entries(declaredByState).filter(([, value]) => Number(value) !== 0).map(([key, value]) => [key, Number(value)])
    ));
    const normalizedObserved = stableObject(histogram);
    if (JSON.stringify(normalizedDeclared) !== JSON.stringify(normalizedObserved)) {
      reasons.push('coverage-state-counts-must-exactly-match-materialized-rows');
    }
  }

  return {
    ok: reasons.length === 0,
    version: SOVEREIGN_COVERAGE_DENOMINATOR_VERSION,
    reasonCodes: [...new Set(reasons)],
    rows: rows.length,
    extractedConcepts: nni(extractedConcepts) ? extractedConcepts : null,
    declaredRows: nni(declaredRows) ? declaredRows : null,
    observedByState: stableObject(histogram),
    truthBoundary: 'DENOMINATOR_CONSERVATION_PROVES_ONLY_THAT_CANONICAL_EXTRACTION_MATERIALIZED_ROWS_AND_STATE_ACCOUNTING_DESCRIBE_THE_SAME_FINITE_SET. IT_DOES_NOT_PROVE_IMPLEMENTATION_RUNTIME_OR_EXTERNAL_OUTCOMES.'
  };
}
