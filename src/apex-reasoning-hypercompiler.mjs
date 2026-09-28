import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { compileSemanticProgram } from './noetic-autocompiler.mjs';

export const APEX_REASONING_HYPERCOMPILER_VERSION = 'uberbond.apex-reasoning-hypercompiler.v1';
export const APEX_REASONING_MODES = Object.freeze([
  'DIRECT_FRONTIER',
  'PARALLEL_FRONTIER',
  'BLIND_COUNCIL',
  'APEX_SEARCH'
]);

const PERSPECTIVES = Object.freeze([
  'FIRST_PRINCIPLES_SOLVER',
  'EVIDENCE_AUDITOR',
  'FALSIFIER',
  'FRAMEBREAKER',
  'CAUSAL_MODELER',
  'COUNTERFACTUAL_ANALYST',
  'FORMALIZER',
  'IMPLEMENTATION_REALIST',
  'UNKNOWN_UNKNOWN_SCOUT',
  'VERIFIER_DESIGNER'
]);

const PUBLIC_DONOR_REFS = Object.freeze([
  'https://aclanthology.org/2026.acl-srw.1/',
  'https://aclanthology.org/2026.findings-acl.1694/',
  'https://aclanthology.org/2026.acl-long.650/',
  'https://www.microsoft.com/en-us/research/publication/acon-optimizing-context-compression-for-long-horizon-llm-agents/',
  'https://www.microsoft.com/en-us/research/publication/act-while-thinking-accelerating-llm-agents-via-pattern-aware-speculative-tool-execution/',
  'https://proceedings.iclr.cc/paper_files/paper/2026/hash/ae8d4084f418bb51575c2ca6c658a05b-Abstract-Conference.html',
  'https://platform.claude.com/docs/en/agents-and-tools/tool-use/manage-tool-context',
  'https://developers.openai.com/api/docs/guides/agents'
]);

function zeroEffects() {
  return structuredClone(ZERO_EXTERNAL_EFFECTS);
}

function envelope(extra = {}) {
  return {
    policyVersion: APEX_REASONING_HYPERCOMPILER_VERSION,
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    ...extra
  };
}

function fail(status, reasonCodes, extra = {}) {
  return envelope({
    ok: false,
    status,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    ...extra
  });
}

function text(value, max = 5000) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}

function finite(value, min = 0, max = 1) {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function integer(value, min, max) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function normalizeSignals(raw = {}) {
  const defaults = {
    uncertainty: 0.5,
    novelty: 0.5,
    stakes: 0.5,
    irreversibility: 0.25,
    ambiguity: 0.5,
    verifiability: 0.5,
    contextPressure: 0.25,
    toolLatency: 0.25
  };
  const out = {};
  const reasons = [];
  for (const [key, fallback] of Object.entries(defaults)) {
    const value = raw?.[key] == null ? fallback : finite(raw[key]);
    if (value == null) reasons.push(`signal-out-of-range:${key}`);
    else out[key] = value;
  }
  return { ok: reasons.length === 0, signals: out, reasonCodes: reasons };
}

function normalizeBudget(raw = {}) {
  const out = {
    maxFrontierCalls: integer(raw.maxFrontierCalls ?? 12, 1, 128),
    maxParallelBranches: integer(raw.maxParallelBranches ?? 12, 1, 128),
    maxSequentialAggregations: integer(raw.maxSequentialAggregations ?? 3, 0, 12),
    maxCostCents: integer(raw.maxCostCents ?? 500, 0, 10_000_000),
    maxWallClockMs: integer(raw.maxWallClockMs ?? 3_600_000, 1, 7 * 24 * 60 * 60 * 1000)
  };
  const reasons = Object.entries(out).filter(([, value]) => value == null).map(([key]) => `invalid-budget:${key}`);
  return { ok: reasons.length === 0, budget: out, reasonCodes: reasons };
}

function difficultyScore(signals) {
  const score =
    signals.uncertainty * 0.24 +
    signals.novelty * 0.20 +
    signals.stakes * 0.18 +
    signals.irreversibility * 0.12 +
    signals.ambiguity * 0.10 +
    (1 - signals.verifiability) * 0.10 +
    signals.contextPressure * 0.03 +
    signals.toolLatency * 0.03;
  return Number(score.toFixed(6));
}

function chooseMode({ score, signals, forceApex }) {
  if (
    forceApex === true ||
    signals.stakes >= 0.90 ||
    signals.irreversibility >= 0.90 ||
    (signals.novelty >= 0.85 && signals.uncertainty >= 0.75) ||
    score >= 0.78
  ) return 'APEX_SEARCH';
  if (score >= 0.60 || signals.ambiguity >= 0.80) return 'BLIND_COUNCIL';
  if (score >= 0.35) return 'PARALLEL_FRONTIER';
  return 'DIRECT_FRONTIER';
}

function branchShape(mode, budget, score) {
  if (mode === 'DIRECT_FRONTIER') {
    return { frontierPasses: 1, parallelBranches: 1, sequentialAggregations: 0, critiqueRounds: 0 };
  }
  if (mode === 'PARALLEL_FRONTIER') {
    const parallelBranches = Math.min(budget.maxParallelBranches, Math.max(2, Math.ceil(2 + score * 3)));
    return {
      frontierPasses: Math.min(budget.maxFrontierCalls, parallelBranches + 1),
      parallelBranches,
      sequentialAggregations: Math.min(1, budget.maxSequentialAggregations),
      critiqueRounds: 0
    };
  }
  if (mode === 'BLIND_COUNCIL') {
    const parallelBranches = Math.min(budget.maxParallelBranches, Math.max(3, Math.ceil(3 + score * 4)));
    const sequentialAggregations = Math.min(
      budget.maxSequentialAggregations,
      Math.max(1, Math.min(2, parallelBranches - 1))
    );
    return {
      frontierPasses: Math.min(budget.maxFrontierCalls, parallelBranches + sequentialAggregations + 1),
      parallelBranches,
      sequentialAggregations,
      critiqueRounds: 1
    };
  }
  const parallelBranches = Math.min(budget.maxParallelBranches, Math.max(6, Math.ceil(6 + score * 8)));
  const sequentialAggregations = Math.min(
    budget.maxSequentialAggregations,
    Math.max(1, Math.min(3, parallelBranches - 1))
  );
  return {
    frontierPasses: Math.min(budget.maxFrontierCalls, parallelBranches + sequentialAggregations + 2),
    parallelBranches,
    sequentialAggregations,
    critiqueRounds: Math.min(2, sequentialAggregations)
  };
}

function selectPerspectives(mode, count) {
  if (mode === 'DIRECT_FRONTIER') return ['FIRST_PRINCIPLES_SOLVER'];
  const base = mode === 'PARALLEL_FRONTIER'
    ? ['FIRST_PRINCIPLES_SOLVER', 'FALSIFIER', 'EVIDENCE_AUDITOR', 'CAUSAL_MODELER']
    : mode === 'BLIND_COUNCIL'
      ? ['FIRST_PRINCIPLES_SOLVER', 'FALSIFIER', 'EVIDENCE_AUDITOR', 'FRAMEBREAKER', 'CAUSAL_MODELER', 'COUNTERFACTUAL_ANALYST']
      : [...PERSPECTIVES];
  return base.slice(0, Math.max(1, Math.min(count, base.length)));
}

function compileReflexProgram({ missionId, semanticDecisions = [] } = {}) {
  if (!Array.isArray(semanticDecisions) || semanticDecisions.length === 0) {
    return {
      ok: true,
      status: 'NO_REFLEX_CANDIDATE_REQUESTED',
      program: null,
      promotionState: 'NONE'
    };
  }
  const compiled = compileSemanticProgram({
    programId: `apex-reflex:${missionId}`,
    version: '1',
    purpose: 'Execute bounded typed semantic judgements beneath frontier-authored policy; never create consequence authority.',
    instructions: semanticDecisions
  });
  if (!compiled.ok) return compiled;
  return {
    ok: true,
    status: 'REFLEX_SHADOW_CANDIDATE_READY',
    program: compiled.program,
    promotionState: 'SHADOW_ONLY',
    law: 'JEV_OR_ANY_SYSTEM_ONE_SUPPLIER_MAY_EXECUTE_ONLY_BOUNDED_TYPED_JUDGEMENTS; FRONTIER_REASONING_OR_EVIDENCE_MUST_DEFINE_POLICY; REALITY_OUTCOMES_CONTROL_CALIBRATION_AND_PROMOTION'
  };
}

export function compileApexReasoningArchitecture({
  missionId,
  taskId,
  objective,
  signals = {},
  budget = {},
  forceApex = false,
  semanticDecisions = [],
  dataClass = 'INTERNAL_NON_SECRET'
} = {}) {
  const mission = text(missionId, 160)?.toLowerCase();
  const task = text(taskId, 160)?.toLowerCase();
  const goal = text(objective, 12000);
  const klass = text(dataClass, 80)?.toUpperCase();
  const reasons = [];
  if (!mission || !task || !goal) reasons.push('mission-task-objective-required');
  if (!['PUBLIC', 'INTERNAL_NON_SECRET', 'SOURCE_CODE'].includes(klass)) reasons.push('safe-data-class-required');

  const normalizedSignals = normalizeSignals(signals);
  if (!normalizedSignals.ok) reasons.push(...normalizedSignals.reasonCodes);
  const normalizedBudget = normalizeBudget(budget);
  if (!normalizedBudget.ok) reasons.push(...normalizedBudget.reasonCodes);
  if (reasons.length) return fail('APEX_REASONING_ARCHITECTURE_REFUSED', reasons);

  const score = difficultyScore(normalizedSignals.signals);
  const mode = chooseMode({ score, signals: normalizedSignals.signals, forceApex });
  const shape = branchShape(mode, normalizedBudget.budget, score);
  const perspectives = selectPerspectives(mode, shape.parallelBranches);
  const reflex = compileReflexProgram({ missionId: mission, semanticDecisions });
  if (!reflex.ok) return fail('APEX_REASONING_ARCHITECTURE_REFUSED', reflex.reasonCodes || ['reflex-program-invalid']);

  const architecture = {
    schemaVersion: APEX_REASONING_HYPERCOMPILER_VERSION,
    missionId: mission,
    taskId: task,
    objective: goal,
    dataClass: klass,
    mode,
    difficultyScore: score,
    signals: normalizedSignals.signals,
    budget: normalizedBudget.budget,
    computePlan: {
      ...shape,
      parallelFirst: mode !== 'DIRECT_FRONTIER',
      law: 'PARALLEL_SEARCH_PRECEDES_SEQUENTIAL_AGGREGATION_WHEN_MULTIPLE_BRANCHES_EXIST; COMPUTE_EXPANDS_ON_UNRESOLVED_UNCERTAINTY_AND_CONTRACTS_AFTER_VERIFICATION'
    },
    semanticQualityFloor: {
      consequentialSemanticJudgements: 'FRONTIER_REASONING_OR_EXPLICITLY_CALIBRATED_COMPILED_REFLEX_ONLY',
      cheapGenerativeAuthority: 'NONE',
      majorityVoteAuthority: 'NONE',
      modelPrestigeAuthority: 'NONE',
      law: 'COST_OPTIMIZATION_MAY_CHANGE_EXECUTION_MECHANICS_BUT_MAY_NOT_SILENTLY_LOWER_THE_REQUIRED_REASONING_QUALITY'
    },
    perspectives,
    councilPolicy: {
      sealedIndependentFirstPasses: mode === 'BLIND_COUNCIL' || mode === 'APEX_SEARCH',
      identityBlindCritique: mode === 'BLIND_COUNCIL' || mode === 'APEX_SEARCH',
      providerAndTrainingLineageDiversityPreferred: true,
      explicitCalibratedConfidenceRequested: mode === 'BLIND_COUNCIL' || mode === 'APEX_SEARCH',
      majorityAgreementIsNotProof: true,
      dissentPreserved: true,
      adjudicatorIndependentWhenCapacityExists: true
    },
    contextPolicy: {
      residentKernel: 'SMALL',
      stablePrefixCache: 'PREFERRED',
      missionDelta: 'MINIMUM_SUFFICIENT',
      rawEvidence: 'IMMUTABLE_AND_RETRIEVABLE',
      derivedStateExternalization: 'REQUIRED_BEFORE_AGGRESSIVE_REASONING_HISTORY_COMPRESSION',
      repeatedSummaryOfSummary: 'PROHIBITED_AS_SOLE_EVIDENCE',
      compressionFailureMode: 'RETURN_TO_HIGHER_FIDELITY_SOURCE',
      contextManagementCallable: true
    },
    toolPolicy: {
      deterministicToolBeforeLLMForExactOperations: true,
      deferredToolLoadingPreferredForLargeToolsets: true,
      programmaticToolBatchingPreferredForMechanicalChains: true,
      speculativeExecution: {
        allowed: normalizedSignals.signals.toolLatency >= 0.35,
        sideEffectClass: 'READ_ONLY_OR_REVERSIBLE_ONLY',
        consequenceAuthority: 'NONE',
        cancelOnBranchDeath: true
      }
    },
    verificationPolicy: {
      deterministicVerifierPreferredWhereAvailable: true,
      processAndOutcomeSeparated: true,
      controllableAndUncontrollableFailureSeparated: true,
      verifierIndependenceRequiredForPromotion: true,
      unresolvedIsValidTerminalState: true,
      externalClaimsRequireExternalEvidence: true
    },
    stopPolicy: {
      stopWhen: [
        'acceptance-criteria-verified',
        'material-disputes-resolved-or-explicitly-unresolved',
        'additional-frontier-compute-has-low-estimated-information-value',
        'budget-bound-reached'
      ],
      neverStopBecause: [
        'cheap-router-confidence-alone',
        'majority-vote-alone',
        'provider-brand',
        'single-benchmark-rank'
      ]
    },
    reflexLayer: {
      status: reflex.status,
      promotionState: reflex.promotionState,
      program: reflex.program,
      consequenceAuthority: 'NONE',
      decompileOnDrift: true
    },
    architectureLearning: {
      arenaRequired: true,
      sealedHoldoutsRequired: true,
      taskClassSpecific: true,
      recordCostLatencyFounderMinutes: true,
      recordErrorCorrelation: true,
      promotionAuthority: 'NONE',
      publicDonorRefs: [...PUBLIC_DONOR_REFS]
    },
    truthBoundary: 'THIS_IS_A_REASONING_EXECUTION_PLAN, NOT EVIDENCE THAT THE SELECTED MODE OR ANY MODEL IS GLOBALLY BEST. LIVE PROMOTION REQUIRES TASK-SPECIFIC HELD-OUT AND REAL-OUTCOME EVIDENCE.',
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE'
  };

  return envelope({
    ok: true,
    status: 'APEX_REASONING_ARCHITECTURE_READY',
    architecture,
    architectureDigest: digest(architecture)
  });
}

export function buildIdentityBlindPacket({ candidates = [] } = {}) {
  if (!Array.isArray(candidates) || candidates.length < 2 || candidates.length > 64) {
    return fail('BLIND_PACKET_REFUSED', ['two-to-64-candidates-required']);
  }
  const rows = [];
  const ids = new Set();
  for (const [index, candidate] of candidates.entries()) {
    const sourceId = text(candidate?.sourceId, 160);
    const content = text(candidate?.content, 20000);
    if (!sourceId || !content) return fail('BLIND_PACKET_REFUSED', [`bounded-source-and-content-required:${index}`]);
    if (ids.has(sourceId)) return fail('BLIND_PACKET_REFUSED', ['unique-source-id-required']);
    ids.add(sourceId);
    rows.push({ sourceId, content, contentDigest: digest(content) });
  }

  rows.sort((a, b) => a.contentDigest.localeCompare(b.contentDigest) || a.sourceId.localeCompare(b.sourceId));
  const identityMap = {};
  const publicPacket = rows.map((row, index) => {
    const blindId = `candidate_${String(index + 1).padStart(2, '0')}`;
    identityMap[blindId] = row.sourceId;
    return { blindId, content: row.content, contentDigest: row.contentDigest };
  });
  const identityMapDigest = digest(identityMap);
  return envelope({
    ok: true,
    status: 'IDENTITY_BLIND_PACKET_READY',
    publicPacket,
    identityMap,
    identityMapDigest,
    modelVisibleIdentityMap: false,
    law: 'MODEL_FACING_CRITIQUE_AND_ADJUDICATION_MUST_RECEIVE_BLIND_IDS_ONLY; SOURCE_IDENTITY_REMAINS_AVAILABLE_TO_THE_RUNTIME_FOR RECEIPTS_AND_PROVENANCE'
  });
}

function normalizeTrial(raw, index) {
  const architectureId = text(raw?.architectureId, 200);
  const taskClass = text(raw?.taskClass, 160)?.toLowerCase();
  const verifiedSuccessRate = finite(raw?.verifiedSuccessRate);
  const processScore = finite(raw?.processScore);
  const falsePositiveRate = finite(raw?.falsePositiveRate);
  const costUsd = finite(raw?.costUsd, 0, Number.MAX_SAFE_INTEGER);
  const latencyMs = finite(raw?.latencyMs, 0, Number.MAX_SAFE_INTEGER);
  const founderMinutes = finite(raw?.founderMinutes, 0, Number.MAX_SAFE_INTEGER);
  const sampleSize = integer(raw?.sampleSize, 1, 1_000_000_000);
  const evidenceRef = text(raw?.evidenceRef, 1000);
  const reasons = [];
  if (!architectureId || !taskClass) reasons.push(`trial-identity-required:${index}`);
  if ([verifiedSuccessRate, processScore, falsePositiveRate, costUsd, latencyMs, founderMinutes].some(v => v == null)) reasons.push(`trial-metrics-required:${index}`);
  if (sampleSize == null || !evidenceRef) reasons.push(`trial-sample-and-evidence-required:${index}`);
  return reasons.length
    ? { ok: false, reasonCodes: reasons }
    : {
        ok: true,
        trial: {
          architectureId,
          taskClass,
          verifiedSuccessRate,
          processScore,
          falsePositiveRate,
          costUsd,
          latencyMs,
          founderMinutes,
          sampleSize,
          evidenceRef
        }
      };
}

function dominates(a, b) {
  const noWorse =
    a.verifiedSuccessRate >= b.verifiedSuccessRate &&
    a.processScore >= b.processScore &&
    a.falsePositiveRate <= b.falsePositiveRate &&
    a.costUsd <= b.costUsd &&
    a.latencyMs <= b.latencyMs &&
    a.founderMinutes <= b.founderMinutes;
  const strictlyBetter =
    a.verifiedSuccessRate > b.verifiedSuccessRate ||
    a.processScore > b.processScore ||
    a.falsePositiveRate < b.falsePositiveRate ||
    a.costUsd < b.costUsd ||
    a.latencyMs < b.latencyMs ||
    a.founderMinutes < b.founderMinutes;
  return noWorse && strictlyBetter;
}

export function evaluateReasoningArchitectureArena({
  trials = [],
  taskClass,
  minimumSampleSize = 20,
  qualityFloorDelta = 0.01
} = {}) {
  const klass = text(taskClass, 160)?.toLowerCase();
  const minSamples = integer(minimumSampleSize, 1, 1_000_000_000);
  const qualityDelta = finite(qualityFloorDelta, 0, 0.10);
  if (!klass || minSamples == null || qualityDelta == null) {
    return fail('REASONING_ARENA_REFUSED', ['valid-task-class-sample-and-quality-floor-required']);
  }
  if (!Array.isArray(trials) || trials.length === 0 || trials.length > 10000) {
    return fail('REASONING_ARENA_REFUSED', ['bounded-trial-list-required']);
  }

  const accepted = [];
  const rejected = [];
  for (const [index, raw] of trials.entries()) {
    const normalized = normalizeTrial(raw, index);
    if (!normalized.ok) {
      rejected.push({ index, reasonCodes: normalized.reasonCodes });
      continue;
    }
    if (normalized.trial.taskClass !== klass) {
      rejected.push({ index, reasonCodes: ['task-class-mismatch'] });
      continue;
    }
    if (normalized.trial.sampleSize < minSamples) {
      rejected.push({ index, reasonCodes: ['insufficient-sample-size'] });
      continue;
    }
    accepted.push(normalized.trial);
  }
  if (!accepted.length) return fail('REASONING_ARENA_INSUFFICIENT_EVIDENCE', ['no-eligible-trials'], { rejected });

  const bestQuality = Math.max(...accepted.map(item => item.verifiedSuccessRate));
  const qualityFloor = Math.max(0, bestQuality - qualityDelta);
  const qualityFrontier = accepted.filter(item => item.verifiedSuccessRate >= qualityFloor);
  const pareto = qualityFrontier.filter(candidate => !qualityFrontier.some(other => other !== candidate && dominates(other, candidate)));

  const ranked = [...qualityFrontier].sort((a, b) =>
    b.verifiedSuccessRate - a.verifiedSuccessRate ||
    b.processScore - a.processScore ||
    a.falsePositiveRate - b.falsePositiveRate ||
    a.costUsd - b.costUsd ||
    a.founderMinutes - b.founderMinutes ||
    a.latencyMs - b.latencyMs ||
    a.architectureId.localeCompare(b.architectureId)
  );

  return envelope({
    ok: true,
    status: 'REASONING_ARCHITECTURE_ARENA_EVALUATED',
    taskClass: klass,
    bestQuality,
    qualityFloor,
    ranked,
    paretoArchitectureIds: pareto.map(item => item.architectureId),
    promotionCandidateId: ranked[0]?.architectureId ?? null,
    rejected,
    promotionAuthority: 'NONE',
    law: 'QUALITY_IS_LEXICOGRAPHICALLY_PRIMARY; COST_LATENCY_AND_FOUNDER_MINUTES_BREAK_TIES_INSIDE_THE_VERIFIED_QUALITY_FRONTIER; A LEADERBOARD RESULT DOES_NOT CREATE PRODUCTION AUTHORITY'
  });
}
