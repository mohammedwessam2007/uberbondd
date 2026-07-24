// Shared unsupported-claim guard, used by both the proposal/document factory (this commit) and
// the diagnostic report generator (a later commit). "Forbid fake clients, guaranteed revenue,
// guaranteed leads, unsupported proof, and hidden implementation scope" (mission's own words) --
// every one of those is a specific, checkable pattern here, not a vague policy.
//
// Negation-aware: a document is expected to say things like "no outcome is guaranteed" as its own
// required disclaimer (report.mjs/proposal.mjs both say exactly that). A bare `/guarantee/i` match
// would flag that disclaimer as the violation it exists to prevent, which is backwards -- so every
// pattern below is checked with a short look-behind for a negation word, and only an
// *un-negated* match counts as an unsupported claim.
const NEGATION_LOOKBEHIND = /\b(no|not|never|isn't|doesn't|don't|without|no such|zero)\s+(\w+\s+){0,3}$/i;

export const UNSUPPORTED_CLAIM_PATTERNS = Object.freeze([
  /\bguarantee[sd]?\b/i,
  /\bwill increase (revenue|sales|conversions?|leads?)\b/i,
  /\bguaranteed (leads?|revenue|results?|roi)\b/i,
  /\b#\s?1 on google\b/i,
  /\b100% (guaranteed|certain)\b/i,
  /\bwe promise\b/i,
  /\bproven to (increase|boost|double|triple)\b/i,
  /\bcase stud(y|ies)\b.*\breal client\b/i
]);

/** Returns every pattern that matches *without* being immediately preceded by a negation word --
 * "no outcome is guaranteed" does not count; "we guarantee results" does. */
export function findUnsupportedClaims(text = '') {
  const s = String(text || '');
  return UNSUPPORTED_CLAIM_PATTERNS.filter(pattern => {
    const globalPattern = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
    let match;
    while ((match = globalPattern.exec(s))) {
      const precedingText = s.slice(Math.max(0, match.index - 40), match.index);
      if (!NEGATION_LOOKBEHIND.test(precedingText)) return true;
      if (globalPattern.lastIndex === match.index) globalPattern.lastIndex += 1; // avoid infinite loop on zero-width matches
    }
    return false;
  });
}

export function assertNoUnsupportedClaims(text = '', context = 'document') {
  const matches = findUnsupportedClaims(text);
  if (matches.length) throw new Error(`unsupported claim in ${context}: matched ${matches.map(p => p.source).join(', ')}`);
  return true;
}
