export const CURRENT_TRUTH_REGENERATION_VERSION = 'uberbond.current-truth-regeneration.v1.1';

const SHA = /^[0-9a-f]{40}$/;
const ZERO_EFFECTS = Object.freeze({
  customerMessages: 0,
  providerCalls: 0,
  spendCents: 0,
  deployments: 0,
  dnsChanges: 0,
  credentialChanges: 0,
  paymentMutations: 0,
  productionMutations: 0
});

export const EXPECTED_TRUTH_OUTPUTS = Object.freeze([
  'artifacts/system-readiness.json',
  'artifacts/sovereign/implementation-coverage-matrix.json',
  'docs/CURRENT_SYSTEM_STATE.md'
]);

const unique = values => [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
const nonnegativeInteger = value => Number.isSafeInteger(Number(value)) && Number(value) >= 0;

function fail(reasonCodes, extra = {}) {
  return {
    ok: false,
    version: CURRENT_TRUTH_REGENERATION_VERSION,
    status: 'CURRENT_TRUTH_REGENERATION_REFUSED',
    reasonCodes: unique(reasonCodes),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS },
    ...extra
  };
}

export function verifyCurrentTruthRegeneration({
  headSha,
  readiness = {},
  coverage = {},
  freeze = {},
  dirtyPaths = [],
  generatorResults = {}
} = {}) {
  const head = String(headSha ?? '').trim().toLowerCase();
  if (!SHA.test(head)) return fail(['valid-exact-head-required']);

  const reasons = [];
  if (generatorResults?.readiness?.exitCode !== 0) reasons.push('readiness-generator-must-exit-zero');
  if (generatorResults?.coverage?.exitCode !== 0) reasons.push('coverage-generator-must-exit-zero');

  if (readiness?.generatedBy !== 'scripts/system-readiness.mjs') reasons.push('canonical-readiness-generator-required');
  if (String(readiness?.repository?.head || '').toLowerCase() !== head) reasons.push('readiness-head-mismatch');
  if (readiness?.repository?.workingTreeClean !== true) reasons.push('readiness-must-be-measured-from-clean-source-checkout');
  const reachability = readiness?.measurements?.reachability;
  if (!reachability || reachability.measurementMode !== 'LIVE_COMPUTED_FROM_IMPORT_GRAPH') reasons.push('live-reachability-measurement-required');
  if (reachability?.partitionExact !== true) reasons.push('reachability-partition-must-be-exact');
  if (reachability?.allClassified !== true) reasons.push('reachability-must-be-fully-classified');

  if (coverage?.ok !== true || coverage?.status !== 'COVERAGE_MATRIX_COMPILED') reasons.push('canonical-coverage-matrix-required');
  if (String(coverage?.sourceCommit || '').toLowerCase() !== head) reasons.push('coverage-head-mismatch');
  if (!nonnegativeInteger(coverage?.counts?.rows) || Number(coverage?.counts?.rows) === 0) reasons.push('coverage-row-denominator-required');
  if (!nonnegativeInteger(coverage?.counts?.extractedConcepts) || Number(coverage?.counts?.extractedConcepts) === 0) reasons.push('coverage-concept-denominator-required');
  if (!coverage?.counts?.byState || typeof coverage.counts.byState !== 'object' || Array.isArray(coverage.counts.byState)) reasons.push('coverage-state-counts-required');
  else {
    const stateTotal = Object.values(coverage.counts.byState).reduce((sum, value) => sum + (nonnegativeInteger(value) ? Number(value) : 0), 0);
    if (stateTotal !== Number(coverage.counts.rows)) reasons.push('coverage-state-counts-must-sum-to-row-denominator');
  }

  // Regeneration is allowed to be idempotent. A generator can successfully run
  // and leave a tracked output byte-identical to the existing file; requiring
  // every output to appear in `git status` would turn idempotence into failure.
  // The artifact's exact HEAD binding proves currency. `git status` is only the
  // mutation boundary: no path outside the declared generated truth surfaces
  // may change.
  const normalizedDirty = unique(dirtyPaths.map(path => String(path).trim()).filter(Boolean)).sort();
  const allowed = new Set(EXPECTED_TRUTH_OUTPUTS);
  const unexpectedDirty = normalizedDirty.filter(path => !allowed.has(path));
  if (unexpectedDirty.length) reasons.push('truth-regeneration-mutated-unexpected-path');

  if (freeze?.ok !== true) reasons.push('current-reality-freeze-must-not-refuse');
  if (String(freeze?.head?.sha || '').toLowerCase() !== head) reasons.push('freeze-head-mismatch');
  const generated = new Map((Array.isArray(freeze?.generatedArtifacts) ? freeze.generatedArtifacts : []).map(row => [row?.id, row]));
  for (const id of ['system-readiness', 'sovereign-coverage']) {
    const artifact = generated.get(id);
    if (!artifact || artifact.status !== 'CURRENT_EXACT_HEAD') reasons.push(`freeze-artifact-not-current-exact-head:${id}`);
  }
  if (freeze?.closureBoundary?.runtimeTruth !== 'NOT_INFERRED_FROM_REPOSITORY_FREEZE') reasons.push('freeze-runtime-boundary-must-remain-noninferred');
  if (freeze?.closureBoundary?.externalOutcomeTruth !== 'NOT_INFERRED_FROM_REPOSITORY_FREEZE') reasons.push('freeze-external-outcome-boundary-must-remain-noninferred');

  if (reasons.length) {
    return fail(reasons, {
      headSha: head,
      unexpectedDirtyPaths: unexpectedDirty,
      dirtyPaths: normalizedDirty
    });
  }

  return {
    ok: true,
    version: CURRENT_TRUTH_REGENERATION_VERSION,
    status: 'CURRENT_TRUTH_REGENERATED_FOR_EXACT_SOURCE_HEAD',
    headSha: head,
    readiness: {
      generatedAt: readiness.generatedAt,
      sourceModules: readiness.repository.sourceModules,
      testSuites: readiness.repository.testSuites,
      reachability: {
        srcModules: reachability.srcModules,
        production: reachability.reachableFromProduction,
        unattendedOperatorOnly: reachability.reachableFromUnattendedOperatorScriptsOnly,
        founderInteractiveOnly: reachability.reachableFromFounderInteractiveOnly,
        unreachable: reachability.noEntryPointAtAll,
        partitionExact: true,
        allClassified: true
      }
    },
    coverage: {
      rows: coverage.counts.rows,
      extractedConcepts: coverage.counts.extractedConcepts,
      byState: structuredClone(coverage.counts.byState),
      byLane: structuredClone(coverage.counts.byLane || {})
    },
    regeneratedPaths: normalizedDirty,
    closureBoundary: {
      sourceTruth: 'EXACT_HEAD_GENERATED_AND_CROSS_CHECKED',
      deterministicExecutionTruth: 'ONLY_GENERATOR_AND_VERIFIER_EXECUTION_PROVEN_BY_THIS_RECEIPT',
      namedRuntimeTruth: 'NOT_INFERRED',
      commercialTruth: 'NOT_INFERRED',
      lifeOutcomeTruth: 'NOT_INFERRED',
      asiTruth: 'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED'
    },
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}
