import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  CORPUS_STATE_SCHEMA,
  normalizeWorldRepositoryCandidate,
  buildMeasuredRepositoryCorpus,
  planGithubRepositorySearchPartitions,
  executeGithubRepositorySearch,
  writeMeasuredCorpusBatch
} from '../src/capability-genome-harvest.mjs';

const repo = (fullName, overrides = {}) => ({
  id: overrides.id ?? fullName.length,
  fullName,
  htmlUrl: `https://github.com/${fullName}`,
  visibility: 'public',
  private: false,
  archived: false,
  defaultBranch: 'main',
  ...overrides
});

function response(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: key => headers[String(key).toLowerCase()] ?? null },
    async json() { return body; }
  };
}

test('repository candidates are public untrusted discovery metadata only', () => {
  const result = normalizeWorldRepositoryCandidate(repo('anthropics/skills'), { query: 'agent skills', observedAt: '2026-08-31T15:00:00Z' });
  assert.equal(result.ok, true);
  assert.equal(result.candidate.visibility, 'PUBLIC');
  assert.equal(result.candidate.trustState, 'UNTRUSTED_REPOSITORY_CANDIDATE');
  assert.equal(result.candidate.skillBodiesImported, 0);
  assert.equal(result.candidate.promotionAuthority, 'NONE');
});

test('private repositories are rejected even if a caller supplies a github url', () => {
  const result = normalizeWorldRepositoryCandidate(repo('secret/private', { visibility: 'private', private: true }));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('private-repository-not-eligible'));
});

test('measured corpus dedupes repository identities across queries without inventing skill bodies', () => {
  const corpus = buildMeasuredRepositoryCorpus({
    observedAt: '2026-08-31T15:00:00Z',
    queryReceipts: [
      { query: 'agent skills', providerCalls: 1, repositories: [repo('anthropics/skills'), repo('vercel-labs/skills')] },
      { query: 'claude skill', providerCalls: 1, repositories: [repo('anthropics/skills'), repo('simonw/claude-skills')] }
    ]
  });
  assert.equal(corpus.ok, true);
  assert.equal(corpus.manifest.schemaVersion, CORPUS_STATE_SCHEMA);
  assert.equal(corpus.manifest.rawRepositoryHits, 4);
  assert.equal(corpus.manifest.distinctRepositoryCandidates, 3);
  assert.equal(corpus.manifest.duplicateRepositoryHits, 1);
  assert.equal(corpus.manifest.skillBodiesImported, 0);
  assert.equal(corpus.manifest.approvedCapabilities, 0);
  assert.equal(corpus.externalEffectLedger.providerCalls, 2);
});

test('partition planner breaks large github search space into bounded date windows', () => {
  const plan = planGithubRepositorySearchPartitions({
    baseQueries: ['"agent skills"', '"mcp server"'],
    startDate: '2026-08-01',
    endDate: '2026-08-15',
    partitionDays: 7
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.partitionCount, 6);
  assert.match(plan.partitions[0].query, /created:2026-08-01\.\.2026-08-07/);
  assert.match(plan.partitions.at(-1).query, /created:2026-08-15\.\.2026-08-15/);
  assert.equal(plan.hardSearchCapPerPartition, 1000);
});

test('github executor is read-only, counts provider calls, and surfaces partitions requiring refinement', async () => {
  const seen = [];
  const fetchImpl = async (url, options) => {
    seen.push({ url, options });
    return response(200, {
      total_count: 1500,
      incomplete_results: false,
      items: [{ id: 1, full_name: 'anthropics/skills', html_url: 'https://github.com/anthropics/skills', visibility: 'public', private: false, archived: false, default_branch: 'main' }]
    });
  };
  const result = await executeGithubRepositorySearch({
    partitions: [{ id: 'p1', query: '"agent skills" created:2026-08-01..2026-08-07', perPage: 100, maxPages: 1 }],
    fetchImpl
  });
  assert.equal(result.ok, true);
  assert.equal(result.providerCalls, 1);
  assert.deepEqual(result.partitionsRequiringRefinement, ['p1']);
  assert.equal(seen[0].options.method, 'GET');
  assert.equal(Object.hasOwn(seen[0].options.headers, 'Authorization'), false);
  assert.equal(result.externalEffectLedger.providerCalls, 1);
});

test('rate limiting produces a receipt and never blind retries', async () => {
  let calls = 0;
  const result = await executeGithubRepositorySearch({
    partitions: [{ id: 'p1', query: 'agent skills', perPage: 100, maxPages: 10 }],
    fetchImpl: async () => {
      calls += 1;
      return response(429, {}, { 'retry-after': '60' });
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'HARVEST_RATE_LIMITED_NO_BLIND_RETRY');
  assert.equal(calls, 1);
  assert.equal(result.providerCalls, 1);
  assert.equal(result.retryAfter, '60');
});

test('provider call ceiling returns partial progress instead of silently exceeding budget', async () => {
  let calls = 0;
  const result = await executeGithubRepositorySearch({
    partitions: [
      { id: 'p1', query: 'agent skills', perPage: 1, maxPages: 1 },
      { id: 'p2', query: 'mcp server', perPage: 1, maxPages: 1 }
    ],
    maxProviderCalls: 1,
    fetchImpl: async () => {
      calls += 1;
      return response(200, { total_count: 1, incomplete_results: false, items: [{ id: calls, full_name: `owner/repo${calls}`, html_url: `https://github.com/owner/repo${calls}`, visibility: 'public', private: false, default_branch: 'main' }] });
    }
  });
  assert.equal(result.status, 'HARVEST_PROVIDER_CALL_BUDGET_EXHAUSTED');
  assert.equal(calls, 1);
  assert.equal(result.providerCalls, 1);
});

test('corpus persistence refuses to dump a scaled corpus into the git repository', () => {
  const corpus = buildMeasuredRepositoryCorpus({
    observedAt: '2026-08-31T15:00:00Z',
    queryReceipts: [{ query: 'agent skills', repositories: [repo('anthropics/skills')] }]
  });
  const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'uberbond-repo-'));
  const denied = writeMeasuredCorpusBatch({ corpusDir: path.join(repositoryRoot, 'artifacts', 'corpus'), corpus, repositoryRoot });
  assert.equal(denied.ok, false);
  assert.ok(denied.reasonCodes.includes('large-corpus-storage-must-live-outside-git'));

  const externalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'uberbond-corpus-'));
  const stored = writeMeasuredCorpusBatch({ corpusDir: externalRoot, corpus, repositoryRoot });
  assert.equal(stored.ok, true);
  assert.equal(fs.existsSync(stored.manifestPath), true);
  assert.equal(fs.existsSync(stored.candidatesPath), true);
});
