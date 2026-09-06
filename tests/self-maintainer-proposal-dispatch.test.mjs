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
const SOURCE_PATH = 'src/proposal-safe-example.mjs';
const SOURCE_CONTENT = 'export const safe = 1;\n';
const BEFORE = contentSha256(SOURCE_CONTENT);

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

function sourceInventory() {
  return {
    ok: true,
    status: 'SOURCE_INVENTORY_READY',
    sourceSha: BASE,
    paths: [SOURCE_PATH, 'tests/proposal-safe-example.test.mjs'],
    pathCount: 2,
    inventoryDigest: 'inventory-digest-test',
    byteLength: 80
  };
}

function exactSourceContext() {
  return {
    ok: true,
    status: 'EXACT_SOURCE_CONTEXT_READY',
    sourceSha: BASE,
    inventoryDigest: 'inventory-digest-test',
    sourceContextDigest: 'source-context-digest-test',
    files: [{ path: SOURCE_PATH, sha256: BEFORE, byteLength: Buffer.byteLength(SOURCE_CONTENT), content: SOURCE_CONTENT }],
    totals: { files: 1, contentBytes: Buffer.byteLength(SOURCE_CONTENT) },
    businessEffectAuthority: 'NONE'
  };
}

function sourceRuntime({ inventory = sourceInventory(), context = exactSourceContext() } = {}) {
  return {
    buildInventory: async ({ expectedSha }) => {
      assert.equal(expectedSha, BASE);
      return inventory;
    },
    buildSourceContext: async ({ expectedSha, inventory: observedInventory, selectedPaths }) => {
      assert.equal(expectedSha, BASE);
      assert.equal(observedInventory, inventory);
      assert.deepEqual(selectedPaths, [SOURCE_PATH]);
      return context;
    }
  };
}

function canonicalWorkerResult() {
  const content = 'export const safe = 2;\n';
  return {
    outcome: 'Canonical proposal prepared; verification pending.',
    changedArtifacts: [SOURCE_PATH],
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
      changes: [{ operation: 'UPDATE', path: SOURCE_PATH, beforeSha256: BEFORE, afterSha256: contentSha256(content), content, rationale: 'safe' }],
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

function stagedProposalFetch({ result = canonicalWorkerResult(), proposalStatus = 200 } = {}) {
  const stages = [];
  const fetchImpl = async (url, options = {}) => {
    assert.equal(String(url), 'https://uberbondd.vercel.app/api/self-maintainer-proposal');
    assert.match(String(options.headers?.authorization || ''), /^Bearer /);
    const body = JSON.parse(options.body);
    assert.equal(body.expectedSha, BASE);
    assert.equal(body.task.taskId, relayTask().taskId);
    stages.push(body.stage);
    if (body.stage === 'SELECT_CONTEXT') {
      assert.deepEqual(body.sourceInventory, sourceInventory().paths);
      return new Response(JSON.stringify({
        ok: true,
        stage: 'SELECT_CONTEXT',
        contextPaths: [SOURCE_PATH],
        proposalProvider: 'ai-gateway',
        usage: { costCents: 0, totalTokens: 10 }
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    assert.equal(body.stage, 'PROPOSE');
    assert.equal(body.sourceContext.sourceSha, BASE);
    assert.equal(body.sourceContext.sourceContextDigest, 'source-context-digest-test');
    const payload = proposalStatus === 200
      ? { ok: true, stage: 'PROPOSE', result, proposalProvider: 'ai-gateway', usage: { costCents: 0, totalTokens: 30 } }
      : { ok: false, reasonCodes: ['provider-blocked'] };
    return new Response(JSON.stringify(payload), { status: proposalStatus, headers: { 'content-type': 'application/json' } });
  };
  return { fetchImpl, stages };
}

test('dispatch claims exact task, selects context, reads exact source, uses OIDC, submits canonical receipt, and closes relay issue', async () => {
  const { client, created, issues } = await seeded();
  let oidcCalls = 0;
  const staged = stagedProposalFetch();
  const out = await runSelfMaintainerProposalDispatch({
    env: env(),
    githubClient: client,
    initialReceipt: { issueNumber: created.issueNumber },
    oidcRequester: async () => { oidcCalls += 1; return { ok: true, token: 'signed-oidc-token' }; },
    fetchImpl: staged.fetchImpl,
    date: NOW,
    ...sourceRuntime()
  });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.status, 'CANONICAL_SOURCE_GROUNDED_PROPOSAL_SUBMITTED');
  assert.equal(oidcCalls, 1);
  assert.deepEqual(staged.stages, ['SELECT_CONTEXT', 'PROPOSE']);
  assert.deepEqual(out.contextPaths, [SOURCE_PATH]);
  assert.equal(out.sourceContextDigest, 'source-context-digest-test');
  assert.equal(issues.get(created.issueNumber).state, 'closed');
  const read = await readGithubRelayTask({ client, owner: 'mohammedwessam2007', repo: 'uberbondd', issueNumber: created.issueNumber, now: NOW });
  assert.equal(read.resultStatus, 'COMPLETED');
  assert.equal(read.result.decision, 'PROCEED');
  assert.deepEqual(read.result.testsActuallyRun, []);
  assert.deepEqual(read.receipt.cost, { usdCents: 0, tokens: 40 });
  assert.equal(read.receipt.confidence, 'HIGH');
  assert.equal(read.receipt.sourceCommit, BASE);
});

test('dispatch never calls proposal endpoint when exact source identity mismatches relay task', async () => {
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

test('exact source inventory failure blocks before OIDC or provider calls', async () => {
  const { client, created } = await seeded();
  let called = false;
  const out = await runSelfMaintainerProposalDispatch({
    env: env(), githubClient: client, initialReceipt: { issueNumber: created.issueNumber },
    buildInventory: async () => ({ ok: false, reasonCodes: ['local-checkout-sha-mismatch'] }),
    buildSourceContext: async () => { called = true; return exactSourceContext(); },
    oidcRequester: async () => { called = true; return { ok: true, token: 'signed-oidc-token' }; },
    fetchImpl: async () => { called = true; return new Response('{}'); },
    date: NOW
  });
  assert.equal(out.ok, false);
  assert.equal(out.status, 'SOURCE_CONTEXT_BLOCKED');
  assert.equal(called, false);
  assert.ok(out.reasonCodes.includes('exact-source-inventory-failed'));
});

test('dispatch fails closed when OIDC acquisition fails after exact inventory and does not submit fake result', async () => {
  const { client, created } = await seeded();
  let endpointCalled = false;
  const out = await runSelfMaintainerProposalDispatch({
    env: env(), githubClient: client, initialReceipt: { issueNumber: created.issueNumber },
    oidcRequester: async () => ({ ok: false, reasonCodes: ['oidc-unavailable'] }),
    fetchImpl: async () => { endpointCalled = true; return new Response('{}'); },
    date: NOW,
    ...sourceRuntime()
  });
  assert.equal(out.ok, false);
  assert.equal(out.status, 'OIDC_BLOCKED');
  assert.equal(endpointCalled, false);
  const read = await readGithubRelayTask({ client, owner: 'mohammedwessam2007', repo: 'uberbondd', issueNumber: created.issueNumber, now: NOW });
  assert.equal(read.result, null);
});

test('dispatch stops if selected exact source context cannot be built and never reaches proposal stage', async () => {
  const { client, created } = await seeded();
  const staged = stagedProposalFetch();
  const out = await runSelfMaintainerProposalDispatch({
    env: env(), githubClient: client, initialReceipt: { issueNumber: created.issueNumber },
    oidcRequester: async () => ({ ok: true, token: 'signed-oidc-token' }),
    fetchImpl: staged.fetchImpl,
    date: NOW,
    buildInventory: sourceRuntime().buildInventory,
    buildSourceContext: async () => ({ ok: false, reasonCodes: ['source-context-read-failed'] })
  });
  assert.equal(out.ok, false);
  assert.equal(out.status, 'SOURCE_CONTEXT_BLOCKED');
  assert.deepEqual(staged.stages, ['SELECT_CONTEXT']);
});

test('dispatch is idempotent after durable relay result exists and never re-reads source or re-calls model', async () => {
  const { client, created } = await seeded();
  const staged = stagedProposalFetch();
  const first = await runSelfMaintainerProposalDispatch({
    env: env(), githubClient: client, initialReceipt: { issueNumber: created.issueNumber },
    oidcRequester: async () => ({ ok: true, token: 'signed-oidc-token' }),
    fetchImpl: staged.fetchImpl, date: NOW, ...sourceRuntime()
  });
  assert.equal(first.ok, true);
  let called = false;
  const second = await runSelfMaintainerProposalDispatch({
    env: env(), githubClient: client, initialReceipt: { issueNumber: created.issueNumber },
    oidcRequester: async () => { called = true; return { ok: true, token: 'should-not-run' }; },
    fetchImpl: async () => { called = true; return new Response('{}'); },
    buildInventory: async () => { called = true; return sourceInventory(); },
    buildSourceContext: async () => { called = true; return exactSourceContext(); },
    date: NOW
  });
  assert.equal(second.ok, true);
  assert.equal(second.status, 'RESULT_ALREADY_PRESENT');
  assert.equal(called, false);
});

test('dispatch pins canonical production proposal endpoint and rejects endpoint substitution', async () => {
  const { client, created } = await seeded();
  const out = await runSelfMaintainerProposalDispatch({
    env: env({ UBERBOND_SELF_MAINTAINER_PROPOSAL_URL: 'https://attacker.example/proposal' }),
    githubClient: client,
    initialReceipt: { issueNumber: created.issueNumber },
    oidcRequester: async () => ({ ok: true, token: 'signed-oidc-token' }),
    fetchImpl: async () => new Response('{}'), date: NOW
  });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('canonical-self-maintainer-proposal-endpoint-required'));
});
