import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const WALLBREAKER_POLICY_VERSION = 'wallbreaker-1.0.2';

export const FAILURE_CLASSES = Object.freeze([
  'WRONG_ASSUMPTION',
  'MISSING_EVIDENCE',
  'CAPABILITY_GAP',
  'IMPLEMENTATION_DEFECT',
  'PROVIDER_FAILURE',
  'AUTHORITY_BLOCK',
  'ECONOMIC_FAILURE',
  'ENVIRONMENT_CHANGE',
  'STOCHASTIC_FAILURE',
  'VERIFIER_FAILURE',
  'IMPOSSIBLE_CONSTRAINT',
  'UNKNOWN'
]);

export const COMPUTE_TIERS = Object.freeze(['CHEAP', 'STANDARD', 'DEEP', 'EXTREME']);

const HARD_STOP_FAILURES = new Set(['AUTHORITY_BLOCK', 'IMPOSSIBLE_CONSTRAINT']);
const RETRYABLE_FAILURES = new Set(['PROVIDER_FAILURE', 'STOCHASTIC_FAILURE']);

const FAILURE_COUNTERS = Object.freeze({
  WRONG_ASSUMPTION: ['invalidate-assumption', 'recompile-problem', 'expand-solution-families'],
  MISSING_EVIDENCE: ['gather-targeted-evidence', 'reduce-uncertainty', 'rerank-after-evidence'],
  CAPABILITY_GAP: ['query-capability-genome', 'benchmark-substitutes', 'compose-minimum-capability-set'],
  IMPLEMENTATION_DEFECT: ['localize-defect', 'repair-implementation', 'rerun-verifier'],
  PROVIDER_FAILURE: ['switch-provider', 'degrade-gracefully', 'retry-only-if-outcome-known-safe'],
  AUTHORITY_BLOCK: ['find-lawful-substitute', 'redesign-dependency', 'escalate-only-if-owner-authority-required'],
  ECONOMIC_FAILURE: ['reprice-or-repackage', 'reduce-cost', 'change-channel-or-segment', 'kill-if-negative-after-proof'],
  ENVIRONMENT_CHANGE: ['refresh-world-state', 'reopen-pruned-branches', 'rerank-under-new-conditions'],
  STOCHASTIC_FAILURE: ['bounded-retry', 'increase-sample-size', 'prefer-more-robust-candidate'],
  VERIFIER_FAILURE: ['repair-verifier', 'add-independent-check', 'withhold-success-claim'],
  IMPOSSIBLE_CONSTRAINT: ['prove-conflict', 'identify-relaxable-constraint', 'escalate-with-proof'],
  UNKNOWN: ['collect-failure-evidence', 'diversify-search', 'avoid-identical-retry']
});

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function list(value, maxItems = 30, maxLen = 240) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => text(item, maxLen)).filter(Boolean))].slice(0, maxItems);
}

function number(value, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function cloneZeroEffects() {
  return structuredClone(ZERO_EXTERNAL_EFFECTS);
}

function invalid(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: WALLBREAKER_POLICY_VERSION,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: cloneZeroEffects(),
    ...extra
  };
}

export function compileWallProblem(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return invalid(['problem-object-required']);
  }

  const objective = text(input.objective, 1000);
  const successCriteria = list(input.successCriteria, 30, 400);
  const hardConstraints = list(input.hardConstraints, 30, 400);
  const assumptions = list(input.assumptions, 50, 400);
  const unknowns = list(input.unknowns, 50, 400);
  const requiredCapabilities = list(input.requiredCapabilities, 50, 200);
  const ownerReservedAuthority = list(input.ownerReservedAuthority, 30, 300);

  const reasonCodes = [];
  if (!objective) reasonCodes.push('objective-required');
  if (!successCriteria.length) reasonCodes.push('success-criteria-required');

  const problem = {
    objective,
    successCriteria,
    hardConstraints,
    assumptions,
    unknowns,
    requiredCapabilities,
    ownerReservedAuthority,
    riskBudget: number(input.riskBudget, 5, 0, 10),
    maxSpendCents: Math.floor(number(input.maxSpendCents, 0, 0, 100_000_000)),
    maxFounderMinutes: number(input.maxFounderMinutes, 30, 0, 100_000),
    evidenceRefs: list(input.evidenceRefs, 100, 500)
  };

  if (reasonCodes.length) return invalid(reasonCodes, { problem });

  return {
    ok: true,
    policyVersion: WALLBREAKER_POLICY_VERSION,
    problemId: `wall_${digest(problem).slice(0, 24)}`,
    problem,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: cloneZeroEffects()
  };
}

function normalizeCandidate(input = {}, index = 0) {
  const id = text(input.id, 120) || `candidate-${index + 1}`;
  const family = text(input.family, 120) || 'unspecified';
  const mechanism = text(input.mechanism, 500);
  const requiredCapabilities = list(input.requiredCapabilities, 30, 200);
  const assumptions = list(input.assumptions, 30, 300);
  const constraintViolations = list(input.constraintViolations, 30, 300);
  const evidenceRefs = list(input.evidenceRefs, 60, 500);
  const reversible = input.reversible !== false;
  const successProbability = number(input.successProbability, 0, 0, 1);
  const expectedContributionCents = number(input.expectedContributionCents, 0, -100_000_000, 100_000_000);
  const costCents = number(input.costCents, 0, 0, 100_000_000);
  const founderMinutes = number(input.founderMinutes, 0, 0, 100_000);
  const risk = number(input.risk, 5, 0, 10);
  const evidenceStrength = number(input.evidenceStrength, 0, 0, 10);
  const novelty = number(input.novelty, 0, 0, 10);
  const robustness = number(input.robustness, 0, 0, 10);

  return {
    id,
    family,
    mechanism,
    requiredCapabilities,
    assumptions,
    constraintViolations,
    evidenceRefs,
    reversible,
    successProbability,
    expectedContributionCents,
    costCents,
    founderMinutes,
    risk,
    evidenceStrength,
    novelty,
    robustness,
    signature: digest({ family, mechanism, requiredCapabilities, assumptions }).slice(0, 32)
  };
}

export function scoreWallCandidate(input = {}, { problem = null, index = 0 } = {}) {
  const candidate = normalizeCandidate(input, index);
  const hardConstraintSet = new Set(problem?.hardConstraints || []);
  const violatedHardConstraints = candidate.constraintViolations.filter(item => hardConstraintSet.has(item));
  const authorityViolation = candidate.constraintViolations.some(item => /^authority:/i.test(item));
  const spendViolation = Boolean(problem) && candidate.costCents > Number(problem.maxSpendCents || 0);
  const founderMinuteViolation = Boolean(problem) && candidate.founderMinutes > Number(problem.maxFounderMinutes || 0);
  const riskViolation = Boolean(problem) && candidate.risk > Number(problem.riskBudget || 0);
  const mechanismMissing = !candidate.mechanism;

  const blocked = violatedHardConstraints.length > 0
    || authorityViolation
    || spendViolation
    || founderMinuteViolation
    || riskViolation
    || mechanismMissing;

  const netExpected = candidate.expectedContributionCents * candidate.successProbability - candidate.costCents;
  const founderDenominator = Math.max(1, candidate.founderMinutes + 1);
  const riskDenominator = 1 + candidate.risk / 5;
  const reversibilityBonus = candidate.reversible ? 6 : 0;
  const evidenceBonus = candidate.evidenceStrength * 3;
  const diversityBonus = candidate.novelty * 1.5;
  const robustnessBonus = candidate.robustness * 2.5;
  const economicScore = netExpected / founderDenominator / riskDenominator;
  const score = blocked ? Number.NEGATIVE_INFINITY : economicScore + reversibilityBonus + evidenceBonus + diversityBonus + robustnessBonus;

  const reasonCodes = [];
  if (violatedHardConstraints.length) reasonCodes.push('hard-constraint-violation');
  if (authorityViolation) reasonCodes.push('authority-boundary-violation');
  if (spendViolation) reasonCodes.push('spend-ceiling-violation');
  if (founderMinuteViolation) reasonCodes.push('founder-minute-ceiling-violation');
  if (riskViolation) reasonCodes.push('risk-budget-violation');
  if (mechanismMissing) reasonCodes.push('mechanism-unspecified');
  if (!candidate.evidenceRefs.length) reasonCodes.push('evidence-thin');

  return {
    candidate,
    eligible: !blocked,
    score: Number.isFinite(score) ? Math.round(score * 1000) / 1000 : null,
    netExpectedContributionCents: Math.round(netExpected),
    reasonCodes,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: cloneZeroEffects()
  };
}

export function classifyWallFailure(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return invalid(['failure-object-required']);
  }

  const suppliedClass = text(input.failureClass, 40).toUpperCase();
  let failureClass = FAILURE_CLASSES.includes(suppliedClass) ? suppliedClass : 'UNKNOWN';

  if (!FAILURE_CLASSES.includes(suppliedClass)) {
    if (input.impossibleConstraint === true) failureClass = 'IMPOSSIBLE_CONSTRAINT';
    else if (input.authorityDenied === true || input.permissionDenied === true) failureClass = 'AUTHORITY_BLOCK';
    else if (input.verifierInvalid === true) failureClass = 'VERIFIER_FAILURE';
    else if (input.environmentChanged === true) failureClass = 'ENVIRONMENT_CHANGE';
    else if (input.implementationError === true || input.testFailure === true) failureClass = 'IMPLEMENTATION_DEFECT';
    else if (input.missingCapability === true) failureClass = 'CAPABILITY_GAP';
    else if (input.providerUnavailable === true || input.rateLimited === true || input.quotaExhausted === true) failureClass = 'PROVIDER_FAILURE';
    else if (input.assumptionFalsified === true) failureClass = 'WRONG_ASSUMPTION';
    else if (input.missingEvidence === true) failureClass = 'MISSING_EVIDENCE';
    else if (input.economicFailure === true) failureClass = 'ECONOMIC_FAILURE';
    else if (input.stochasticFailure === true) failureClass = 'STOCHASTIC_FAILURE';
  }

  return {
    ok: true,
    policyVersion: WALLBREAKER_POLICY_VERSION,
    failureClass,
    candidateId: text(input.candidateId, 120) || null,
    failedSignature: text(input.failedSignature, 64) || null,
    evidenceRefs: list(input.evidenceRefs, 60, 500),
    invalidatedAssumptions: list(input.invalidatedAssumptions, 30, 300),
    discoveredConstraints: list(input.discoveredConstraints, 30, 300),
    missingCapabilities: list(input.missingCapabilities, 30, 200),
    safeToRetrySameMechanism: RETRYABLE_FAILURES.has(failureClass) && input.outcomeUncertain !== true,
    hardStop: HARD_STOP_FAILURES.has(failureClass),
    countermoveTypes: [...FAILURE_COUNTERS[failureClass]],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: cloneZeroEffects()
  };
}

export function deriveCountermoves(failureInput = {}) {
  const failure = classifyWallFailure(failureInput);
  if (!failure.ok) return failure;

  const capabilityQueries = failure.failureClass === 'CAPABILITY_GAP'
    ? failure.missingCapabilities.map(capability => ({ capability, query: `best approved implementations for ${capability}` }))
    : [];

  const forbidden = [];
  if (failure.failureClass === 'AUTHORITY_BLOCK') {
    forbidden.push('circumvent-permission', 'bypass-terms', 'impersonate-authority');
  }
  if (failure.failureClass === 'PROVIDER_FAILURE' && !failure.safeToRetrySameMechanism) {
    forbidden.push('blind-identical-retry');
  }

  return {
    ok: true,
    policyVersion: WALLBREAKER_POLICY_VERSION,
    failure,
    actions: failure.countermoveTypes.map((type, index) => ({
      id: `counter-${index + 1}`,
      type,
      priority: index + 1
    })),
    capabilityQueries,
    forbidden,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: cloneZeroEffects()
  };
}

function selectComputeTier({ eligibleCount, failureCount, unknownCount, hardStopCount }) {
  if (hardStopCount > 0) return 'STANDARD';
  if (failureCount >= 4 || unknownCount >= 8 || eligibleCount === 0) return 'EXTREME';
  if (failureCount >= 2 || unknownCount >= 4) return 'DEEP';
  if (eligibleCount >= 4) return 'STANDARD';
  return 'CHEAP';
}

export function planWallbreakerCycle(input = {}) {
  const compiled = input.problem?.problemId ? input.problem : compileWallProblem(input.problem || {});
  if (!compiled.ok) return compiled;

  const failures = Array.isArray(input.failures)
    ? input.failures.map(classifyWallFailure).filter(item => item.ok)
    : [];
  const failedSignatures = new Set(
    failures
      .filter(item => !item.safeToRetrySameMechanism)
      .map(item => item.failedSignature)
      .filter(Boolean)
  );
  const invalidatedAssumptions = new Set(failures.flatMap(item => item.invalidatedAssumptions));

  const scored = (Array.isArray(input.candidates) ? input.candidates : []).map((candidate, index) => {
    const score = scoreWallCandidate(candidate, { problem: compiled.problem, index });
    const repeatsFailedMechanism = failedSignatures.has(score.candidate.signature);
    const reliesOnInvalidatedAssumption = score.candidate.assumptions.some(item => invalidatedAssumptions.has(item));
    const eligible = score.eligible && !repeatsFailedMechanism && !reliesOnInvalidatedAssumption;
    return {
      ...score,
      eligible,
      reasonCodes: [...new Set([
        ...score.reasonCodes,
        ...(repeatsFailedMechanism ? ['failed-mechanism-not-changed'] : []),
        ...(reliesOnInvalidatedAssumption ? ['relies-on-falsified-assumption'] : [])
      ])]
    };
  });

  const eligible = scored.filter(item => item.eligible);
  const bestByFamily = new Map();
  for (const item of eligible.sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity) || a.candidate.id.localeCompare(b.candidate.id))) {
    if (!bestByFamily.has(item.candidate.family)) bestByFamily.set(item.candidate.family, item);
  }
  const diverseFrontier = [...bestByFamily.values()].sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
  const selected = diverseFrontier[0] || null;
  const fallbacks = diverseFrontier.slice(1, 6);
  const counterplans = failures.map(deriveCountermoves);
  const hardStopCount = failures.filter(item => item.hardStop).length;
  const computeTier = selectComputeTier({
    eligibleCount: eligible.length,
    failureCount: failures.length,
    unknownCount: compiled.problem.unknowns.length,
    hardStopCount
  });

  const missingCapabilities = [...new Set([
    ...compiled.problem.requiredCapabilities,
    ...failures.flatMap(item => item.missingCapabilities),
    ...eligible.flatMap(item => item.candidate.requiredCapabilities)
  ])];

  let status = 'SEARCH_REQUIRED';
  if (selected) status = 'CANDIDATE_SELECTED';
  if (hardStopCount > 0 && !selected) status = 'EXTERNAL_OR_AUTHORITY_BLOCK';

  const receiptCore = {
    problemId: compiled.problemId,
    selectedSignature: selected?.candidate.signature || null,
    fallbackSignatures: fallbacks.map(item => item.candidate.signature),
    failureClasses: failures.map(item => item.failureClass),
    computeTier,
    missingCapabilities
  };

  return {
    ok: true,
    policyVersion: WALLBREAKER_POLICY_VERSION,
    status,
    problem: compiled,
    candidateCount: scored.length,
    eligibleCount: eligible.length,
    familyCount: bestByFamily.size,
    selected,
    fallbacks,
    rejected: scored.filter(item => !item.eligible),
    failures,
    counterplans,
    missingCapabilities,
    computeTier,
    nextSearchInstruction: selected
      ? 'Execute only through existing consequence gates; on failure, record evidence and replan instead of blind retry.'
      : 'Generate materially different strategy families and/or acquire missing capabilities before attempting execution.',
    wallbreakerReceiptId: `wbr_${digest(receiptCore).slice(0, 24)}`,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: cloneZeroEffects()
  };
}
