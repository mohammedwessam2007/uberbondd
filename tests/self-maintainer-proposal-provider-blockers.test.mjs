import test from 'node:test';
import assert from 'node:assert/strict';
import { createGithubRelayTask, readGithubRelayTask } from '../src/github-relay.mjs';
import { runSelfMaintainerProposalWorker } from '../.github/workflows/runtime/self-maintainer-proposal-worker.mjs';

const BASE = 'e'.repeat(40);
const T0 = new Date('2026-09-06T20:30:00.000Z');

function fakeGithub() {
  const issues = new Map();
  const comments = new Map();
  let nextIssue = 1;
  let nextComment = 1;
  const client = {
    async createIssue({ title, body, labels = [] }) {
      const number = nextIssue++;
      const issue = { number, title, body, state: 'open', labels: labels.map(name => ({ name })), html_url: `https://github.com/o/r/issues/${number}`, created_at: T0.toISOString() };
      issues.set(number, issue); comments.set(number, []); return issue;
    },
    async listIssues({ labels = [] }) { return [...issues.values()].filter(issue => issue.state === 'open' && labels.every(want => issue.labels.some(label => label.name === want))); },
    async getIssue({ issueNumber }) { return issues.get(issueNumber) || null; },
    async getComments({ issueNumber }) { return comments.get(issueNumber) || []; },
    async addComment({ issueNumber, body }) { const c = { id: nextComment++, body }; comments.get(issueNumber).push(c); return c; },
    async addLabels({ issueNumber, labels }) { const issue = issues.get(issueNumber); for (const name of labels) if (!issue.labels.some(label => label.name === name)) issue.labels.push({ name }); return issue; },
    async closeIssue({ issueNumber, stateReason }) { const issue = issues.get(issueNumber); issue.state = 'closed'; issue.state_reason = stateReason; return issue; }
  };
  return { client, issues };
}

function task() {
  return {
    taskId: `uberbond_self_maintain_${BASE.slice(0, 24)}`,
    objective: 'One bounded repair.',
    originAgent: 'uberbond-max-council-controller',
    targetAgent: 'claude-code',
    parentTask: `main:${BASE}`,
    contextRefs: [`github:commit:${BASE}`],
    evidenceRefs: [`github:commit:${BASE}`],
    constraints: [`exact-base-revision:${BASE}`, 'local-preparation-only'],
    forbiddenActions: ['merge', 'deploy', 'send', 'spend'],
    requiredOutputs: ['outcome', 'changedArtifacts', 'testsActuallyRun', 'truthTable', 'externalEffectLedger', 'decision', 'codeChangeSet'],
    acceptanceTests: ['npm run check:syntax', 'npm run test:deterministic'],
    budget: { maxTokens: 10000, maxCostCents: 0 },
    consequenceClass: 'LOCAL_PREPARATION'
  };
}

async function exercise(reasonCodes, expectedStatus) {
  const { client, issues } = fakeGithub();
  const created = await createGithubRelayTask({ client, owner: 'o', repo: 'r', input: task(), date: T0 });
  assert.equal(created.ok, true);
  const out = await runSelfMaintainerProposalWorker({
    client, owner: 'o', repo: 'r', date: T0,
    modelExecutor: async () => ({ ok: false, outcome: 'CONFIRMED_FAILURE', reasonCodes })
  });
  assert.equal(out.ok, false);
  assert.equal(out.status, expectedStatus);
  assert.equal(out.taskRemainsRecoverable, true);
  assert.equal(issues.get(created.issueNumber).state, 'open');
  const read = await readGithubRelayTask({ client, owner: 'o', repo: 'r', issueNumber: created.issueNumber, now: T0 });
  assert.equal(read.result, null, 'recoverable activation blockers must not become terminal relay results');
}

test('zero-cent compute refusal remains recoverable', async () => {
  await exercise(['estimated-cost-exceeds-reserved-ceiling'], 'COMPUTE_BUDGET_NOT_AUTHORIZED');
});

test('missing provider credential remains recoverable', async () => {
  await exercise(['ai-gateway-api-key-required'], 'PROVIDER_CREDENTIAL_REQUIRED');
});

test('missing pricing evidence remains recoverable', async () => {
  await exercise(['verified-pricing-config-required'], 'PROVIDER_PRICING_EVIDENCE_REQUIRED');
});

test('disabled provider remains recoverable', async () => {
  await exercise(['ai-gateway-executor-disabled'], 'PROVIDER_NOT_ACTIVATED');
});

test('provider capacity wall remains recoverable', async () => {
  await exercise(['ai-gateway-quota-or-rate-limit-http-429'], 'PROVIDER_CAPACITY_BLOCKED');
});
