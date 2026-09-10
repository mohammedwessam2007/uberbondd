import { compileAgentTask } from './agent-relay.mjs';

export const SANDWICH_AUTOCATALYTIC_GOVERNOR_VERSION = 'uberbond.sandwich-autocatalytic-governor.v1';

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
const SHA40 = /^[0-9a-f]{40}$/i;
const text = (value, max = 2000) => {
  const candidate = String(value ?? '').trim();
  return candidate && candidate.length <= max ? candidate : null;
};
const exactSha = value => {
  const candidate = text(value, 80)?.toLowerCase();
  return candidate && SHA40.test(candidate) ? candidate : null;
};
const fail = (reasonCodes, status = 'SANDWICH_AUTOCATALYTIC_GOVERNOR_REFUSED', extra = {}) => ({
  ok: false,
  status,
  version: SANDWICH_AUTOCATALYTIC_GOVERNOR_VERSION,
  reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE',
  externalEffectLedger: { ...ZERO_EFFECTS },
  ...extra
});

export function compileSandwichAutocatalyticDirective({ baseRevision = null, finiteDirective = null } = {}) {
  const base = exactSha(baseRevision);
  if (!base) return fail(['exact-main-base-revision-required']);
  if (!finiteDirective?.ok
    || finiteDirective?.status !== 'FINITE_ENGINEERING_ALREADY_CLOSED'
    || finiteDirective?.taskRequired !== false
    || exactSha(finiteDirective?.baseRevision) !== base) {
    return fail(['exact-base-finite-engineering-closure-required'], 'FINITE_COMPLETION_RETAINS_PRIORITY', { baseRevision: base });
  }

  return {
    ok: true,
    status: 'DESCENDANT_REQUIREMENT_GENESIS_READY',
    version: SANDWICH_AUTOCATALYTIC_GOVERNOR_VERSION,
    baseRevision: base,
    taskRequired: true,
    mode: 'ONE_NEW_FINITE_REQUIREMENT_ONLY',
    nextTransition: 'DISCOVER_ONE_STRONGER_DESCENDANT_GAP__CHALLENGE_ITS_TIMELINE_TOPOLOGY__ADMIT_AS_FINITE_REQUIREMENT__RETURN_CONTROL_TO_EXISTING_FINITE_COMPLETION_ENGINE',
    paceLaw: 'NO_IDLE_WAIT_AFTER_VERIFIED_FINITE_CLOSURE__EVERY_NEW_MAIN_RECOMPUTES_TRUTH_AND_EITHER_FOLDS_ONE_INTERNAL_GAP_OR_STOPS_AT_A_REAL_BOUNDARY',
    timelineLaw: 'DO_NOT_MERELY_OPTIMIZE_A_LONG_ROUTE__FIRST_TEST_WHETHER_DEPENDENCIES_STEPS_OR_BOUNDARY_CONDITIONS_CAN_BE_DELETED_SUBSTITUTED_PARALLELIZED_PRECOMPUTED_OR_REPRESENTED_DIFFERENTLY',
    sovereigntyBoundary: 'THE_GOVERNOR_MAY_DERIVE_INTERNAL_ENGINEERING_REQUIREMENTS_FROM_EXISTING_CANONICAL_GOALS_BUT_MAY_NOT_CREATE_FOUNDER_GOALS_OR_EFFECT_AUTHORITY',
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

export function compileSandwichAutocatalyticTask({ directive = null, date = new Date() } = {}) {
  const base = exactSha(directive?.baseRevision);
  if (!directive?.ok || directive?.status !== 'DESCENDANT_REQUIREMENT_GENESIS_READY' || directive?.taskRequired !== true || !base) {
    return fail(['ready-post-finite-descendant-directive-required'], 'SANDWICH_AUTOCATALYTIC_TASK_REFUSED');
  }

  const objective = `On exact UberBond main ${base}, finite engineering is closed. Run one SANDWICH DESCENDANT-GENESIS pass over exact-current truth, canonical North Star, execution graph, Sandwich canon, and Timeline Topology Engine. Before admitting a gap, challenge its apparent dependency path: preserve the terminal contract; separate evidence-bound causal floors from assumptions; try deletion, substitution, representation escape, parallelization, precompute, reuse, proxy observables, changed boundary conditions, and invented intermediates; prefer a falsifiable topology change that removes the most critical-path time. Admit exactly ONE novel dependency-satisfied INTERNAL_SOURCE/INTERNAL_RESEARCH requirement implied by existing canonical goals, with source+test acceptance evidence and valid leaf mapping. Requirement genesis only: do not implement or claim it complete in this cycle. Never weaken requirements, invent founder goals, or convert physical/provider/commercial/customer/elapsed/ASI claims into source closure. If no justified internal gap exists, STOP with EXTERNAL_FRONTIER or NO_NOVEL_INTERNAL_GAP. Return one bounded AgentCodeChangeSet.`;

  const compiled = compileAgentTask({
    taskId: `uberbond_sandwich_descendant_${base.slice(0, 24)}`,
    objective,
    originAgent: 'uberbond-sandwich-autocatalytic-governor',
    targetAgent: 'claude-code',
    parentTask: `main:${base}`,
    contextRefs: [
      `main:${base}`,
      'doc:NORTH_STAR',
      'doc:SANDWICH_METHOD_CANON',
      'doc:TIMELINE_TOPOLOGY_ENGINE_CANON',
      'source:timeline-topology-engine',
      'artifact:terminal-realization',
      'artifact:canonical-execution-leaf-graph',
      'mode:post-finite-descendant-genesis'
    ],
    evidenceRefs: [
      `evidence:exact-main-${base}`,
      'audit:terminal-realization',
      'audit:canonical-execution-leaf-graph',
      'audit:no-duplicate-canonical-requirement'
    ],
    constraints: [
      `exact-base-revision:${base}`,
      'sandwich-autocatalytic-descendant-genesis',
      'timeline-topology-challenge-required-before-admission',
      'preserve-terminal-contract-during-timeline-compression',
      'evidence-bound-causal-floor-rebuttal-required-before-bypass',
      'prefer-critical-path-elimination-over-local-duration-optimization',
      'exactly-one-new-finite-requirement-maximum',
      'requirement-genesis-only-do-not-implement-same-cycle',
      'derive-only-from-existing-canonical-goals-and-invariants',
      'novelty-and-nonduplication-required',
      'dependency-satisfied-internal-source-or-research-only',
      'explicit-falsifiable-acceptance-evidence-required',
      'canonical-execution-leaf-mapping-required',
      'zero-orphan-zero-cycle-graph-required',
      'do-not-convert-external-founder-physical-commercial-or-elapsed-reality-into-source-closure',
      'do-not-remove-or-weaken-existing-requirements-or-invariants',
      'stop-instead-of-manufacturing-work-when-no-novel-internal-gap-exists',
      'one-bounded-change-set',
      'local-preparation-only',
      'business-effect-authority:none',
      'external-effect-authority:none'
    ],
    forbiddenActions: [
      'merge', 'deploy', 'send', 'spend', 'purchase', 'change-credentials', 'change-dns',
      'mutate-production', 'customer-contact', 'payment-action', 'weaken-tests', 'weaken-authority',
      'invent-founder-goal', 'change-terminal-contract-to-create-speedup',
      'claim-causal-floor-bypass-without-rebuttal-evidence', 'claim-physical-proof-from-source',
      'claim-commercial-proof-from-source', 'claim-asi', 'implement-newly-admitted-requirement-in-same-cycle'
    ],
    requiredOutputs: [
      'outcome', 'changedArtifacts', 'testsActuallyRun', 'truthTable', 'externalEffectLedger',
      'decision', 'codeChangeSet', 'descendantGap', 'newFiniteRequirementId',
      'duplicateSearchEvidence', 'acceptanceEvidenceContract', 'dependencyMapping', 'whyThisGapNow',
      'timelineTopologyAnalysis', 'criticalPathBefore', 'projectedCriticalPathAfter',
      'wormholeCandidates', 'causalFloorEvidence'
    ],
    acceptanceTests: ['npm run check:syntax', 'npm run test:deterministic'],
    budget: { maxTokens: 120_000, maxCostCents: 0 },
    economicObjective: 'maximize verified critical-path time and downstream capability unlocked per founder minute while preserving canonical truth and sovereignty',
    consequenceClass: 'LOCAL_PREPARATION',
    date
  });
  if (!compiled?.ok) return fail(compiled?.reasonCodes || ['canonical-agent-task-compilation-failed'], 'SANDWICH_AUTOCATALYTIC_TASK_REFUSED');
  return compiled.task || compiled;
}
