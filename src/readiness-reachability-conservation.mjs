export const READINESS_REACHABILITY_CONSERVATION_VERSION = 'uberbond.readiness-reachability-conservation.v1.1';

const nni = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const cleanList = value => [...new Set((Array.isArray(value) ? value : []).map(item => String(item || '').trim()).filter(Boolean))].sort();

export function verifyReachabilityConservation({ repository = {}, reachability = {} } = {}) {
  const reasons = [];
  const counts = {
    srcModules: reachability?.srcModules,
    production: reachability?.reachableFromProduction,
    unattendedOperatorOnly: reachability?.reachableFromUnattendedOperatorScriptsOnly,
    founderInteractiveOnly: reachability?.reachableFromFounderInteractiveOnly,
    unreachable: reachability?.noEntryPointAtAll
  };

  for (const [name, value] of Object.entries(counts)) {
    if (!nni(value)) reasons.push(`reachability-count-must-be-nonnegative-integer:${name}`);
  }
  if (!nni(repository?.sourceModules)) reasons.push('readiness-source-module-count-must-be-nonnegative-integer');
  if (reachability?.partitionExact !== true) reasons.push('reachability-partition-must-be-exact');

  if (Object.values(counts).every(nni)) {
    const observedPartition = counts.production + counts.unattendedOperatorOnly + counts.founderInteractiveOnly + counts.unreachable;
    if (observedPartition !== counts.srcModules) reasons.push('reachability-partition-arithmetic-mismatch');
    if (reachability?.partitionExact !== (observedPartition === counts.srcModules)) reasons.push('reachability-partition-flag-must-match-arithmetic');
  }

  if (nni(repository?.sourceModules) && nni(counts.srcModules) && repository.sourceModules !== counts.srcModules) {
    reasons.push('readiness-source-modules-must-match-reachability-denominator');
  }

  const unclassified = cleanList(reachability?.unclassified);
  const staleClassifications = cleanList(reachability?.staleClassifications);
  const founderInteractiveClassificationViolations = cleanList(reachability?.founderInteractiveClassificationViolations);

  if (reachability?.allClassified !== true) reasons.push('reachability-must-be-fully-classified');
  if (unclassified.length) reasons.push('reachability-unclassified-list-must-be-empty');
  if (staleClassifications.length) reasons.push('reachability-stale-classifications-must-be-empty');
  if (founderInteractiveClassificationViolations.length) reasons.push('reachability-founder-classification-violations-must-be-empty');

  return {
    ok: reasons.length === 0,
    version: READINESS_REACHABILITY_CONSERVATION_VERSION,
    reasonCodes: [...new Set(reasons)],
    counts: Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, nni(value) ? value : null])),
    sourceModules: nni(repository?.sourceModules) ? repository.sourceModules : null,
    classificationDiagnostics: {
      unclassified,
      staleClassifications,
      founderInteractiveClassificationViolations
    },
    truthBoundary: 'REACHABILITY_CONSERVATION_PROVES_ONLY_ARITHMETIC_AND_CLASSIFICATION_ACCOUNTING_FOR_THE_DECLARED_EXACT_SOURCE_TREE. DIAGNOSTIC LISTS REPORT THE SOURCE PATHS THAT FAILED THAT ACCOUNTING; THEY GRANT NO REACHABILITY OR AUTHORITY. IT DOES_NOT_PROVE_RUNTIME_EXECUTION_OR_EXTERNAL_OUTCOMES.'
  };
}
