// Business Genome + Opportunity Scoring Tournament + Promotion Ladder.
//
// This is deliberately the *leverage* layer, not a database of "300 verified
// money mechanisms." It never asserts market truth on its own -- every
// genome field the caller supplies must be tagged with an honest evidence
// classification (see CLAIM_CLASSIFICATIONS below), and the resulting score's
// confidence is capped by how much of that evidence is actually strong.
// Feeding it fabricated VERIFIED_FACT tags produces a wrong score; feeding it
// honestly-labeled ESTIMATE/HYPOTHESIS data produces a correctly low-confidence
// one. The module cannot tell the difference -- that discipline belongs to
// whatever populates a candidate, human or future research pass.

export const OPPORTUNITY_REGISTRY_POLICY_VERSION = 'opportunity-registry-1.0.0';

// The scoring policy above is intentionally separate from the canonical
// opportunity-record schema below.  The schema is a projection over the
// existing catalog and audit log, not a second opportunities database.
export const CANONICAL_OPPORTUNITY_REGISTRY_SCHEMA_VERSION = 'opportunity-registry-canonical-1.0.0';

export const CANONICAL_OPPORTUNITY_REQUIRED_FIELDS = Object.freeze([
  'opportunityId', 'mechanismName', 'buyer', 'payer', 'seller', 'painOrTrigger',
  'existingSpend', 'offer', 'pricingHypothesis', 'paymentTiming', 'acquisitionRoute',
  'fulfilmentRoute', 'recurringMechanism', 'retentionMechanism', 'expansionMechanism',
  'grossMarginHypothesis', 'founderBurden', 'automationPotential', 'capitalRequired',
  'platformDependency', 'regulatoryRisk', 'refundDisputeRisk', 'evidenceTier',
  'officialSourceOrProvenance', 'buyerEvidence', 'competitiveRisk',
  'implementationDistance', 'sharedCapabilityReuse', 'expectedTimeToFirstPayment',
  'killCondition', 'sevenDayExperiment', 'currentStatus', 'truthClassification'
]);

// Ordered weakest to strongest. Used only to compute confidence, never to
// infer a fact that wasn't actually supplied.
export const CLAIM_CLASSIFICATIONS = [
  'UNRESOLVED', 'HYPOTHESIS', 'ESTIMATE', 'INFERENCE', 'CREATOR_CLAIM',
  'OPERATOR_CLAIM', 'BUYER_SIGNAL', 'COMPANY_CLAIM', 'VERIFIED_FACT'
];

const CLAIM_STRENGTH = Object.fromEntries(CLAIM_CLASSIFICATIONS.map((name, i) => [name, i]));
const STRONG_CLAIM_THRESHOLD = CLAIM_STRENGTH.INFERENCE;

export const EVIDENCE_TIERS = [
  'TIER_0_CREATOR_ASSERTION', 'TIER_1_VISIBLE_OFFER', 'TIER_2_MULTIPLE_OPERATORS',
  'TIER_3_BUYER_REVIEWS', 'TIER_4_VERIFIED_TRANSACTIONS', 'TIER_5_PUBLIC_FINANCIALS'
];

export const PROMOTION_LADDER_STAGES = [
  'DISCOVERED', 'EVIDENCED', 'SCORED', 'PROPOSED', 'BUILT',
  'VERIFIED', 'SHADOW', 'CANARY', 'ECONOMICALLY_PROVEN', 'PROMOTED'
];

const GENOME_FIELDS = [
  'buyer', 'trigger', 'pain', 'existingSpend', 'offer', 'price', 'acquisition',
  'conversion', 'fulfilment', 'recurringTrigger', 'retention', 'expansion',
  'grossMargin', 'founderBurden', 'platformDependency', 'capital', 'regulation',
  'moat', 'dataAsset', 'automationPotential', 'failureMode'
];

const CANONICAL_SHARED_CAPABILITIES = Object.freeze([
  'market-signal-registry',
  'business-genome-extractor',
  'opportunity-registry',
  'opportunity-tournament',
  'commercial-experiment-engine',
  'distribution-partner-graph',
  'revenue-outcome-graph',
  'commercial-memory',
  'failure-memory',
  'self-upgrade-pipeline',
  'cloud-agent-relay',
  'consequence-boundary',
  'durable-queue'
]);

// Money Model Tournament: the 15 criteria the mission specifies. Each maps
// to one or more genome fields via an explicit, documented heuristic -- not
// a fabricated market benchmark.
const TOURNAMENT_CRITERIA = [
  'firstCash', 'recurringRevenue', 'grossMargin', 'automation', 'founderFreedom',
  'distribution', 'partnerLeverage', 'dataCompounding', 'platformIndependence',
  'capitalEfficiency', 'defensibility', 'aiResilience', 'globalScale',
  'acquisitionValue', 'founderOwnership'
];

const DEFAULT_WEIGHTS = Object.fromEntries(TOURNAMENT_CRITERIA.map(key => [key, 1 / TOURNAMENT_CRITERIA.length]));

const ENUM_SCORES = {
  maturity: { none: 0, emerging: 35, proven: 70, owned: 100 },
  leverage: { none: 0, light: 35, moderate: 65, strong: 100 },
  asset: { none: 0, some: 50, compounding: 100 },
  dependency: { high: 15, medium: 50, low: 90 }, // inverted: high dependency -> low independence score
  moat: { none: 0, weak: 30, moderate: 60, strong: 100 },
  resilience: { fragile: 15, moderate: 55, resilient: 95 },
  scale: { local: 15, regional: 40, national: 65, global: 100 },
  value: { low: 20, medium: 55, high: 90 },
  capitalNeed: { none: 100, low: 80, medium: 45, high: 10 } // inverted: high capital need -> low efficiency score
};

function clamp01to100(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, n));
}

// Unwraps { value, claimType } shape or a bare primitive (treated as
// UNRESOLVED -- the caller gets no confidence credit for an untagged claim).
function unwrap(field) {
  if (field == null) return { value: null, claimType: 'UNRESOLVED', present: false };
  if (typeof field === 'object' && !Array.isArray(field) && 'value' in field) {
    const claimType = CLAIM_CLASSIFICATIONS.includes(field.claimType) ? field.claimType : 'UNRESOLVED';
    return { value: field.value, claimType, present: field.value != null && field.value !== '' };
  }
  return { value: field, claimType: 'UNRESOLVED', present: field != null && field !== '' };
}

function enumScore(table, rawValue) {
  const unwrapped = unwrap(rawValue);
  if (!unwrapped.present) return { score: null, claimType: unwrapped.claimType };
  const key = String(unwrapped.value).toLowerCase();
  const score = Object.prototype.hasOwnProperty.call(table, key) ? table[key] : null;
  return { score, claimType: unwrapped.claimType };
}

function numericScore(rawValue, { invert = false } = {}) {
  const unwrapped = unwrap(rawValue);
  if (!unwrapped.present) return { score: null, claimType: unwrapped.claimType };
  const bounded = clamp01to100(unwrapped.value);
  if (bounded == null) return { score: null, claimType: unwrapped.claimType };
  return { score: invert ? 100 - bounded : bounded, claimType: unwrapped.claimType };
}

// Builds a normalized genome record from a raw candidate object. Unknown/
// missing fields are kept as explicit nulls rather than defaulted to a
// plausible-looking value -- a missing field must read as missing.
export function compileBusinessGenome(candidate = {}) {
  if (!candidate || typeof candidate !== 'object' || !candidate.id) {
    return { ok: false, reason: 'malformed-input-candidate', policyVersion: OPPORTUNITY_REGISTRY_POLICY_VERSION };
  }
  const fields = {};
  for (const key of GENOME_FIELDS) fields[key] = unwrap(candidate[key]);
  const populated = GENOME_FIELDS.filter(key => fields[key].present).length;
  return {
    ok: true,
    policyVersion: OPPORTUNITY_REGISTRY_POLICY_VERSION,
    id: candidate.id,
    name: candidate.name || candidate.id,
    category: candidate.category || 'UNCATEGORIZED',
    fields,
    completeness: Math.round((populated / GENOME_FIELDS.length) * 100),
    promotionStage: PROMOTION_LADDER_STAGES.includes(candidate.promotionStage) ? candidate.promotionStage : 'DISCOVERED'
  };
}

function canonicalClone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function canonicalClaim(value, claimType = 'UNRESOLVED') {
  const normalizedType = CLAIM_CLASSIFICATIONS.includes(claimType) ? claimType : 'UNRESOLVED';
  const present = value !== undefined && value !== null && value !== ''
    && !(Array.isArray(value) && value.length === 0);
  return {
    value: present ? canonicalClone(value) : 'UNRESOLVED',
    claimType: present ? normalizedType : 'UNRESOLVED'
  };
}

function candidateClaim(entry, key, fallback = 'UNRESOLVED') {
  const field = entry?.candidate?.[key];
  if (field && typeof field === 'object' && !Array.isArray(field) && 'value' in field) {
    return canonicalClaim(field.value, field.claimType);
  }
  return canonicalClaim(field ?? fallback, field == null ? 'UNRESOLVED' : 'HYPOTHESIS');
}

function sourceClaim(entry) {
  return entry?.evidence?.classification === 'BUYER_SIGNAL' ? 'BUYER_SIGNAL' : 'HYPOTHESIS';
}

function unresolved(value = 'UNRESOLVED') {
  return canonicalClaim(value, 'UNRESOLVED');
}

// Projects one catalog entry into the single canonical registry shape.  All
// values retain a claim classification; absent economic facts stay explicit
// UNRESOLVED rather than being filled with a plausible default.
export function normalizeCanonicalOpportunityRecord(entry, { index = 0 } = {}) {
  if (!entry || typeof entry !== 'object' || !String(entry.id || '').trim()) return null;
  const evidenceClaim = sourceClaim(entry);
  const buyerSegments = Array.isArray(entry.buyerSegments) ? entry.buyerSegments.filter(Boolean) : [];
  const buyerEvidence = Array.isArray(entry.observedBuyerSignals) ? entry.observedBuyerSignals : [];
  const existingSpend = buyerEvidence.length
    ? buyerEvidence.map(signal => ({
      amountUsd: Number.isFinite(Number(signal?.amountUsd)) ? Number(signal.amountUsd) : null,
      scope: signal?.scope || 'UNRESOLVED',
      source: signal?.source || null,
      claimType: 'BUYER_SIGNAL'
    }))
    : 'UNRESOLVED';
  const constraints = Array.isArray(entry.constraints) ? entry.constraints.filter(Boolean) : [];
  const regulatory = constraints.filter(item => /consent|jurisdiction|privacy|legal|law|regulat|terms|licens/i.test(String(item)));
  const refund = constraints.filter(item => /refund|dispute|chargeback|cancellation|credit/i.test(String(item)));
  const firstPayment = entry.firstRevenueWindowDays && typeof entry.firstRevenueWindowDays === 'object'
    ? entry.firstRevenueWindowDays
    : null;
  const killConditions = entry.taskBlueprint?.evaluator?.killConditions
    || entry.taskBlueprint?.killConditions
    || (Array.isArray(entry.sevenDayExperiment) ? entry.sevenDayExperiment.slice(-1) : []);
  const currentStatus = entry.verdict || 'UNRESOLVED';
  const commercialTruth = evidenceClaim === 'BUYER_SIGNAL'
    ? 'BUYER_SIGNAL_ONLY__NOT_PAYMENT_PROOF'
    : 'THREAD_HYPOTHESIS__NO_BUYER_OR_PAYMENT_PROOF';

  return {
    schemaVersion: CANONICAL_OPPORTUNITY_REGISTRY_SCHEMA_VERSION,
    opportunityId: String(entry.id),
    rank: Number.isInteger(entry.rank) ? entry.rank : 4 + Number(index || 0),
    mechanismName: canonicalClaim(entry.name || entry.id, 'OPERATOR_CLAIM'),
    category: entry.category || 'UNCATEGORIZED',
    buyer: canonicalClaim(buyerSegments, evidenceClaim),
    payer: canonicalClaim(buyerSegments, 'HYPOTHESIS'),
    seller: canonicalClaim('UberBond', 'OPERATOR_CLAIM'),
    painOrTrigger: canonicalClaim(entry.mechanism, evidenceClaim === 'BUYER_SIGNAL' ? 'INFERENCE' : 'HYPOTHESIS'),
    existingSpend: canonicalClaim(existingSpend, existingSpend === 'UNRESOLVED' ? 'UNRESOLVED' : 'BUYER_SIGNAL'),
    offer: canonicalClaim({
      mechanism: entry.mechanism || 'UNRESOLVED',
      deliverables: Array.isArray(entry.deliverables) ? entry.deliverables : []
    }, evidenceClaim === 'BUYER_SIGNAL' ? 'HYPOTHESIS' : 'HYPOTHESIS'),
    pricingHypothesis: canonicalClaim(entry.priceHypotheses || [], 'HYPOTHESIS'),
    paymentTiming: canonicalClaim(firstPayment || 'UNRESOLVED', firstPayment?.classification || 'UNRESOLVED'),
    acquisitionRoute: canonicalClaim(entry.candidate?.acquisition?.value || entry.candidate?.acquisition || 'UNRESOLVED', entry.candidate?.acquisition?.claimType || 'UNRESOLVED'),
    fulfilmentRoute: canonicalClaim({
      deliverables: Array.isArray(entry.deliverables) ? entry.deliverables : [],
      taskBlueprint: entry.taskBlueprint?.id || null
    }, 'OPERATOR_CLAIM'),
    recurringMechanism: canonicalClaim(entry.recurringRoute || entry.candidate?.recurringTrigger?.value || 'UNRESOLVED', entry.candidate?.recurringTrigger?.claimType || (entry.recurringRoute ? 'HYPOTHESIS' : 'UNRESOLVED')),
    retentionMechanism: candidateClaim(entry, 'retention', 'Recurring value review remains unverified'),
    expansionMechanism: unresolved('Expansion path requires accepted delivery and repeat-payment evidence'),
    grossMarginHypothesis: candidateClaim(entry, 'grossMargin', 'UNRESOLVED'),
    founderBurden: candidateClaim(entry, 'founderBurden', 'UNRESOLVED'),
    automationPotential: candidateClaim(entry, 'automationPotential', 'UNRESOLVED'),
    capitalRequired: canonicalClaim(entry.testCost || entry.candidate?.capital?.value || 'UNRESOLVED', entry.testCost?.classification || entry.candidate?.capital?.claimType || 'UNRESOLVED'),
    platformDependency: candidateClaim(entry, 'platformDependency', 'UNRESOLVED'),
    regulatoryRisk: canonicalClaim(regulatory.length ? regulatory : 'UNRESOLVED', regulatory.length ? 'INFERENCE' : 'UNRESOLVED'),
    refundDisputeRisk: canonicalClaim(refund.length ? refund : 'UNRESOLVED', refund.length ? 'INFERENCE' : 'UNRESOLVED'),
    evidenceTier: canonicalClaim(evidenceClaim === 'BUYER_SIGNAL' ? 'TIER_1_VISIBLE_OFFER' : 'TIER_0_CREATOR_ASSERTION', evidenceClaim),
    officialSourceOrProvenance: canonicalClaim(entry.evidence?.sources || [], evidenceClaim),
    buyerEvidence: canonicalClaim(buyerEvidence, evidenceClaim),
    competitiveRisk: canonicalClaim(entry.competitiveRisk || 'UNRESOLVED', entry.competitiveRisk ? 'INFERENCE' : 'UNRESOLVED'),
    implementationDistance: unresolved('UNRESOLVED until the required shared-capability slice is scored'),
    sharedCapabilityReuse: canonicalClaim(CANONICAL_SHARED_CAPABILITIES, 'OPERATOR_CLAIM'),
    expectedTimeToFirstPayment: canonicalClaim(firstPayment || 'UNRESOLVED', firstPayment?.classification || 'UNRESOLVED'),
    killCondition: canonicalClaim(killConditions, 'OPERATOR_CLAIM'),
    sevenDayExperiment: canonicalClaim(entry.sevenDayExperiment || [], 'OPERATOR_CLAIM'),
    currentStatus: canonicalClaim(currentStatus, 'OPERATOR_CLAIM'),
    truthClassification: canonicalClaim({
      evidence: evidenceClaim,
      commercial: commercialTruth,
      payment: 'EXTERNAL_PROOF_REQUIRED',
      execution: 'LOCAL_PREPARATION_ONLY'
    }, evidenceClaim),
    provenance: {
      origin: entry.origin || 'CORE_CATALOG',
      evidenceClassification: evidenceClaim,
      sourceCount: Array.isArray(entry.evidence?.sources) ? entry.evidence.sources.length : 0,
      catalogEntryDigest: canonicalClone(entry.id),
      rank: Number.isInteger(entry.rank) ? entry.rank : 4 + Number(index || 0)
    },
    externalEffectLedger: {
      providerCalls: 0, messages: 0, purchases: 0, deployments: 0,
      credentialChanges: 0, dnsChanges: 0, productionMutations: 0, spendCents: 0
    }
  };
}

export function validateCanonicalOpportunityRegistry(records = []) {
  const list = Array.isArray(records) ? records : [];
  const failures = [];
  const ids = new Set();
  list.forEach((record, index) => {
    if (!record || typeof record !== 'object') {
      failures.push({ index, reason: 'record-object-required' });
      return;
    }
    if (!record.opportunityId) failures.push({ index, reason: 'opportunity-id-required' });
    if (record.opportunityId && ids.has(record.opportunityId)) failures.push({ index, reason: 'duplicate-opportunity-id', opportunityId: record.opportunityId });
    if (record.opportunityId) ids.add(record.opportunityId);
    for (const field of CANONICAL_OPPORTUNITY_REQUIRED_FIELDS) {
      if (!(field in record)) failures.push({ index, opportunityId: record.opportunityId || null, reason: `required-field-missing:${field}` });
    }
    if (!Array.isArray(record.sevenDayExperiment?.value) || record.sevenDayExperiment.value.length < 7) {
      failures.push({ index, opportunityId: record.opportunityId || null, reason: 'seven-day-experiment-incomplete' });
    }
    if (!Array.isArray(record.officialSourceOrProvenance?.value) || record.officialSourceOrProvenance.value.length < 1) {
      failures.push({ index, opportunityId: record.opportunityId || null, reason: 'provenance-required' });
    }
  });
  return {
    ok: failures.length === 0,
    schemaVersion: CANONICAL_OPPORTUNITY_REGISTRY_SCHEMA_VERSION,
    count: list.length,
    uniqueIdCount: ids.size,
    failures
  };
}

function criterionScores(candidate) {
  const scores = {};
  scores.firstCash = numericScore(candidate.timeToCashDays, { invert: true });
  scores.recurringRevenue = (() => {
    const trigger = unwrap(candidate.recurringTrigger);
    const retention = numericScore(candidate.retention);
    const retentionPresent = retention.score != null;
    if (!trigger.present) return { score: retentionPresent ? retention.score * 0.5 : null, claimType: retention.claimType };
    return { score: retentionPresent ? retention.score : 40, claimType: retentionPresent ? retention.claimType : trigger.claimType };
  })();
  scores.grossMargin = numericScore(candidate.grossMargin);
  scores.automation = numericScore(candidate.automationPotential);
  scores.founderFreedom = numericScore(candidate.founderBurden, { invert: true });
  scores.distribution = enumScore(ENUM_SCORES.maturity, candidate.acquisition);
  scores.partnerLeverage = enumScore(ENUM_SCORES.leverage, candidate.partnerLeverage);
  scores.dataCompounding = enumScore(ENUM_SCORES.asset, candidate.dataAsset);
  scores.platformIndependence = enumScore(ENUM_SCORES.dependency, candidate.platformDependency);
  scores.capitalEfficiency = enumScore(ENUM_SCORES.capitalNeed, candidate.capital);
  scores.defensibility = enumScore(ENUM_SCORES.moat, candidate.moat);
  scores.aiResilience = enumScore(ENUM_SCORES.resilience, candidate.aiResilience);
  scores.globalScale = enumScore(ENUM_SCORES.scale, candidate.scale);
  scores.acquisitionValue = enumScore(ENUM_SCORES.value, candidate.acquisitionValue);
  scores.founderOwnership = numericScore(candidate.founderOwnershipRetainedPercent);
  return scores;
}

// Pure. Scores one candidate against the Money Model Tournament criteria.
// A criterion with no supplied evidence contributes 0 to the weighted sum
// (never a fabricated neutral guess) and is listed in `missingCriteria`, and
// the overall confidence is explicitly reduced -- there is no way to buy a
// high composite score with silence.
export function scoreOpportunity({ candidate, weights = DEFAULT_WEIGHTS, date = new Date() } = {}) {
  const referenceDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const timestamp = referenceDate.toISOString();
  if (!candidate || typeof candidate !== 'object' || !candidate.id) {
    return { ok: false, reason: 'malformed-input-candidate', policyVersion: OPPORTUNITY_REGISTRY_POLICY_VERSION, timestamp };
  }
  const genome = compileBusinessGenome(candidate);
  const raw = criterionScores(candidate);

  let weightedSum = 0;
  let weightTotal = 0;
  let strongEvidenceCount = 0;
  const breakdown = {};
  const missingCriteria = [];

  for (const key of TOURNAMENT_CRITERIA) {
    const weight = Number.isFinite(weights[key]) ? weights[key] : DEFAULT_WEIGHTS[key];
    const { score, claimType } = raw[key];
    breakdown[key] = { score: score ?? null, weight, claimType };
    if (score == null) { missingCriteria.push(key); continue; }
    weightedSum += score * weight;
    weightTotal += weight;
    if (CLAIM_STRENGTH[claimType] >= STRONG_CLAIM_THRESHOLD) strongEvidenceCount += 1;
  }

  const answeredFraction = weightTotal > 0 ? weightTotal / TOURNAMENT_CRITERIA.reduce((sum, key) => sum + (Number.isFinite(weights[key]) ? weights[key] : DEFAULT_WEIGHTS[key]), 0) : 0;
  const compositeScore = weightTotal > 0 ? Math.round((weightedSum / weightTotal) * answeredFraction) : 0;
  const evidenceFraction = TOURNAMENT_CRITERIA.length > 0 ? strongEvidenceCount / TOURNAMENT_CRITERIA.length : 0;
  const confidence = Math.round(answeredFraction * evidenceFraction * 100) / 100;
  const dataSufficiency = missingCriteria.length > TOURNAMENT_CRITERIA.length / 2 ? 'INSUFFICIENT'
    : confidence < 0.3 ? 'WEAK' : confidence < 0.6 ? 'MODERATE' : 'STRONG';

  return {
    ok: true,
    policyVersion: OPPORTUNITY_REGISTRY_POLICY_VERSION,
    timestamp,
    id: candidate.id,
    name: genome.name,
    category: genome.category,
    compositeScore,
    confidence,
    dataSufficiency,
    breakdown,
    missingCriteria,
    genomeCompleteness: genome.completeness,
    promotionStage: genome.promotionStage
  };
}

// Ranks candidates deterministically: composite score desc, then confidence
// desc, then id asc as a stable tiebreaker.
export function rankOpportunities(candidates = [], opts = {}) {
  const scored = (Array.isArray(candidates) ? candidates : [])
    .map(candidate => scoreOpportunity({ candidate, ...opts }))
    .filter(result => result.ok);
  return scored.sort((a, b) => (b.compositeScore - a.compositeScore) || (b.confidence - a.confidence) || a.id.localeCompare(b.id));
}

const LADDER_INDEX = Object.fromEntries(PROMOTION_LADDER_STAGES.map((stage, i) => [stage, i]));

// A stage can only advance one step at a time and only when the caller
// asserts the specific gate for that transition passed. This never inspects
// real-world state itself -- it only prevents skipping steps in the
// caller's own bookkeeping.
export function nextPromotionStage(currentStage, { gatePassed = false } = {}) {
  const index = LADDER_INDEX[currentStage];
  if (index == null) return { ok: false, reason: `unknown-stage:${currentStage}` };
  if (!gatePassed) return { ok: true, stage: currentStage, advanced: false };
  if (index === PROMOTION_LADDER_STAGES.length - 1) return { ok: true, stage: currentStage, advanced: false, reason: 'already-terminal' };
  return { ok: true, stage: PROMOTION_LADDER_STAGES[index + 1], advanced: true };
}

// 0 (fully reuses existing capabilities) to 1 (entirely new build surface).
// Existing/required capabilities are plain string tags the caller defines
// (e.g. from a manifest of real UberBond modules) -- this function does no
// discovery of its own.
export function incrementalBuildDistance(requiredCapabilities = [], existingCapabilities = []) {
  const required = Array.isArray(requiredCapabilities) ? requiredCapabilities.filter(Boolean) : [];
  if (required.length === 0) return { distance: 0, reused: [], missing: [] };
  const existingSet = new Set((Array.isArray(existingCapabilities) ? existingCapabilities : []).map(String));
  const reused = required.filter(cap => existingSet.has(String(cap)));
  const missing = required.filter(cap => !existingSet.has(String(cap)));
  return { distance: Math.round((missing.length / required.length) * 100) / 100, reused, missing };
}

export const TOURNAMENT_CRITERIA_LIST = TOURNAMENT_CRITERIA;

// Thin, optional persistence: reuses the existing auditLog writer instead of
// creating a parallel "opportunities" table/collection. Never required --
// every function above is pure and works without a store.
export async function logOpportunityEvaluation(store, result) {
  if (!store || typeof store.log !== 'function' || !result || !result.ok) return null;
  return store.log('opportunity_evaluation', {
    id: result.id, compositeScore: result.compositeScore, confidence: result.confidence,
    dataSufficiency: result.dataSufficiency, promotionStage: result.promotionStage,
    policyVersion: result.policyVersion
  });
}
