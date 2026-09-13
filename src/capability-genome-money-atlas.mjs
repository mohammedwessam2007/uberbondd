const MONEY_TERMS = new Set([
  'revenue','sales','lead','leads','prospect','prospecting','crm','outreach','email','deliverability','marketing','growth','conversion','pricing','payment','payments','billing','invoice','checkout','subscription','commerce','ecommerce','marketplace','affiliate','referral','seo','advertising','analytics','experiment','retention','renewal','customer','support','scraping','crawler','browser','enrichment','data','automation','workflow','agent','mcp','research','intelligence','finance','accounting','fulfillment','fulfilment','api','saas'
]);

export const MONEY_CAPABILITY_TARGETS = Object.freeze({
  discoveryCandidates: 1_000_000,
  tournamentEntrants: 50_000,
  deepBenchmarks: 5_000,
  approvedChampionsTarget: 500
});

export const MONEY_CAPABILITY_QUERY_FAMILIES = Object.freeze([
  ['sales-revenue', 1.0, ['sales automation','revenue automation','lead generation','prospecting automation','crm automation','sales intelligence']],
  ['distribution-outreach', 1.0, ['email outreach','email deliverability','campaign automation','linkedin automation','social media automation','distribution automation']],
  ['buyer-data', 0.95, ['data enrichment','company enrichment','contact enrichment','business directory crawler','website crawler','web scraping']],
  ['conversion-pricing', 0.95, ['conversion optimization','pricing engine','ab testing','checkout optimization','offer optimization','funnel analytics']],
  ['payments-billing', 0.95, ['payment processing','billing automation','subscription billing','invoice automation','payment reconciliation','revenue recognition']],
  ['commerce-marketplaces', 0.9, ['ecommerce automation','marketplace automation','shopify automation','product feed automation','affiliate platform','referral platform']],
  ['retention-success', 0.9, ['customer success automation','retention analytics','churn prediction','renewal automation','support automation','customer feedback analysis']],
  ['research-intelligence', 0.9, ['market research agent','competitive intelligence','business intelligence agent','company research','demand intelligence','trend detection']],
  ['agent-browser', 0.85, ['browser agent','computer use agent','web automation agent','mcp server','agent skills','ai agent framework']],
  ['workflow-orchestration', 0.85, ['workflow automation','business process automation','job orchestration','event driven automation','integration platform','automation framework']],
  ['content-seo-media', 0.8, ['seo automation','content automation','content marketing','keyword research','programmatic seo','media automation']],
  ['ads-acquisition', 0.8, ['ad automation','ads optimization','media buying automation','campaign optimization','attribution analytics','growth marketing automation']],
  ['fulfillment-delivery', 0.85, ['service fulfillment automation','report generation automation','document automation','client portal','quality assurance automation','delivery workflow']],
  ['finance-operations', 0.8, ['accounting automation','finance automation','cash flow analytics','expense automation','procurement automation','financial reconciliation']],
  ['software-product', 0.8, ['saas starter','api monetization','usage billing','feature flag experimentation','product analytics','developer portal']],
  ['data-infrastructure', 0.75, ['data pipeline','etl framework','webhook automation','queue worker','postgres automation','vector search']],
  ['ai-capability', 0.8, ['llm tools','ai sdk','model routing','rag framework','agent memory','tool calling framework']]
].map(([id, weight, queries]) => Object.freeze({ id, weight, queries: Object.freeze(queries) })));

export function buildMoneyCapabilitySearchAtlas() {
  const seen = new Set();
  const entries = [];
  for (const family of MONEY_CAPABILITY_QUERY_FAMILIES) {
    for (const query of family.queries) {
      const normalized = query.trim().toLowerCase();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      entries.push(Object.freeze({ family: family.id, familyWeight: family.weight, query: normalized }));
    }
  }
  return Object.freeze(entries);
}

function text(candidate = {}) {
  const topics = Array.isArray(candidate.topics) ? candidate.topics.join(' ') : '';
  return [candidate.name, candidate.full_name, candidate.fullName, candidate.description, topics]
    .filter(Boolean).join(' ').toLowerCase();
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

export function scoreMoneyRepositoryCandidate(candidate = {}, { now = new Date() } = {}) {
  const haystack = text(candidate);
  let semanticHits = 0;
  for (const term of MONEY_TERMS) if (haystack.includes(term)) semanticHits += 1;
  const semantic = clamp(semanticHits / 8, 0, 1);

  const stars = Number(candidate.stargazers_count ?? candidate.stars ?? 0);
  const forks = Number(candidate.forks_count ?? candidate.forks ?? 0);
  const adoption = clamp((Math.log10(1 + Math.max(0, stars)) + 0.5 * Math.log10(1 + Math.max(0, forks))) / 5, 0, 1);

  const pushedRaw = candidate.pushed_at ?? candidate.pushedAt ?? candidate.updated_at ?? candidate.updatedAt;
  const pushed = pushedRaw ? new Date(pushedRaw) : null;
  const ageDays = pushed && !Number.isNaN(pushed.getTime()) ? Math.max(0, (now.getTime() - pushed.getTime()) / 86_400_000) : Infinity;
  const freshness = Number.isFinite(ageDays) ? Math.exp(-ageDays / 730) : 0;

  const archived = candidate.archived === true;
  const fork = candidate.fork === true;
  const score = clamp(0.6 * semantic + 0.2 * adoption + 0.2 * freshness - (archived ? 0.35 : 0) - (fork ? 0.05 : 0), 0, 1);
  return Object.freeze({
    score: Number(score.toFixed(6)),
    semantic: Number(semantic.toFixed(6)),
    adoption: Number(adoption.toFixed(6)),
    freshness: Number(freshness.toFixed(6)),
    archived,
    fork,
    classification: score >= 0.7 ? 'MONEY_HIGH_PRIOR' : score >= 0.45 ? 'MONEY_MEDIUM_PRIOR' : 'MONEY_LOW_PRIOR',
    truth: 'DISCOVERY_PRIOR_NOT_REVENUE'
  });
}

function identity(candidate = {}) {
  return String(candidate.id ?? candidate.node_id ?? candidate.full_name ?? candidate.fullName ?? candidate.html_url ?? candidate.url ?? '').trim();
}

export function selectMoneyCapabilityTournament(candidates = [], { limit = MONEY_CAPABILITY_TARGETS.tournamentEntrants, now = new Date() } = {}) {
  const byIdentity = new Map();
  for (const candidate of candidates) {
    const id = identity(candidate);
    if (!id) continue;
    const scored = { candidate, prior: scoreMoneyRepositoryCandidate(candidate, { now }) };
    const existing = byIdentity.get(id);
    if (!existing || scored.prior.score > existing.prior.score) byIdentity.set(id, scored);
  }
  const ranked = [...byIdentity.values()].sort((a, b) => b.prior.score - a.prior.score || identity(a.candidate).localeCompare(identity(b.candidate)));
  return Object.freeze({
    status: 'MONEY_CAPABILITY_DISCOVERY_TOURNAMENT',
    observed: candidates.length,
    unique: ranked.length,
    selected: Math.min(limit, ranked.length),
    limit,
    target: MONEY_CAPABILITY_TARGETS,
    candidates: Object.freeze(ranked.slice(0, limit)),
    promotionAuthority: 'NONE',
    moneyMovementAuthority: 'NONE',
    truth: 'DISCOVERY_RANKING_ONLY_NOT_APPROVAL_NOT_REVENUE'
  });
}
