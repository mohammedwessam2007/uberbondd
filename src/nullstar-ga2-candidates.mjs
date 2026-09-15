// GA2 candidates for the research bottleneck.
//
// The incumbent ranks on a fixed provenance ladder and nothing else, so a
// source that is high-provenance and stale beats a fresh replication. These
// four disagree about what quality even is, which is the point: if only the
// narrowest one wins, the gap was trivial rather than structural.

export const NULLSTAR_GA2_CANDIDATES_VERSION = 'uberbond.nullstar-ga2-candidates.v1';

const PROVENANCE = Object.freeze({
  REPLICATED_MEASUREMENT: 4,
  PRIMARY_MEASUREMENT: 3,
  SECONDHAND_SUMMARY: 1,
  UNSOURCED_ASSERTION: 0
});

const daysBetween = (from, to) => {
  const a = Date.parse(from);
  const b = Date.parse(to);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.abs(b - a) / 86400000 : 0;
};

const newest = sources => sources.reduce((best, source) =>
  (!best || String(source.observedAt) > String(best.observedAt) ? source : best), null);

/** R1. Prefer the most recent claim. Ignores provenance entirely. */
export function r1RecencyOnly(surface) {
  const sources = surface.sources ?? [];
  const best = newest(sources);
  return best ? String(best.claim) : null;
}

/**
 * R2. Provenance and freshness as separate axes.
 *
 * A stale primary and a fresh secondhand summary are different kinds of good,
 * and collapsing them onto one ladder is what the incumbent does wrong.
 */
export function r2TwoAxis(surface) {
  const sources = surface.sources ?? [];
  if (sources.length === 0) return null;
  const latest = newest(sources)?.observedAt;

  let best = null;
  let bestScore = -Infinity;
  for (const source of sources) {
    const provenance = PROVENANCE[source.quality] ?? 0;
    // Decay rather than a cliff: a week-old primary should still outrank a
    // fresh assertion, while a seven-year-old one should not.
    const ageDays = daysBetween(source.observedAt, latest);
    const freshness = 1 / (1 + ageDays / 30);
    const score = provenance * freshness;
    if (score > bestScore) { bestScore = score; best = source; }
  }
  return best ? String(best.claim) : null;
}

/**
 * R3. Weigh a claim by everything supporting it, discounting repetition.
 *
 * Three secondhand summaries carrying the same number are one claim repeated,
 * not three independent confirmations, so support is the best single source
 * plus a shrinking bonus for each additional one.
 */
export function r3Corroboration(surface) {
  const sources = surface.sources ?? [];
  if (sources.length === 0) return null;
  const latest = newest(sources)?.observedAt;

  const byClaim = new Map();
  for (const source of sources) {
    const key = String(source.claim);
    if (!byClaim.has(key)) byClaim.set(key, []);
    byClaim.get(key).push(source);
  }

  let best = null;
  let bestScore = -Infinity;
  for (const [claim, supporting] of byClaim) {
    const scores = supporting
      .map(source => {
        const provenance = PROVENANCE[source.quality] ?? 0;
        const freshness = 1 / (1 + daysBetween(source.observedAt, latest) / 30);
        return provenance * freshness;
      })
      .sort((a, b) => b - a);
    // Diminishing returns on repetition.
    const support = scores.reduce((sum, value, index) => sum + value / (index + 1), 0);
    if (support > bestScore) { bestScore = support; best = claim; }
  }
  return best;
}

/**
 * R4. Corroboration, but refuse when the top two are indistinguishable.
 *
 * Included to test whether refusal costs accuracy on items that do have an
 * answer. It should score slightly below R3 here, and that is informative.
 */
export function r4RefusalAware(surface) {
  const sources = surface.sources ?? [];
  if (sources.length === 0) return null;
  const latest = newest(sources)?.observedAt;

  const byClaim = new Map();
  for (const source of sources) {
    const key = String(source.claim);
    if (!byClaim.has(key)) byClaim.set(key, []);
    byClaim.get(key).push(source);
  }

  const ranked = [...byClaim.entries()].map(([claim, supporting]) => {
    const scores = supporting
      .map(source => (PROVENANCE[source.quality] ?? 0) * (1 / (1 + daysBetween(source.observedAt, latest) / 30)))
      .sort((a, b) => b - a);
    return { claim, support: scores.reduce((sum, value, index) => sum + value / (index + 1), 0) };
  }).sort((a, b) => b.support - a.support);

  if (ranked.length === 0) return null;
  if (ranked.length > 1 && Math.abs(ranked[0].support - ranked[1].support) < 0.05) return null;
  return ranked[0].claim;
}

export const GA2_CANDIDATES = Object.freeze({
  R1_RECENCY_ONLY: r1RecencyOnly,
  R2_TWO_AXIS: r2TwoAxis,
  R3_CORROBORATION: r3Corroboration,
  R4_REFUSAL_AWARE: r4RefusalAware
});
