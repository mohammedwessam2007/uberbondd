import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compileAutonomyOccurrenceSession,
  compileAutonomyOccurrenceTaskIntent
} from '../src/agent-autonomy-occurrence.mjs';

const BASE = Object.freeze({
  objective: 'Run the bounded Kilimanjaro reliability mission',
  allowedAgents: ['chatgpt', 'claude-code'],
  startAgent: 'chatgpt',
  maxRounds: 8,
  maxTasks: 16,
  maxTotalTokens: 500_000,
  founderActionBudget: 0,
  date: new Date('2026-08-22T07:00:00.000Z')
});

function initialIntent(session) {
  return compileAutonomyOccurrenceTaskIntent({
    session,
    originAgent: 'uberbond',
    targetAgent: 'chatgpt',
    kind: 'RESEARCH_REQUIRED',
    objective: 'Inspect the current repository and produce one evidence-backed finding.',
    evidenceRefs: ['mission:kilimanjaro'],
    acceptanceTests: ['current main SHA is recorded'],
    constraints: ['local-preparation-only'],
    tokenBudget: 10_000,
    date: new Date('2026-08-22T07:00:00.000Z')
  });
}

test('different explicit schedule occurrences produce different session and task identities', () => {
  const first = compileAutonomyOccurrenceSession({ ...BASE, occurrenceKey: 'schedule:2026-08-22T07:00:00+03:00' });
  const second = compileAutonomyOccurrenceSession({ ...BASE, occurrenceKey: 'schedule:2026-08-22T08:00:00+03:00' });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.missionKey, second.missionKey);
  assert.notEqual(first.sessionId, second.sessionId);

  const firstTask = initialIntent(first);
  const secondTask = initialIntent(second);
  assert.equal(firstTask.ok, true);
  assert.equal(secondTask.ok, true);
  assert.notEqual(firstTask.taskId, secondTask.taskId);
});

test('recompiling the same occurrence after restart preserves session and task identity', () => {
  const beforeRestart = compileAutonomyOccurrenceSession({ ...BASE, occurrenceKey: 'github-actions:run-32560000000:attempt-1' });
  const afterRestart = compileAutonomyOccurrenceSession({ ...BASE, occurrenceKey: 'github-actions:run-32560000000:attempt-1' });

  assert.equal(beforeRestart.sessionId, afterRestart.sessionId);
  assert.equal(beforeRestart.missionKey, afterRestart.missionKey);
  assert.equal(initialIntent(beforeRestart).taskId, initialIntent(afterRestart).taskId);
});

test('same logical mission may use an explicit stable mission key across different occurrences', () => {
  const missionKey = 'mission:kilimanjaro:reliability-cluster';
  const first = compileAutonomyOccurrenceSession({ ...BASE, missionKey, occurrenceKey: 'occurrence:001' });
  const second = compileAutonomyOccurrenceSession({ ...BASE, missionKey, occurrenceKey: 'occurrence:002' });

  assert.equal(first.missionKey, missionKey);
  assert.equal(second.missionKey, missionKey);
  assert.notEqual(first.sessionId, second.sessionId);
});

test('missing occurrence identity fails closed rather than reverting to collision-prone identity', () => {
  const result = compileAutonomyOccurrenceSession(BASE);
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasonCodes, ['occurrence-key-required']);
});

test('ordinary autonomy sessions cannot be silently passed through the occurrence task compiler', async () => {
  const { compileAutonomySession } = await import('../src/agent-autonomy-loop.mjs');
  const legacy = compileAutonomySession(BASE);
  const result = compileAutonomyOccurrenceTaskIntent({
    session: legacy,
    originAgent: 'uberbond',
    targetAgent: 'chatgpt',
    objective: 'should refuse',
    evidenceRefs: ['mission:kilimanjaro'],
    acceptanceTests: ['must refuse']
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.reasonCodes, ['valid-occurrence-session-required']);
});
