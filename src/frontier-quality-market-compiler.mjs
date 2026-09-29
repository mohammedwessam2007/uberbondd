import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import {
  ABSOLUTE_FRONTIER_QUALITY_POLICY_DIGEST,
  qualityInvariantAttestation
} from './absolute-frontier-quality-invariant.mjs';

export const FRONTIER_QUALITY_MARKET_COMPILER_VERSION = 'uberbond.frontier-quality-market-compiler.v1';
export const DEFAULT_MONTHLY_BUDGET_USD = 20;

const ADVERSARIAL_ROLES = Object.freeze([
  'FALSIFIER',
  'FRAMEBREAKER',
  'COUNTERFACTUAL',
  'MINORITY_PRESERVER',
  'EVIDENCE_HUNTER'
]);

const text = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
const finite = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max ? Number(value) : null;
const integer = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(Number(value)) && Number(value) >= min && Number(value) <= max ? Number(value) : null;
const zeroEffects = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const stable = value => Array.isArray(value) ? value.map(stable) : (!value || typeof value !== 'object') ? value : Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
const digest = value => crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');

function envelope(extra = {}) {
  return {
    compilerVersion: FRONTIER_QUALITY_MARKET_COMPILER_VERSION,
    absoluteQualityInvariant: qualityInvariantAttestation(),
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    ...extra
  };
}
function fail(status, reasonCodes, extra = {}) {
  return envelope({ ok: false, status, reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))], ...extra });
}

function normalizeCandidate(raw, taskClass) {
  const candidateId = text(raw?.candidateId, 200);
  const model = text(raw?.model, 240);
  const transport = text(raw?.transport || 'openrouter', 80).toLowerCase();
  const taskClasses = Array.isArray(raw?.taskClasses) ? raw.taskClasses.map(x => text(x, 120)).filter(Boolean) : [];
  const lineage = text(raw?.lineage || raw?.providerFamily || model.split('/')[0], 120).toLowerCase();
  const quality = finite(raw?.qualityEvidence?.score, 0, 1);
  const reliability = finite(raw?.qualityEvidence?.reliability, 0, 1);
  const evidenceConfidence = finite(raw?.qualityEvidence?.evidenceConfidence, 0, 1);
  const input = finite(raw?.pricing?.inputUsdPerMillion, 0, 1_000_000);
  const output = finite(raw?.pricing?.outputUsdPerMillion, 0, 1_000_000);
  const sourceRef = text(raw?.pricing?.sourceRef, 500);
  const verifiedAt = text(raw?.pricing?.verifiedAt, 80);
  const correlationGroup = text(raw?.errorCorrelationGroup || lineage, 120).toLowerCase();
  if (!candidateId || !model || !lineage || quality == null || reliability == null || evidenceConfidence == null || input == null || output == null || !sourceRef || !Number.isFinite(Date.parse(verifiedAt))) return null;
  if (taskClasses.length && !taskClasses.includes(taskClass) && !taskClasses.includes('general')) return null;
  return {
    candidateId,
    model,
    transport,
    lineage,
    correlationGroup,
    quality,
    reliability,
    evidenceConfidence,
    pricing: {
      inputUsdPerMillion: input,
      outputUsdPerMillion: output,
      ...(raw?.pricing?.cacheReadUsdPerMillion != null && finite(raw.pricing.cacheReadUsdPerMillion, 0, 1_000_000) != null ? { cacheReadUsdPerMillion: Number(raw.pricing.cacheReadUsdPerMillion) } : {}),
      sourceRef,
      verifiedAt: new Date(Date.parse(verifiedAt)).toISOString()
    }
  };
}

function estimatedCallUsd(candidate, { inputTokens, outputTokens, cachedInputTokens = 0 }) {
  const cached = Math.min(inputTokens, cachedInputTokens);
  const fresh = inputTokens - cached;
  const cacheRate = candidate.pricing.cacheReadUsdPerMillion ?? candidate.pricing.inputUsdPerMillion;
  return ((fresh * candidate.pricing.inputUsdPerMillion) + (cached * cacheRate) + (outputTokens * candidate.pricing.outputUsdPerMillion)) / 1_000_000;
}

export function compilePreInferenceRoleAuction({
  taskClass,
  candidates = [],
  initialAgentCount = 2,
  maximumAgentCount = 32,
  estimatedInputTokensPerAgent = 3000,
  estimatedOutputTokensPerAgent = 600,
  estimatedCachedInputTokensPerAgent = 0,
  minimumEvidenceConfidence = 0.8
} = {}) {
  const klass = text(taskClass, 120);
  const initialN = integer(initialAgentCount, 1, 64);
  const maxN = integer(maximumAgentCount, 1, 128);
  const inTokens = integer(estimatedInputTokensPerAgent, 1, 10_000_000);
  const outTokens = integer(estimatedOutputTokensPerAgent, 1, 10_000_000);
  const cachedTokens = integer(estimatedCachedInputTokensPerAgent, 0, 10_000_000);
  const minConfidence = finite(minimumEvidenceConfidence, 0, 1);
  if (!klass || initialN == null || maxN == null || initialN > maxN || inTokens == null || outTokens == null || cachedTokens == null || cachedTokens > inTokens || minConfidence == null) {
    return fail('FRONTIER_MARKET_AUCTION_REFUSED', ['valid-bounded-auction-policy-required']);
  }

  const normalized = candidates.map(raw => normalizeCandidate(raw, klass)).filter(Boolean)
    .filter(row => row.evidenceConfidence >= minConfidence);
  if (!normalized.length) return fail('FRONTIER_MARKET_AUCTION_BLOCKED', ['evidence-backed-candidate-required']);

  const cheapest = Math.min(...normalized.map(row => estimatedCallUsd(row, { inputTokens: inTokens, outputTokens: outTokens, cachedInputTokens: cachedTokens })));
  const scored = normalized.map(row => {
    const costUsd = estimatedCallUsd(row, { inputTokens: inTokens, outputTokens: outTokens, cachedInputTokens: cachedTokens });
    const costRatio = cheapest > 0 ? cheapest / Math.max(costUsd, 1e-12) : (costUsd === 0 ? 1 : 0);
    const score = (row.quality * 0.55) + (row.reliability * 0.25) + (row.evidenceConfidence * 0.10) + (Math.min(1, costRatio) * 0.10);
    return { ...row, estimatedCallUsd: costUsd, routingScore: score };
  }).sort((a, b) => b.routingScore - a.routingScore || a.estimatedCallUsd - b.estimatedCallUsd || a.candidateId.localeCompare(b.candidateId));

  const selected = [];
  const usedCorrelationGroups = new Set();
  for (const row of scored) {
    if (selected.length >= initialN) break;
    if (usedCorrelationGroups.has(row.correlationGroup) && scored.some(other => !usedCorrelationGroups.has(other.correlationGroup) && !selected.includes(other))) continue;
    selected.push(row);
    usedCorrelationGroups.add(row.correlationGroup);
  }
  for (const row of scored) {
    if (selected.length >= initialN) break;
    if (!selected.includes(row)) selected.push(row);
  }

  return envelope({
    ok: true,
    status: 'FRONTIER_MARKET_PREINFERENCE_ROUTE_READY',
    taskClass: klass,
    initialAgents: selected.map(row => ({
      candidateId: row.candidateId,
      model: row.model,
      transport: row.transport,
      lineage: row.lineage,
      correlationGroup: row.correlationGroup,
      estimatedCallUsd: row.estimatedCallUsd,
      pricing: row.pricing
    })),
    expansionPool: scored.filter(row => !selected.includes(row)).slice(0, Math.max(0, maxN - selected.length)).map(row => ({
      candidateId: row.candidateId,
      model: row.model,
      transport: row.transport,
      lineage: row.lineage,
      correlationGroup: row.correlationGroup,
      estimatedCallUsd: row.estimatedCallUsd,
      pricing: row.pricing
    })),
    initialAgentCount: selected.length,
    maximumAgentCount: maxN,
    estimatedInitialSwarmUsd: selected.reduce((sum, row) => sum + row.estimatedCallUsd, 0),
    authority: 'EXPLORATION_ONLY',
    law: 'PREINFERENCE_ROUTING_MAY_REDUCE_SEARCH_COST_BUT_NEVER_GRANTS_SEMANTIC_AUTHORITY_OR_LOWERS_THE_FRONTIER_QUALITY_FLOOR'
  });
}

export function decideAdaptiveExpansion({
  completedAgents = [],
  currentAgentCount,
  maximumAgentCount,
  disagreement = 0,
  uncertainty = 0,
  evidenceConflict = false,
  frontierRequired = false
} = {}) {
  const current = integer(currentAgentCount ?? completedAgents.length, 0, 128);
  const maximum = integer(maximumAgentCount, 1, 128);
  const d = finite(disagreement, 0, 1);
  const u = finite(uncertainty, 0, 1);
  if (current == null || maximum == null || current > maximum || d == null || u == null) return fail('ADAPTIVE_N_REFUSED', ['valid-adaptive-n-state-required']);

  if (frontierRequired) {
    return envelope({ ok: true, status: 'ESCALATE_TO_FRONTIER_CROWN', nextAgentCount: current, reasonCodes: ['frontier-required-by-policy'], semanticAuthority: 'FRONTIER_ONLY' });
  }
  if (d === 0 && u <= 0.15 && !evidenceConflict) {
    return envelope({ ok: true, status: 'CHEAP_SWARM_STOP_SEARCH', nextAgentCount: current, reasonCodes: ['low-disagreement-low-uncertainty'], semanticAuthority: 'NONE' });
  }
  if (current >= maximum) {
    return envelope({ ok: true, status: 'ESCALATE_TO_FRONTIER_CROWN', nextAgentCount: current, reasonCodes: ['adaptive-n-ceiling-reached'], semanticAuthority: 'FRONTIER_ONLY' });
  }
  const pressure = Math.max(d, u, evidenceConflict ? 1 : 0);
  const multiplier = pressure >= 0.75 ? 2 : 1.5;
  const next = Math.min(maximum, Math.max(current + 1, Math.ceil(Math.max(1, current) * multiplier)));
  return envelope({
    ok: true,
    status: 'EXPAND_CHEAP_SWARM',
    nextAgentCount: next,
    additionalAgents: next - current,
    reasonCodes: [evidenceConflict ? 'evidence-conflict' : d >= u ? 'disagreement' : 'uncertainty'],
    semanticAuthority: 'NONE'
  });
}

export function compileAdversarialSynthesis({
  claimIds = [],
  minorityClaimIds = [],
  evidenceRefs = [],
  artifactRefs = [],
  disputedClaimIds = []
} = {}) {
  const claims = [...new Set(claimIds.map(x => text(x, 240)).filter(Boolean))];
  const minority = [...new Set(minorityClaimIds.map(x => text(x, 240)).filter(Boolean))];
  const disputed = [...new Set(disputedClaimIds.map(x => text(x, 240)).filter(Boolean))];
  const evidence = [...new Set(evidenceRefs.map(x => text(x, 1000)).filter(Boolean))];
  const artifacts = [...new Set(artifactRefs.map(x => text(x, 1000)).filter(Boolean))];
  if (!claims.length) return fail('ADVERSARIAL_SYNTHESIS_REFUSED', ['claim-graph-required']);
  const unknown = [...minority, ...disputed].filter(id => !claims.includes(id));
  if (unknown.length) return fail('ADVERSARIAL_SYNTHESIS_REFUSED', ['minority-or-disputed-claim-not-in-claim-graph']);

  return envelope({
    ok: true,
    status: 'ADVERSARIAL_SYNTHESIS_PLAN_READY',
    roles: ADVERSARIAL_ROLES,
    claimIds: claims,
    minorityClaimIds: minority,
    disputedClaimIds: disputed,
    evidenceRefs: evidence,
    artifactRefs: artifacts,
    outputsRequired: [
      'claim-by-claim attack results',
      'strongest disconfirming evidence',
      'surviving minority hypotheses',
      'unresolved proposition set',
      'evidence gaps that could change the final decision'
    ],
    majorityVoteAuthority: 'NONE',
    synthesisAuthority: 'NONE',
    frontierEscalationInput: 'UNRESOLVED_ATOMS_ONLY',
    law: 'CONSENSUS_IS_NOT_TRUTH; CHEAP_AGENTS_ATTACK_AND_COMPRESS_DISPUTES_BUT_CANNOT_SELF_CERTIFY_THE_FINAL_SEMANTIC_RESULT'
  });
}

export function compileLosslessFrontierDeltaPacket({
  missionId,
  baselineArtifactDigest,
  claimRecords = [],
  unresolvedClaimIds = [],
  evidenceRefs = [],
  artifactRefs = [],
  maximumInlineBytes = 12_000
} = {}) {
  const id = text(missionId, 240);
  const baselineDigest = text(baselineArtifactDigest, 128).toLowerCase();
  const maxBytes = integer(maximumInlineBytes, 256, 100_000);
  if (!id || !/^[a-f0-9]{64}$/.test(baselineDigest) || maxBytes == null) return fail('FRONTIER_DELTA_PACKET_REFUSED', ['mission-id-baseline-digest-and-bounded-inline-limit-required']);

  const rawRows = Array.isArray(claimRecords) ? claimRecords : [];
  const rows = rawRows.map(row => {
    const claimIdRaw = String(row?.claimId ?? '');
    const exactClaimRaw = String(row?.exactClaim ?? '');
    const stateRaw = String(row?.state ?? '');
    const evidenceRaw = Array.isArray(row?.evidenceRefs) ? row.evidenceRefs.map(x => String(x ?? '')) : [];
    if (!claimIdRaw.trim() || claimIdRaw.length > 240 || !exactClaimRaw.trim() || exactClaimRaw.length > 100_000 || !stateRaw.trim() || stateRaw.length > 80 || evidenceRaw.some(ref => !ref.trim() || ref.length > 4000)) return null;
    return {
      claimId: claimIdRaw,
      exactClaim: exactClaimRaw,
      state: stateRaw.toUpperCase(),
      evidenceRefs: evidenceRaw
    };
  });
  if (!rows.length || rows.some(row => row == null)) return fail('FRONTIER_DELTA_PACKET_REFUSED', ['complete-bounded-exact-claim-records-required']);
  const unresolved = [...new Set(unresolvedClaimIds.map(x => text(x, 240)).filter(Boolean))];
  const byId = new Map(rows.map(row => [row.claimId, row]));
  if (unresolved.some(id => !byId.has(id))) return fail('FRONTIER_DELTA_PACKET_REFUSED', ['unresolved-claim-missing-from-exact-records']);

  const selected = unresolved.map(id => byId.get(id));
  const packet = {
    missionId: id,
    baselineArtifactDigest: baselineDigest,
    unresolvedClaims: selected,
    evidenceRefs: [...new Set(evidenceRefs.map(x => String(x ?? '')).filter(ref => ref.trim() && ref.length <= 4000))],
    artifactRefs: [...new Set(artifactRefs.map(x => String(x ?? '')).filter(ref => ref.trim() && ref.length <= 4000))],
    instruction: 'ADJUDICATE_ONLY_THE_UNRESOLVED_CLAIMS. RETURN_VERDICTS_OR_EXACT_PATCHES. DO_NOT_REWRITE_STABLE_ARTIFACT_CONTENT.'
  };
  const inlineBytes = Buffer.byteLength(JSON.stringify(packet), 'utf8');
  if (inlineBytes > maxBytes) {
    return fail('FRONTIER_DELTA_PACKET_REFUSED', ['frontier-delta-inline-budget-exceeded-use-artifact-references'], { inlineBytes, maximumInlineBytes: maxBytes });
  }

  return envelope({
    ok: true,
    status: 'LOSSLESS_FRONTIER_DELTA_PACKET_READY',
    packet,
    inlineBytes,
    packetDigest: digest(packet),
    compressionClass: 'LOSSLESS_REFERENCE_AND_EXACT_DELTA_ONLY',
    lossySummarizationAuthorized: false
  });
}

export function compileExactCacheDecision({
  requestDigest,
  sourceStateDigest,
  cachedRequestDigest,
  cachedSourceStateDigest,
  dataClass = 'PUBLIC',
  semanticSimilarityOnly = false
} = {}) {
  const req = text(requestDigest, 128).toLowerCase();
  const state = text(sourceStateDigest, 128).toLowerCase();
  const cachedReq = text(cachedRequestDigest, 128).toLowerCase();
  const cachedState = text(cachedSourceStateDigest, 128).toLowerCase();
  const klass = text(dataClass, 80).toUpperCase();
  const validDigest = value => /^[a-f0-9]{64}$/.test(value);
  if (![req, state, cachedReq, cachedState].every(validDigest)) return fail('EXACT_CACHE_REFUSED', ['cryptographic-request-and-source-state-digests-required']);
  if (semanticSimilarityOnly) {
    return envelope({ ok: true, status: 'SEMANTIC_CACHE_SHADOW_ONLY', reusableAsAuthority: false, reasonCodes: ['semantic-similarity-is-not-logical-equivalence'] });
  }
  const exact = req === cachedReq && state === cachedState;
  return envelope({
    ok: true,
    status: exact ? 'EXACT_CACHE_HIT_AUTHORITY_CANDIDATE' : 'EXACT_CACHE_MISS',
    reusableAsAuthority: exact,
    responseCacheEligible: exact && klass === 'PUBLIC',
    law: 'CACHE_AUTHORITY_REQUIRES_EXACT_REQUEST_AND_EXACT_SOURCE_STATE_IDENTITY; SEMANTIC_SIMILARITY_NEVER_CREATES_AUTHORITY'
  });
}

export function governMonthlyCognitionBudget({
  monthlyBudgetUsd = DEFAULT_MONTHLY_BUDGET_USD,
  spentUsd = 0,
  reservedUsd = 0,
  proposedUsd = 0,
  frontierQualityRequired = true
} = {}) {
  const budget = finite(monthlyBudgetUsd, 0, 1_000_000);
  const spent = finite(spentUsd, 0, 1_000_000);
  const reserved = finite(reservedUsd, 0, 1_000_000);
  const proposed = finite(proposedUsd, 0, 1_000_000);
  if ([budget, spent, reserved, proposed].some(value => value == null)) return fail('COGNITION_BUDGET_REFUSED', ['valid-budget-state-required']);
  const remaining = Math.max(0, budget - spent - reserved);
  if (proposed <= remaining) {
    return envelope({
      ok: true,
      status: 'COGNITION_SPEND_RESERVATION_ALLOWED',
      monthlyBudgetUsd: budget,
      spentUsd: spent,
      reservedUsd: reserved,
      proposedUsd: proposed,
      remainingAfterReservationUsd: remaining - proposed,
      qualityAction: 'UNCHANGED'
    });
  }
  return envelope({
    ok: true,
    status: 'QUEUE_FOR_BUDGET_NOT_QUALITY_DOWNGRADE',
    monthlyBudgetUsd: budget,
    spentUsd: spent,
    reservedUsd: reserved,
    proposedUsd: proposed,
    remainingUsd: remaining,
    frontierQualityRequired: frontierQualityRequired === true,
    qualityAction: 'DO_NOT_DOWNGRADE',
    allowedPressureRelief: ['QUEUE', 'DEFER', 'BATCH', 'WAIT_FOR_CHEAPER_EQUIVALENT_PROVIDER', 'EXACT_CACHE_REUSE', 'DETERMINISTIC_EXECUTION'],
    forbiddenPressureRelief: ['WEAKER_MODEL_AS_FINAL_AUTHORITY', 'LOSSY_CONTEXT_DROP', 'SKIP_REQUIRED_FRONTIER_ADJUDICATION'],
    law: 'WHEN_QUALITY_AND_BUDGET_ARE_FIXED_LATENCY_AND_THROUGHPUT_ABSORB_PRESSURE'
  });
}

export function compileOpenRouterProviderPolicy({
  sort = 'price',
  requireZdr = true,
  allowProviderFallbacks = true,
  maxPromptUsdPerMillion = null,
  maxCompletionUsdPerMillion = null,
  sessionId = ''
} = {}) {
  const normalizedSort = text(sort, 40).toLowerCase();
  if (!['price', 'throughput', 'latency'].includes(normalizedSort)) return fail('OPENROUTER_PROVIDER_POLICY_REFUSED', ['recognized-provider-sort-required']);
  const prompt = maxPromptUsdPerMillion == null ? null : finite(maxPromptUsdPerMillion, 0, 1_000_000);
  const completion = maxCompletionUsdPerMillion == null ? null : finite(maxCompletionUsdPerMillion, 0, 1_000_000);
  if (maxPromptUsdPerMillion != null && prompt == null) return fail('OPENROUTER_PROVIDER_POLICY_REFUSED', ['valid-prompt-price-ceiling-required']);
  if (maxCompletionUsdPerMillion != null && completion == null) return fail('OPENROUTER_PROVIDER_POLICY_REFUSED', ['valid-completion-price-ceiling-required']);
  return envelope({
    ok: true,
    status: 'OPENROUTER_PROVIDER_POLICY_READY',
    provider: {
      sort: normalizedSort,
      data_collection: 'deny',
      require_parameters: true,
      allow_fallbacks: allowProviderFallbacks === true,
      ...(requireZdr ? { zdr: true } : {}),
      ...(prompt != null || completion != null ? { max_price: { ...(prompt != null ? { prompt } : {}), ...(completion != null ? { completion } : {}) } } : {})
    },
    stickySessionId: text(sessionId, 240) || null,
    modelFallbacks: 'PROHIBITED_UNLESS_SEPARATELY_ZERO_LOSS_CERTIFIED',
    providerFailoverScope: 'SAME_MODEL_ONLY',
    policyDigest: ABSOLUTE_FRONTIER_QUALITY_POLICY_DIGEST
  });
}


export function compileSpeculativeReadOnlyPlan({
  missionId,
  operations = [],
  maximumOperations = 16
} = {}) {
  const id = text(missionId, 240);
  const max = integer(maximumOperations, 1, 64);
  if (!id || max == null || !Array.isArray(operations) || !operations.length || operations.length > max) {
    return fail('SPECULATIVE_READ_ONLY_PLAN_REFUSED', ['bounded-mission-and-operation-list-required']);
  }
  const forbiddenKinds = new Set(['MESSAGE', 'PURCHASE', 'DEPLOY', 'DNS_WRITE', 'CREDENTIAL_CHANGE', 'PAYMENT', 'PRODUCTION_MUTATION']);
  const normalized = operations.map((row, index) => ({
    operationId: text(row?.operationId || `spec-${index + 1}`, 240),
    kind: text(row?.kind, 80).toUpperCase(),
    targetRef: text(row?.targetRef, 1000),
    reversible: row?.reversible === true,
    readOnly: row?.readOnly === true
  }));
  const unsafe = normalized.filter(row => !row.operationId || !row.kind || !row.targetRef || !row.readOnly || !row.reversible || forbiddenKinds.has(row.kind));
  if (unsafe.length) {
    return fail('SPECULATIVE_READ_ONLY_PLAN_REFUSED', ['only-read-only-reversible-speculation-allowed'], {
      refusedOperationIds: unsafe.map(row => row.operationId)
    });
  }
  return envelope({
    ok: true,
    status: 'SPECULATIVE_READ_ONLY_PLAN_READY',
    missionId: id,
    operations: normalized,
    cancellationAuthority: 'NONE',
    consequenceAuthority: 'NONE',
    law: 'SPECULATION_MAY_PREFETCH_READ_ONLY_EVIDENCE_OR_RUN_REVERSIBLE_COMPUTATION_WHILE_FRONTIER_REASONING_PROCEEDS; IT_MAY_NOT_CAUSE_EXTERNAL_EFFECTS_OR_CANCEL_REQUIRED_FRONTIER_ADJUDICATION'
  });
}

export function compileShadowEscalationThresholdCandidate({
  taskClass,
  disagreementThreshold,
  uncertaintyThreshold,
  minimumSamples = 100,
  evidenceRef
} = {}) {
  const klass = text(taskClass, 120);
  const disagreement = finite(disagreementThreshold, 0, 1);
  const uncertainty = finite(uncertaintyThreshold, 0, 1);
  const samples = integer(minimumSamples, 20, 1_000_000);
  const evidence = text(evidenceRef, 1000);
  if (!klass || disagreement == null || uncertainty == null || samples == null || !evidence) {
    return fail('SHADOW_THRESHOLD_CANDIDATE_REFUSED', ['task-class-thresholds-samples-and-evidence-required']);
  }
  const candidate = {
    taskClass: klass,
    disagreementThreshold: disagreement,
    uncertaintyThreshold: uncertainty,
    minimumSamples: samples,
    evidenceRef: evidence
  };
  return envelope({
    ok: true,
    status: 'SHADOW_ESCALATION_THRESHOLD_CANDIDATE',
    candidate,
    candidateDigest: digest(candidate),
    routingAuthority: 'SHADOW_ONLY',
    promotionAuthority: 'NONE',
    requiredPromotionEvidence: [
      'fresh paired sealed evaluation',
      'zero paired task regressions',
      'no false-positive regression',
      'canonical zero-loss certificate'
    ],
    law: 'ONLINE_THRESHOLD_OPTIMIZATION_MAY_PROPOSE_CHEAPER_BOUNDARIES_BUT_CANNOT_SELF_PROMOTE_OR_RELAX_FRONTIER_ESCALATION'
  });
}
