import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGithubIssuesRelayClient,
  describeGithubIssuesRelayReadiness
} from '../src/github-issues-relay-client.mjs';
import {
  claimGithubRelayTask,
  submitGithubRelayResult
} from '../src/github-relay.mjs';

const DATE = new Date('2026-09-04T16:30:00.000Z');
const ZERO = {
  providerCalls: 0, messages: 0, purchases: 0, deployments: 0,
  credentialChanges: 0, dnsChanges: 0, productionMutations: 0, spendCents: 0
};

function fakeGithub() {
  const issues = new Map();
  const comments = new Map();
  let nextIssue = 1;
  let nextComment = 1000;
  const client = {
    async createIssue({ title, body, labels = [] }) {
      const number = nextIssue++;
      const issue = {
        number,
        title,
        body,
        state: 'open',
        labels: labels.map(name => ({ name })),
        html_url: `https://github.com/o/r/issues/${number}`,
        created_at: DATE.toISOString()
      };
      issues.set(number, issue);
      comments.set(number, []);
      return issue;
    },
    async listIssues({ state = 'open', labels = [] }) {
      return [...issues.values()].filter(issue =>
        issue.state === String(state).toLowerCase()
        && labels.every(want => issue.labels.some(label => label.name === want)));
    },
    async getIssue({ issueNumber }) { return issues.get(issueNumber) || null; },
    async getComments({ issueNumber }) { return comments.get(issueNumber) || []; },
    async addComment({ issueNumber, body }) {
      const comment = { id: nextComment++, body, html_url: `https://github.com/o/r/issues/${issueNumber}#issuecomment-${nextComment}` };
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

function task() {
  return {
    taskId: 'evolution-direct-github-test',
    objective: 'Verify the direct GitHub Issues relay client.',
    originAgent: 'chatgpt',
    targetAgent: 'claude-code',
    requiredOutputs: ['outcome', 'changedArtifacts', 'testsActuallyRun', 'truthTable', 'externalEffectLedger', 'decision'],
    acceptanceTests: ['npm run check:syntax'],
    evidenceRefs: ['test:github-issues-relay-client'],
    consequenceClass: 'LOCAL_PREPARATION',
    budget: { maxTokens: 1000, maxCostCents: 0 }
  };
}

function result() {
  return {
    outcome: 'Direct GitHub relay client verified.',
    changedArtifacts: [],
    testsActuallyRun: [{ command: 'npm run check:syntax', result: 'PASS', total: 1, passed: 1, failed: 0, skipped: 0 }],
    truthTable: { directGithubRelay: 'PASS_LOCAL' },
    externalEffectLedger: { ...ZERO },
    decision: 'PROCEED'
  };
}

test('readiness is presence-only and never exposes the GitHub credential', () => {
  const secret = 'ghp_this_value_must_never_leave_the_reader';
  const ready = describeGithubIssuesRelayReadiness({
    env: { GITHUB_REPOSITORY: 'o/r', GITHUB_TOKEN: secret }
  });
  assert.equal(ready.ready, true);
  assert.equal(ready.repositoryPresent, true);
  assert.equal(ready.credentialPresent, true);
  assert.equal(JSON.stringify(ready).includes(secret), false);

  const blocked = describeGithubIssuesRelayReadiness({ env: {} });
  assert.equal(blocked.ready, false);
  assert.ok(blocked.blockers.includes('github-repository-absent-or-invalid'));
  assert.ok(blocked.blockers.includes('github-credential-absent'));
});

test('unconfigured client refuses before any fetch call', async () => {
  let calls = 0;
  const relay = createGithubIssuesRelayClient({
    env: {},
    fetchImpl: async () => { calls += 1; throw new Error('must not run'); }
  });
  assert.equal(relay.getConfig().ok, false);
  const health = await relay.health();
  assert.equal(health.status, 'NOT_CONFIGURED');
  assert.equal(calls, 0);
});

test('injected canonical GitHub client drives one create -> claim -> submit -> independent read cycle', async () => {
  const fake = fakeGithub();
  const relay = createGithubIssuesRelayClient({
    env: { GITHUB_REPOSITORY: 'o/r' },
    githubClient: fake.client,
    sleep: async () => {}
  });
  const health = await relay.health();
  assert.equal(health.status, 'READY');
  assert.equal(health.transport, 'github-issues');

  const created = await relay.createTask(task(), DATE);
  assert.equal(created.ok, true, JSON.stringify(created));
  assert.equal(created.issueNumber, 1);
  assert.equal(created.taskId, task().taskId);

  const claim = await claimGithubRelayTask({
    client: fake.client,
    owner: 'o', repo: 'r', issueNumber: created.issueNumber,
    workerId: 'claude-code:test', now: DATE
  });
  assert.equal(claim.ok, true, JSON.stringify(claim));

  const submitted = await submitGithubRelayResult({
    client: fake.client,
    owner: 'o', repo: 'r', issueNumber: created.issueNumber,
    workerId: 'claude-code:test', status: 'COMPLETED', result: result(), now: DATE
  });
  assert.equal(submitted.ok, true, JSON.stringify(submitted));

  const received = await relay.waitForResult({
    issueNumber: created.issueNumber,
    expectedTaskId: task().taskId,
    maxPolls: 1,
    pollIntervalMs: 25
  });
  assert.equal(received.ok, true, JSON.stringify(received));
  assert.equal(received.status, 'RESULT_RECEIVED');
  assert.equal(received.resultStatus, 'COMPLETED');
  assert.equal(received.result.outcome, result().outcome);
  assert.deepEqual(received.externalEffectLedger, ZERO);
});

test('task identity is bound on reviewer reads', async () => {
  const fake = fakeGithub();
  const relay = createGithubIssuesRelayClient({
    env: { GITHUB_REPOSITORY: 'o/r' },
    githubClient: fake.client,
    sleep: async () => {}
  });
  const created = await relay.createTask(task(), DATE);
  const mismatch = await relay.readTask({ issueNumber: created.issueNumber, expectedTaskId: 'different-task' });
  assert.equal(mismatch.ok, false);
  assert.ok(mismatch.reasonCodes.includes('relay-task-identity-mismatch'));
});

test('bounded wait returns PENDING without creating another task', async () => {
  const fake = fakeGithub();
  const relay = createGithubIssuesRelayClient({
    env: { GITHUB_REPOSITORY: 'o/r' },
    githubClient: fake.client,
    sleep: async () => {}
  });
  const created = await relay.createTask(task(), DATE);
  const pending = await relay.waitForResult({
    issueNumber: created.issueNumber,
    expectedTaskId: task().taskId,
    maxPolls: 2,
    pollIntervalMs: 25
  });
  assert.equal(pending.status, 'PENDING');
  assert.equal(pending.polls, 2);
  assert.deepEqual(pending.externalEffectLedger, ZERO);
  assert.equal(fake.issues.size, 1);
});
