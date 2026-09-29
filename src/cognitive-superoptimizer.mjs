import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { qualityInvariantAttestation } from './absolute-frontier-quality-invariant.mjs';
import { validateCanonicalZeroLossCertificate } from './canonical-zero-loss-certificate.mjs';

export const COGNITIVE_SUPEROPTIMIZER_VERSION = 'uberbond.cognitive-superoptimizer.v1';

const zeroEffects = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const text = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
const finite = (value, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max ? Number(value) : null;
const integer = (value, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  Number.isSafeInteger(Number(value)) && Number(value) >= min && Number(value) <= max ? Number(value) : null;
const stable = value => Array.isArray(value)
  ? value.map(stable)
  : (!value || typeof value !== 'object')
    ? value
    : Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
const digest = value => crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const unique = values => [...new Set(values.filter(Boolean))];

function envelope(extra = {}) {
  return {
    optimizerVersion: COGNITIVE_SUPEROPTIMIZER_VERSION,
    absoluteQualityInvariant: qualityInvariantAttestation(),
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
    reasonCodes: unique(reasonCodes),
    ...extra
  });
}

function normalizeProfileEvent(raw, index) {
  const reasons = [];
  const semanticIdentity = text(raw?.semanticIdentity, 500);
  const taskArchetype = text(raw?.taskArchetype, 240);
  const qualityType = text(raw?.qualityType, 80).toUpperCase();
  const backend = text(raw?.backend, 120).toUpperCase();
  const costUsd = finite(raw?.costUsd, 0, 1_000_000);
  const frontierCostUsd = finite(raw?.frontierCostUsd ?? (backend.includes('FRONTIER') ? raw?.costUsd : 0), 0, 1_000_000);
  const latencyMs = finite(raw?.latencyMs ?? 0, 0, 86_400_000);
  const reuseCount = integer(raw?.reuseCount ?? 0, 0, 1_000_000_000);
  const futureCallsAvoided = integer(raw?.futureCallsAvoided ?? 0, 0, 1_000_000_000);
  const pairedRegression = raw?.pairedRegression === true;
  const decompiled = raw?.decompiled === true;

  if (!semanticIdentity) reasons.push(`event-${index}:semantic-identity-required`);
  if (!taskArchetype) reasons.push(`event-${index}:task-archetype-required`);
  if (!qualityType) reasons.push(`event-${index}:quality-type-required`);
  if (!backend) reasons.push(`event-${index}:backend-required`);
  if ([costUsd, frontierCostUsd, latencyMs, reuseCount, futureCallsAvoided].some(v => v == null)) {
    reasons.push(`event-${index}:bounded-numeric-fields-required`);
  }

  return {
    reasons,
    event: {
      semanticIdentity,
      taskArchetype,
      qualityType,
      backend,
      costUsd,
      frontierCostUsd,
      latencyMs,
      reuseCount,
      futureCallsAvoided,
      pairedRegression,
      decompiled
    }
  };
}

export function profileCognitiveHotPaths({
  events = [],
  minimumOccurrences = 2,
  implementationCostUsd = 0,
  migrationRiskWeight = 1
} = {}) {
  const min = integer(minimumOccurrences, 1, 1_000_000);
  const implementationCost = finite(implementationCostUsd, 0, 1_000_000);
  const riskWeight = finite(migrationRiskWeight, 0, 1_000_000);
  if (!Array.isArray(events) || !events.length || min == null || implementationCost == null || riskWeight == null) {
    return fail('COGNITIVE_HOT_PATH_PROFILE_REFUSED', ['valid-events-and-bounds-required']);
  }

  const normalized = [];
  const reasons = [];
  events.forEach((raw, index) => {
    const checked = normalizeProfileEvent(raw, index);
    reasons.push(...checked.reasons);
    normalized.push(checked.event);
  });
  if (reasons.length) return fail('COGNITIVE_HOT_PATH_PROFILE_REFUSED', reasons);

  const groups = new Map();
  for (const event of normalized) {
    const key = digest({
      semanticIdentity: event.semanticIdentity,
      taskArchetype: event.taskArchetype,
      qualityType: event.qualityType
    });
    const row = groups.get(key) || {
      semanticDigest: `sha256:${key}`,
      semanticIdentity: event.semanticIdentity,
      taskArchetype: event.taskArchetype,
      qualityType: event.qualityType,
      occurrences: 0,
      totalCostUsd: 0,
      totalFrontierCostUsd: 0,
      totalLatencyMs: 0,
      reuseCount: 0,
      futureCallsAvoided: 0,
      pairedRegressions: 0,
      decompilations: 0,
      backends: new Set()
    };
    row.occurrences += 1;
    row.totalCostUsd += event.costUsd;
    row.totalFrontierCostUsd += event.frontierCostUsd;
    row.totalLatencyMs += event.latencyMs;
    row.reuseCount += event.reuseCount;
    row.futureCallsAvoided += event.futureCallsAvoided;
    row.pairedRegressions += event.pairedRegression ? 1 : 0;
    row.decompilations += event.decompiled ? 1 : 0;
    row.backends.add(event.backend);
    groups.set(key, row);
  }

  const hotPaths = [...groups.values()]
    .filter(row => row.occurrences >= min)
    .map(row => {
      const empiricalRisk =
        (row.pairedRegressions / row.occurrences) +
        (row.decompilations / row.occurrences);
      const expectedLifetimeRemovableFrontierUsd =
        row.totalFrontierCostUsd * Math.max(1, row.reuseCount + row.futureCallsAvoided + 1);
      const denominator = implementationCost + (empiricalRisk * riskWeight) + 1e-9;
      const compilationPriority = expectedLifetimeRemovableFrontierUsd / denominator;
      return {
        ...row,
        backends: [...row.backends].sort(),
        averageCostUsd: row.totalCostUsd / row.occurrences,
        averageFrontierCostUsd: row.totalFrontierCostUsd / row.occurrences,
        averageLatencyMs: row.totalLatencyMs / row.occurrences,
        empiricalRisk,
        expectedLifetimeRemovableFrontierUsd,
        compilationPriority
      };
    })
    .sort((a, b) =>
      b.compilationPriority - a.compilationPriority ||
      b.totalFrontierCostUsd - a.totalFrontierCostUsd ||
      a.semanticDigest.localeCompare(b.semanticDigest)
    );

  return envelope({
    ok: true,
    status: hotPaths.length ? 'COGNITIVE_HOT_PATHS_PROFILED' : 'NO_HOT_PATHS_YET',
    eventCount: normalized.length,
    hotPaths,
    promotionAuthority: 'NONE',
    law: 'HOT_PATH_PRIORITY_MAY_CHOOSE_WHAT_TO_TEST_FOR_COMPILATION_BUT_CAN_NEVER_GRANT_LOWER_TIER_AUTHORITY'
  });
}

export function assessSemanticPage({
  page,
  currentSourceStateDigest,
  currentCrownRevision,
  currentTime = new Date().toISOString()
} = {}) {
  const reasons = [];
  const pageId = text(page?.pageId, 240);
  const qualityType = text(page?.qualityType, 80).toUpperCase();
  const sourceStateDigest = text(page?.sourceStateDigest, 128).toLowerCase();
  const crownRevision = text(page?.crownRevision, 500);
  const applicabilityDomain = text(page?.applicabilityDomain, 2000);
  const expiresAt = page?.expiresAt ? text(page.expiresAt, 100) : null;
  const currentState = text(currentSourceStateDigest, 128).toLowerCase();
  const currentCrown = text(currentCrownRevision, 500);
  const nowMs = Date.parse(currentTime);

  if (!pageId) reasons.push('page-id-required');
  if (!/^[a-f0-9]{64}$/.test(sourceStateDigest)) reasons.push('page-source-state-digest-required');
  if (!/^[a-f0-9]{64}$/.test(currentState)) reasons.push('current-source-state-digest-required');
  if (!qualityType) reasons.push('page-quality-type-required');
  if (!crownRevision) reasons.push('page-crown-revision-required');
  if (!currentCrown) reasons.push('current-crown-revision-required');
  if (!applicabilityDomain) reasons.push('applicability-domain-required');
  if (!Number.isFinite(nowMs)) reasons.push('valid-current-time-required');
  if (expiresAt && !Number.isFinite(Date.parse(expiresAt))) reasons.push('valid-expiry-required');
  if (reasons.length) return fail('SEMANTIC_PAGE_ASSESSMENT_REFUSED', reasons);

  const invalidators = [];
  if (sourceStateDigest !== currentState) invalidators.push('SOURCE_STATE_CHANGED');
  if (crownRevision !== currentCrown) invalidators.push('CROWN_SUCCESSION_REVALIDATION_REQUIRED');
  if (expiresAt && Date.parse(expiresAt) <= nowMs) invalidators.push('PAGE_EXPIRED');
  if (page?.driftDetected === true) invalidators.push('REALITY_DRIFT_DETECTED');
  if (page?.revoked === true) invalidators.push('PAGE_REVOKED');

  const resident = invalidators.length === 0;
  return envelope({
    ok: true,
    status: resident ? 'SEMANTIC_PAGE_RESIDENT' : 'SEMANTIC_PAGE_FAULT',
    pageId,
    qualityType,
    resident,
    invalidators,
    action: resident ? 'REUSE_WITHIN_APPLICABILITY_DOMAIN' : 'DECOMPILE_AND_ESCALATE_TO_REQUIRED_FRONTIER',
    law: 'STALE_OR_DRIFTED_COMPILED_COGNITION_NEVER_FAILS_OPEN'
  });
}

export function recordFrontierThoughtCapital({
  frontierCallId,
  taskArchetype,
  costUsd,
  novelDecisionIds = [],
  newBoundaryIds = [],
  counterexampleIds = [],
  spawnedJevCandidateIds = [],
  spawnedCodeCandidateIds = [],
  negativeKnowledgeIds = [],
  futureReferenceCostAvoidedUsd = 0,
  realizedReferenceCostAvoidedUsd = 0,
  authorizedConsumers = 1
} = {}) {
  const id = text(frontierCallId, 240);
  const archetype = text(taskArchetype, 240);
  const cost = finite(costUsd, 0.000000001, 1_000_000);
  const futureAvoided = finite(futureReferenceCostAvoidedUsd, 0, 1_000_000_000);
  const realizedAvoided = finite(realizedReferenceCostAvoidedUsd, 0, 1_000_000_000);
  const consumers = integer(authorizedConsumers, 1, 1_000_000_000);
  if (!id || !archetype || cost == null || futureAvoided == null || realizedAvoided == null || consumers == null) {
    return fail('FRONTIER_THOUGHT_CAPITAL_REFUSED', ['valid-call-archetype-cost-and-value-fields-required']);
  }

  const asset = {
    frontierCallId: id,
    taskArchetype: archetype,
    costUsd: cost,
    novelDecisionIds: unique(novelDecisionIds.map(v => text(v, 240))),
    newBoundaryIds: unique(newBoundaryIds.map(v => text(v, 240))),
    counterexampleIds: unique(counterexampleIds.map(v => text(v, 240))),
    spawnedJevCandidateIds: unique(spawnedJevCandidateIds.map(v => text(v, 240))),
    spawnedCodeCandidateIds: unique(spawnedCodeCandidateIds.map(v => text(v, 240))),
    negativeKnowledgeIds: unique(negativeKnowledgeIds.map(v => text(v, 240))),
    futureReferenceCostAvoidedUsd: futureAvoided,
    realizedReferenceCostAvoidedUsd: realizedAvoided,
    authorizedConsumers: consumers
  };

  const realizedRoi = realizedAvoided / cost;
  const projectedRoi = futureAvoided / cost;
  return envelope({
    ok: true,
    status: 'FRONTIER_THOUGHT_CAPITAL_RECORDED',
    asset: {
      ...asset,
      assetDigest: `sha256:${digest(asset)}`
    },
    realizedRoi,
    projectedRoi,
    semanticReuseMultiplicity: consumers,
    law: 'FRONTIER_OUTPUT_LENGTH_IS_NOT_VALUE; REALIZED_REUSABLE_VERIFIED_COGNITION_IS_VALUE'
  });
}

export function compareCounterfactualRoutes({
  chosen,
  alternatives = [],
  qualityWeight = 1_000_000,
  costWeight = 1,
  latencyWeight = 0
} = {}) {
  const normalizeRoute = (raw, label) => {
    const quality = finite(raw?.quality, 0, 1);
    const costUsd = finite(raw?.costUsd, 0, 1_000_000);
    const latencyMs = finite(raw?.latencyMs ?? 0, 0, 86_400_000);
    if (quality == null || costUsd == null || latencyMs == null) return null;
    return { label, quality, costUsd, latencyMs };
  };

  const selected = normalizeRoute(chosen, 'CHOSEN');
  const candidates = alternatives.map((row, index) => normalizeRoute(row, text(row?.routeId || `ALT_${index + 1}`, 120))).filter(Boolean);
  if (!selected || candidates.length !== alternatives.length) {
    return fail('COUNTERFACTUAL_ROUTE_COMPARISON_REFUSED', ['complete-route-quality-cost-latency-required']);
  }

  const qWeight = finite(qualityWeight, 1, 1_000_000_000);
  const cWeight = finite(costWeight, 0, 1_000_000);
  const lWeight = finite(latencyWeight, 0, 1_000_000);
  if ([qWeight, cWeight, lWeight].some(v => v == null)) {
    return fail('COUNTERFACTUAL_ROUTE_COMPARISON_REFUSED', ['valid-utility-weights-required']);
  }

  const utility = route =>
    (route.quality * qWeight) -
    (route.costUsd * cWeight) -
    ((route.latencyMs / 1000) * lWeight);

  const chosenUtility = utility(selected);
  const ranked = candidates
    .map(route => ({ ...route, utility: utility(route) }))
    .sort((a, b) => b.utility - a.utility || a.costUsd - b.costUsd || a.label.localeCompare(b.label));

  const bestAlternative = ranked[0] || null;
  const regret = bestAlternative ? Math.max(0, bestAlternative.utility - chosenUtility) : 0;
  const qualityRegret = bestAlternative ? Math.max(0, bestAlternative.quality - selected.quality) : 0;

  return envelope({
    ok: true,
    status: regret > 0 ? 'ROUTING_REGRET_OBSERVED' : 'NO_POSITIVE_ROUTING_REGRET_OBSERVED',
    chosen: { ...selected, utility: chosenUtility },
    bestAlternative,
    routingRegret: regret,
    qualityRegret,
    costRegretUsd: bestAlternative && bestAlternative.quality >= selected.quality
      ? Math.max(0, selected.costUsd - bestAlternative.costUsd)
      : 0,
    law: 'QUALITY_REGRET_DOMINATES_COST_REGRET; CHEAPER_IS_NOT_BETTER_IF_QUALITY_IS_LOWER'
  });
}

export function proposeSuperoptimizationCandidate({
  candidateArchitectureId,
  parentArchitectureId,
  mutations = [],
  expectedCostReductionUsd,
  expectedLatencyReductionMs = 0,
  affectedQualityTypes = []
} = {}) {
  const candidate = text(candidateArchitectureId, 240);
  const parent = text(parentArchitectureId, 240);
  const costReduction = finite(expectedCostReductionUsd, 0, 1_000_000_000);
  const latencyReduction = finite(expectedLatencyReductionMs, 0, 86_400_000);
  const mutationList = unique(mutations.map(v => text(v, 500)));
  const qualityTypes = unique(affectedQualityTypes.map(v => text(v, 80).toUpperCase()));

  if (!candidate || !parent || candidate === parent || !mutationList.length || costReduction == null || latencyReduction == null || !qualityTypes.length) {
    return fail('SUPEROPTIMIZATION_CANDIDATE_REFUSED', ['complete-distinct-candidate-parent-mutations-quality-and-benefit-required']);
  }

  const body = {
    candidateArchitectureId: candidate,
    parentArchitectureId: parent,
    mutations: mutationList,
    expectedCostReductionUsd: costReduction,
    expectedLatencyReductionMs: latencyReduction,
    affectedQualityTypes: qualityTypes
  };

  return envelope({
    ok: true,
    status: 'SUPEROPTIMIZATION_CANDIDATE_SHADOW_ONLY',
    candidate: {
      ...body,
      candidateDigest: `sha256:${digest(body)}`
    },
    executionAuthority: 'SHADOW_ONLY',
    promotionAuthority: 'NONE',
    requiredEvidence: [
      'fresh sealed paired evaluation',
      'zero paired task regressions',
      'no false-positive regression',
      'canonical zero-loss certificate',
      'real all-in cost receipt'
    ]
  });
}

export function assessSuperoptimizationPromotion({
  candidate,
  zeroLossCertificate,
  observedAllInCostUsd,
  parentAllInCostUsd,
  minimumTaskCount = 100
} = {}) {
  if (!candidate?.candidateArchitectureId) {
    return fail('SUPEROPTIMIZATION_PROMOTION_REFUSED', ['candidate-required']);
  }
  const observed = finite(observedAllInCostUsd, 0, 1_000_000_000);
  const parent = finite(parentAllInCostUsd, 0, 1_000_000_000);
  const minTasks = integer(minimumTaskCount, 1, 1_000_000);
  if (observed == null || parent == null || minTasks == null) {
    return fail('SUPEROPTIMIZATION_PROMOTION_REFUSED', ['valid-costs-and-task-count-required']);
  }

  const zeroLoss = validateCanonicalZeroLossCertificate(zeroLossCertificate, {
    expectedCandidateArchitectureId: candidate.candidateArchitectureId,
    minimumTaskCount: minTasks
  });

  const cheaper = observed < parent;
  const reasons = [];
  if (!zeroLoss.ok) reasons.push(...zeroLoss.reasonCodes);
  if (!cheaper) reasons.push('candidate-not-cheaper-than-parent');

  const eligible = reasons.length === 0;
  return envelope({
    ok: true,
    status: eligible ? 'SUPEROPTIMIZATION_PROMOTION_ELIGIBLE' : 'SUPEROPTIMIZATION_REMAINS_SHADOW',
    eligible,
    reasonCodes: unique(reasons),
    observedAllInCostUsd: observed,
    parentAllInCostUsd: parent,
    realizedSavingsUsd: Math.max(0, parent - observed),
    zeroLossCertificationDigest: zeroLoss.ok ? zeroLoss.certificationDigest : null,
    automaticPromotionAuthorized: false,
    law: 'THE_OPTIMIZER_MAY_DISCOVER_A_CHEAPER_PROGRAM_BUT_CANNOT_SELF_PROMOTE_WITHOUT_CANONICAL_ZERO_LOSS_EVIDENCE'
  });
}

export function computeFrontierResidualRatio({
  directBaselineFrontierUsd,
  compiledFrontierUsd
} = {}) {
  const direct = finite(directBaselineFrontierUsd, 0.000000001, 1_000_000_000);
  const compiled = finite(compiledFrontierUsd, 0, 1_000_000_000);
  if (direct == null || compiled == null) {
    return fail('FRONTIER_RESIDUAL_RATIO_REFUSED', ['positive-direct-baseline-and-valid-compiled-cost-required']);
  }
  const ratio = compiled / direct;
  return envelope({
    ok: true,
    status: 'FRONTIER_RESIDUAL_RATIO_COMPUTED',
    directBaselineFrontierUsd: direct,
    compiledFrontierUsd: compiled,
    frontierResidualRatio: ratio,
    referenceCompressionFactor: compiled === 0 ? Number.POSITIVE_INFINITY : direct / compiled,
    interpretation: ratio === 0
      ? 'NO_FRONTIER_PRICED_SEMANTIC_RESIDUAL_OBSERVED_FOR_THIS_MEASURED_CASE'
      : 'LOWER_IS_BETTER_ONLY_WHEN_PAIRED_FINAL_QUALITY_IS_NON_REGRESSED'
  });
}
