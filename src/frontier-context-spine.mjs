import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const FRONTIER_CONTEXT_SPINE_VERSION = 'uberbond.frontier-context-spine-1.0.0';

function text(value, max = 5000) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}
function list(value, max = 128, itemMax = 1000) {
  if (!Array.isArray(value) || value.length > max) return null;
  const out = [];
  const seen = new Set();
  for (const item of value) {
    const normalized = text(item, itemMax);
    if (!normalized) return null;
    if (!seen.has(normalized)) { seen.add(normalized); out.push(normalized); }
  }
  return out;
}
function safeInt(value, min, max) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : null;
}
function envelope(extra = {}) {
  return { businessEffectAuthority: 'NONE', externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS), ...extra };
}

export function normalizeContextArtifact(input = {}) {
  const id = text(input.id, 240)?.toLowerCase();
  const kind = text(input.kind, 80)?.toUpperCase();
  const contentRef = text(input.contentRef, 1800);
  const tags = list(input.tags || [], 128, 240)?.map(tag => tag.toLowerCase());
  const dependencies = list(input.dependencies || [], 128, 240)?.map(dep => dep.toLowerCase());
  const estimatedTokens = safeInt(input.estimatedTokens ?? 1, 1, 5_000_000);
  const priority = safeInt(input.priority ?? 50, 0, 100);
  const immutable = input.immutable === true;
  const reasonCodes = [];
  if (!id || !['CONSTITUTION', 'CONTRACT', 'STATE', 'EVIDENCE', 'HISTORY', 'PROCEDURE', 'CODEMAP', 'CHECKPOINT'].includes(kind)) reasonCodes.push('recognized-context-artifact-required');
  if (!contentRef || !tags || !dependencies || estimatedTokens == null || priority == null) reasonCodes.push('complete-context-metadata-required');
  if (reasonCodes.length) return envelope({ ok: false, status: 'CONTEXT_ARTIFACT_INVALID', reasonCodes });
  return envelope({ ok: true, status: 'CONTEXT_ARTIFACT_NORMALIZED', artifact: { id, kind, contentRef, tags, dependencies, estimatedTokens, priority, immutable } });
}

export function buildContextPlan({ taskId, requiredTags = [], artifacts = [], tokenBudget = 32_000 } = {}) {
  const task = text(taskId, 240)?.toLowerCase();
  const tags = list(requiredTags, 128, 240)?.map(tag => tag.toLowerCase());
  const budget = safeInt(tokenBudget, 1, 5_000_000);
  if (!task || !tags || !Array.isArray(artifacts) || artifacts.length === 0 || artifacts.length > 5000 || budget == null) {
    return envelope({ ok: false, status: 'CONTEXT_PLAN_INVALID', reasonCodes: ['task-tags-artifacts-and-budget-required'] });
  }
  const normalized = [];
  for (const artifact of artifacts) {
    const result = normalizeContextArtifact(artifact);
    if (!result.ok) return envelope({ ok: false, status: 'CONTEXT_PLAN_INVALID', reasonCodes: result.reasonCodes });
    normalized.push(result.artifact);
  }
  const byId = new Map(normalized.map(item => [item.id, item]));
  const constitution = normalized.filter(item => item.kind === 'CONSTITUTION');
  if (constitution.length === 0) return envelope({ ok: false, status: 'CONTEXT_PLAN_INVALID', reasonCodes: ['constitution-artifact-required'] });

  const selected = new Map();
  function includeWithDependencies(item, trail = new Set()) {
    if (selected.has(item.id)) return true;
    if (trail.has(item.id)) return false;
    const nextTrail = new Set(trail); nextTrail.add(item.id);
    for (const dependencyId of item.dependencies) {
      const dependency = byId.get(dependencyId);
      if (!dependency || !includeWithDependencies(dependency, nextTrail)) return false;
    }
    selected.set(item.id, item);
    return true;
  }

  for (const item of constitution) includeWithDependencies(item);
  const candidates = normalized
    .filter(item => item.tags.some(tag => tags.includes(tag)))
    .sort((a, b) => b.priority - a.priority || a.estimatedTokens - b.estimatedTokens || a.id.localeCompare(b.id));
  for (const item of candidates) includeWithDependencies(item);

  const ordered = [...selected.values()].sort((a, b) => {
    if (a.kind === 'CONSTITUTION' && b.kind !== 'CONSTITUTION') return -1;
    if (b.kind === 'CONSTITUTION' && a.kind !== 'CONSTITUTION') return 1;
    return b.priority - a.priority || a.id.localeCompare(b.id);
  });
  let used = 0;
  const admitted = [];
  const omitted = [];
  for (const item of ordered) {
    if (used + item.estimatedTokens <= budget || item.kind === 'CONSTITUTION' || item.immutable) {
      admitted.push(item);
      used += item.estimatedTokens;
    } else omitted.push(item.id);
  }
  const missingDependencies = admitted.flatMap(item => item.dependencies.filter(dep => !admitted.some(candidate => candidate.id === dep)).map(dep => `${item.id}:${dep}`));
  if (missingDependencies.length) return envelope({ ok: false, status: 'CONTEXT_PLAN_INVALID', reasonCodes: ['dependency-would-be-omitted'], missingDependencies });
  if (used > budget && admitted.some(item => item.kind !== 'CONSTITUTION' && !item.immutable)) {
    return envelope({ ok: false, status: 'CONTEXT_BUDGET_EXCEEDED', reasonCodes: ['required-context-exceeds-budget'], usedTokens: used, tokenBudget: budget });
  }
  return envelope({
    ok: true,
    status: 'CONTEXT_PLAN_READY',
    taskId: task,
    tokenBudget: budget,
    estimatedTokens: used,
    admitted: admitted.map(item => ({ id: item.id, kind: item.kind, contentRef: item.contentRef, estimatedTokens: item.estimatedTokens })),
    omitted,
    invariants: ['constitution-always-present', 'dependencies-before-use', 'task-specific-retrieval', 'history-is-not-loaded-by-default']
  });
}

export function assessContextPressure({ usedTokens, tokenBudget, checkpointAvailable = false } = {}) {
  const used = safeInt(usedTokens, 0, 5_000_000);
  const budget = safeInt(tokenBudget, 1, 5_000_000);
  if (used == null || budget == null) return { ok: false, reasonCodes: ['valid-context-pressure-inputs-required'] };
  const ratio = used / budget;
  const state = ratio >= 0.9 ? 'CRITICAL' : ratio >= 0.75 ? 'HIGH' : ratio >= 0.5 ? 'MODERATE' : 'LOW';
  return {
    ok: true,
    state,
    ratio: Number(ratio.toFixed(4)),
    action: state === 'CRITICAL'
      ? (checkpointAvailable ? 'CHECKPOINT_AND_RETRIEVE_MINIMUM_NEXT_CONTEXT' : 'CREATE_CHECKPOINT_BEFORE_CONTINUING')
      : state === 'HIGH' ? 'PRUNE_OPTIONAL_CONTEXT_AND_PREPARE_CHECKPOINT' : 'CONTINUE'
  };
}
