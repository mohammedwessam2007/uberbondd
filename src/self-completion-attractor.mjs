export const SELF_COMPLETION_ATTRACTOR_VERSION = 'uberbond.self-completion-attractor-1.0.0';

export const GAP_STATES = Object.freeze([
  'VERIFIED_CURRENT',
  'PARTIAL_CURRENT',
  'MISSING',
  'UNKNOWN'
]);

export const CLOSURE_CLASSES = Object.freeze([
  'INTERNAL_SOURCE',
  'INTERNAL_RESEARCH',
  'FOUNDER_CHOICE',
  'OWNED_PHYSICAL_HOST',
  'EXTERNAL_PROVIDER',
  'EXTERNAL_COMMERCIAL',
  'ELAPSED_REALITY',
  'UNKNOWN'
]);

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false,
  status,
  reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE',
  ...extra
});

const text = (value, max = 1000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const list = (value, max = 256, itemMax = 300) => {
  if (!Array.isArray(value) || value.length > max) return null;
  const out = [];
  const seen = new Set();
  for (const raw of value) {
    const item = text(raw, itemMax)?.toLowerCase();
    if (!item) return null;
    if (!seen.has(item)) { seen.add(item); out.push(item); }
  }
  return out;
};

const unit = value => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
};

const nonnegative = value => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

function normalizeGraph(nodes) {
  if (!Array.isArray(nodes) || nodes.length < 1 || nodes.length > 10_000) return { ok: false, reasonCodes: ['bounded-nodes-required'] };
  const normalized = [];
  const ids = new Set();
  for (const raw of nodes) {
    const id = text(raw?.id, 200)?.toLowerCase();
    const label = text(raw?.label, 500);
    const state = text(raw?.state, 40);
    const closureClass = text(raw?.closureClass, 80);
    const requires = list(raw?.requires || [], 512, 200);
    const unlockWeight = nonnegative(raw?.unlockWeight ?? 1);
    const evidenceStrength = unit(raw?.evidenceStrength ?? 0);
    const effortUnits = nonnegative(raw?.effortUnits ?? 1);
    if (!id || !label || ids.has(id) || !GAP_STATES.includes(state) || !CLOSURE_CLASSES.includes(closureClass) || !requires || unlockWeight === null || evidenceStrength === null || effortUnits === null || effortUnits === 0) {
      return { ok: false, reasonCodes: ['valid-unique-gap-nodes-required'] };
    }
    ids.add(id);
    normalized.push({ id, label, state, closureClass, requires, unlockWeight, evidenceStrength, effortUnits });
  }
  for (const node of normalized) {
    const missing = node.requires.filter(id => !ids.has(id));
    if (missing.length) return { ok: false, reasonCodes: ['dependency-reference-missing'], nodeId: node.id, missing };
    if (node.requires.includes(node.id)) return { ok: false, reasonCodes: ['self-dependency-refused'], nodeId: node.id };
  }
  return { ok: true, nodes: normalized };
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
  const counts = new Map();
  for (const node of nodes) {
    const seen = new Set();
    const stack = [...reverse.get(node.id)];
    while (stack.length) {
      const id = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      stack.push(...(reverse.get(id) || []));
    }
    counts.set(node.id, seen.size);
  }
  return counts;
}

export function compileSelfCompletionAttractor({ nodes = [] } = {}) {
  const graph = normalizeGraph(nodes);
  if (!graph.ok) return fail('SELF_COMPLETION_ATTRACTOR_INVALID', graph.reasonCodes, graph.nodeId ? { nodeId: graph.nodeId, missing: graph.missing } : {});
  if (detectCycle(graph.nodes)) return fail('SELF_COMPLETION_ATTRACTOR_INVALID', ['dependency-cycle-refused']);

  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  const downstream = descendants(graph.nodes);
  const resolved = node => node.state === 'VERIFIED_CURRENT';
  const gaps = graph.nodes.filter(node => !resolved(node));
  const frontier = gaps.filter(node => node.requires.every(dep => resolved(byId.get(dep))));

  const ranked = frontier.map(node => {
    const descendantsUnlocked = downstream.get(node.id) || 0;
    const truthPenalty = node.state === 'UNKNOWN' ? 0.55 : node.state === 'PARTIAL_CURRENT' ? 0.85 : 1;
    const closability = ['INTERNAL_SOURCE', 'INTERNAL_RESEARCH'].includes(node.closureClass) ? 1
      : node.closureClass === 'FOUNDER_CHOICE' ? 0.35
        : node.closureClass === 'OWNED_PHYSICAL_HOST' ? 0.25
          : node.closureClass === 'ELAPSED_REALITY' ? 0.05
            : ['EXTERNAL_PROVIDER', 'EXTERNAL_COMMERCIAL'].includes(node.closureClass) ? 0.12 : 0.08;
    const score = ((node.unlockWeight + descendantsUnlocked * 2) * truthPenalty * (0.35 + 0.65 * node.evidenceStrength) * closability) / Math.sqrt(node.effortUnits);
    return { ...node, descendantsUnlocked, selfCompletionPriority: Number(score.toFixed(6)) };
  }).sort((a, b) => b.selfCompletionPriority - a.selfCompletionPriority || a.id.localeCompare(b.id));

  const internalClosable = ranked.filter(node => ['INTERNAL_SOURCE', 'INTERNAL_RESEARCH'].includes(node.closureClass));
  const externalFrontier = ranked.filter(node => !['INTERNAL_SOURCE', 'INTERNAL_RESEARCH'].includes(node.closureClass));
  const unresolvedDependencies = gaps.filter(node => !frontier.includes(node)).map(node => ({
    id: node.id,
    waitingOn: node.requires.filter(dep => !resolved(byId.get(dep)))
  }));

  return {
    ok: true,
    status: 'SELF_COMPLETION_ATTRACTOR_COMPILED',
    version: SELF_COMPLETION_ATTRACTOR_VERSION,
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    totalNodes: graph.nodes.length,
    verifiedNodes: graph.nodes.filter(resolved).length,
    gapNodes: gaps.length,
    frontierNodes: ranked.length,
    negativeImage: gaps.map(node => ({ id: node.id, label: node.label, state: node.state, closureClass: node.closureClass })),
    rankedFrontier: ranked,
    nextInternalGap: internalClosable[0] || null,
    externalEvidenceFrontier: externalFrontier,
    unresolvedDependencies,
    foldingRule: 'CLOSE_THE_HIGHEST_LEVERAGE_DEPENDENCY_SATISFIED_INTERNAL_GAP__THEN_RECOMPUTE_THE_NEGATIVE_IMAGE',
    blockerRule: 'EXTERNAL_PROVIDER_COMMERCIAL_PHYSICAL_FOUNDER_CHOICE_AND_ELAPSED_REALITY_GAPS_MAY_BE_NAMED_AND_PREPARED_FOR__THEY_MAY_NOT_BE_MINTED_CLOSED_BY_SOURCE_CODE',
    claimBoundary: 'A_GAP_GRAPH_IS_A_MODEL_OF_MISSING_OR_UNVERIFIED_CAPABILITY__NOT_PROOF_OF_COMPLETENESS_OR_ASI'
  };
}

export function compareSelfCompletionStates({ before = null, after = null } = {}) {
  if (!before?.ok || !after?.ok || before.status !== 'SELF_COMPLETION_ATTRACTOR_COMPILED' || after.status !== 'SELF_COMPLETION_ATTRACTOR_COMPILED') {
    return fail('SELF_COMPLETION_COMPARISON_INVALID', ['compiled-before-and-after-required']);
  }
  const beforeMissing = new Set(before.negativeImage.map(node => node.id));
  const afterMissing = new Set(after.negativeImage.map(node => node.id));
  const closed = [...beforeMissing].filter(id => !afterMissing.has(id));
  const newlyVisible = [...afterMissing].filter(id => !beforeMissing.has(id));
  return {
    ok: true,
    status: 'SELF_COMPLETION_STATES_COMPARED',
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    closedGapIds: closed,
    newlyVisibleGapIds: newlyVisible,
    gapDelta: after.gapNodes - before.gapNodes,
    interpretation: after.gapNodes < before.gapNodes ? 'NEGATIVE_IMAGE_SHRANK' : after.gapNodes > before.gapNodes ? 'STRONGER_MODEL_REVEALED_MORE_MISSING_STRUCTURE' : 'GAP_COUNT_STABLE',
    law: 'DISCOVERING_MORE_GAPS_CAN_BE_PROGRESS_IF_THE_MODEL_OF_COMPLETENESS_BECAME_MORE_TRUTHFUL'
  };
}
