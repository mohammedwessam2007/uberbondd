import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const OPEN_MODEL_FOUNDRY_VERSION = 'uberbond.open-model-foundry-1.0.0';
export const MODEL_SUPPLY_TYPES = Object.freeze(['OPEN_WEIGHT', 'CLOSED_API', 'LOCAL_RUNTIME', 'HOSTED_OPEN_WEIGHT']);
export const MODEL_SUPPLY_STATES = Object.freeze(['DISCOVERED', 'SCREENED', 'BENCHMARKED', 'APPROVED', 'ACTIVE', 'DEGRADED', 'REVOKED']);

function clone(value) { return structuredClone(value); }
function text(value, max = 1000) {
  const result = String(value ?? '').trim();
  return result && result.length <= max ? result : null;
}
function number(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}
function list(value, max = 128, itemMax = 300) {
  if (!Array.isArray(value) || value.length > max) return null;
  const output = [];
  const seen = new Set();
  for (const item of value) {
    const normalized = text(item, itemMax);
    if (!normalized) return null;
    if (!seen.has(normalized)) { seen.add(normalized); output.push(normalized); }
  }
  return output;
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

export function normalizeModelSupply(input = {}) {
  const reasonCodes = [];
  const id = text(input.id, 200)?.toLowerCase();
  const provider = text(input.provider, 200)?.toLowerCase();
  const model = text(input.model, 300);
  const revision = text(input.revision, 300);
  const supplyType = text(input.supplyType, 80)?.toUpperCase();
  const state = text(input.state || 'DISCOVERED', 80)?.toUpperCase();
  const license = text(input.license || 'UNKNOWN', 160)?.toUpperCase();
  const weightsAvailable = input.weightsAvailable === true;
  const taskClasses = list(input.taskClasses || [], 128, 200);
  const modalities = list(input.modalities || ['TEXT'], 32, 100);
  const toolCapabilities = list(input.toolCapabilities || [], 64, 200);
  const contextTokens = number(input.contextTokens, { min: 1, max: 100_000_000 });
  const benchmarkScore = number(input.benchmarkScore ?? 0, { min: 0, max: 1 });
  const benchmarkObservedAt = iso(input.benchmarkObservedAt);
  const reliabilityScore = number(input.reliabilityScore ?? 0, { min: 0, max: 1 });
  const inputCostPerMillionUsd = number(input.inputCostPerMillionUsd ?? 0, { min: 0, max: 1_000_000 });
  const outputCostPerMillionUsd = number(input.outputCostPerMillionUsd ?? 0, { min: 0, max: 1_000_000 });
  const infrastructureCostPerHourUsd = number(input.infrastructureCostPerHourUsd ?? 0, { min: 0, max: 1_000_000 });
  const minimumVramGb = number(input.minimumVramGb ?? 0, { min: 0, max: 100_000 });
  const runtimeCostKnown = input.runtimeCostKnown === true;
  const permissionEligible = input.permissionEligible === true;
  const evidenceRefs = list(input.evidenceRefs || [], 128, 1200);

  if (!id || !provider || !model || !revision) reasonCodes.push('model-identity-and-revision-required');
  if (!MODEL_SUPPLY_TYPES.includes(supplyType)) reasonCodes.push('recognized-model-supply-type-required');
  if (!MODEL_SUPPLY_STATES.includes(state)) reasonCodes.push('recognized-model-state-required');
  if (!taskClasses || !modalities || !toolCapabilities || !evidenceRefs) reasonCodes.push('bounded-model-capability-fields-required');
  if ([contextTokens, benchmarkScore, reliabilityScore, inputCostPerMillionUsd, outputCostPerMillionUsd, infrastructureCostPerHourUsd, minimumVramGb].some(value => value == null)) reasonCodes.push('bounded-model-metrics-required');
  if (['OPEN_WEIGHT', 'LOCAL_RUNTIME', 'HOSTED_OPEN_WEIGHT'].includes(supplyType) && !runtimeCostKnown) reasonCodes.push('open-or-local-runtime-cost-must-be-known');
  if (supplyType === 'OPEN_WEIGHT' && !weightsAvailable) reasonCodes.push('open-weight-supply-requires-observed-weight-availability');
  if (['BENCHMARKED', 'APPROVED', 'ACTIVE'].includes(state) && !benchmarkObservedAt) reasonCodes.push('benchmarked-model-requires-observation-time');
  if (reasonCodes.length) return zeroEffectEnvelope({ ok: false, status: 'MODEL_SUPPLY_INVALID', reasonCodes });

  return zeroEffectEnvelope({
    ok: true,
    status: 'MODEL_SUPPLY_NORMALIZED',
    supply: {
      schemaVersion: 'uberbond.model-supply.v1',
      id,
      provider,
      model,
      revision,
      supplyType,
      state,
      license,
      weightsAvailable,
      taskClasses,
      modalities,
      toolCapabilities,
      contextTokens,
      benchmarkScore,
      benchmarkObservedAt,
      reliabilityScore,
      costs: { inputCostPerMillionUsd, outputCostPerMillionUsd, infrastructureCostPerHourUsd, runtimeCostKnown },
      hardware: { minimumVramGb },
      permissionEligible,
      evidenceRefs
    }
  });
}

export function rankModelCandidates({ candidates = [], taskClass, maxEstimatedCostUsd = Number.MAX_SAFE_INTEGER, now = new Date().toISOString(), benchmarkMaxAgeDays = 30 } = {}) {
  const normalizedTask = text(taskClass, 200);
  const maxCost = number(maxEstimatedCostUsd, { min: 0, max: 1_000_000_000 });
  const observedNow = iso(now);
  const maxAgeDays = number(benchmarkMaxAgeDays, { min: 1, max: 3650 });
  if (!normalizedTask || maxCost == null || !observedNow || maxAgeDays == null || !Array.isArray(candidates) || candidates.length > 512) {
    return zeroEffectEnvelope({ ok: false, status: 'MODEL_RANKING_INVALID', reasonCodes: ['bounded-ranking-input-required'] });
  }
  const nowMs = new Date(observedNow).getTime();
  const eligible = [];
  const rejected = [];
  for (const candidate of candidates) {
    const normalized = normalizeModelSupply(candidate);
    if (!normalized.ok) { rejected.push({ id: candidate?.id || null, reasonCodes: normalized.reasonCodes }); continue; }
    const supply = normalized.supply;
    const reasons = [];
    if (!['APPROVED', 'ACTIVE'].includes(supply.state)) reasons.push('model-not-approved-or-active');
    if (!supply.permissionEligible) reasons.push('permission-not-eligible');
    if (!supply.taskClasses.includes(normalizedTask)) reasons.push('task-class-not-benchmarked');
    if (!supply.benchmarkObservedAt) reasons.push('benchmark-observation-missing');
    else {
      const ageDays = (nowMs - new Date(supply.benchmarkObservedAt).getTime()) / 86_400_000;
      if (ageDays < 0 || ageDays > maxAgeDays) reasons.push('benchmark-stale-or-future');
    }
    if (!supply.costs.runtimeCostKnown) reasons.push('runtime-cost-unknown');
    const estimatedUnitCost = supply.costs.inputCostPerMillionUsd + supply.costs.outputCostPerMillionUsd + supply.costs.infrastructureCostPerHourUsd;
    if (estimatedUnitCost > maxCost) reasons.push('cost-ceiling-exceeded');
    if (reasons.length) { rejected.push({ id: supply.id, reasonCodes: reasons }); continue; }
    const score = (supply.benchmarkScore * 0.65) + (supply.reliabilityScore * 0.30) + (1 / (1 + estimatedUnitCost) * 0.05);
    eligible.push({ id: supply.id, score, benchmarkScore: supply.benchmarkScore, reliabilityScore: supply.reliabilityScore, estimatedUnitCost, supply });
  }
  eligible.sort((a, b) => b.score - a.score || a.estimatedUnitCost - b.estimatedUnitCost || a.id.localeCompare(b.id));
  return zeroEffectEnvelope({
    ok: true,
    status: eligible.length ? 'MODEL_CANDIDATES_RANKED' : 'NO_ELIGIBLE_MODEL',
    selected: eligible[0] || null,
    ranked: eligible,
    rejected,
    executionAuthority: 'NONE'
  });
}

export function planModelTournament({ baseline, candidates = [], taskClass, holdoutId } = {}) {
  const normalizedBaseline = normalizeModelSupply(baseline);
  if (!normalizedBaseline.ok) return zeroEffectEnvelope({ ok: false, status: 'MODEL_TOURNAMENT_INVALID', reasonCodes: ['valid-baseline-required', ...normalizedBaseline.reasonCodes] });
  if (!Array.isArray(candidates) || candidates.length === 0 || candidates.length > 128) return zeroEffectEnvelope({ ok: false, status: 'MODEL_TOURNAMENT_INVALID', reasonCodes: ['bounded-candidates-required'] });
  const normalizedTask = text(taskClass, 200);
  const normalizedHoldout = text(holdoutId, 300);
  if (!normalizedTask || !normalizedHoldout) return zeroEffectEnvelope({ ok: false, status: 'MODEL_TOURNAMENT_INVALID', reasonCodes: ['task-class-and-holdout-required'] });
  const normalizedCandidates = [];
  for (const candidate of candidates) {
    const normalized = normalizeModelSupply(candidate);
    if (!normalized.ok) return zeroEffectEnvelope({ ok: false, status: 'MODEL_TOURNAMENT_INVALID', reasonCodes: ['all-candidates-must-normalize'] });
    normalizedCandidates.push(normalized.supply);
  }
  return zeroEffectEnvelope({
    ok: true,
    status: 'MODEL_TOURNAMENT_PLAN_ONLY',
    tournament: {
      schemaVersion: 'uberbond.model-tournament.v1',
      taskClass: normalizedTask,
      holdoutId: normalizedHoldout,
      baselineId: normalizedBaseline.supply.id,
      candidateIds: normalizedCandidates.map(candidate => candidate.id),
      measures: [
        'task-success', 'quality', 'reliability', 'latency', 'token-cost',
        'infrastructure-cost', 'founder-intervention', 'tool-use-success',
        'recovery-success', 'safety-policy-compliance'
      ],
      promotionRequirements: [
        'current-benchmark-evidence',
        'permission-eligibility',
        'no-security-regression',
        'economically-superior-or-capability-expanding'
      ]
    },
    promotionAuthority: 'NONE'
  });
}
