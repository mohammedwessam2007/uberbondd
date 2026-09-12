import test from 'node:test';
import assert from 'node:assert/strict';
import { compileInitiativeOccurrence, seedInitiativeCycle } from '../src/north-star-initiative-dispatch.mjs';
import { loadLatestAutonomyRun } from '../src/agent-autonomy-store.mjs';

const BASE = 'a'.repeat(40);
const PORTFOLIO = 'b'.repeat(64);
const REALITY = 'c'.repeat(64);
const GOAL = 'initiative-test-goal';

function durableStore() {
  const auditLog = [];
  return {
    auditLog,
    async log(type, detail) {
      const row = { id: `a${auditLog.length + 1}`, type, detail: structuredClone(detail), createdAt: detail.createdAt || new Date().toISOString() };
      auditLog.push(row);
      return row;
    },
    async list(_key, options = {}) {
      let rows = [...auditLog];
      if (options.filters?.type) rows = rows.filter(row => row.type === options.filters.type);
      return structuredClone(rows.slice(0, options.limit || rows.length));
    }
  };
}

function cycle(overrides = {}) {
  return {
    ok: true,
    status: 'NORTH_STAR_INITIATIVE_CYCLE_READY',
    portfolio: {
      sourceCommit: BASE,
      portfolioId: PORTFOLIO,
      realityDigest: REALITY,
      selectedCandidateId: GOAL
    },
    goalContract: { id: GOAL },
    agentMeshMission: {
      missionKey: GOAL,
      objective: 'Advance one bounded North-Star mission from observed current reality.',
      acceptanceTests: ['receipt exists', 'zero external authority'],
      evidenceRefs: ['mission:initiative-test-goal'],
      constraints: ['local-preparation-only'],
      targetAgent: 'chatgpt',
      maxRounds: 3,
      maxTasks: 6,
      maxTotalTokens: 60000,
      founderActionBudget: 0,
      tokenBudget: 60000
    },
    ...overrides
  };
}

test('one exact source/reality cycle compiles one stable occurrence identity', () => {
  const first = compileInitiativeOccurrence(cycle());
  const second = compileInitiativeOccurrence(cycle());
  assert.equal(first.ok, true);
  assert.equal(first.occurrenceKey, second.occurrenceKey);
  assert.match(first.occurrenceKey, /^north-star\/[a-f0-9]{40}\/[a-f0-9]{64}$/);
  assert.equal(first.externalEffectAuthority, 'NONE');
});

test('initiative cycle seeds an actual durable Agent Mesh autonomy run', async () => {
  const store = durableStore();
  const dispatched = await seedInitiativeCycle({ store, cycle: cycle(), date: new Date('2026-09-12T15:30:00Z') });
  assert.equal(dispatched.ok, true);
  assert.equal(dispatched.status, 'NORTH_STAR_INITIATIVE_DISPATCHED');
  assert.equal(dispatched.duplicate, false);
  assert.ok(dispatched.runId);
  const loaded = await loadLatestAutonomyRun(store, dispatched.runId);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.run.session.objective, cycle().agentMeshMission.objective);
  assert.equal(loaded.run.currentIntent.consequenceClass, 'LOCAL_PREPARATION');
  assert.ok(loaded.run.currentIntent.constraints.includes('local-preparation-only'));
});

test('same reality delivery is idempotent and cannot create a duplicate run', async () => {
  const store = durableStore();
  const first = await seedInitiativeCycle({ store, cycle: cycle() });
  const second = await seedInitiativeCycle({ store, cycle: cycle() });
  assert.equal(first.status, 'NORTH_STAR_INITIATIVE_DISPATCHED');
  assert.equal(second.status, 'NORTH_STAR_INITIATIVE_ALREADY_DISPATCHED');
  assert.equal(second.runId, first.runId);
  assert.equal(store.auditLog.filter(row => row.type === 'agent_autonomy_run_snapshot').length, 1);
});

test('changed reality produces a distinct occurrence while preserving logical mission identity', async () => {
  const store = durableStore();
  const first = await seedInitiativeCycle({ store, cycle: cycle() });
  const changed = cycle({ portfolio: { sourceCommit: BASE, portfolioId: 'd'.repeat(64), realityDigest: 'e'.repeat(64), selectedCandidateId: GOAL } });
  const second = await seedInitiativeCycle({ store, cycle: changed });
  assert.notEqual(second.occurrenceKey, first.occurrenceKey);
  assert.notEqual(second.runId, first.runId);
  assert.equal(second.missionKey, first.missionKey);
});

test('invalid identity or widened founder-action budget is refused before durable seeding', async () => {
  const store = durableStore();
  const widened = cycle();
  widened.agentMeshMission.founderActionBudget = 1;
  const refused = await seedInitiativeCycle({ store, cycle: widened });
  assert.equal(refused.ok, false);
  assert.ok(refused.reasonCodes.includes('zero-founder-action-budget-required'));
  assert.equal(store.auditLog.length, 0);

  const mismatched = cycle();
  mismatched.goalContract.id = 'different-goal';
  const wrong = compileInitiativeOccurrence(mismatched);
  assert.equal(wrong.ok, false);
  assert.ok(wrong.reasonCodes.includes('selected-goal-identity-required'));
});
