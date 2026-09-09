import crypto from 'node:crypto';

export const EXECUTION_LEAF_GRAPH_VERSION = 'uberbond.execution-leaf-graph.v1';

export const REQUIREMENT_DISPOSITIONS = Object.freeze([
  'OWNED_INTERNAL',
  'OWNED_EXTERNAL',
  'OWNED_ELAPSED',
  'OPEN_ENDED_FRONTIER',
  'SUPERSEDED_WITH_PROOF'
]);

export const EXECUTION_LEAF_KINDS = Object.freeze([
  'IMPLEMENTATION',
  'VERIFICATION',
  'BOUNDARY',
  'INTEGRATION',
  'RUNTIME',
  'RECOVERY'
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

const SHA = /^[0-9a-f]{40}$/;
const text = (value, max = 1000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};
const unique = values => [...new Set((Array.isArray(values) ? values : []).map(value => text(value, 500)).filter(Boolean))];
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = (reasonCodes, extra = {}) => ({
  ok: false,
  version: EXECUTION_LEAF_GRAPH_VERSION,
  status: 'EXECUTION_LEAF_GRAPH_REFUSED',
  reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE',
  externalEffectLedger: { ...ZERO_EFFECTS },
  ...extra
});

function normalizeRequirement(raw = {}) {
  return {
    id: text(raw.id, 240),
    canonicalSource: text(raw.canonicalSource, 800),
    disposition: REQUIREMENT_DISPOSITIONS.includes(raw.disposition) ? raw.disposition : null,
    executionLeafIds: unique(raw.executionLeafIds),
    terminalEvidenceClass: text(raw.terminalEvidenceClass, 240),
    statusEvidenceRef: text(raw.statusEvidenceRef, 800),
    note: text(raw.note, 1000)
  };
}

function normalizeLeaf(raw = {}) {
  return {
    leafId: text(raw.leafId, 240),
    kind: EXECUTION_LEAF_KINDS.includes(raw.kind) ? raw.kind : null,
    requirementIds: unique(raw.requirementIds),
    exactScope: unique(raw.exactScope),
    predecessors: unique(raw.predecessors),
    verifierLeafIds: unique(raw.verifierLeafIds),
    parallelConflictSet: unique(raw.parallelConflictSet),
    inputEvidence: unique(raw.inputEvidence),
    implementationAcceptance: text(raw.implementationAcceptance, 2000),
    hostileFalsifiers: unique(raw.hostileFalsifiers),
    mutationRequirement: text(raw.mutationRequirement, 1000),
    persistenceRequirement: text(raw.persistenceRequirement, 1000),
    restartRecoveryRequirement: text(raw.restartRecoveryRequirement, 1000),
    runtimeRequirement: text(raw.runtimeRequirement, 1000),
    externalEvidenceRequirement: text(raw.externalEvidenceRequirement, 1000),
    authorityRequired: unique(raw.authorityRequired),
    authorityExplicitlyNotGranted: unique(raw.authorityExplicitlyNotGranted),
    verifierIndependence: text(raw.verifierIndependence, 1000),
    rollback: text(raw.rollback, 1000),
    claimExpiry: text(raw.claimExpiry, 160),
    alternateRoutes: unique(raw.alternateRoutes),
    blockerFingerprint: text(raw.blockerFingerprint, 1000),
    terminalEvidenceClass: text(raw.terminalEvidenceClass, 240),
    executorClass: text(raw.executorClass, 240)
  };
}

function topologicalAnalysis(leaves) {
  const byId = new Map(leaves.map(leaf => [leaf.leafId, leaf]));
  const indegree = new Map(leaves.map(leaf => [leaf.leafId, 0]));
  const children = new Map(leaves.map(leaf => [leaf.leafId, []]));
  for (const leaf of leaves) {
    for (const predecessor of leaf.predecessors) {
      if (!byId.has(predecessor)) continue;
      indegree.set(leaf.leafId, (indegree.get(leaf.leafId) || 0) + 1);
      children.get(predecessor).push(leaf.leafId);
    }
  }

  const waves = [];
  let frontier = [...indegree.entries()].filter(([, degree]) => degree === 0).map(([id]) => id).sort();
  const visited = [];
  while (frontier.length) {
    waves.push(frontier);
    const next = [];
    for (const id of frontier) {
      visited.push(id);
      for (const child of children.get(id) || []) {
        indegree.set(child, indegree.get(child) - 1);
        if (indegree.get(child) === 0) next.push(child);
      }
    }
    frontier = [...new Set(next)].sort();
  }
  const cycleLeafIds = leaves.map(leaf => leaf.leafId).filter(id => !visited.includes(id)).sort();

  const distance = new Map();
  const parent = new Map();
  for (const wave of waves) {
    for (const id of wave) {
      const leaf = byId.get(id);
      let bestDistance = 1;
      let bestParent = null;
      for (const predecessor of leaf.predecessors) {
        const candidate = (distance.get(predecessor) || 0) + 1;
        if (candidate > bestDistance) {
          bestDistance = candidate;
          bestParent = predecessor;
        }
      }
      distance.set(id, bestDistance);
      parent.set(id, bestParent);
    }
  }
  let end = null;
  let maxDistance = 0;
  for (const [id, value] of distance) {
    if (value > maxDistance) { maxDistance = value; end = id; }
  }
  const criticalPath = [];
  while (end) {
    criticalPath.unshift(end);
    end = parent.get(end) || null;
  }

  return { waves, cycleLeafIds, criticalPath, dependencyDepth: maxDistance };
}

function conflictFreeBounds(wave, byId) {
  const ordered = [...wave].sort();
  const witness = [];
  for (const id of ordered) {
    const conflicts = new Set(byId.get(id)?.parallelConflictSet || []);
    if (witness.some(existing => conflicts.has(existing))) continue;
    witness.push(id);
  }

  // Any matching of conflict edges is a lower bound on minimum vertex cover,
  // therefore n - |matching| is a sound upper bound on the maximum independent
  // set. A greedy matching may be loose, but it can never overclaim safety.
  const matched = new Set();
  const matching = [];
  for (const id of ordered) {
    if (matched.has(id)) continue;
    const peer = [...(byId.get(id)?.parallelConflictSet || [])]
      .filter(other => ordered.includes(other) && !matched.has(other))
      .sort()[0];
    if (!peer) continue;
    matched.add(id);
    matched.add(peer);
    matching.push([id, peer]);
  }
  const lowerBound = witness.length;
  const upperBound = ordered.length - matching.length;
  return {
    lowerBound,
    upperBound,
    exact: lowerBound === upperBound,
    width: lowerBound === upperBound ? lowerBound : null,
    witness,
    matchingUpperBoundWitness: matching
  };
}

export function compileExecutionLeafGraph({ sourceCommit, requirements = [], leaves = [] } = {}) {
  const head = String(sourceCommit ?? '').trim().toLowerCase();
  if (!SHA.test(head)) return fail(['valid-source-commit-required']);

  const normalizedRequirements = (Array.isArray(requirements) ? requirements : []).map(normalizeRequirement);
  const normalizedLeaves = (Array.isArray(leaves) ? leaves : []).map(normalizeLeaf);
  const reasons = [];

  if (!normalizedRequirements.length) reasons.push('at-least-one-requirement-required');
  if (!normalizedLeaves.length) reasons.push('at-least-one-execution-leaf-required');

  const requirementIds = normalizedRequirements.map(row => row.id).filter(Boolean);
  const leafIds = normalizedLeaves.map(row => row.leafId).filter(Boolean);
  if (requirementIds.length !== normalizedRequirements.length) reasons.push('every-requirement-needs-id');
  if (leafIds.length !== normalizedLeaves.length) reasons.push('every-leaf-needs-id');
  if (new Set(requirementIds).size !== requirementIds.length) reasons.push('requirement-ids-must-be-unique');
  if (new Set(leafIds).size !== leafIds.length) reasons.push('leaf-ids-must-be-unique');

  const requirementById = new Map(normalizedRequirements.map(row => [row.id, row]));
  const leafById = new Map(normalizedLeaves.map(row => [row.leafId, row]));

  for (const requirement of normalizedRequirements) {
    if (!requirement.canonicalSource) reasons.push(`canonical-source-required:${requirement.id || 'unknown'}`);
    if (!requirement.disposition) reasons.push(`recognized-requirement-disposition-required:${requirement.id || 'unknown'}`);
    if (!requirement.terminalEvidenceClass) reasons.push(`terminal-evidence-class-required:${requirement.id || 'unknown'}`);
    if (!requirement.executionLeafIds.length) reasons.push(`orphan-requirement:${requirement.id || 'unknown'}`);
    for (const leafId of requirement.executionLeafIds) {
      if (!leafById.has(leafId)) reasons.push(`requirement-references-missing-leaf:${requirement.id}->${leafId}`);
    }
    if (requirement.disposition === 'SUPERSEDED_WITH_PROOF' && !requirement.statusEvidenceRef) reasons.push(`supersession-proof-required:${requirement.id}`);
  }

  for (const leaf of normalizedLeaves) {
    if (!leaf.kind) reasons.push(`recognized-leaf-kind-required:${leaf.leafId || 'unknown'}`);
    if (!leaf.requirementIds.length) reasons.push(`floating-execution-leaf:${leaf.leafId || 'unknown'}`);
    for (const requirementId of leaf.requirementIds) {
      if (!requirementById.has(requirementId)) reasons.push(`leaf-references-unknown-requirement:${leaf.leafId}->${requirementId}`);
      else if (!requirementById.get(requirementId).executionLeafIds.includes(leaf.leafId)) reasons.push(`requirement-leaf-binding-not-reciprocal:${requirementId}<->${leaf.leafId}`);
    }
    if (!leaf.exactScope.length) reasons.push(`exact-scope-required:${leaf.leafId || 'unknown'}`);
    if (!leaf.implementationAcceptance) reasons.push(`implementation-acceptance-required:${leaf.leafId || 'unknown'}`);
    if (!leaf.terminalEvidenceClass) reasons.push(`leaf-terminal-evidence-class-required:${leaf.leafId || 'unknown'}`);
    if (!leaf.rollback) reasons.push(`rollback-required:${leaf.leafId || 'unknown'}`);
    if (!leaf.verifierIndependence) reasons.push(`verifier-independence-contract-required:${leaf.leafId || 'unknown'}`);
    if (!leaf.alternateRoutes.length) reasons.push(`alternate-route-required:${leaf.leafId || 'unknown'}`);
    for (const predecessor of leaf.predecessors) {
      if (predecessor === leaf.leafId) reasons.push(`leaf-cannot-depend-on-itself:${leaf.leafId}`);
      else if (!leafById.has(predecessor)) reasons.push(`missing-predecessor:${leaf.leafId}->${predecessor}`);
    }
    for (const conflict of leaf.parallelConflictSet) {
      if (conflict === leaf.leafId) reasons.push(`leaf-cannot-conflict-with-itself:${leaf.leafId}`);
      else if (!leafById.has(conflict)) reasons.push(`unknown-parallel-conflict:${leaf.leafId}->${conflict}`);
    }
    for (const verifierId of leaf.verifierLeafIds) {
      const verifier = leafById.get(verifierId);
      if (!verifier) reasons.push(`missing-verifier-leaf:${leaf.leafId}->${verifierId}`);
      else if (verifier.kind !== 'VERIFICATION') reasons.push(`verifier-leaf-must-have-verification-kind:${leaf.leafId}->${verifierId}`);
      else if (!verifier.predecessors.includes(leaf.leafId)) reasons.push(`verifier-must-depend-on-subject-leaf:${verifierId}->${leaf.leafId}`);
    }
    if (['IMPLEMENTATION', 'INTEGRATION', 'RUNTIME', 'RECOVERY'].includes(leaf.kind) && !leaf.verifierLeafIds.length) {
      reasons.push(`independent-verifier-leaf-required:${leaf.leafId}`);
    }
  }

  for (const leaf of normalizedLeaves) {
    for (const conflict of leaf.parallelConflictSet) {
      const other = leafById.get(conflict);
      if (other && !other.parallelConflictSet.includes(leaf.leafId)) reasons.push(`parallel-conflict-must-be-symmetric:${leaf.leafId}<->${conflict}`);
    }
  }

  const graph = topologicalAnalysis(normalizedLeaves);
  if (graph.cycleLeafIds.length) reasons.push('execution-leaf-dependency-cycle');

  const orphanRequirements = normalizedRequirements.filter(row => row.executionLeafIds.length === 0).map(row => row.id);
  const floatingLeaves = normalizedLeaves.filter(row => row.requirementIds.length === 0).map(row => row.leafId);
  const byId = new Map(normalizedLeaves.map(row => [row.leafId, row]));
  const waveCapacity = graph.waves.map(wave => conflictFreeBounds(wave, byId));
  const safeParallelWidthLowerBound = waveCapacity.reduce((max, row) => Math.max(max, row.lowerBound), 0);
  const safeParallelWidthUpperBound = waveCapacity.reduce((max, row) => Math.max(max, row.upperBound), 0);
  const safeParallelWidthProvenExact = safeParallelWidthLowerBound === safeParallelWidthUpperBound;
  const maxSafeParallelWidth = safeParallelWidthProvenExact ? safeParallelWidthLowerBound : null;
  const widestWitness = waveCapacity.find(row => row.lowerBound === safeParallelWidthLowerBound)?.witness || [];

  if (reasons.length) {
    return fail(reasons, {
      sourceCommit: head,
      orphanRequirements,
      floatingLeaves,
      cycleLeafIds: graph.cycleLeafIds
    });
  }

  const parallelismProof = {
    lowerBound: safeParallelWidthLowerBound,
    upperBound: safeParallelWidthUpperBound,
    provenExact: safeParallelWidthProvenExact,
    conflictFreeWitness: widestWitness,
    method: 'GREEDY_INDEPENDENT_SET_LOWER_BOUND_PLUS_CONFLICT_MATCHING_UPPER_BOUND',
    truthBoundary: safeParallelWidthProvenExact
      ? 'LOWER_AND_UPPER_BOUNDS_MATCH; MAXIMUM_SAFE_PARALLEL_WIDTH_IS_PROVEN_FOR_THIS_GRAPH.'
      : 'MAXIMUM_SAFE_PARALLEL_WIDTH_IS_NOT_ESTABLISHED; ONLY_THE_REPORTED_LOWER_AND_UPPER_BOUNDS_ARE_PROVEN.'
  };

  const stable = {
    sourceCommit: head,
    requirements: normalizedRequirements,
    leaves: normalizedLeaves,
    topologicalWaves: graph.waves,
    criticalPath: graph.criticalPath,
    parallelismProof
  };

  return {
    ok: true,
    version: EXECUTION_LEAF_GRAPH_VERSION,
    status: 'ZERO_ORPHAN_EXECUTION_LEAF_GRAPH_COMPILED',
    sourceCommit: head,
    counts: {
      requirements: normalizedRequirements.length,
      leaves: normalizedLeaves.length,
      dependencyEdges: normalizedLeaves.reduce((sum, leaf) => sum + leaf.predecessors.length, 0),
      orphanRequirements: 0,
      floatingLeaves: 0,
      dependencyCycles: 0
    },
    criticalPath: graph.criticalPath,
    dependencyDepth: graph.dependencyDepth,
    topologicalWaves: graph.waves,
    maxSafeParallelWidth,
    safeParallelWidthLowerBound,
    safeParallelWidthUpperBound,
    safeParallelWidthProvenExact,
    waveCapacity,
    parallelismProof,
    requirements: normalizedRequirements,
    leaves: normalizedLeaves,
    graphDigest: digest(stable),
    truthBoundary: 'ZERO_ORPHAN_MEANS_EVERY_DECLARED_REQUIREMENT_HAS_AN_EXPLICIT_OWNER_LEAF_AND_EVERY_LEAF_MAPS_BACK_TO_CANON. IT_DOES_NOT_MEAN_THE_LEAVES_ARE_IMPLEMENTED_EXECUTED_VERIFIED_DEPLOYED_OR_EXTERNALLY_PROVEN; PARALLELISM_IS_ONLY_CALLED_MAXIMUM_WHEN_AN_INDEPENDENT_LOWER_BOUND_MEETS_A_SOUND_UPPER_BOUND.',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

export function requirementsFromCoverageRows(rows = [], ownership = {}) {
  return (Array.isArray(rows) ? rows : []).map(row => {
    const id = text(row?.canonicalId || row?.id, 240);
    const owner = ownership?.[id] || {};
    return normalizeRequirement({
      id,
      canonicalSource: row?.sourceRef || row?.source || row?.sourceFile || 'SOVEREIGN_COVERAGE_MATRIX',
      disposition: owner.disposition,
      executionLeafIds: owner.executionLeafIds,
      terminalEvidenceClass: owner.terminalEvidenceClass,
      statusEvidenceRef: owner.statusEvidenceRef,
      note: owner.note
    });
  });
}
