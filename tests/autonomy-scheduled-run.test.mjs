import test from 'node:test';
import assert from 'node:assert/strict';

import { compileScheduledAutonomyRun } from '../src/agent-autonomy-scheduled-run.mjs';
import { compileRelayTaskFromIntent } from '../src/agent-autonomy-relay-adapter.mjs';
import { createGithubRelayTask } from '../src/github-relay.mjs';

const SESSION = Object.freeze({
  objective: 'Run bounded recurring Kilimanjaro reliability work',
  allowedAgents: ['chatgpt', 'claude-code'],
  startAgent: 'chatgpt',
  maxRounds: 8,
  maxTasks: 16,
  maxTotalTokens: 500_000,
  founderActionBudget: 0
});

const INITIAL = Object.freeze({
  originAgent: 'uberbond',
  targetAgent: 'chatgpt',
  kind: 'RESEARCH_REQUIRED',
  objective: 'Inspect current repository truth and return one bounded finding.',
  evidenceRefs: ['mission:kilimanjaro'],
  acceptanceTests: ['current main SHA is recorded'],
  constraints: ['local-preparation-only'],
  tokenBudget: 10_000
});

function scheduled(occurrenceKey, date) {
  return compileScheduledAutonomyRun({
    missionKey: 'mission:kilimanjaro:reliability-cluster',
    occurrenceKey,
    session: SESSION,
    initialIntent: INITIAL,
    date
  });
}

function relayInput(task) {
  return {
    taskId: task.taskId,
    objective: task.objective,
    originAgent: task.originAgent,
    targetAgent: task.targetAgent,
    parentTask: task.parentTask,
    contextRefs: task.contextRefs,
    evidenceRefs: task.evidenceRefs,
    constraints: task.constraints,
    forbiddenActions: task.forbiddenActions,
    requiredOutputs: task.requiredOutputs,
    acceptanceTests: task.acceptanceTests,
    budget: task.budget,
    economicObjective: task.economicObjective,
    consequenceClass: task.consequenceClass
  };
}

function fakeGithubClient() {
  const issues = [];
  return {
    issues,
    async listIssues() { return issues; },
    async createIssue(input) {
      const issue = {
        number: issues.length + 1,
        html_url: `https://example.invalid/issues/${issues.length + 1}`,
        body: input.body,
        labels: input.labels,
        state: 'OPEN'
      };
      issues.push(issue);
      return issue;
    }
  };
}

test('scheduler boundary makes later occurrences distinct at session, task and run identity', () => {
  const first = scheduled('schedule:2026-08-22T07:00:00+03:00', new Date('2026-08-22T04:00:00.000Z'));
  const second = scheduled('schedule:2026-08-22T08:00:00+03:00', new Date('2026-08-22T05:00:00.000Z'));

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.missionKey, second.missionKey);
  assert.notEqual(first.session.sessionId, second.session.sessionId);
  assert.notEqual(first.initialIntent.taskId, second.initialIntent.taskId);
  assert.notEqual(first.run.runId, second.run.runId);
});

test('restart reconstruction of the same occurrence keeps session, task and run identity stable', () => {
  const occurrence = 'github-actions:workflow:agent-mesh:run:32560000000';
  const before = scheduled(occurrence, new Date('2026-08-22T04:00:00.000Z'));
  const after = scheduled(occurrence, new Date('2026-08-22T04:41:17.000Z'));

  assert.equal(before.ok, true);
  assert.equal(after.ok, true);
  assert.notEqual(before.run.createdAt, after.run.createdAt);
  assert.equal(before.session.sessionId, after.session.sessionId);
  assert.equal(before.initialIntent.taskId, after.initialIntent.taskId);
  assert.equal(before.run.runId, after.run.runId);
});

test('scheduler cannot inject a precomputed sessionId or taskId around the occurrence boundary', () => {
  const withTaskId = compileScheduledAutonomyRun({
    occurrenceKey: 'occurrence:attack-task-id',
    session: SESSION,
    initialIntent: { ...INITIAL, taskId: 'attacker-controlled' }
  });
  assert.equal(withTaskId.ok, false);
  assert.deepEqual(withTaskId.reasonCodes, ['scheduler-cannot-inject-derived-identity']);

  const withSessionId = compileScheduledAutonomyRun({
    occurrenceKey: 'occurrence:attack-session-id',
    session: SESSION,
    initialIntent: { ...INITIAL, sessionId: 'legacy-collision' }
  });
  assert.equal(withSessionId.ok, false);
  assert.deepEqual(withSessionId.reasonCodes, ['scheduler-cannot-inject-derived-identity']);
});

test('GitHub relay dedupes a retry of the same occurrence but queues the next occurrence separately', async () => {
  const client = fakeGithubClient();
  const first = scheduled('schedule:occurrence:001', new Date('2026-08-22T04:00:00.000Z'));
  const retry = scheduled('schedule:occurrence:001', new Date('2026-08-22T04:10:00.000Z'));
  const next = scheduled('schedule:occurrence:002', new Date('2026-08-22T05:00:00.000Z'));

  const firstRelay = compileRelayTaskFromIntent(first.initialIntent, first.session, new Date('2026-08-22T04:00:00.000Z'));
  const retryRelay = compileRelayTaskFromIntent(retry.initialIntent, retry.session, new Date('2026-08-22T04:10:00.000Z'));
  const nextRelay = compileRelayTaskFromIntent(next.initialIntent, next.session, new Date('2026-08-22T05:00:00.000Z'));

  assert.equal(firstRelay.taskId, retryRelay.taskId);
  assert.notEqual(firstRelay.taskId, nextRelay.taskId);

  const queuedFirst = await createGithubRelayTask({
    client, owner: 'owner', repo: 'repo', input: relayInput(firstRelay), date: new Date('2026-08-22T04:00:00.000Z')
  });
  const queuedRetry = await createGithubRelayTask({
    client, owner: 'owner', repo: 'repo', input: relayInput(retryRelay), date: new Date('2026-08-22T04:10:00.000Z')
  });
  const queuedNext = await createGithubRelayTask({
    client, owner: 'owner', repo: 'repo', input: relayInput(nextRelay), date: new Date('2026-08-22T05:00:00.000Z')
  });

  assert.equal(queuedFirst.ok, true);
  assert.equal(queuedFirst.status, 'QUEUED');
  assert.equal(queuedRetry.ok, true);
  assert.equal(queuedRetry.status, 'ALREADY_QUEUED');
  assert.equal(queuedRetry.issueNumber, queuedFirst.issueNumber);
  assert.equal(queuedNext.ok, true);
  assert.equal(queuedNext.status, 'QUEUED');
  assert.notEqual(queuedNext.issueNumber, queuedFirst.issueNumber);
  assert.equal(client.issues.length, 2);
});
