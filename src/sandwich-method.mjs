import crypto from 'node:crypto';

export const SANDWICH_METHOD_VERSION = 'uberbond.sandwich-method.v1.0.0';

export const SANDWICH_NODE_STATES = Object.freeze([
  'VERIFIED_CURRENT',
  'PARTIAL_CURRENT',
  'MISSING',
  'UNKNOWN'
]);

export const SANDWICH_FOLD_CLASSES = Object.freeze([
  'INTERNAL_SOURCE',
  'INTERNAL_RESEARCH',
  'FOUNDER_CHOICE',
  'OWNED_PHYSICAL_HOST',
  'EXTERNAL_PROVIDER',
  'EXTERNAL_COMMERCIAL',
  'ELAPSED_REALITY',
  'UNKNOWN'
]);

export const SANDWICH_TARGET_AUTHORITIES = Object.freeze([
  'CANONICAL_REPOSITORY',
  'FOUNDER_AUTHORIZED_PRIVATE',
  'HYPOTHETICAL_ONLY'
]);

export const SANDWICH_FOLD_OUTCOMES = Object.freeze([
  'VERIFIED',
  'MORE_STRUCTURE_DISCOVERED',
  'BLOCKED_EXTERNAL',
  'TARGET_INVALIDATED',
  'FAILED'
]);

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

const text = (value, max = 2000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};
const unit = value => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
};
const positive = value => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const cleanList = (value, max = 512, itemMax = 500) => {
  if (!Array.isArray(value) || value.length > max) return null;
  const seen = new Set();
  const out = [];
  for (const raw of value) {
    const item = text(raw, itemMax);
    if (!item) return null;
    if (!seen.has(item)) { seen.add(item); out.push(item); }
  }
  return out;
};
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = (status, reasonCodes, extra = {}) => ({
  ok: false,
  status,
  version: SANDWICH_METHOD_VERSION,
  reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE',
  externalEffectLedger: { ...ZERO_EFFECTS },
  ...extra
});

function normalizeNode(raw) {
  const id = text(raw?.id, 200)?.toLowerCase();
  const label = text(raw?.label, 800);
  const state = text(raw?.state, 40);
  const foldClass = text(raw?.foldClass, 80);
  const requires = cleanList(raw?.requires || [], 512, 200)?.map(v => v.toLowerCase());
  const evidenceRefs = cleanList(raw?.evidenceRefs || [], 512, 1000);
  const executionRequirementIds = cleanList(raw?.executionRequirementIds || [], 512, 240);
  const leverage = positive(raw?.leverage ?? 1);
  const effort = positive(raw?.effort ?? 1);
  const uncertainty = unit(raw?.uncertainty ?? (state === 'UNKNOWN' ? 1 : 0.5));
  if (!id || !label || !SANDWICH_NODE_STATES.includes(state) || !SANDWICH_FOLD_CLASSES.includes(foldClass)
    || !requires || !evidenceRefs || !executionRequirementIds || leverage === null || effort === null || uncertainty === null) return null;
  if (state === 'VERIFIED_CURRENT' && evidenceRefs.length === 0) return null;
  return { id, label, state, foldClass, requires, evidenceRefs, executionRequirementIds, leverage, effort, uncertainty };
}

function detectCycle(nodes) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const visiting = new Set();
  const visited = new Set();
  const walk = id => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dep of byId.get(id)?.requires || []) if (walk(dep)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return nodes.some(node => walk(node.id));
}

function descendants(nodes) {
  const reverse = new Map(nodes.map(node => [node.id, []]));
  for (const node of nodes) for (const dep of node.requires) reverse.get(dep).push(node.id);
  const result = new Map();
  for (const node of nodes) {
    const seen = new Set();
    const stack = [...reverse.get(node.id)];
    while (stack.length) {
      const id = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      stack.push(...(reverse.get(id) || []));
    }
    result.set(node.id, seen.size);
  }
  return result;
}

function normalizeTarget(target = {}) {
  const targetId = text(target.targetId, 200)?.toLowerCase();
  const targetRevision = text(target.targetRevision, 120);
  const statement = text(target.statement, 4000);
  const authority = text(target.authority, 80);
  const invariants = cleanList(target.invariants || [], 256, 1000);
  const nodesRaw = Array.isArray(target.nodes) ? target.nodes : null;
  if (!targetId || !targetRevision || !statement || !SANDWICH_TARGET_AUTHORITIES.includes(authority) || !invariants || !nodesRaw || nodesRaw.length < 1 || nodesRaw.length > 10_000) {
    return { ok: false, reasonCodes: ['valid-bounded-descendant-target-required'] };
  }
  const nodes = nodesRaw.map(normalizeNode);
  if (nodes.some(node => !node)) return { ok: false, reasonCodes: ['valid-gap-nodes-required'] };
  const ids = new Set();
  for (const node of nodes) {
    if (ids.has(node.id)) return { ok: false, reasonCodes: ['unique-gap-node-ids-required'], nodeId: node.id };
    ids.add(node.id);
  }
  for (const node of nodes) {
    const missing = node.requires.filter(dep => !ids.has(dep));
    if (missing.length) return { ok: false, reasonCodes: ['dependency-reference-missing'], nodeId: node.id, missing };
    if (node.requires.includes(node.id)) return { ok: false, reasonCodes: ['self-dependency-refused'], nodeId: node.id };
  }
  if (detectCycle(nodes)) return { ok: false, reasonCodes: ['dependency-cycle-refused'] };
  const core = { targetId, targetRevision, statement, authority, invariants, nodes };
  return { ok: true, target: { ...core, targetDigest: digest(core) } };
}

function foldClassWeight(foldClass) {
  if (foldClass === 'INTERNAL_SOURCE') return 1;
  if (foldClass === 'INTERNAL_RESEARCH') return 0.95;
  if (foldClass === 'FOUNDER_CHOICE') return 0.08;
  if (foldClass === 'OWNED_PHYSICAL_HOST') return 0.07;
  if (foldClass === 'EXTERNAL_PROVIDER') return 0.05;
  if (foldClass === 'EXTERNAL_COMMERCIAL') return 0.04;
  if (foldClass === 'ELAPSED_REALITY') return 0.02;
  return 0.01;
}

function stateWeight(state) {
  if (state === 'MISSING') return 1;
  if (state === 'PARTIAL_CURRENT') return 0.85;
  if (state === 'UNKNOWN') return 0.72;
  return 0;
}

export function compileSandwichMethod({ currentSourceCommit = null, target = null } = {}) {
  const sourceCommit = text(currentSourceCommit, 80)?.toLowerCase();
  if (!sourceCommit || !/^[0-9a-f]{40}$/.test(sourceCommit)) return fail('SANDWICH_METHOD_REFUSED', ['valid-exact-current-source-commit-required']);
  const normalized = normalizeTarget(target);
  if (!normalized.ok) return fail('SANDWICH_METHOD_REFUSED', normalized.reasonCodes, normalized.nodeId ? { nodeId: normalized.nodeId, missing: normalized.missing } : {});

  const t = normalized.target;
  const byId = new Map(t.nodes.map(node => [node.id, node]));
  const downstream = descendants(t.nodes);
  const verified = node => node.state === 'VERIFIED_CURRENT';
  const gaps = t.nodes.filter(node => !verified(node));
  const frontier = gaps.filter(node => node.requires.every(dep => verified(byId.get(dep))));

  const ranked = frontier.map(node => {
    const descendantCount = downstream.get(node.id) || 0;
    const epistemic = node.state === 'UNKNOWN' ? 0.72 + 0.28 * node.uncertainty : 1 - 0.25 * node.uncertainty;
    const score = ((node.leverage + descendantCount * 2) * stateWeight(node.state) * foldClassWeight(node.foldClass) * epistemic) / Math.sqrt(node.effort);
    return { ...node, descendantsUnlocked: descendantCount, foldPriority: Number(score.toFixed(8)) };
  }).sort((a, b) => b.foldPriority - a.foldPriority || a.id.localeCompare(b.id));

  const canAuthorizeInternalFold = t.authority !== 'HYPOTHETICAL_ONLY';
  const internalFrontier = ranked.filter(node => ['INTERNAL_SOURCE', 'INTERNAL_RESEARCH'].includes(node.foldClass));
  const nextFold = canAuthorizeInternalFold ? (internalFrontier[0] || null) : null;
  const blockedFrontier = ranked.filter(node => !['INTERNAL_SOURCE', 'INTERNAL_RESEARCH'].includes(node.foldClass));
  const unresolvedDependencies = gaps.filter(node => !frontier.some(item => item.id === node.id)).map(node => ({
    id: node.id,
    waitingOn: node.requires.filter(dep => !verified(byId.get(dep)))
  }));

  const knownWeight = t.nodes.reduce((sum, node) => sum + node.leverage, 0);
  const verifiedWeight = t.nodes.filter(verified).reduce((sum, node) => sum + node.leverage, 0);
  const declaredTargetCoverage = knownWeight > 0 ? Number((verifiedWeight / knownWeight).toFixed(6)) : 0;

  const core = {
    sourceCommit,
    targetDigest: t.targetDigest,
    targetRevision: t.targetRevision,
    verifiedIds: t.nodes.filter(verified).map(node => node.id).sort(),
    gapIds: gaps.map(node => node.id).sort(),
    nextFoldId: nextFold?.id || null
  };

  return {
    ok: true,
    status: nextFold ? 'SANDWICH_FOLD_READY' : gaps.length === 0 ? 'SANDWICH_DECLARED_TARGET_SATISFIED' : t.authority === 'HYPOTHETICAL_ONLY' ? 'SANDWICH_PROPOSAL_ONLY' : 'SANDWICH_WAITING_ON_NONINTERNAL_OR_DEPENDENCY_FRONTIER',
    version: SANDWICH_METHOD_VERSION,
    currentSourceCommit: sourceCommit,
    sandwichDigest: digest(core),
    lowerSlice: {
      meaning: 'EXACT_CURRENT_VERIFIED_SURFACE',
      verifiedNodes: t.nodes.filter(verified).map(node => ({ id: node.id, label: node.label, evidenceRefs: node.evidenceRefs }))
    },
    upperSlice: {
      meaning: 'STRONGER_DESCENDANT_TARGET',
      targetId: t.targetId,
      targetRevision: t.targetRevision,
      targetDigest: t.targetDigest,
      statement: t.statement,
      authority: t.authority,
      invariants: t.invariants,
      authorityBoundary: t.authority === 'HYPOTHETICAL_ONLY'
        ? 'HYPOTHESIZED_DESCENDANTS_MAY_EXPAND_SEARCH_SPACE_BUT_CANNOT_AUTHORIZE_IMPLEMENTATION'
        : 'TARGET_AUTHORITY_DOES_NOT_EXPAND_THE_AUTHORITY_OF_ANY_FOLD'
    },
    filling: {
      meaning: 'NEGATIVE_IMAGE_BETWEEN_CURRENT_AND_STRONGER_DESCENDANT',
      gapCount: gaps.length,
      gaps: gaps.map(node => ({ id: node.id, label: node.label, state: node.state, foldClass: node.foldClass, requires: node.requires, uncertainty: node.uncertainty })),
      unresolvedDependencies
    },
    foldFrontier: ranked,
    nextFold,
    blockedFrontier,
    declaredFiniteTargetCoverage: declaredTargetCoverage,
    coverageBoundary: 'DECLARED_FINITE_TARGET_COVERAGE_IS_NOT_GLOBAL_UBERBOND_COMPLETENESS_AND_MAY_FALL_WHEN_A_STRONGER_DESCENDANT_MODEL_REVEALS_NEW_STRUCTURE',
    foldingLaw: 'CURRENT_STATE__MODEL_STRONGER_DESCENDANT__COMPUTE_NEGATIVE_IMAGE__SELECT_HIGHEST_LEVERAGE_DEPENDENCY_SATISFIED_AUTHORIZED_INTERNAL_FOLD__VERIFY_INDEPENDENTLY__PROMOTE__RECOMPUTE_DESCENDANT__REPEAT',
    progressLaw: 'A_CYCLE_COUNTS_AS_PROGRESS_ONLY_IF_IT_CLOSES_A_GAP_WITH_INDEPENDENT_EVIDENCE__REVEALS_PREVIOUSLY_MISSING_STRUCTURE__INVALIDATES_A_BAD_TARGET__OR_PROVES_A_REAL_EXTERNAL_BLOCKER',
    sovereigntyLaw: 'A_STRONGER_DESCENDANT_HYPOTHESIS_CANNOT_CREATE_NEW_FOUNDER_GOALS_PERMISSIONS_SPEND_MESSAGING_DEPLOYMENT_CUSTOMER_OR_PHYSICAL_AUTHORITY',
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS },
    claimBoundary: 'THE_SANDWICH_METHOD_IS_A_SELF_COMPLETION_PLANNING_AND_EVIDENCE_PROTOCOL__NOT_PROOF_OF_ASI_GLOBAL_COMPLETENESS_OR_REAL_WORLD_EFFECT'
  };
}

export function buildSandwichFoldMission({ sandwich = null } = {}) {
  if (!sandwich?.ok || sandwich.status !== 'SANDWICH_FOLD_READY' || !sandwich.nextFold) {
    return fail('SANDWICH_FOLD_MISSION_REFUSED', ['ready-sandwich-fold-required']);
  }
  const node = sandwich.nextFold;
  return {
    ok: true,
    status: 'SANDWICH_FOLD_MISSION_READY',
    version: SANDWICH_METHOD_VERSION,
    mission: {
      sourceCommit: sandwich.currentSourceCommit,
      sandwichDigest: sandwich.sandwichDigest,
      targetDigest: sandwich.upperSlice.targetDigest,
      targetRevision: sandwich.upperSlice.targetRevision,
      gapId: node.id,
      objective: node.label,
      foldClass: node.foldClass,
      executionRequirementIds: node.executionRequirementIds,
      requiredEvidence: [
        'INDEPENDENT_VERIFIER_RESULT',
        'EVIDENCE_REFS_BOUND_TO_EXACT_FOLD',
        'NO_AUTHORITY_EXPANSION',
        'RECOMPUTE_FROM_NEW_EXACT_CURRENT_STATE_AFTER_PROMOTION'
      ],
      allowedOutcomes: SANDWICH_FOLD_OUTCOMES,
      prohibitedShortcuts: [
        'SELF_ATTESTED_COMPLETION',
        'COUNTING_CODE_EXISTENCE_AS_RUNTIME_PROOF',
        'COUNTING_SIMULATION_AS_PHYSICAL_OR_LIFE_OUTCOME_PROOF',
        'SILENT_TARGET_OR_FOUNDER_GOAL_MUTATION',
        'CLOSING_EXTERNAL_OR_ELAPSED_REALITY_GAPS_FROM_SOURCE_ONLY',
        'RETRYING_THE_SAME_FAILED_STRATEGY_WITHOUT_NEW_EVIDENCE_OR_MECHANISM'
      ]
    },
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

export function buildCanonicalLeafHandoff({ sandwich = null, executionGraph = null } = {}) {
  if (!sandwich?.ok || sandwich.status !== 'SANDWICH_FOLD_READY' || !sandwich.nextFold) {
    return fail('SANDWICH_CANONICAL_LEAF_HANDOFF_REFUSED', ['ready-sandwich-fold-required']);
  }
  if (!executionGraph?.ok || !Array.isArray(executionGraph?.leaves) || executionGraph.sourceCommit !== sandwich.currentSourceCommit) {
    return fail('SANDWICH_CANONICAL_LEAF_HANDOFF_REFUSED', ['exact-current-canonical-execution-graph-required']);
  }
  const wanted = new Set(sandwich.nextFold.executionRequirementIds || []);
  if (wanted.size === 0) return fail('SANDWICH_CANONICAL_LEAF_HANDOFF_REFUSED', ['execution-requirement-mapping-required']);
  const matching = executionGraph.leaves.filter(leaf => (leaf.requirementIds || []).some(id => wanted.has(id))).map(leaf => leaf.leafId).filter(Boolean).sort();
  if (matching.length === 0) return fail('SANDWICH_CANONICAL_LEAF_HANDOFF_REFUSED', ['mapped-requirement-not-found-in-canonical-execution-graph']);
  return {
    ok: true,
    status: 'SANDWICH_CANONICAL_LEAF_HANDOFF_READY',
    sourceCommit: sandwich.currentSourceCommit,
    sandwichDigest: sandwich.sandwichDigest,
    gapId: sandwich.nextFold.id,
    candidateLeafIds: matching,
    handoffBoundary: 'THIS_ONLY_MAPS_THE_FOLD_TO_CANONICAL_LEAVES__EXISTING_EXECUTION_LEAF_CONTINUATION_AND_INDEPENDENT_VERIFIER_RETAIN_EXECUTION_AND_PROMOTION_AUTHORITY',
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

export function admitSandwichFoldResult({ sandwich = null, result = null } = {}) {
  if (!sandwich?.ok || sandwich.status !== 'SANDWICH_FOLD_READY' || !sandwich.nextFold) {
    return fail('SANDWICH_FOLD_RESULT_REFUSED', ['ready-sandwich-fold-required']);
  }
  const outcome = text(result?.outcome, 80);
  const gapId = text(result?.gapId, 200)?.toLowerCase();
  const evidenceRefs = cleanList(result?.evidenceRefs || [], 512, 1000);
  const independent = result?.independentlyVerified === true;
  if (!SANDWICH_FOLD_OUTCOMES.includes(outcome) || gapId !== sandwich.nextFold.id || !evidenceRefs) {
    return fail('SANDWICH_FOLD_RESULT_REFUSED', ['result-must-bind-selected-fold-and-known-outcome']);
  }
  if (['VERIFIED', 'MORE_STRUCTURE_DISCOVERED', 'BLOCKED_EXTERNAL', 'TARGET_INVALIDATED'].includes(outcome) && (!independent || evidenceRefs.length === 0)) {
    return fail('SANDWICH_FOLD_RESULT_REFUSED', ['independent-evidence-required-for-progress-claim']);
  }
  if (outcome === 'BLOCKED_EXTERNAL' && ['INTERNAL_SOURCE', 'INTERNAL_RESEARCH'].includes(sandwich.nextFold.foldClass) && !text(result?.blockerClass, 80)) {
    return fail('SANDWICH_FOLD_RESULT_REFUSED', ['explicit-external-blocker-class-required']);
  }
  return {
    ok: true,
    status: 'SANDWICH_FOLD_RESULT_ADMITTED',
    gapId,
    outcome,
    progressCounted: ['VERIFIED', 'MORE_STRUCTURE_DISCOVERED', 'BLOCKED_EXTERNAL', 'TARGET_INVALIDATED'].includes(outcome),
    evidenceRefs,
    nextRequiredAction: outcome === 'VERIFIED' || outcome === 'MORE_STRUCTURE_DISCOVERED' || outcome === 'TARGET_INVALIDATED'
      ? 'RECOMPUTE_DESCENDANT_FROM_NEW_EXACT_CURRENT_STATE'
      : outcome === 'BLOCKED_EXTERNAL'
        ? 'PRESERVE_BLOCKER_AND_SELECT_ANOTHER_DEPENDENCY_SATISFIED_INTERNAL_FOLD'
        : 'CHANGE_STRATEGY_OR_GATHER_NEW_EVIDENCE_BEFORE_RETRY',
    promotionBoundary: 'THIS_ADMISSION_DOES_NOT_PROMOTE_CODE_OR_MUTATE_THE_TARGET__PROMOTION_REMAINS_WITH_EXISTING_REPOSITORY_OR_RUNTIME_AUTHORITY',
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

export function compareSandwichStates({ before = null, after = null } = {}) {
  if (!before?.ok || !after?.ok || !before?.upperSlice?.targetDigest || !after?.upperSlice?.targetDigest) {
    return fail('SANDWICH_COMPARISON_REFUSED', ['two-compiled-sandwich-states-required']);
  }
  const beforeVerified = new Set(before.lowerSlice.verifiedNodes.map(node => node.id));
  const afterVerified = new Set(after.lowerSlice.verifiedNodes.map(node => node.id));
  const beforeGaps = new Set(before.filling.gaps.map(node => node.id));
  const afterGaps = new Set(after.filling.gaps.map(node => node.id));
  const newlyVerified = [...afterVerified].filter(id => !beforeVerified.has(id)).sort();
  const newlyVisible = [...afterGaps].filter(id => !beforeGaps.has(id)).sort();
  const disappeared = [...beforeGaps].filter(id => !afterGaps.has(id)).sort();
  return {
    ok: true,
    status: 'SANDWICH_STATES_COMPARED',
    newlyVerifiedGapIds: newlyVerified,
    disappearedGapIds: disappeared,
    newlyVisibleGapIds: newlyVisible,
    targetChanged: before.upperSlice.targetDigest !== after.upperSlice.targetDigest,
    interpretation: newlyVerified.length > 0
      ? 'VERIFIED_CAPABILITY_MOVED_CURRENT_STATE_TOWARD_DECLARED_DESCENDANT'
      : newlyVisible.length > 0 || before.upperSlice.targetDigest !== after.upperSlice.targetDigest
        ? 'NEGATIVE_IMAGE_BECAME_MORE_INFORMATIVE'
        : 'NO_VERIFIED_OR_EPISTEMIC_PROGRESS_OBSERVED',
    law: 'A_LARGER_NEGATIVE_IMAGE_CAN_REPRESENT_PROGRESS_WHEN_A_STRONGER_MODEL_REVEALS_PREVIOUSLY_UNSEEN_STRUCTURE',
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}
