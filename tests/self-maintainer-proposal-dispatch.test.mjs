import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGithubRelayTask,
  readGithubRelayTask
} from '../src/github-relay.mjs';
import { contentSha256 } from '../src/agent-code-change-contract.mjs';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';
import { runSelfMaintainerProposalDispatch } from '../.github/workflows/runtime/self-maintainer-proposal-dispatch.mjs';

const BASE = 'f'.repeat(40);
const NOW = new Date('2026-09-06T20:00:00.000Z');
const BEFORE = contentSha256('export const safe = 1;\n');

function fakeGithub() {
  const issues = new Map();
  const comments = new Map();
  let nextIssue = 1;
  let nextComment = 1000;
  const client = {
    async createIssue({ title, body, labels = [] }) {
      const number = nextIssue++;
      const issue = { number, title, body, state: 'open', labels: labels.map(name => ({ name })), html_url: `https://github.com/o/r/issues/${number}`, created_at: NOW.toISOString() };
      issues.set(number, issue);
      comments.set(number, []);
      return issue;
    },
    async listIssues({ labels = [] }) {
      return [...issues.values()].filter(issue => issue.state === 'open' && labels.every(want => issue.labels.some(label => label.name === want)));
    },
    async getIssue({ issueNumber }) { return issues.get(issueNumber) || null; },
    async getComments({ issueNumber }) { return comments.get(issueNumber) || []; },
    async addComment({ issueNumber, body }) {
      const comment = { id: nextComment++, body, html_url: `https://github.com/o/r/issues/${issueNumber}#c` };
      comments.get(issueNumber).push(comment);
      return comment;
    },
    async addLabels({ issueNumber, labels }) {
      const issue = issues.get(issueNumber);
      for (const name of labels) if (!issue.labels.some(label => label.name === name)) issue.labels.push({ name });
      return issue;
    },
    async closeIssue({ issueNumber, stateReason }) {
      const issue = issues.get(issueNumber);
      Object.assign(issue, { state: 'closed', state_reason: stateReason });
      return issue;
    }
  };
  return { client, issues, comments };
}

function relayTask() {
  return {
    taskId: `uberbond_self_maintain_${BASE.slice(0, 24)}`,
    objective: 'Make one exact bounded internal improvement.',
    originAgent: 'uberbond-max-council-controller',
    targetAgent: 'claude-code',
    parentTask: `main:${BASE}`,
    contextRefs: [`github:commit:${BASE}`],
    evidenceRefs: [`github:commit:${BASE}`],
    constraints: [`exact-base-revision:${BASE}`],
    forbiddenActions: ['merge', 'deploy', 'send', 'spend'],
    requiredOutputs: ['outcome', 'changedArtifacts', 'testsActuallyRun', 'truthTable', 'externalEffectLedger', 'decision', 'codeChangeSet'],
    acceptanceTests: ['npm run check:syntax', 'npm run test:deterministic'],
    budget: { maxTokens: 12000, maxCostCents: 0 },
    consequenceClass: 'LOCAL_PREPARATION'
  };
}

function canonicalWorkerResult() {
  const content = 'export const safe = 2;\n';
  return {
    outcome: 'Canonical proposal prepared; verification pending.',
    changedArtifacts: ['src/proposal-safe-example.mjs'],
    testsActuallyRun: [],
    truthTable: [{ claim: 'proposal only', status: 'UNRESOLVED', evidenceRefs: [] }],
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
    decision: 'PROCEED',
    coordination: { action: 'ENGINEERING_REQUIRED', objective: 'verify', summary: 'verify', evidenceRefs: [], contextRefs: [], acceptanceTests: ['npm run check:syntax', 'npm run test:deterministic'], requiredOutputs: [], constraints: [], tokenBudget: 12000, confidence: 0.9 },
    evidenceRefs: [`github:commit:${BASE}`],
    codeChangeSet: {
      ok: true,
      policyVersion: 'agent-code-change-1.6.0',
      status: 'READY_FOR_SANDBOX_APPLY',
      changeSetId: 'agent_changes_0123456789abcdef01234567',
      taskId: `uberbond_self_maintain_${BASE.slice(0, 24)}`,
      baseRevision: BASE,
      consequenceClass: 'LOCAL_PREPARATION',
      businessEffectAuthority: 'NONE',
      summary: 'safe',
      changes: [{ operation: 'UPDATE', path: 'src/proposal-safe-example.mjs', beforeSha256: BEFORE, afterSha256: contentSha256(content), content, rationale: 'safe' }],
      verification: ['npm run check:syntax', 'npm run test:deterministic'],
      totals: { files: 1, contentBytes: Buffer.byteLength(content), relaySafeEnvelopeBytes: 180000 }
    },
    cognitivePrioritiesConsidered: ['wallbreaker']
  };
}

function env(overrides = {}) {
  return {
    GITHUB_ACTIONS: 'true',
    GITHUB_REPOSITORY: 'mohammedwessam2007/uberbondd',
    GITHUB_TOKEN: 'test-token-not-a-real-secret',
    GITHUB_SHA: BASE,
    GITHUB_RUN_ID: '12345',
    UBERBOND_SELF_MAINTAINER_PROPOSAL_URL: 'https://uberbondd.vercel.app/api/self-maintainer-proposal',
    ...overrides
  };
}

async function seeded() {
  const github = fakeGithub();
  const created = await createGithubRelayTask({ client: github.client, owner: 'mohammedwessam2007', repo: 'uberbondd', input: relayTask(), date: NOW });
  assert.equal(created.ok, true, JSON.stringify(created));
  return { ...github, created };
}

function proposalFetch({ result = canonicalWorkerResult(), status = 200 } = {}) {
  return async (url, options = {}) => {
    assert.equal(String(url), 'https://uberbondd.vercel.app/api/self-maintainer-proposal');
    assert.match(String(options.headers?.authorization || ''), /^Bearer /);
    const body = JSON.parse(options.body);
    assert.equal(body.expectedSha, BASE);
    assert.equal(body.task.taskId, relayTask().taskId);
    const payload = status === 200
      ? { ok: true, result, proposalProvider: 'ai-gateway', usage: { costCents: 0 } }
      : { ok: false, reasonCodes: ['provider-blocked'] };
    return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
  };
}

test('dispatch claims the exact task, uses OIDC, submits proposal, and closes the relay issue', async () => {
  const { client, created, issues } = await seeded();
  let oidcCalls = 0;
  const out = await runSelfMaintainerProposalDispatch({
    env: env(),
    githubClient: client,
    initialReceipt: { issueNumber: created.issueNumber },
    oidcRequester: async () => { oidcCalls += 1; return { ok: true, token: 'signed-oidc-token' }; },
    fetchImpl: proposalFetch(),
    date: NOW
  });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.status, 'CANONICAL_PROPOSAL_SUBMITTED');
  assert.equal(oidcCalls, 1);
  assert.equal(issues.get(created.issueNumber).state, 'closed');
  const read = await readGithubRelayTask({ client, owner: 'mohammedwessam2007', repo: 'uberbondd', issueNumber: created.issueNumber, now: NOW });
  assert.equal(read.resultStatus, 'COMPLETED');
  assert.equal(read.result.decision, 'PROCEED');
  assert.deepEqual(read.result.testsActuallyRun, []);
});

test('dispatch never calls proposal endpoint when exact source identity mismatches', async () => {
  const { client, created } = await seeded();
  let called = false;
  const out = await runSelfMaintainerProposalDispatch({
    env: env({ GITHUB_SHA: 'a'.repeat(40) }),
    githubClient: client,
    initialReceipt: { issueNumber: created.issueNumber },
    oidcRequester: async () => ({ ok: true, token: 'signed-oidc-token' }),
    fetchImpl: async () => { called = true; return new Response('{}'); },
    date: NOW
  });
  assert.equal(out.ok, false);
  assert.equal(called, false);
  assert.ok(out.reasonCodes.includes('relay-task-base-revision-mismatch'));
});

test('dispatch fails closed when OIDC acquisition fails and does not submit a fake result', async () => {
  const { client, created } = await seeded();
  let endpointCalled = false;
  const out = await runSelfMaintainerProposalDispatch({
    env: env(), githubClient: client, initialReceipt: { issueNumber: created.issueNumber },
    oidcRequester: async () => ({ ok: false, reasonCodes: ['oidc-unavailable'] }),
    fetchImpl: async () => { endpointCalled = true; return new Response('{}'); },
    date: NOW
  });
  assert.equal(out.ok, false);
  assert.equal(out.status, 'OIDC_BLOCKED');
  assert.equal(endpointCalled, false);
  const read = await readGithubRelayTask({ client, owner: 'mohammedwessam2007', repo: 'uberbondd', issueNumber: created.issueNumber, now: NOW });
  assert.equal(read.result, null);
});

test('dispatch is idempotent after a durable relay result exists and never re-calls the model', async () => {
  const { client, created } = await seeded();
  const first = await runSelfMaintainerProposalDispatch({
    env: env(), githubClient: client, initialReceipt: { issueNumber: created.issueNumber },
    oidcRequester: async () => ({ ok: true, token: 'signed-oidc-token' }),
    fetchImpl: proposalFetch(), date: NOW
  });
  assert.equal(first.ok, true);
  let called = false;
  const second = await runSelfMaintainerProposalDispatch({
    env: env(), githubClient: client, initialReceipt: { issueNumber: created.issueNumber },
    oidcRequester: async () => { called = true; return { ok: true, token: 'should-not-run' }; },
    fetchImpl: async () => { called = true; return new Response('{}'); }, date: NOW
  });
  assert.equal(second.ok, true);
  assert.equal(second.status, 'RESULT_ALREADY_PRESENT');
  assert.equal(called, false);
});

test('dispatch pins the canonical production proposal endpoint and rejects endpoint substitution', async () => {
  const { client, created } = await seeded();
  const out = await runSelfMaintainerProposalDispatch({
    env: env({ UBERBOND_SELF_MAINTAINER_PROPOSAL_URL: 'https://attacker.example/proposal' }),
    githubClient: client,
    initialReceipt: { issueNumber: created.issueNumber },
    oidcRequester: async () => ({ ok: true, token: 'signed-oidc-token' }),
    fetchImpl: proposalFetch(), date: NOW
  });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('canonical-self-maintainer-proposal-endpoint-required'));
});
