import test from 'node:test';
import assert from 'node:assert/strict';
import { createGithubRelayTask, readGithubRelayTask } from '../src/github-relay.mjs';
import { contentSha256 } from '../src/agent-code-change-contract.mjs';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';
import { runSelfMaintainerProposalWorker } from '../.github/workflows/runtime/self-maintainer-proposal-worker.mjs';

const BASE = 'd'.repeat(40);
const T0 = new Date('2026-09-06T20:00:00.000Z');
const BEFORE = contentSha256('export const safe = 1;\n');

function fakeGithub() {
  const issues = new Map();
  const comments = new Map();
  let nextIssue = 1;
  let nextComment = 1000;
  const client = {
    async createIssue({ title, body, labels = [] }) {
      const number = nextIssue++;
      const issue = { number, title, body, state: 'open', labels: labels.map(name => ({ name })), html_url: `https://github.com/o/r/issues/${number}`, created_at: T0.toISOString() };
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
      issue.state = 'closed';
      issue.state_reason = stateReason;
      return issue;
    }
  };
  return { client, issues, comments };
}

function selfTask(overrides = {}) {
  return {
    taskId: `uberbond_self_maintain_${BASE.slice(0, 24)}`,
    objective: 'Identify one bounded internally-solvable engineering repair.',
    originAgent: 'uberbond-max-council-controller',
    targetAgent: 'claude-code',
    parentTask: `main:${BASE}`,
    contextRefs: [`github:commit:${BASE}`, 'capability:self-maintainer'],
    evidenceRefs: [`github:commit:${BASE}`],
    constraints: [`exact-base-revision:${BASE}`, 'one-bounded-change-set', 'local-preparation-only'],
    forbiddenActions: ['merge', 'deploy', 'send', 'spend', 'change-credentials', 'change-dns'],
    requiredOutputs: ['outcome', 'changedArtifacts', 'testsActuallyRun', 'truthTable', 'externalEffectLedger', 'decision', 'codeChangeSet'],
    acceptanceTests: ['npm run check:syntax', 'npm run test:deterministic'],
    budget: { maxTokens: 10000, maxCostCents: 0 },
    economicObjective: 'risk-adjusted cleared contribution profit per founder minute',
    consequenceClass: 'LOCAL_PREPARATION',
    ...overrides
  };
}

function baseWorkerResult(proposal) {
  return {
    ok: true,
    outcome: 'COMPLETED',
    providerRequestId: 'provider_req_test',
    model: 'zero-cost/test-model',
    usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300, costCents: 0 },
    result: {
      outcome: 'Raw proposal prepared.',
      changedArtifacts: [],
      testsActuallyRun: [],
      truthTable: [],
      externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
      decision: 'PROCEED',
      coordination: { action: 'ENGINEERING_REQUIRED', objective: '', summary: '', evidenceRefs: [], contextRefs: [], acceptanceTests: [], requiredOutputs: [], constraints: [], tokenBudget: 1, confidence: 0.5 },
      evidenceRefs: [],
      selfMaintenanceProposal: proposal
    }
  };
}

function rawProposal(overrides = {}) {
  return {
    decision: 'PROCEED',
    summary: 'Repair one safe source module.',
    baseRevision: BASE,
    changes: [{ operation: 'UPDATE', path: 'src/example-safe-module.mjs', beforeSha256: BEFORE, content: 'export const safe = 2;\n', rationale: 'Smallest causal repair.' }],
    verification: ['npm run check:syntax', 'npm run test:deterministic'],
    evidenceRefs: [`github:commit:${BASE}`],
    cognitivePrioritiesConsidered: ['wallbreaker'],
    ...overrides
  };
}

async function queue(client, input = selfTask()) {
  const created = await createGithubRelayTask({ client, owner: 'o', repo: 'r', input, date: T0 });
  assert.equal(created.ok, true, JSON.stringify(created));
  return created.issueNumber;
}

test('worker claims one exact task, canonicalizes proposal, submits and closes the relay issue', async () => {
  const { client, issues } = fakeGithub();
  const issueNumber = await queue(client);
  const out = await runSelfMaintainerProposalWorker({ client, owner: 'o', repo: 'r', date: T0, modelExecutor: async () => baseWorkerResult(rawProposal()) });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.status, 'CANONICAL_PROPOSAL_SUBMITTED');
  assert.match(out.changeSetId, /^agent_changes_[a-f0-9]{24}$/);
  assert.equal(issues.get(issueNumber).state, 'closed');
  const read = await readGithubRelayTask({ client, owner: 'o', repo: 'r', issueNumber, now: T0 });
  assert.equal(read.resultStatus, 'COMPLETED');
  assert.equal(read.result.decision, 'PROCEED');
  assert.equal(read.result.codeChangeSet.baseRevision, BASE);
  assert.equal(read.receipt.sourceCommit, BASE);
  assert.deepEqual(read.receipt.cost, { usdCents: 0, tokens: 300 });
});

test('protected-path proposal becomes a confirmed failed relay result, never a candidate', async () => {
  const { client } = fakeGithub();
  const issueNumber = await queue(client);
  const out = await runSelfMaintainerProposalWorker({
    client, owner: 'o', repo: 'r', date: T0,
    modelExecutor: async () => baseWorkerResult(rawProposal({ changes: [{ ...rawProposal().changes[0], path: 'package.json' }] }))
  });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.status, 'CONFIRMED_FAILURE_SUBMITTED');
  const read = await readGithubRelayTask({ client, owner: 'o', repo: 'r', issueNumber, now: T0 });
  assert.equal(read.resultStatus, 'FAILED');
  assert.equal(read.result.decision, 'STOP');
  assert.equal('codeChangeSet' in read.result, false);
});

test('uncertain provider outcome is not submitted as terminal truth', async () => {
  const { client, issues } = fakeGithub();
  const issueNumber = await queue(client);
  const out = await runSelfMaintainerProposalWorker({
    client, owner: 'o', repo: 'r', date: T0,
    modelExecutor: async () => ({ ok: false, outcome: 'UNCERTAIN', uncertain: true, reasonCodes: ['transport-uncertain'] })
  });
  assert.equal(out.ok, false);
  assert.equal(out.status, 'PROVIDER_OUTCOME_UNCERTAIN');
  assert.equal(issues.get(issueNumber).state, 'open');
  const read = await readGithubRelayTask({ client, owner: 'o', repo: 'r', issueNumber, now: T0 });
  assert.equal(read.result, null);
});

test('ordinary relay tasks are ignored without spending model compute', async () => {
  const { client, issues } = fakeGithub();
  const issueNumber = await queue(client, selfTask({ taskId: 'ordinary-task', originAgent: 'chatgpt', parentTask: null, constraints: [], requiredOutputs: ['outcome'] }));
  let called = false;
  const out = await runSelfMaintainerProposalWorker({ client, owner: 'o', repo: 'r', date: T0, modelExecutor: async () => { called = true; return baseWorkerResult(rawProposal()); } });
  assert.equal(out.ok, true);
  assert.equal(out.status, 'IDLE_NO_SELF_MAINTAINER_TASK');
  assert.equal(called, false);
  assert.equal(issues.get(issueNumber).state, 'open');
});

test('STOP proposal is submitted as a truthful no-change result with no fake codeChangeSet', async () => {
  const { client } = fakeGithub();
  const issueNumber = await queue(client);
  const out = await runSelfMaintainerProposalWorker({
    client, owner: 'o', repo: 'r', date: T0,
    modelExecutor: async () => baseWorkerResult(rawProposal({ decision: 'STOP', changes: [], summary: 'No safe worthwhile change.' }))
  });
  assert.equal(out.ok, true);
  assert.equal(out.status, 'NO_SAFE_CHANGE_SUBMITTED');
  const read = await readGithubRelayTask({ client, owner: 'o', repo: 'r', issueNumber, now: T0 });
  assert.equal(read.resultStatus, 'COMPLETED');
  assert.equal(read.result.decision, 'STOP');
  assert.equal('codeChangeSet' in read.result, false);
});
