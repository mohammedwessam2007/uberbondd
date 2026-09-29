import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { evaluateReasoningArchitectureArena } from './apex-reasoning-hypercompiler.mjs';
import { ABSOLUTE_FRONTIER_QUALITY_DELTA, qualityInvariantAttestation, validateQualityInvariantAttestation } from './absolute-frontier-quality-invariant.mjs';

export const REASONING_ARCHITECTURE_LAB_VERSION = 'uberbond.reasoning-architecture-lab.v1';

export const ARCHITECTURE_MUTATION_AXES = Object.freeze([
  'TOPOLOGY',
  'ROLE_SET',
  'PERSPECTIVE_SET',
  'PROMPT_CONTRACT',
  'CONTEXT_POLICY',
  'TOOL_POLICY',
  'VERIFICATION_POLICY',
  'STOP_POLICY',
  'REFLEX_BOUNDARY'
]);

const IMMUTABLE_GUARDS = Object.freeze([
  'businessEffectAuthority',
  'externalEffectAuthority',
  'promotionAuthority',
  'deploymentAuthority',
  'spendAuthority',
  'credentialAuthority',
  'paymentAuthority'
]);

function zeroEffects() { return structuredClone(ZERO_EXTERNAL_EFFECTS); }
function envelope(extra = {}) {
  return {
    policyVersion: REASONING_ARCHITECTURE_LAB_VERSION,
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    ...extra
  };
}
function fail(status, reasonCodes, extra = {}) {
  return envelope({ ok: false, status, reasonCodes: [...new Set(reasonCodes.filter(Boolean))], ...extra });
}
function text(value, max = 5000) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}
function integer(value, min, max) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
}
function finite(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}
function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}
function clone(value) { return structuredClone(value); }
function list(value, max = 128, itemMax = 1000) {
  if (!Array.isArray(value) || value.length > max) return null;
  const out = [];
  for (const item of value) {
    const normalized = text(item, itemMax);
    if (!normalized) return null;
    out.push(normalized);
  }
  return [...new Set(out)];
}
function deepMerge(base, patch) {
  if (Array.isArray(patch)) return clone(patch);
  if (!patch || typeof patch !== 'object') return patch;
  const out = base && typeof base === 'object' && !Array.isArray(base) ? clone(base) : {};
  for (const [key, value] of Object.entries(patch)) {
    out[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? deepMerge(out[key], value)
      : clone(value);
  }
  return out;
}

function forbiddenPatchReasons(patch) {
  const raw = JSON.stringify(patch ?? {});
  const reasons = [];
  for (const key of IMMUTABLE_GUARDS) {
    if (raw.includes(`"${key}"`)) reasons.push(`authority-guard-mutation-prohibited:${key}`);
  }
  const upper = raw.toUpperCase();
  for (const token of ['MAJORITY_ONLY', 'COST_FIRST', 'SKIP_VERIFICATION', 'SELF_PROMOTE', 'AUTO_PROMOTE', 'QUALITYDELTA', 'ABSOLUTEQUALITYINVARIANT']) {
    if (upper.includes(token)) reasons.push(`quality-guard-lowering-prohibited:${token}`);
  }
  return reasons;
}

function architectureInvariantReasons(candidate) {
  const reasons = [];
  const absoluteQuality = validateQualityInvariantAttestation(candidate?.semanticQualityFloor?.absoluteQualityInvariant);
  if (!absoluteQuality.ok) reasons.push(...absoluteQuality.reasonCodes);
  if (candidate?.semanticQualityFloor?.cheapGenerativeAuthority !== 'NONE') reasons.push('cheap-generative-authority-must-remain-none');
  if (candidate?.semanticQualityFloor?.majorityVoteAuthority !== 'NONE') reasons.push('majority-vote-authority-must-remain-none');
  if (candidate?.businessEffectAuthority !== 'NONE') reasons.push('business-effect-authority-must-remain-none');
  if (candidate?.externalEffectAuthority !== 'NONE') reasons.push('external-effect-authority-must-remain-none');
  if (candidate?.architectureLearning?.promotionAuthority !== 'NONE') reasons.push('architecture-learning-promotion-authority-must-remain-none');
  if (candidate?.verificationPolicy?.externalClaimsRequireExternalEvidence !== true) reasons.push('external-evidence-guard-required');
  if (candidate?.verificationPolicy?.verifierIndependenceRequiredForPromotion !== true) reasons.push('independent-verifier-guard-required');
  if (candidate?.reflexLayer?.consequenceAuthority !== 'NONE') reasons.push('reflex-authority-must-remain-none');
  if (candidate?.reflexLayer?.decompileOnDrift !== true) reasons.push('decompile-on-drift-required');
  return reasons;
}

export function compileArchitectureCandidate({
  parentArchitecture,
  mutationId,
  axis,
  patch,
  rationale,
  expectedEffect,
  falsifier,
  donorRefs = [],
  generation = 1
} = {}) {
  if (!parentArchitecture || typeof parentArchitecture !== 'object' || Array.isArray(parentArchitecture)) {
    return fail('ARCHITECTURE_CANDIDATE_REFUSED', ['parent-architecture-required']);
  }
  const id = text(mutationId, 160)?.toLowerCase();
  const mutationAxis = text(axis, 80)?.toUpperCase();
  const why = text(rationale, 4000);
  const effect = text(expectedEffect, 2000);
  const falsification = text(falsifier, 2000);
  const refs = list(donorRefs, 32, 1000);
  const gen = integer(generation, 1, 1_000_000);
  const reasons = [];
  if (!id || !mutationAxis || !ARCHITECTURE_MUTATION_AXES.includes(mutationAxis)) reasons.push('mutation-id-and-axis-required');
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) reasons.push('object-patch-required');
  if (!why || !effect || !falsification) reasons.push('rationale-effect-and-falsifier-required');
  if (!refs || gen == null) reasons.push('valid-donor-refs-and-generation-required');
  reasons.push(...forbiddenPatchReasons(patch));
  if (reasons.length) return fail('ARCHITECTURE_CANDIDATE_REFUSED', reasons);

  const candidate = deepMerge(parentArchitecture, patch);
  const invariantReasons = architectureInvariantReasons(candidate);
  if (invariantReasons.length) return fail('ARCHITECTURE_CANDIDATE_REFUSED', invariantReasons);

  const parentDigest = digest(parentArchitecture);
  const candidateDigest = digest(candidate);
  const lineage = {
    generation: gen,
    parentDigest,
    candidateDigest,
    mutationId: id,
    axis: mutationAxis,
    donorRefs: refs,
    rationale: why,
    expectedEffect: effect,
    falsifier: falsification
  };

  return envelope({
    ok: true,
    status: 'ARCHITECTURE_CANDIDATE_READY',
    candidate,
    candidateDigest,
    lineage,
    lineageDigest: digest(lineage),
    promotionAuthority: 'NONE',
    productionActivationAuthorized: false,
    truthBoundary: 'THIS IS AN OFFLINE CANDIDATE FOR SEALED EVALUATION. IT CANNOT ACTIVATE OR PROMOTE ITSELF.'
  });
}

function normalizeArchiveEntry(raw, index) {
  const architectureId = text(raw?.architectureId, 200);
  const taskClass = text(raw?.taskClass, 160)?.toLowerCase();
  const quality = finite(raw?.quality, 0, 1);
  const novelty = finite(raw?.novelty, 0, 1);
  const reliability = finite(raw?.reliability, 0, 1);
  const costUsd = finite(raw?.costUsd, 0);
  const evidenceRef = text(raw?.evidenceRef, 1000);
  const candidateDigest = text(raw?.candidateDigest, 128);
  const reasons = [];
  if (!architectureId || !taskClass || !candidateDigest || !evidenceRef) reasons.push(`archive-${index}:identity-evidence-required`);
  if ([quality, novelty, reliability, costUsd].some(value => value == null)) reasons.push(`archive-${index}:metrics-required`);
  return reasons.length
    ? { ok: false, reasonCodes: reasons }
    : { ok: true, entry: { architectureId, taskClass, quality, novelty, reliability, costUsd, evidenceRef, candidateDigest } };
}

function behaviorCell(entry) {
  const q = Math.min(9, Math.floor(entry.quality * 10));
  const n = Math.min(9, Math.floor(entry.novelty * 10));
  const c = entry.costUsd === 0 ? 0 : Math.min(9, Math.floor(Math.log10(entry.costUsd + 1) * 3));
  return `${entry.taskClass}:q${q}:n${n}:c${c}`;
}

export function buildArchitectureArchive({ entries = [], maxPerCell = 3 } = {}) {
  const cap = integer(maxPerCell, 1, 16);
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > 10000 || cap == null) {
    return fail('ARCHITECTURE_ARCHIVE_REFUSED', ['bounded-entry-list-and-cell-cap-required']);
  }
  const cells = new Map();
  const rejected = [];
  for (const [index, raw] of entries.entries()) {
    const checked = normalizeArchiveEntry(raw, index);
    if (!checked.ok) {
      rejected.push({ index, reasonCodes: checked.reasonCodes });
      continue;
    }
    const entry = checked.entry;
    const cell = behaviorCell(entry);
    const bucket = cells.get(cell) ?? [];
    bucket.push(entry);
    bucket.sort((a, b) =>
      b.quality - a.quality ||
      b.reliability - a.reliability ||
      b.novelty - a.novelty ||
      a.costUsd - b.costUsd ||
      a.architectureId.localeCompare(b.architectureId)
    );
    cells.set(cell, bucket.slice(0, cap));
  }
  const retained = [...cells.entries()].flatMap(([cell, bucket]) => bucket.map(entry => ({ ...entry, behaviorCell: cell })));
  if (!retained.length) return fail('ARCHITECTURE_ARCHIVE_REFUSED', ['no-valid-archive-entries'], { rejected });
  retained.sort((a, b) => b.quality - a.quality || b.novelty - a.novelty || a.costUsd - b.costUsd);

  return envelope({
    ok: true,
    status: 'ARCHITECTURE_ARCHIVE_READY',
    retained,
    retainedCount: retained.length,
    cellCount: cells.size,
    rejected,
    archiveDigest: digest(retained),
    law: 'PRESERVE MULTIPLE HIGH-QUALITY DISTINCT ARCHITECTURES SO THE SEARCH DOES NOT COLLAPSE TO ONE EARLY LOCAL OPTIMUM.'
  });
}

export function compileArchitectureSearchPlan({
  taskClass,
  archiveDigest,
  generation,
  populationSize = 24,
  eliteCount = 6,
  noveltySlots = 6,
  maxEvaluationCostUsd = 25,
  mutationAxes = ARCHITECTURE_MUTATION_AXES
} = {}) {
  const klass = text(taskClass, 160)?.toLowerCase();
  const archive = text(archiveDigest, 128);
  const gen = integer(generation, 1, 1_000_000);
  const population = integer(populationSize, 4, 256);
  const elites = integer(eliteCount, 1, 64);
  const novelty = integer(noveltySlots, 1, 64);
  const maxCost = finite(maxEvaluationCostUsd, 0.01, 1_000_000);
  const axes = list(mutationAxes, ARCHITECTURE_MUTATION_AXES.length, 80)?.map(value => value.toUpperCase());
  const reasons = [];
  if (!klass || !archive || gen == null) reasons.push('task-class-archive-and-generation-required');
  if (population == null || elites == null || novelty == null || maxCost == null) reasons.push('bounded-search-budget-required');
  if (!axes || axes.some(axis => !ARCHITECTURE_MUTATION_AXES.includes(axis))) reasons.push('recognized-mutation-axes-required');
  if (population != null && elites != null && novelty != null && elites + novelty > population) reasons.push('elite-plus-novelty-exceeds-population');
  if (reasons.length) return fail('ARCHITECTURE_SEARCH_PLAN_REFUSED', reasons);

  const plan = {
    taskClass: klass,
    archiveDigest: archive,
    generation: gen,
    populationSize: population,
    eliteCount: elites,
    noveltySlots: novelty,
    mutationAxes: axes,
    searchPolicy: {
      preserveElites: true,
      preserveNovelty: true,
      allowRecombination: true,
      allowPromptMutation: true,
      allowTopologyMutation: true,
      allowVerifierMutation: true,
      allowContextMutation: true,
      allowReflexBoundaryMutation: true,
      rejectAuthorityExpansion: true,
      rejectQualityFloorLowering: true,
      sealedHoldoutRequired: true,
      trainTestSeparationRequired: true,
      independentReplicationRequiredForPromotion: true
    },
    budget: {
      maxEvaluationCostUsd: maxCost,
      productionMutationBudgetUsd: 0
    },
    authority: {
      candidateGeneration: 'ALLOWED',
      sealedEvaluation: 'ALLOWED',
      productionPromotion: 'NONE',
      externalEffects: 'NONE'
    },
    stopConditions: [
      'evaluation-budget-exhausted',
      'no-material-quality-gain-across-stability-window',
      'archive-diversity-collapse-detected',
      'verifier-integrity-insufficient'
    ]
  };

  return envelope({
    ok: true,
    status: 'ARCHITECTURE_SEARCH_PLAN_READY',
    plan,
    planDigest: digest(plan),
    promotionAuthority: 'NONE'
  });
}

export function evaluateArchitectureGeneration({
  taskClass,
  trials = [],
  incumbentArchitectureId,
  minimumSampleSize = 20,
  qualityFloorDelta = ABSOLUTE_FRONTIER_QUALITY_DELTA
} = {}) {
  const incumbentId = text(incumbentArchitectureId, 200);
  if (!incumbentId) return fail('ARCHITECTURE_GENERATION_REFUSED', ['incumbent-architecture-id-required']);
  const arena = evaluateReasoningArchitectureArena({
    taskClass,
    trials,
    minimumSampleSize,
    qualityFloorDelta
  });
  if (!arena.ok) return arena;

  const incumbent = arena.ranked.find(row => row.architectureId === incumbentId) ?? null;
  const leader = arena.ranked[0] ?? null;
  const challengerSurvived = Boolean(leader && leader.architectureId !== incumbentId);
  const delta = incumbent && leader
    ? Number((leader.verifiedSuccessRate - incumbent.verifiedSuccessRate).toFixed(6))
    : null;

  return envelope({
    ok: true,
    status: challengerSurvived ? 'CHALLENGER_SURVIVED_SEALED_HOLDOUT' : 'INCUMBENT_SURVIVED_SEALED_HOLDOUT',
    taskClass: arena.taskClass,
    incumbentArchitectureId: incumbentId,
    promotionCandidateId: arena.promotionCandidateId,
    paretoArchitectureIds: arena.paretoArchitectureIds,
    verifiedSuccessRateDeltaVsIncumbent: delta,
    ranked: arena.ranked,
    absoluteQualityInvariant: qualityInvariantAttestation(),
    promotionAuthority: 'NONE',
    automaticProductionChange: false,
    nextStep: challengerSurvived
      ? 'INDEPENDENT_REPLICATION_AND_BOUNDED_CANARY_REQUIRED'
      : 'KEEP_INCUMBENT_AND_CONTINUE_DIVERSE_OFFLINE_SEARCH',
    truthBoundary: 'SEALED-HOLDOUT SURVIVAL IS NOT PRODUCTION PROMOTION.'
  });
}
