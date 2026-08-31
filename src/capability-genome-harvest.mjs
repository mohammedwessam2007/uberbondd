import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const CAPABILITY_GENOME_HARVEST_VERSION = 'capability-genome-harvest-1.0.0';
export const CORPUS_STATE_SCHEMA = 'uberbond.capability-genome.corpus-state.v1';
const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GITHUB_API_ORIGIN = 'https://api.github.com';
const MAX_GITHUB_SEARCH_PAGES = 10;

const clone = value => structuredClone(value);
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}
const digest = value => crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const zeroEffects = () => clone(ZERO_EXTERNAL_EFFECTS);
function readEffects(providerCalls = 0) { return { ...zeroEffects(), providerCalls }; }
function fail(reasonCodes, extra = {}) {
  return {
    ok: false,
    status: 'CAPABILITY_WORLD_HARVEST_DENIED',
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    ...extra
  };
}
function isoDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function dayString(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}
function safeInteger(value, fallback, min, max) {
  return Number.isSafeInteger(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

export function normalizeWorldRepositoryCandidate(input = {}, { query = null, observedAt = new Date() } = {}) {
  const fullName = clean(input.fullName ?? input.full_name, 240);
  const htmlUrl = clean(input.htmlUrl ?? input.html_url ?? input.url, 500);
  const visibility = clean(input.visibility || (input.private === false ? 'public' : ''), 40).toLowerCase();
  const observed = isoDate(observedAt);
  const reasons = [];
  if (!/^[^/\s]+\/[^/\s]+$/.test(fullName)) reasons.push('github-full-name-required');
  if (!/^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/i.test(htmlUrl)) reasons.push('public-github-repository-url-required');
  if (visibility && visibility !== 'public') reasons.push('private-repository-not-eligible');
  if (input.private === true) reasons.push('private-repository-not-eligible');
  if (!observed) reasons.push('valid-observed-at-required');
  if (reasons.length) return fail(reasons);

  const candidateCore = {
    canonicalRepositoryIdentity: `github:${fullName.toLowerCase()}`,
    repositoryFullName: fullName,
    sourceUrl: htmlUrl.replace(/\/$/, ''),
    visibility: 'PUBLIC',
    archived: input.archived === true,
    defaultBranch: clean(input.defaultBranch ?? input.default_branch, 120) || null,
    repositoryId: input.id == null ? null : clean(input.id, 80),
    discoveryQuery: clean(query, 500) || null,
    observedAt: observed,
    evidenceClass: 'MEASURED_PUBLIC_REPOSITORY_METADATA',
    trustState: 'UNTRUSTED_REPOSITORY_CANDIDATE',
    skillBodiesImported: 0,
    promotionAuthority: 'NONE'
  };
  return {
    ok: true,
    status: 'WORLD_REPOSITORY_CANDIDATE_NORMALIZED',
    candidate: { ...candidateCore, metadataHash: digest(candidateCore) },
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}

export function buildMeasuredRepositoryCorpus({ sourceId = 'github-public-capability-search', queryReceipts = [], observedAt = new Date() } = {}) {
  if (sourceId !== 'github-public-capability-search') return fail(['github-public-source-required']);
  if (!Array.isArray(queryReceipts) || queryReceipts.length === 0) return fail(['query-receipts-required']);
  const observed = isoDate(observedAt);
  if (!observed) return fail(['valid-observed-at-required']);

  let rawRepositoryHits = 0;
  let invalidRepositoryHits = 0;
  let providerCalls = 0;
  const queries = [];
  const byIdentity = new Map();
  const duplicateIdentities = [];
  for (const receipt of queryReceipts) {
    const query = clean(receipt?.query, 500);
    if (!query || !Array.isArray(receipt?.repositories)) return fail(['query-and-repositories-required']);
    queries.push(query);
    providerCalls += safeInteger(receipt.providerCalls, 1, 0, 1_000_000);
    for (const repository of receipt.repositories) {
      rawRepositoryHits += 1;
      const normalized = normalizeWorldRepositoryCandidate(repository, { query, observedAt: observed });
      if (!normalized.ok) { invalidRepositoryHits += 1; continue; }
      const identity = normalized.candidate.canonicalRepositoryIdentity;
      if (byIdentity.has(identity)) { duplicateIdentities.push(identity); continue; }
      byIdentity.set(identity, normalized.candidate);
    }
  }

  const candidates = [...byIdentity.values()].sort((a, b) => a.canonicalRepositoryIdentity.localeCompare(b.canonicalRepositoryIdentity));
  const duplicateRepositoryHits = rawRepositoryHits - invalidRepositoryHits - candidates.length;
  const candidateDigest = digest(candidates.map(candidate => [candidate.canonicalRepositoryIdentity, candidate.metadataHash]));
  const manifestCore = {
    schemaVersion: CORPUS_STATE_SCHEMA,
    harvestVersion: CAPABILITY_GENOME_HARVEST_VERSION,
    corpusKind: 'WORLD_REPOSITORY_CANDIDATE_METADATA',
    sourceId,
    evidenceClass: 'MEASURED_IMPORT',
    observedAt: observed,
    queryCount: queries.length,
    queries: [...new Set(queries)],
    providerCalls,
    rawRepositoryHits,
    distinctRepositoryCandidates: candidates.length,
    duplicateRepositoryHits,
    invalidRepositoryHits,
    skillBodiesImported: 0,
    capabilityRecordsNormalized: 0,
    approvedCapabilities: 0,
    activeCapabilities: 0,
    candidateDigest,
    truthBoundary: 'PUBLIC_REPOSITORY_METADATA_IS_A_DISCOVERY_CANDIDATE_ONLY__NOT_A_SKILL_BODY_NOT_SECURITY_REVIEWED_NOT_APPROVED_NOT_ACTIVE'
  };
  const manifest = { ...manifestCore, batchId: `harvest_${digest(manifestCore).slice(0, 24)}` };
  return {
    ok: true,
    status: 'MEASURED_WORLD_REPOSITORY_CORPUS_BUILT',
    manifest,
    candidates,
    duplicateIdentities: [...new Set(duplicateIdentities)].sort(),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: readEffects(providerCalls)
  };
}

export function planGithubRepositorySearchPartitions({ baseQueries = [], startDate, endDate, partitionDays = 7, perPage = 100, maxPagesPerPartition = 10, maxPartitions = 5_000 } = {}) {
  if (!Array.isArray(baseQueries) || baseQueries.length === 0) return fail(['base-queries-required']);
  const start = dayString(startDate);
  const end = dayString(endDate);
  if (!start || !end || start > end) return fail(['valid-date-range-required']);
  const days = safeInteger(partitionDays, 7, 1, 365);
  const pageSize = safeInteger(perPage, 100, 1, 100);
  const pages = safeInteger(maxPagesPerPartition, 10, 1, MAX_GITHUB_SEARCH_PAGES);
  const cap = safeInteger(maxPartitions, 5_000, 1, 100_000);
  const partitions = [];

  let cursor = new Date(`${start}T00:00:00.000Z`);
  const final = new Date(`${end}T00:00:00.000Z`);
  while (cursor <= final) {
    const rangeStart = cursor.toISOString().slice(0, 10);
    const rangeEndDate = new Date(cursor);
    rangeEndDate.setUTCDate(rangeEndDate.getUTCDate() + days - 1);
    if (rangeEndDate > final) rangeEndDate.setTime(final.getTime());
    const rangeEnd = rangeEndDate.toISOString().slice(0, 10);
    for (const rawQuery of baseQueries) {
      const baseQuery = clean(rawQuery, 400);
      if (!baseQuery) continue;
      partitions.push({
        id: `ghpart_${digest({ baseQuery, rangeStart, rangeEnd }).slice(0, 20)}`,
        query: `${baseQuery} created:${rangeStart}..${rangeEnd}`,
        rangeStart,
        rangeEnd,
        perPage: pageSize,
        maxPages: pages,
        maximumObservableHitsBeforeRefinement: pageSize * pages
      });
      if (partitions.length > cap) return fail(['partition-ceiling-exceeded'], { partitionCount: partitions.length, maxPartitions: cap });
    }
    cursor = new Date(rangeEndDate);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return {
    ok: true,
    status: 'GITHUB_WORLD_HARVEST_PARTITIONS_COMPILED',
    partitions,
    partitionCount: partitions.length,
    hardSearchCapPerPartition: pageSize * pages,
    refinementLaw: 'IF_TOTAL_COUNT_EXCEEDS_PARTITION_CAP_SPLIT_RANGE_OR_QUERY_BEFORE_CLAIMING_COVERAGE',
    planDigest: digest(partitions),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}

function publicRepositoryFromGithub(item) {
  return {
    id: item?.id,
    fullName: item?.full_name,
    htmlUrl: item?.html_url,
    visibility: item?.visibility || (item?.private === false ? 'public' : null),
    private: item?.private,
    archived: item?.archived === true,
    defaultBranch: item?.default_branch
  };
}

export async function executeGithubRepositorySearch({ partitions = [], fetchImpl = globalThis.fetch, maxProviderCalls = 100, userAgent = 'uberbond-capability-genome/1.0' } = {}) {
  if (!Array.isArray(partitions) || partitions.length === 0) return fail(['search-partitions-required']);
  if (typeof fetchImpl !== 'function') return fail(['fetch-implementation-required']);
  const callCap = safeInteger(maxProviderCalls, 100, 1, 10_000);
  const receipts = [];
  let providerCalls = 0;

  for (const partition of partitions) {
    const query = clean(partition?.query, 500);
    if (!query) return fail(['partition-query-required']);
    const perPage = safeInteger(partition.perPage, 100, 1, 100);
    const maxPages = safeInteger(partition.maxPages, 10, 1, MAX_GITHUB_SEARCH_PAGES);
    const repositories = [];
    let reportedTotalCount = null;
    let incompleteResults = false;
    let capped = false;
    let callsForPartition = 0;

    for (let page = 1; page <= maxPages; page += 1) {
      if (providerCalls >= callCap) {
        return { ok: true, status: 'HARVEST_PROVIDER_CALL_BUDGET_EXHAUSTED', queryReceipts: receipts, providerCalls, remainingPartitionId: partition.id || null, businessEffectAuthority: 'NONE', externalEffectLedger: readEffects(providerCalls) };
      }
      const params = new URLSearchParams({ q: query, sort: 'updated', order: 'desc', per_page: String(perPage), page: String(page) });
      const url = `${GITHUB_API_ORIGIN}/search/repositories?${params.toString()}`;
      providerCalls += 1;
      callsForPartition += 1;
      let response;
      try {
        response = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/vnd.github+json', 'User-Agent': userAgent } });
      } catch (error) {
        return fail(['github-search-network-error'], { errorClass: error?.name || 'UNKNOWN', queryReceipts: receipts, providerCalls, externalEffectLedger: readEffects(providerCalls) });
      }
      if (response.status === 403 || response.status === 429) {
        return { ok: true, status: 'HARVEST_RATE_LIMITED_NO_BLIND_RETRY', queryReceipts: receipts, providerCalls, rateLimitedPartitionId: partition.id || null, retryAfter: response.headers?.get?.('retry-after') || null, businessEffectAuthority: 'NONE', externalEffectLedger: readEffects(providerCalls) };
      }
      if (!response.ok) return fail(['github-search-http-error'], { httpStatus: response.status, queryReceipts: receipts, providerCalls, externalEffectLedger: readEffects(providerCalls) });
      let body;
      try {
        body = await response.json();
      } catch (error) {
        return fail(['github-search-json-error'], { errorClass: error?.name || 'UNKNOWN', queryReceipts: receipts, providerCalls, externalEffectLedger: readEffects(providerCalls) });
      }
      if (!Array.isArray(body?.items)) return fail(['github-search-items-required'], { providerCalls, externalEffectLedger: readEffects(providerCalls) });
      if (reportedTotalCount == null && Number.isSafeInteger(body.total_count)) reportedTotalCount = body.total_count;
      incompleteResults = incompleteResults || body.incomplete_results === true;
      if (reportedTotalCount != null && reportedTotalCount > perPage * maxPages) capped = true;
      for (const item of body.items) {
        if (item?.private === true || (item?.visibility && item.visibility !== 'public')) continue;
        repositories.push(publicRepositoryFromGithub(item));
      }
      if (body.items.length < perPage) break;
    }
    receipts.push({ partitionId: partition.id || null, query, providerCalls: callsForPartition, reportedTotalCount, incompleteResults, searchCapExceeded: capped, repositories });
  }

  return {
    ok: true,
    status: 'GITHUB_WORLD_HARVEST_EXECUTED_READ_ONLY',
    queryReceipts: receipts,
    providerCalls,
    partitionsRequiringRefinement: receipts.filter(receipt => receipt.searchCapExceeded || receipt.incompleteResults).map(receipt => receipt.partitionId),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: readEffects(providerCalls)
  };
}

export function writeMeasuredCorpusBatch({ corpusDir, corpus, repositoryRoot = REPOSITORY_ROOT, allowRepositoryStorageForTests = false } = {}) {
  if (!corpus?.ok || !corpus?.manifest || !Array.isArray(corpus?.candidates)) return fail(['measured-corpus-required']);
  const requestedDir = clean(corpusDir, 2000);
  if (!requestedDir) return fail(['safe-corpus-directory-required']);
  const targetRoot = path.resolve(requestedDir);
  if (targetRoot === path.parse(targetRoot).root) return fail(['safe-corpus-directory-required']);
  const repoRoot = path.resolve(repositoryRoot);
  const insideRepository = targetRoot === repoRoot || targetRoot.startsWith(`${repoRoot}${path.sep}`);
  if (insideRepository && !allowRepositoryStorageForTests) return fail(['large-corpus-storage-must-live-outside-git']);

  const batchDir = path.join(targetRoot, corpus.manifest.batchId);
  const tempDir = `${batchDir}.tmp-${process.pid}-${Date.now()}`;
  fs.mkdirSync(tempDir, { recursive: true });
  const manifestPath = path.join(tempDir, 'manifest.json');
  const candidatesPath = path.join(tempDir, 'candidates.jsonl');
  fs.writeFileSync(manifestPath, `${JSON.stringify(corpus.manifest, null, 2)}\n`, 'utf8');
  fs.writeFileSync(candidatesPath, corpus.candidates.map(candidate => JSON.stringify(candidate)).join('\n') + (corpus.candidates.length ? '\n' : ''), 'utf8');
  fs.mkdirSync(path.dirname(batchDir), { recursive: true });
  if (fs.existsSync(batchDir)) fs.rmSync(batchDir, { recursive: true, force: true });
  fs.renameSync(tempDir, batchDir);
  return { ok: true, status: 'MEASURED_CORPUS_BATCH_PERSISTED_OUTSIDE_GIT', batchId: corpus.manifest.batchId, batchDir, manifestPath: path.join(batchDir, 'manifest.json'), candidatesPath: path.join(batchDir, 'candidates.jsonl'), businessEffectAuthority: 'NONE', externalEffectLedger: zeroEffects() };
}
