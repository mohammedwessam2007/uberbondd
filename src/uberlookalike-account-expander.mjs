// UberLookalike: bounded, explainable account-similarity expansion.
//
// This is candidate generation only. It intentionally excludes email/phone and
// other contact-route material from its feature vocabulary, preserves source
// provenance, and never grants permission to enrich or contact a candidate.

export const UBERLOOKALIKE_VERSION = 'uberbond.uberlookalike.v1';

const FORBIDDEN_FEATURE_KEYS = new Set([
  'email', 'emails', 'phone', 'phones', 'mobile', 'contact', 'contacts',
  'personalemail', 'privateemail', 'directdial'
]);

function text(value, max = 300) {
  return String(value ?? '').trim().slice(0, max);
}

function clamp(value, fallback = 0, min = 0, max = 1) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function normalizeTags(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(item => text(item, 100).toLowerCase())
    .filter(Boolean))].slice(0, 200);
}

function sanitizeFeatures(input = {}) {
  const result = {};
  for (const [key, value] of Object.entries(input && typeof input === 'object' ? input : {})) {
    const canonicalKey = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (FORBIDDEN_FEATURE_KEYS.has(canonicalKey)) continue;
    if (typeof value === 'number' && Number.isFinite(value)) result[key] = value;
    else if (typeof value === 'boolean') result[key] = value ? 1 : 0;
    else if (typeof value === 'string' && value.trim()) result[key] = value.trim().toLowerCase().slice(0, 160);
  }
  return result;
}

function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size && !B.size) return 0;
  let intersection = 0;
  for (const value of A) if (B.has(value)) intersection += 1;
  return intersection / (A.size + B.size - intersection || 1);
}

function featureSimilarity(a, b) {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  if (!keys.length) return 0;
  let score = 0;
  let weight = 0;
  for (const key of keys) {
    if (!(key in a) || !(key in b)) continue;
    const left = a[key];
    const right = b[key];
    weight += 1;
    if (typeof left === 'number' && typeof right === 'number') {
      const denominator = Math.max(Math.abs(left), Math.abs(right), 1);
      score += 1 - Math.min(1, Math.abs(left - right) / denominator);
    } else {
      score += left === right ? 1 : 0;
    }
  }
  return weight ? score / weight : 0;
}

function normalizeAccount(input = {}) {
  const accountId = text(input.accountId || input.id, 200);
  if (!accountId) throw new Error('UberLookalike accountId is required');
  const sourceUrl = text(input.sourceUrl, 700);
  const sourceType = text(input.sourceType || 'public', 80).toLowerCase();
  return {
    accountId,
    name: text(input.name, 240),
    domain: text(input.domain, 253).toLowerCase(),
    tags: normalizeTags(input.tags || input.categories || []),
    features: sanitizeFeatures(input.features || {}),
    sourceType,
    sourceUrl,
    confidence: clamp(input.confidence, 0.5),
    suppressed: input.suppressed === true
  };
}

function pairScore(seed, candidate) {
  const tagScore = jaccard(seed.tags, candidate.tags);
  const structured = featureSimilarity(seed.features, candidate.features);
  const domainClass = seed.domain && candidate.domain && seed.domain.split('.').slice(-1)[0] === candidate.domain.split('.').slice(-1)[0] ? 1 : 0;
  const score = 0.55 * tagScore + 0.40 * structured + 0.05 * domainClass;
  return {
    score: clamp(score),
    tagScore: clamp(tagScore),
    structuredFeatureScore: clamp(structured),
    domainClassScore: domainClass
  };
}

export function rankUberLookalikes({ seeds = [], candidates = [], minScore = 0.25, limit = 100 } = {}) {
  const normalizedSeeds = (Array.isArray(seeds) ? seeds : []).map(normalizeAccount);
  if (!normalizedSeeds.length) throw new Error('UberLookalike requires at least one seed account');
  const seedIds = new Set(normalizedSeeds.map(item => item.accountId));
  const threshold = clamp(minScore, 0.25);
  const maxResults = Math.max(1, Math.min(1000, Math.round(Number(limit) || 100)));
  const rows = [];

  for (const rawCandidate of (Array.isArray(candidates) ? candidates : [])) {
    const candidate = normalizeAccount(rawCandidate);
    if (seedIds.has(candidate.accountId) || candidate.suppressed) continue;
    const comparisons = normalizedSeeds.map(seed => ({ seedId: seed.accountId, ...pairScore(seed, candidate) }));
    comparisons.sort((a, b) => b.score - a.score || a.seedId.localeCompare(b.seedId));
    const best = comparisons[0];
    if (!best || best.score < threshold) continue;
    const meanTop = comparisons.slice(0, Math.min(3, comparisons.length)).reduce((sum, item) => sum + item.score, 0) / Math.min(3, comparisons.length);
    const confidenceAdjusted = clamp(meanTop * candidate.confidence);
    rows.push({
      accountId: candidate.accountId,
      name: candidate.name,
      domain: candidate.domain,
      similarityScore: Number(best.score.toFixed(4)),
      confidenceAdjustedScore: Number(confidenceAdjusted.toFixed(4)),
      bestSeedId: best.seedId,
      explanation: {
        tagSimilarity: Number(best.tagScore.toFixed(4)),
        structuredFeatureSimilarity: Number(best.structuredFeatureScore.toFixed(4)),
        domainClassSimilarity: best.domainClassScore
      },
      sourceType: candidate.sourceType,
      sourceUrl: candidate.sourceUrl,
      requiresIndependentQualification: true,
      businessEffectAuthority: 'NONE',
      externalEffectAuthority: 'NONE'
    });
  }

  rows.sort((a, b) => b.confidenceAdjustedScore - a.confidenceAdjustedScore || b.similarityScore - a.similarityScore || a.accountId.localeCompare(b.accountId));
  return {
    version: UBERLOOKALIKE_VERSION,
    seedCount: normalizedSeeds.length,
    candidateCount: Array.isArray(candidates) ? candidates.length : 0,
    returnedCount: Math.min(rows.length, maxResults),
    candidates: rows.slice(0, maxResults),
    forbiddenContactFeaturesIgnored: true,
    providerCalls: 0,
    externalEffects: 0,
    businessEffectAuthority: 'NONE',
    note: 'Similarity creates a research candidate only. It does not infer permission, contact information, or buying intent.'
  };
}
