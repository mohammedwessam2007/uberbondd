const COMPARISON_CATEGORIES = Object.freeze([
  'BOTH_ALLOW',
  'BOTH_DENY',
  'LEGACY_ALLOW_V9_DENY',
  'LEGACY_DENY_V9_ALLOW',
  'V9_INCOMPLETE',
  'V9_ERROR'
]);

/**
 * Classifies one legacy-vs-V9 decision pair into exactly one of the six
 * mandated comparison categories. This never resolves a disagreement — it
 * only labels it. LEGACY_DENY_V9_ALLOW is the category that must block
 * promotion until every instance is investigated.
 */
export function classifyComparison({ legacyEligible, v9Status, v9Decision }) {
  if (v9Status === 'SHADOW_ERROR') return 'V9_ERROR';
  if (v9Status === 'NO_HOOK') return 'V9_INCOMPLETE';
  if (v9Decision !== 'ALLOW' && v9Decision !== 'DENY') return 'V9_INCOMPLETE';

  const legacy = legacyEligible ? 'ALLOW' : 'DENY';
  if (legacy === 'ALLOW' && v9Decision === 'ALLOW') return 'BOTH_ALLOW';
  if (legacy === 'DENY' && v9Decision === 'DENY') return 'BOTH_DENY';
  if (legacy === 'ALLOW' && v9Decision === 'DENY') return 'LEGACY_ALLOW_V9_DENY';
  return 'LEGACY_DENY_V9_ALLOW';
}

export function isCriticalDisagreement(category) {
  return category === 'LEGACY_DENY_V9_ALLOW';
}

export { COMPARISON_CATEGORIES };
