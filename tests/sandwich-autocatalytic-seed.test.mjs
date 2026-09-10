import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSandwichAutocatalyticSeed } from '../scripts/sandwich-autocatalytic-seed.mjs';

const HEAD = 'c'.repeat(40);
const env = {
  GITHUB_ACTIONS: 'true',
  GITHUB_REPOSITORY: 'owner/repo',
  GITHUB_TOKEN: 'test-token',
  GITHUB_SHA: HEAD
};

async function closedRepo() {
  const root = await mkdtemp(join(tmpdir(), 'uberbond-sandwich-seed-'));
  const dir = join(root, 'artifacts', 'sovereign');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'terminal-realization.json'), JSON.stringify({
    ok: true,
    status: 'FINITE_REALIZATION_TRIBUNAL_PASSED_WITH_SEPARATE_REALITY_BOUNDARIES',
    sourceCommit: HEAD,
    finiteOpenRequirements: [],
    separatedStatus: { FINITE_ENGINEERING_CLOSURE: '100_PERCENT_OF_DECLARED_FINITE_ENGINEERING_SCOPE' }
  }));
  await writeFile(join(dir, 'canonical-execution-leaf-graph.json'), JSON.stringify({
    ok: true,
    status: 'ZERO_ORPHAN_CANONICAL_EXECUTION_LEAF_GRAPH_COMPILED',
    sourceCommit: HEAD,
    counts: { orphanRequirements: 0, floatingLeaves: 0, dependencyCycles: 0, leaves: 1 }
  }));
  return root;
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

test('closed finite truth creates one bounded descendant-genesis issue', async t => {
  const root = await closedRepo();
  t.after(() => rm(root, { recursive: true, force: true }));
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if ((options.method || 'GET') === 'POST') return jsonResponse({ number: 91 });
    return jsonResponse([]);
  };
  const result = await runSandwichAutocatalyticSeed({ env, repoRoot: root, fetchImpl, date: new Date('2026-09-10T20:00:00Z') });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'SANDWICH_DESCENDANT_TASK_QUEUED');
  assert.equal(result.issueNumber, 91);
  assert.equal(calls.filter(call => (call.options.method || 'GET') === 'POST').length, 1);
  const posted = JSON.parse(calls.find(call => call.options.method === 'POST').options.body);
  assert.match(posted.title, /Sandwich descendant genesis/);
  assert.match(posted.body, /sandwich-autocatalytic-descendant-genesis/);
  assert.match(posted.body, /requirement-genesis-only-do-not-implement-same-cycle/);
});

test('open same-base task is reused rather than duplicated', async t => {
  const root = await closedRepo();
  t.after(() => rm(root, { recursive: true, force: true }));
  let createdBody = '';
  const firstFetch = async (_url, options = {}) => {
    if (options.method === 'POST') {
      createdBody = JSON.parse(options.body).body;
      return jsonResponse({ number: 92 });
    }
    return jsonResponse([]);
  };
  await runSandwichAutocatalyticSeed({ env, repoRoot: root, fetchImpl: firstFetch, date: new Date('2026-09-10T20:00:00Z') });
  let posts = 0;
  const secondFetch = async (_url, options = {}) => {
    if (options.method === 'POST') { posts += 1; return jsonResponse({ number: 999 }); }
    return jsonResponse([{ number: 92, state: 'open', body: createdBody }]);
  };
  const result = await runSandwichAutocatalyticSeed({ env, repoRoot: root, fetchImpl: secondFetch, date: new Date('2026-09-10T20:00:00Z') });
  assert.equal(result.status, 'SANDWICH_DESCENDANT_TASK_ALREADY_QUEUED');
  assert.equal(result.issueNumber, 92);
  assert.equal(posts, 0);
});

test('closed same-base attempt cannot be silently retried by the recovery clock', async t => {
  const root = await closedRepo();
  t.after(() => rm(root, { recursive: true, force: true }));
  let createdBody = '';
  const firstFetch = async (_url, options = {}) => {
    if (options.method === 'POST') {
      createdBody = JSON.parse(options.body).body;
      return jsonResponse({ number: 93 });
    }
    return jsonResponse([]);
  };
  await runSandwichAutocatalyticSeed({ env, repoRoot: root, fetchImpl: firstFetch, date: new Date('2026-09-10T20:00:00Z') });
  let posts = 0;
  const secondFetch = async (_url, options = {}) => {
    if (options.method === 'POST') { posts += 1; return jsonResponse({ number: 1000 }); }
    return jsonResponse([{ number: 93, state: 'closed', body: createdBody }]);
  };
  const result = await runSandwichAutocatalyticSeed({ env, repoRoot: root, fetchImpl: secondFetch, date: new Date('2026-09-10T20:00:00Z') });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'SANDWICH_DESCENDANT_SAME_BASE_ALREADY_ATTEMPTED');
  assert.equal(result.issueNumber, undefined);
  assert.equal(result.repositoryIssueEffects, 0);
  assert.equal(posts, 0);
});

test('post-finite seed refuses when exact-base finite closure is absent', async t => {
  const root = await mkdtemp(join(tmpdir(), 'uberbond-sandwich-seed-open-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'artifacts', 'sovereign'), { recursive: true });
  const fetchImpl = async () => { throw new Error('network must not be touched'); };
  const result = await runSandwichAutocatalyticSeed({ env, repoRoot: root, fetchImpl });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'FINITE_COMPLETION_RETAINS_PRIORITY');
});
