import crypto from 'node:crypto';

export const NEURAL_GITHUB_HARVEST_VERSION = 'uberbond.neural-github-harvest.v1';
const GITHUB_API_ORIGIN = 'https://api.github.com';
const MAX_PAGES = 10;
const SIZE_BANDS = Object.freeze([[0,32],[33,256],[257,2048],[2049,16384],[16385,131072],[131073,null]]);

const stable = value => { if (Array.isArray(value)) return value.map(stable); if (!value || typeof value !== 'object') return value; return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])); };
const digest = value => crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const clean = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
const isoDay = value => { const date = new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`); return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null; };
const safeInteger = (value, fallback, min, max) => Number.isSafeInteger(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;
function fail(reasonCodes, extra = {}) { return { ok: false, status: 'NEURAL_GITHUB_HARVEST_REFUSED', reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))], businessEffectAuthority: 'NONE', consequenceAuthority: 'NONE', ...extra }; }
function addDays(day, delta) { const date = new Date(`${day}T00:00:00.000Z`); date.setUTCDate(date.getUTCDate() + delta); return date.toISOString().slice(0, 10); }
function midpointDay(start, end) { const a = new Date(`${start}T00:00:00.000Z`).getTime(); const b = new Date(`${end}T00:00:00.000Z`).getTime(); return new Date(a + Math.floor((b - a) / 2)).toISOString().slice(0, 10); }
function sizeQualifier(band) { if (!band) return ''; const [lo, hi] = band; return hi == null ? ` size:>=${lo}` : ` size:${lo}..${hi}`; }
function partitionQuery(partition) { return `${partition.baseQuery} created:${partition.rangeStart}..${partition.rangeEnd}${sizeQualifier(partition.sizeBand)}`; }

export function compileNeuralGithubPartitions({ atlasEntries = [], startDate, endDate, maxEntries = 25, maxPartitions = 10_000 } = {}) {
  const start = isoDay(startDate), end = isoDay(endDate);
  if (!start || !end || start > end) return fail(['valid-date-window-required']);
  if (!Array.isArray(atlasEntries) || !atlasEntries.length) return fail(['atlas-entries-required']);
  const entryCap = safeInteger(maxEntries, 25, 1, 250), partitionCap = safeInteger(maxPartitions, 10_000, 1, 100_000), partitions = [];
  for (const entry of atlasEntries.slice(0, entryCap)) {
    const baseQuery = clean(entry?.query, 420), family = clean(entry?.family, 120).toLowerCase(), seed = clean(entry?.seed, 300);
    if (!baseQuery || !family || !seed) continue;
    const core = { family, familyWeight: Number(entry.familyWeight ?? 0.8), seed, starBand: Array.isArray(entry.starBand) ? entry.starBand : null, baseQuery, rangeStart: start, rangeEnd: end, sizeBand: null, refinementDepth: 0, perPage: 100, maxPages: MAX_PAGES };
    partitions.push({ ...core, id: `neuralpart_${digest(core).slice(0, 24)}`, query: partitionQuery(core) });
    if (partitions.length > partitionCap) return fail(['partition-ceiling-exceeded'], { partitionCount: partitions.length });
  }
  return { ok: true, status: 'NEURAL_GITHUB_PARTITIONS_COMPILED', partitions, partitionCount: partitions.length, startDate: start, endDate: end, hardObservableCapPerPartition: 1000, refinementLaw: 'SPLIT_SATURATED_PARTITIONS_BY_DATE_UNTIL_ONE_DAY_THEN_BY_REPOSITORY_SIZE; NEVER_CALL_A_SATURATED_LEAF_COMPLETE', planDigest: digest(partitions), businessEffectAuthority: 'NONE' };
}

export function refineNeuralGithubPartition(partition = {}, receipt = {}) {
  const saturated = receipt.searchCapExceeded === true || receipt.incompleteResults === true || Number(receipt.reportedTotalCount || 0) > Number(partition.perPage || 100) * Number(partition.maxPages || 10);
  if (!saturated) return { ok: true, status: 'NEURAL_PARTITION_REFINEMENT_NOT_REQUIRED', partitions: [] };
  const start = isoDay(partition.rangeStart), end = isoDay(partition.rangeEnd);
  if (!start || !end) return fail(['partition-date-range-required']);
  if (start < end) {
    const mid = midpointDay(start, end);
    const ranges = [[start, mid], [addDays(mid, 1), end]].filter(([a, b]) => a <= b);
    const children = ranges.map(([rangeStart, rangeEnd]) => { const core = { ...partition, rangeStart, rangeEnd, refinementDepth: Number(partition.refinementDepth || 0) + 1 }; delete core.id; delete core.query; return { ...core, id: `neuralpart_${digest(core).slice(0, 24)}`, query: partitionQuery(core) }; });
    return { ok: true, status: 'NEURAL_PARTITION_SPLIT_BY_DATE', partitions: children };
  }
  if (!partition.sizeBand) {
    const children = SIZE_BANDS.map(sizeBand => { const core = { ...partition, sizeBand, refinementDepth: Number(partition.refinementDepth || 0) + 1 }; delete core.id; delete core.query; return { ...core, id: `neuralpart_${digest(core).slice(0, 24)}`, query: partitionQuery(core) }; });
    return { ok: true, status: 'NEURAL_PARTITION_SPLIT_BY_SIZE', partitions: children };
  }
  return { ok: true, status: 'NEURAL_PARTITION_SATURATED_LEAF_UNRESOLVED', partitions: [], unresolved: { partitionId: partition.id || null, query: partition.query || partitionQuery(partition), reportedTotalCount: receipt.reportedTotalCount ?? null }, truthBoundary: 'THIS_PUBLIC_GITHUB_SEARCH_LEAF_REMAINS_UNOBSERVABLE_WITHIN_THE_PROVIDER_SEARCH_WINDOW_AND_MUST_NOT_BE_COUNTED_AS_EXHAUSTIVELY_HARVESTED' };
}

function richRepositoryFromGithub(item, partition, observedAt) {
  return {
    repositoryId: item?.id == null ? null : String(item.id), repositoryFullName: clean(item?.full_name, 240), sourceUrl: clean(item?.html_url, 500), visibility: clean(item?.visibility || (item?.private === false ? 'public' : ''), 40).toUpperCase() || 'PUBLIC', private: item?.private === true, archived: item?.archived === true, fork: item?.fork === true, defaultBranch: clean(item?.default_branch, 120) || null,
    description: clean(item?.description, 1200) || null, topics: Array.isArray(item?.topics) ? [...new Set(item.topics.map(topic => clean(topic, 120)).filter(Boolean))].slice(0, 32) : [], language: clean(item?.language, 80) || null,
    stargazersCount: Math.max(0, Number(item?.stargazers_count || 0)), forksCount: Math.max(0, Number(item?.forks_count || 0)), openIssuesCount: Math.max(0, Number(item?.open_issues_count || 0)), sizeKb: Math.max(0, Number(item?.size || 0)), licenseSpdx: clean(item?.license?.spdx_id, 80) || null,
    pushedAt: clean(item?.pushed_at, 80) || null, createdAt: clean(item?.created_at, 80) || null, updatedAt: clean(item?.updated_at, 80) || null,
    family: partition.family, familyWeight: Number(partition.familyWeight ?? 0.8), seed: partition.seed, starBand: partition.starBand || null, sizeBand: partition.sizeBand || null, discoveryQuery: partition.query, partitionId: partition.id, observedAt,
    evidenceClass: 'MEASURED_PUBLIC_GITHUB_REPOSITORY_SEARCH', trustState: 'UNTRUSTED_REPOSITORY_CANDIDATE', promotionAuthority: 'NONE'
  };
}

export async function executeNeuralGithubPartitions({ partitions = [], fetchImpl = globalThis.fetch, maxProviderCalls = 100, userAgent = 'uberbond-neural-exocortex/1.0' } = {}) {
  if (!Array.isArray(partitions) || !partitions.length) return fail(['partitions-required']);
  if (typeof fetchImpl !== 'function') return fail(['fetch-implementation-required']);
  const callCap = safeInteger(maxProviderCalls, 100, 1, 10_000);
  let providerCalls = 0;
  const receipts = [], refinements = [], unresolvedSaturatedLeaves = [], observedAt = new Date().toISOString();
  for (const partition of partitions) {
    if (providerCalls >= callCap) break;
    const repositories = [];
    let reportedTotalCount = null, incompleteResults = false, callsForPartition = 0, terminationStatus = null;
    for (let page = 1; page <= Number(partition.maxPages || MAX_PAGES); page += 1) {
      if (providerCalls >= callCap) { terminationStatus = 'PROVIDER_CALL_BUDGET_EXHAUSTED'; break; }
      const params = new URLSearchParams({ q: partition.query, sort: 'updated', order: 'desc', per_page: String(partition.perPage || 100), page: String(page) });
      providerCalls += 1; callsForPartition += 1;
      let response;
      try { response = await fetchImpl(`${GITHUB_API_ORIGIN}/search/repositories?${params.toString()}`, { method: 'GET', headers: { Accept: 'application/vnd.github+json', 'User-Agent': userAgent } }); }
      catch (error) { return fail(['github-search-network-error'], { providerCalls, errorClass: error?.name || 'UNKNOWN', receipts }); }
      if (response.status === 403 || response.status === 429) {
        terminationStatus = 'RATE_LIMITED_NO_BLIND_RETRY';
        receipts.push({ partitionId: partition.id, partition, query: partition.query, providerCalls: callsForPartition, reportedTotalCount, incompleteResults, searchCapExceeded: reportedTotalCount != null && reportedTotalCount > 1000, repositories, complete: false, terminationStatus });
        return { ok: true, status: 'NEURAL_HARVEST_RATE_LIMITED_NO_BLIND_RETRY', receipts, refinements, unresolvedSaturatedLeaves, providerCalls, retryAfter: response.headers?.get?.('retry-after') || null, businessEffectAuthority: 'NONE' };
      }
      if (!response.ok) return fail(['github-search-http-error'], { providerCalls, httpStatus: response.status, receipts });
      let body; try { body = await response.json(); } catch (error) { return fail(['github-search-json-error'], { providerCalls, errorClass: error?.name || 'UNKNOWN', receipts }); }
      if (!Array.isArray(body?.items)) return fail(['github-search-items-required'], { providerCalls, receipts });
      if (reportedTotalCount == null && Number.isFinite(Number(body.total_count))) reportedTotalCount = Number(body.total_count);
      incompleteResults = incompleteResults || body.incomplete_results === true;
      for (const item of body.items) {
        if (item?.private === true || (item?.visibility && item.visibility !== 'public')) continue;
        const repository = richRepositoryFromGithub(item, partition, observedAt);
        if (/^[^/\s]+\/[^/\s]+$/.test(repository.repositoryFullName) && /^https:\/\/github\.com\//i.test(repository.sourceUrl)) repositories.push(repository);
      }
      if (body.items.length < Number(partition.perPage || 100)) break;
    }
    const searchCapExceeded = Number(reportedTotalCount || 0) > Number(partition.perPage || 100) * Number(partition.maxPages || MAX_PAGES);
    const receipt = { partitionId: partition.id, partition, query: partition.query, providerCalls: callsForPartition, reportedTotalCount, incompleteResults, searchCapExceeded, repositories, complete: terminationStatus == null && !searchCapExceeded && !incompleteResults, terminationStatus };
    receipts.push(receipt);
    if (searchCapExceeded || incompleteResults) { const refinement = refineNeuralGithubPartition(partition, receipt); refinements.push(...(refinement.partitions || [])); if (refinement.unresolved) unresolvedSaturatedLeaves.push(refinement.unresolved); }
  }
  const status = providerCalls >= callCap ? 'NEURAL_HARVEST_PROVIDER_CALL_BUDGET_EXHAUSTED' : 'NEURAL_GITHUB_READ_ONLY_BATCH_COMPLETE';
  return { ok: true, status, receipts, refinements, unresolvedSaturatedLeaves, providerCalls, observedRepositories: receipts.reduce((sum, receipt) => sum + receipt.repositories.length, 0), businessEffectAuthority: 'NONE', consequenceAuthority: 'NONE', networkEffect: 'PUBLIC_READ_ONLY_GITHUB_API' };
}
