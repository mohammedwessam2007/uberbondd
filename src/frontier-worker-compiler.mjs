import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const FRONTIER_WORKER_COMPILER_VERSION = 'uberbond.frontier-worker-compiler-1.0.0';

const ROLES = new Set(['LEADER', 'WORKER', 'VERIFIER', 'ADVERSARY', 'JUDGE', 'RESEARCHER', 'OPERATOR']);
const PERMISSIONS = new Set(['REPO_READ', 'BOUNDED_REPO_WRITE', 'TEST_EXECUTION', 'READ_ONLY_NETWORK', 'BROWSER_READ', 'ARTIFACT_WRITE', 'DATABASE_READ', 'DATABASE_TEST_WRITE', 'MESSAGE_PREPARATION']);

function text(value, max = 3000) {
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
function boundedInt(value, min, max) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : null;
}
function envelope(extra = {}) {
  return { businessEffectAuthority: 'NONE', externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS), ...extra };
}

export function normalizeWorkerSpec(input = {}) {
  const id = text(input.id, 220)?.toLowerCase();
  const name = text(input.name, 240);
  const role = text(input.role, 80)?.toUpperCase();
  const objective = text(input.objective, 3000);
  const ownedResources = list(input.ownedResources || [], 256, 700);
  const permissions = list(input.permissions || [], 64, 120)?.map(item => item.toUpperCase());
  const forbiddenEffects = list(input.forbiddenEffects || ['MESSAGE', 'DEPLOYMENT', 'MONEY_MOVEMENT', 'PRODUCTION_MUTATION'], 64, 120)?.map(item => item.toUpperCase());
  const acceptanceCriteria = list(input.acceptanceCriteria || [], 128, 1400);
  const contextTags = list(input.contextTags || [], 128, 300);
  const maxTurns = boundedInt(input.maxTurns ?? 20, 1, 10_000);
  const maxParallelChildren = boundedInt(input.maxParallelChildren ?? 0, 0, 128);
  const preferredModels = list(input.preferredModels || [], 64, 300);
  const fallbackModels = list(input.fallbackModels || [], 64, 300);
  const reasonCodes = [];
  if (!id || !name || !ROLES.has(role) || !objective) reasonCodes.push('worker-identity-role-and-objective-required');
  if (!ownedResources || !permissions || permissions.some(item => !PERMISSIONS.has(item))) reasonCodes.push('recognized-worker-permissions-required');
  if (!forbiddenEffects || !acceptanceCriteria || acceptanceCriteria.length === 0) reasonCodes.push('worker-boundaries-and-acceptance-required');
  if (!contextTags || maxTurns == null || maxParallelChildren == null || !preferredModels || !fallbackModels) reasonCodes.push('bounded-worker-runtime-contract-required');
  if (reasonCodes.length) return envelope({ ok: false, status: 'WORKER_SPEC_INVALID', reasonCodes });
  return envelope({
    ok: true,
    status: 'WORKER_SPEC_NORMALIZED',
    worker: {
      schemaVersion: 'uberbond.worker-spec.v1', id, name, role, objective,
      ownedResources, permissions, forbiddenEffects, acceptanceCriteria, contextTags,
      budget: { maxTurns, maxParallelChildren }, preferredModels, fallbackModels,
      completionRule: 'RETURN_ARTIFACTS_CHECKS_UNCERTAINTY; NEVER_SELF_CERTIFY',
      authoritySource: 'NONE'
    }
  });
}

export function compileWorkerManifest({ worker, target = 'GENERIC' } = {}) {
  const normalized = normalizeWorkerSpec(worker);
  if (!normalized.ok) return normalized;
  const targetName = text(target, 80)?.toUpperCase();
  if (!['GENERIC', 'CLAUDE_CODE', 'CODEX', 'OPEN_MODEL_AGENT'].includes(targetName)) {
    return envelope({ ok: false, status: 'WORKER_COMPILE_INVALID', reasonCodes: ['recognized-worker-target-required'] });
  }
  const w = normalized.worker;
  const common = {
    id: w.id,
    name: w.name,
    role: w.role,
    objective: w.objective,
    ownedResources: w.ownedResources,
    permissions: w.permissions,
    forbiddenEffects: w.forbiddenEffects,
    acceptanceCriteria: w.acceptanceCriteria,
    contextTags: w.contextTags,
    maxTurns: w.budget.maxTurns,
    maxParallelChildren: w.budget.maxParallelChildren,
    preferredModels: w.preferredModels,
    fallbackModels: w.fallbackModels,
    selfCertificationAllowed: false,
    externalEffectAuthority: 'NONE'
  };
  if (targetName === 'CLAUDE_CODE') {
    return envelope({ ok: true, status: 'WORKER_MANIFEST_COMPILED', target: targetName, manifest: { ...common, providerShape: 'CLAUDE_AGENT_MD', instructions: `Own only: ${w.ownedResources.join(', ') || 'NO_FILE_OWNERSHIP'}. Run relevant checks. Return files changed, real check output, and uncertainty. Do not grade your own work.` } });
  }
  if (targetName === 'CODEX') {
    return envelope({ ok: true, status: 'WORKER_MANIFEST_COMPILED', target: targetName, manifest: { ...common, providerShape: 'CODEX_TASK_CONTRACT', instructions: 'Inspect first, change only owned resources, run relevant checks, return exact evidence and remaining uncertainty.' } });
  }
  if (targetName === 'OPEN_MODEL_AGENT') {
    return envelope({ ok: true, status: 'WORKER_MANIFEST_COMPILED', target: targetName, manifest: { ...common, providerShape: 'JSON_TOOL_AGENT_CONTRACT', instructions: 'Use only declared tools and permissions. Stop on missing authority or unverifiable completion.' } });
  }
  return envelope({ ok: true, status: 'WORKER_MANIFEST_COMPILED', target: targetName, manifest: common });
}

export function detectWorkerOwnershipConflicts(workers = []) {
  if (!Array.isArray(workers) || workers.length === 0 || workers.length > 256) return envelope({ ok: false, status: 'WORKER_SET_INVALID', reasonCodes: ['bounded-workers-required'] });
  const owners = new Map();
  const conflicts = [];
  const normalizedWorkers = [];
  for (const worker of workers) {
    const normalized = normalizeWorkerSpec(worker);
    if (!normalized.ok) return envelope({ ok: false, status: 'WORKER_SET_INVALID', reasonCodes: normalized.reasonCodes });
    normalizedWorkers.push(normalized.worker);
    for (const resource of normalized.worker.ownedResources) {
      if (owners.has(resource)) conflicts.push({ resource, workers: [owners.get(resource), normalized.worker.id] });
      else owners.set(resource, normalized.worker.id);
    }
  }
  return envelope({ ok: true, status: conflicts.length ? 'SERIALIZATION_REQUIRED' : 'PARALLELISM_ELIGIBLE', conflicts, parallelExecutionAuthority: 'NONE', workers: normalizedWorkers.map(worker => worker.id) });
}
