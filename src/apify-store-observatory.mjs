// Apify Store breakage observatory (experiment X2, pre-registered in
// artifacts/machiavelli/absolute-money-hunt/preregistration-2026-10-22.json).
// Pure functions over the public Store listing; the script does the reading.

export const DEFINITIONS = Object.freeze({
  leader: { minUsers30: 200, minRuns30: 1000, minFailShare: 0.2 },
  substitute: { maxFailShare: 0.05, minRuns30: 500, minUsers30: 50 },
  h2aMinBrokenLeaders: 25,
  h2bMaxAbsorbedShare: 0.7,
  absorbingSubstituteUserRatio: 0.5,
});

const STOPWORDS = new Set(['scraper', 'scrapers', 'scraping', 'scrape', 'actor', 'api', 'data', 'extractor', 'extract', 'crawler', 'crawl', 'the', 'and', 'for', 'with', 'from', 'to', 'of', 'a', 'an', 'in', 'on', 'by', 'all', 'fast', 'cheap', 'best', 'pro', 'lite', 'free', 'tool', 'v2', 'v3', 'new', 'advanced', 'ultimate', 'premium', 'plus', 'pay', 'per', 'result', 'results', 'only', 'no', 'cookies', 'login', 'ai', 'mcp', 'server']);

export function titleTokens(title = '') {
  return new Set(String(title).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(t => t.length > 1 && !STOPWORDS.has(t)));
}

export function compactActor(item) {
  const stats = item.stats ?? {};
  const runs = stats.publicActorRunStats30Days ?? {};
  return {
    id: `${item.username}/${item.name}`,
    title: item.title ?? '',
    categories: item.categories ?? [],
    pricingModel: item.currentPricingInfo?.pricingModel ?? 'FREE',
    notice: item.notice ?? 'NONE',
    users7: stats.totalUsers7Days ?? 0,
    users30: stats.totalUsers30Days ?? 0,
    users90: stats.totalUsers90Days ?? 0,
    totalUsers: stats.totalUsers ?? 0,
    runs30: runs.TOTAL ?? 0,
    failed30: runs.FAILED ?? 0,
    timedOut30: runs['TIMED-OUT'] ?? 0,
    aborted30: runs.ABORTED ?? 0,
    succeeded30: runs.SUCCEEDED ?? 0,
    rating: stats.actorReviewRating ?? null,
    reviews: stats.actorReviewCount ?? 0,
    lastRunStartedAt: stats.lastRunStartedAt ?? null,
  };
}

export function failShare(actor) {
  return actor.runs30 > 0 ? (actor.failed30 + actor.timedOut30) / actor.runs30 : null;
}

export function dedupeActors(actors) {
  const byId = new Map();
  for (const actor of actors) if (!byId.has(actor.id)) byId.set(actor.id, actor);
  return [...byId.values()];
}

const round = (x, d = 4) => (x === null ? null : Number(x.toFixed(d)));

export const STORE_OFFSET_CAP = 15_000;

// Amendment X2-A1: a partition that reached the offset cap is complete for
// this experiment only if its last page has no Actor at the substitute floor.
// partitions: [{ name, reachedCap, lastPageMaxUsers30 }]
export function completeness(partitions, defs = DEFINITIONS) {
  const floor = defs.substitute.minUsers30;
  const failing = partitions.filter(p => p.reachedCap && !(p.lastPageMaxUsers30 < floor)).map(p => p.name);
  return { complete: failing.length === 0 && partitions.length > 0, floor, failingPartitions: failing };
}

// Amendment X2-A2: completeness by direct enumeration. The Store reports
// items it never returns, so the attainable coverage is calibrated on
// categories that were fully enumerated (never reached the cap).
// partitions: [{ name, reachedCap, reportedTotal, distinct }]
export function enumerationCompleteness(partitions, { minCalibrationTotal = 1000, tolerance = 0.02 } = {}) {
  const calibration = partitions.filter(p => !p.reachedCap && p.name !== 'global' && p.reportedTotal >= minCalibrationTotal).map(p => p.distinct / p.reportedTotal).sort((a, b) => a - b);
  if (!calibration.length) return { complete: false, visibleFraction: null, failingPartitions: ['no calibration partitions'] };
  const mid = Math.floor(calibration.length / 2);
  const visibleFraction = calibration.length % 2 ? calibration[mid] : (calibration[mid - 1] + calibration[mid]) / 2;
  const needed = visibleFraction - tolerance;
  const checked = partitions.filter(p => p.reachedCap || p.name === 'global').map(p => ({ name: p.name, coverage: p.reportedTotal ? p.distinct / p.reportedTotal : 0 }));
  const failing = checked.filter(c => !(c.coverage >= needed)).map(c => c.name);
  const round = x => Number(x.toFixed(4));
  return { complete: failing.length === 0, visibleFraction: round(visibleFraction), needed: round(needed), coverage: checked.map(c => ({ ...c, coverage: round(c.coverage) })), failingPartitions: failing };
}

export function analyzeStore(actors, defs = DEFINITIONS, { complete = true } = {}) {
  const isLeader = a => a.users30 >= defs.leader.minUsers30 && a.runs30 >= defs.leader.minRuns30 && failShare(a) >= defs.leader.minFailShare;
  const isHealthy = a => a.runs30 >= defs.substitute.minRuns30 && a.users30 >= defs.substitute.minUsers30 && failShare(a) <= defs.substitute.maxFailShare;
  const healthyByCategory = new Map();
  for (const actor of actors) {
    if (!isHealthy(actor)) continue;
    const category = actor.categories[0] ?? 'UNCATEGORIZED';
    if (!healthyByCategory.has(category)) healthyByCategory.set(category, []);
    healthyByCategory.get(category).push({ actor, tokens: titleTokens(actor.title) });
  }
  const leaders = actors.filter(isLeader).map(leader => {
    const tokens = titleTokens(leader.title);
    const substitutes = (healthyByCategory.get(leader.categories[0] ?? 'UNCATEGORIZED') ?? [])
      .filter(({ actor, tokens: other }) => actor.id !== leader.id && [...tokens].some(t => other.has(t)))
      .map(({ actor }) => ({ id: actor.id, title: actor.title, users30: actor.users30, failShare: round(failShare(actor)) }))
      .sort((a, b) => b.users30 - a.users30);
    const absorbing = substitutes.filter(s => s.users30 >= defs.absorbingSubstituteUserRatio * leader.users30);
    return {
      id: leader.id, title: leader.title, category: leader.categories[0] ?? 'UNCATEGORIZED', pricingModel: leader.pricingModel, notice: leader.notice,
      users30: leader.users30, users90: leader.users90, runs30: leader.runs30, failShare: round(failShare(leader)), rating: leader.rating, reviews: leader.reviews,
      healthySubstitutes: substitutes.length, absorbed: absorbing.length > 0, topSubstitutes: substitutes.slice(0, 3),
    };
  }).sort((a, b) => b.users30 - a.users30);
  const absorbedShare = leaders.length ? leaders.filter(l => l.absorbed).length / leaders.length : null;
  const unabsorbed = leaders.filter(l => !l.absorbed);
  let decision;
  if (!complete) decision = 'INCOMPLETE_NOT_SCORED';
  else if (leaders.length < defs.h2aMinBrokenLeaders) decision = 'KILL_H2A_BREAKAGE_NOT_MATERIAL';
  else if (absorbedShare > defs.h2bMaxAbsorbedShare) decision = 'KILL_H2B_SUBSTITUTES_ABSORB';
  else decision = 'CONTINUE_BUILD_CANDIDATES';
  const pricing = {};
  for (const actor of actors) pricing[actor.pricingModel] = (pricing[actor.pricingModel] ?? 0) + 1;
  const active = actors.filter(a => a.users30 > 0);
  return {
    actors: actors.length,
    activeActors30d: active.length,
    pricingModels: pricing,
    brokenLeaders: leaders.length,
    absorbedShare: round(absorbedShare),
    unabsorbedLeaders: unabsorbed.length,
    strandedUsers30: unabsorbed.reduce((s, l) => s + l.users30, 0),
    decision,
    leaders,
  };
}
