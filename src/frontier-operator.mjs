import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const FRONTIER_OPERATOR_VERSION = 'uberbond.frontier-operator-1.0.0';
export const OPERATOR_ROLES = Object.freeze(['LEADER', 'WORKER', 'VERIFIER', 'ADVERSARY', 'JUDGE']);
export const EFFORT_TIERS = Object.freeze(['DETERMINISTIC', 'LOW', 'MEDIUM', 'HIGH', 'FRONTIER']);

const EFFECTS = new Set(['NONE', 'READ_ONLY_NETWORK', 'LOCAL_WRITE', 'EXTERNAL_WRITE', 'MESSAGE', 'DEPLOYMENT', 'PRODUCTION_MUTATION', 'MONEY_MOVEMENT', 'SECURITY_TEST']);
const MAX_LIST = 256;

function clone(value) { return structuredClone(value); }
function text(value, max = 2000) {
  const result = String(value ?? '').trim();
  return result && result.length <= max ? result : null;
}
function boundedList(value, max = MAX_LIST, itemMax = 1000) {
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
function finiteNumber(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}
function iso(value) {
  const normalized = text(value, 80);
  const date = normalized ? new Date(normalized) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function zeroEffectEnvelope(extra = {}) {
  return {
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS),
    ...extra
  };
}

export function normalizeGoalContract(input = {}) {
  const reasonCodes = [];
  const id = text(input.id, 200)?.toLowerCase();
  const outcome = text(input.outcome, 4000);
  const reason = text(input.reason, 4000);
  const constraints = boundedList(input.constraints || [], 128, 1200);
  const proof = Array.isArray(input.proof) && input.proof.length <= 128
    ? input.proof.map((item, index) => ({
        id: text(item?.id || `proof-${index + 1}`, 200)?.toLowerCase(),
        description: text(item?.description, 1600),
        verifierType: text(item?.verifierType || 'DETERMINISTIC_OR_INDEPENDENT', 120)?.toUpperCase()
      }))
    : null;
  const permittedEffects = boundedList(input.permittedEffects || ['NONE'], 32, 80)?.map(item => item.toUpperCase());
  const maxSpendUsd = finiteNumber(input.maxSpendUsd ?? 0, { min: 0, max: 1_000_000_000 });
  const maxTurns = finiteNumber(input.maxTurns ?? 50, { min: 1, max: 10_000 });
  const maxDurationMinutes = finiteNumber(input.maxDurationMinutes ?? 1440, { min: 1, max: 525_600 });
  const failurePolicy = text(input.failurePolicy || 'STOP_WITH_EVIDENCE', 200)?.toUpperCase();

  if (!id) reasonCodes.push('goal-id-required');
  if (!outcome) reasonCodes.push('goal-outcome-required');
  if (!reason) reasonCodes.push('goal-reason-required');
  if (!constraints) reasonCodes.push('bounded-constraints-required');
  if (!proof || proof.length === 0 || proof.some(item => !item.id || !item.description)) reasonCodes.push('nonempty-bounded-proof-contract-required');
  if (!permittedEffects || permittedEffects.some(effect => !EFFECTS.has(effect))) reasonCodes.push('recognized-permitted-effects-required');
  if (maxSpendUsd == null || maxTurns == null || maxDurationMinutes == null) reasonCodes.push('bounded-resource-budget-required');
  if (!['STOP_WITH_EVIDENCE', 'ESCALATE_WITH_EVIDENCE'].includes(failurePolicy)) reasonCodes.push('fail-closed-failure-policy-required');

  if (reasonCodes.length) return zeroEffectEnvelope({ ok: false, status: 'GOAL_INVALID', reasonCodes });
  return zeroEffectEnvelope({
    ok: true,
    status: 'GOAL_NORMALIZED',
    goal: {
      schemaVersion: 'uberbond.goal-contract.v1',
      id,
      outcome,
      reason,
      constraints,
      proof,
      permittedEffects,
      budget: { maxSpendUsd, maxTurns, maxDurationMinutes },
      failurePolicy
    }
  });
}

export function planWorkerLanes({ missionId, lanes = [] } = {}) {
  const normalizedMissionId = text(missionId, 200)?.toLowerCase();
  if (!normalizedMissionId || !Array.isArray(lanes) || lanes.length === 0 || lanes.length > 128) {
    return zeroEffectEnvelope({ ok: false, status: 'LANE_PLAN_INVALID', reasonCodes: ['mission-id-and-bounded-lanes-required'] });
  }
  const seenIds = new Set();
  const owners = new Map();
  const normalized = [];
  const conflicts = [];

  for (const lane of lanes) {
    const id = text(lane?.id, 200)?.toLowerCase();
    const role = text(lane?.role || 'WORKER', 80)?.toUpperCase();
    const objective = text(lane?.objective, 2000);
    const ownedResources = boundedList(lane?.ownedResources || [], 128, 500);
    const dependsOn = boundedList(lane?.dependsOn || [], 128, 200)?.map(item => item.toLowerCase());
    if (!id || seenIds.has(id) || !OPERATOR_ROLES.includes(role) || !objective || !ownedResources || !dependsOn) {
      return zeroEffectEnvelope({ ok: false, status: 'LANE_PLAN_INVALID', reasonCodes: ['valid-unique-lane-contract-required'] });
    }
    seenIds.add(id);
    for (const resource of ownedResources) {
      const prior = owners.get(resource);
      if (prior) conflicts.push({ resource, lanes: [prior, id] });
      else owners.set(resource, id);
    }
    normalized.push({ id, role, objective, ownedResources, dependsOn });
  }
  const unknownDependencies = normalized.flatMap(lane => lane.dependsOn.filter(dep => !seenIds.has(dep)).map(dep => `${lane.id}:${dep}`));
  if (unknownDependencies.length) return zeroEffectEnvelope({ ok: false, status: 'LANE_PLAN_INVALID', reasonCodes: ['unknown-lane-dependency'], unknownDependencies });

  return zeroEffectEnvelope({
    ok: true,
    status: conflicts.length ? 'SERIALIZATION_REQUIRED' : 'PARALLELISM_ELIGIBLE',
    missionId: normalizedMissionId,
    lanes: normalized,
    ownershipConflicts: conflicts,
    parallelExecutionAuthorized: false
  });
}

export function planPersistentLoop(input = {}) {
  const id = text(input.id, 200)?.toLowerCase();
  const objective = text(input.objective, 2000);
  const cadenceMinutes = finiteNumber(input.cadenceMinutes, { min: 1, max: 43_200 });
  const stopCondition = text(input.stopCondition, 2000);
  const maxIterations = finiteNumber(input.maxIterations ?? 100, { min: 1, max: 100_000 });
  const maxSpendUsd = finiteNumber(input.maxSpendUsd ?? 0, { min: 0, max: 1_000_000_000 });
  const allowedEffects = boundedList(input.allowedEffects || ['NONE'], 32, 80)?.map(item => item.toUpperCase());
  const reasonCodes = [];
  if (!id || !objective || cadenceMinutes == null || !stopCondition || maxIterations == null || maxSpendUsd == null) reasonCodes.push('bounded-loop-contract-required');
  if (!allowedEffects || allowedEffects.some(effect => !EFFECTS.has(effect))) reasonCodes.push('recognized-loop-effects-required');
  if (reasonCodes.length) return zeroEffectEnvelope({ ok: false, status: 'LOOP_INVALID', reasonCodes });
  return zeroEffectEnvelope({
    ok: true,
    status: 'LOOP_PLAN_ONLY',
    loop: { id, objective, cadenceMinutes, stopCondition, maxIterations, maxSpendUsd, allowedEffects },
    schedulingAuthority: 'NONE'
  });
}

export function selectEffortTier(input = {}) {
  if (input.deterministicPossible === true) return { ok: true, effortTier: 'DETERMINISTIC', reason: 'deterministic-solution-available' };
  const consequence = finiteNumber(input.consequenceScore ?? 0, { min: 0, max: 100 });
  const ambiguity = finiteNumber(input.ambiguityScore ?? 0, { min: 0, max: 100 });
  const complexity = finiteNumber(input.complexityScore ?? 0, { min: 0, max: 100 });
  if ([consequence, ambiguity, complexity].some(value => value == null)) return { ok: false, reasonCodes: ['bounded-effort-signals-required'] };
  const score = Math.max(consequence, ambiguity, complexity);
  const effortTier = score >= 85 ? 'FRONTIER' : score >= 65 ? 'HIGH' : score >= 35 ? 'MEDIUM' : 'LOW';
  return { ok: true, effortTier, score };
}

export function evaluateGoalEvidence({ goal, receipts = [] } = {}) {
  const normalizedGoal = normalizeGoalContract(goal);
  if (!normalizedGoal.ok) return normalizedGoal;
  if (!Array.isArray(receipts) || receipts.length > 512) return zeroEffectEnvelope({ ok: false, status: 'GOAL_EVIDENCE_INVALID', reasonCodes: ['bounded-receipts-required'] });
  const byProof = new Map();
  for (const receipt of receipts) {
    const proofId = text(receipt?.proofId, 200)?.toLowerCase();
    const status = text(receipt?.status, 40)?.toUpperCase();
    const observedAt = iso(receipt?.observedAt);
    const evidenceRef = text(receipt?.evidenceRef, 2000);
    if (!proofId || !['PASS', 'FAIL', 'UNCERTAIN'].includes(status) || !observedAt || !evidenceRef) continue;
    byProof.set(proofId, { proofId, status, observedAt, evidenceRef });
  }
  const missing = [];
  const failed = [];
  const uncertain = [];
  for (const requirement of normalizedGoal.goal.proof) {
    const receipt = byProof.get(requirement.id);
    if (!receipt) missing.push(requirement.id);
    else if (receipt.status === 'FAIL') failed.push(requirement.id);
    else if (receipt.status === 'UNCERTAIN') uncertain.push(requirement.id);
  }
  const complete = missing.length === 0 && failed.length === 0 && uncertain.length === 0;
  return zeroEffectEnvelope({
    ok: true,
    status: complete ? 'GOAL_PROVEN' : 'GOAL_NOT_PROVEN',
    complete,
    missing,
    failed,
    uncertain,
    evidenceReceipts: [...byProof.values()]
  });
}

export function buildMissionCheckpoint(input = {}) {
  const missionId = text(input.missionId, 200)?.toLowerCase();
  const observedAt = iso(input.observedAt);
  const sourceRevision = text(input.sourceRevision, 240);
  const completedStages = boundedList(input.completedStages || [], 256, 500);
  const failedStrategies = boundedList(input.failedStrategies || [], 256, 1000);
  const falsifiedAssumptions = boundedList(input.falsifiedAssumptions || [], 256, 1000);
  const blockers = boundedList(input.blockers || [], 256, 1000);
  const nextActions = boundedList(input.nextActions || [], 256, 1000);
  if (!missionId || !observedAt || !sourceRevision || !completedStages || !failedStrategies || !falsifiedAssumptions || !blockers || !nextActions) {
    return zeroEffectEnvelope({ ok: false, status: 'CHECKPOINT_INVALID', reasonCodes: ['complete-durable-checkpoint-fields-required'] });
  }
  return zeroEffectEnvelope({
    ok: true,
    status: 'CHECKPOINT_RECORDED',
    checkpoint: {
      schemaVersion: 'uberbond.long-horizon-checkpoint.v1',
      missionId,
      observedAt,
      sourceRevision,
      completedStages,
      failedStrategies,
      falsifiedAssumptions,
      blockers,
      nextActions
    }
  });
}
