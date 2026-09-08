import crypto from 'node:crypto';
import { compileExecutionLeafGraph } from './execution-leaf-graph.mjs';

export const CANONICAL_EXECUTION_LEAF_GRAPH_VERSION = 'uberbond.canonical-execution-leaf-graph.v1';

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
const SHA = /^[0-9a-f]{40}$/;
const text = (value, max = 500) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = (reasonCodes, extra = {}) => ({
  ok: false,
  version: CANONICAL_EXECUTION_LEAF_GRAPH_VERSION,
  status: 'CANONICAL_EXECUTION_LEAF_GRAPH_REFUSED',
  reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE',
  externalEffectLedger: { ...ZERO_EFFECTS },
  ...extra
});

export function compileCoverageBoundExecutionLeafGraph({ coverage = {}, requirements = [], leaves = [] } = {}) {
  const reasons = [];
  const sourceCommit = String(coverage?.sourceCommit ?? '').trim().toLowerCase();
  const rows = Array.isArray(coverage?.rows) ? coverage.rows : [];

  if (coverage?.ok !== true || coverage?.status !== 'COVERAGE_MATRIX_COMPILED') reasons.push('canonical-compiled-sovereign-coverage-required');
  if (!SHA.test(sourceCommit)) reasons.push('coverage-exact-source-commit-required');
  if (!rows.length) reasons.push('coverage-row-denominator-required');
  if (Number(coverage?.counts?.rows) !== rows.length) reasons.push('coverage-declared-row-count-must-match-materialized-rows');

  const canonicalIds = rows.map(row => text(row?.canonicalId, 240));
  if (canonicalIds.some(id => !id)) reasons.push('every-coverage-row-needs-canonical-id');
  if (new Set(canonicalIds.filter(Boolean)).size !== canonicalIds.filter(Boolean).length) reasons.push('coverage-canonical-ids-must-be-unique');

  const requirementIds = (Array.isArray(requirements) ? requirements : []).map(row => text(row?.id, 240)).filter(Boolean);
  const canonicalSet = new Set(canonicalIds.filter(Boolean));
  const requirementSet = new Set(requirementIds);
  const missingRequirements = [...canonicalSet].filter(id => !requirementSet.has(id)).sort();
  const extraRequirements = [...requirementSet].filter(id => !canonicalSet.has(id)).sort();
  if (missingRequirements.length) reasons.push('canonical-requirements-missing-from-execution-graph');
  if (extraRequirements.length) reasons.push('execution-graph-contains-noncanonical-requirements');
  if (requirementIds.length !== requirementSet.size) reasons.push('execution-requirement-ids-must-be-unique');

  if (reasons.length) {
    return fail(reasons, {
      sourceCommit: SHA.test(sourceCommit) ? sourceCommit : null,
      missingRequirements,
      extraRequirements,
      canonicalRequirementCount: canonicalSet.size,
      declaredRequirementCount: requirementIds.length
    });
  }

  const graph = compileExecutionLeafGraph({ sourceCommit, requirements, leaves });
  if (!graph.ok) {
    return fail(['execution-leaf-graph-invalid', ...graph.reasonCodes], {
      sourceCommit,
      missingRequirements: [],
      extraRequirements: [],
      graphFailure: graph
    });
  }

  const canonicalBinding = {
    sourceCommit,
    canonicalRequirementIds: [...canonicalSet].sort(),
    coverageRows: rows.length,
    coverageStates: structuredClone(coverage?.counts?.byState || {}),
    graphDigest: graph.graphDigest
  };

  return {
    ...graph,
    version: CANONICAL_EXECUTION_LEAF_GRAPH_VERSION,
    status: 'ZERO_ORPHAN_CANONICAL_EXECUTION_LEAF_GRAPH_COMPILED',
    canonicalBinding,
    canonicalBindingDigest: digest(canonicalBinding),
    truthBoundary: 'ZERO_ORPHAN_IS_PROVEN_AGAINST_THE_EXACT_CANONICAL_REQUIREMENT_ID_SET_FROM_THE_BOUND_SOVEREIGN_COVERAGE_MATRIX. THIS STILL DOES_NOT PROVE_IMPLEMENTATION_EXECUTION_RUNTIME_OR_EXTERNAL_OUTCOMES.',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}
