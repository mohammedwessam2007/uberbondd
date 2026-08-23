// #93 gave recurring work a restart-stable identity, and nothing in production
// ever used it. The mesh tick pumps whatever runs already exist; no production
// path created one with an occurrence identity, so compileScheduledAutonomyRun
// was a compiler nobody compiled with. Issue #100 named this directly: do not
// merge a dead compiler and call the issue solved.
//
// A reachability walk from server.mjs, worker.mjs and scripts/agent-mesh-tick.mjs
// confirmed it, which is why the last test here is a reachability assertion
// rather than a behavioural one -- a green suite says nothing about whether a
// module can be reached.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMissionSpec, seedScheduledMission } from '../src/agent-mesh-mission-seed.mjs';
import { loadLatestAutonomyRun } from '../src/agent-autonomy-store.mjs';
import { reachableFromEntryPoints } from '../scripts/system-readiness.mjs';

const OCCURRENCE = 'mission/nightly#2026-08-23T04:00:00Z';

function durableStore() {
  const auditLog = [];
  return {
    auditLog,
    async log(type, detail) {
      const row = {
        id: `a${auditLog.length + 1}`,
        type,
        detail: structuredClone(detail),
        createdAt: detail.createdAt || new Date().toISOString()
      };
      auditLog.push(row);
      return row;
    },
    async list(key, options = {}) {
      let rows = [...auditLog];
      if (options.filters?.type) rows = rows.filter(row => row.type === options.filters.type);
      return structuredClone(rows.slice(0, options.limit || rows.length));
    }
  };
}

const MISSION = Object.freeze({
  objective: 'Research a bounded opportunity every night',
  acceptanceTests: ['bounded research acceptance'],
  constraints: ['no-customer-contact'],
  maxRounds: 8,
  maxTasks: 8
});

test('a mission spec is parsed, or refused with a reason', () => {
  assert.deepEqual(parseMissionSpec(''), { ok: true, present: false, mission: null, reasonCodes: [] });
  assert.equal(parseMissionSpec(undefined).present, false);

  const bad = parseMissionSpec('{not json');
  assert.equal(bad.ok, false);
  assert.ok(bad.reasonCodes.includes('mission-spec-json-required'));

  assert.equal(parseMissionSpec('[]').ok, false);
  assert.ok(parseMissionSpec('{"acceptanceTests":["a"]}').reasonCodes.includes('mission-objective-required'));
  assert.ok(parseMissionSpec('{"objective":"o"}').reasonCodes.includes('mission-acceptance-tests-required'));

  const good = parseMissionSpec(JSON.stringify(MISSION));
  assert.equal(good.ok, true);
  assert.equal(good.present, true);
  assert.equal(good.mission.objective, MISSION.objective);
});

test('no configured mission seeds nothing and is not an error', async () => {
  const store = durableStore();
  const result = await seedScheduledMission({ store, mission: null, occurrenceKey: OCCURRENCE });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'DISABLED');
  assert.equal(result.seeded, false);
  assert.equal(store.auditLog.length, 0);
});

test('a configured mission seeds exactly one durable run for the occurrence', async () => {
  const store = durableStore();
  const result = await seedScheduledMission({ store, mission: MISSION, occurrenceKey: OCCURRENCE });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'SEEDED');
  assert.equal(result.seeded, true);
  assert.equal(result.businessEffectAuthority, 'NONE');

  const loaded = await loadLatestAutonomyRun(store, result.runId);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.run.session.objective, MISSION.objective);
  assert.ok(loaded.run.currentIntent.constraints.includes('no-customer-contact'));
  assert.equal(loaded.run.currentIntent.consequenceClass, 'LOCAL_PREPARATION');
});

test('redelivering the same occurrence does not create a second run', async () => {
  const store = durableStore();
  const first = await seedScheduledMission({ store, mission: MISSION, occurrenceKey: OCCURRENCE });
  const second = await seedScheduledMission({ store, mission: MISSION, occurrenceKey: OCCURRENCE });
  const third = await seedScheduledMission({ store, mission: MISSION, occurrenceKey: OCCURRENCE });

  assert.equal(first.status, 'SEEDED');
  assert.equal(second.status, 'ALREADY_SEEDED');
  assert.equal(third.status, 'ALREADY_SEEDED');
  assert.equal(second.runId, first.runId);
  assert.equal(third.runId, first.runId);

  const snapshots = store.auditLog.filter(row => row.type === 'agent_autonomy_run_snapshot');
  assert.equal(snapshots.length, 1, `${snapshots.length} runs were created for one occurrence`);
});

test('the next occurrence of the same mission gets its own run', async () => {
  const store = durableStore();
  const first = await seedScheduledMission({ store, mission: MISSION, occurrenceKey: OCCURRENCE });
  const next = await seedScheduledMission({
    store, mission: MISSION, occurrenceKey: 'mission/nightly#2026-08-24T04:00:00Z'
  });
  assert.equal(next.status, 'SEEDED');
  assert.notEqual(next.runId, first.runId);
  // Same logical mission across both occurrences.
  assert.equal(next.missionKey, first.missionKey);
});

test('seeding refuses without an occurrence key or a usable store', async () => {
  const store = durableStore();
  const noKey = await seedScheduledMission({ store, mission: MISSION, occurrenceKey: '' });
  assert.equal(noKey.ok, false);
  assert.ok(noKey.reasonCodes.includes('scheduler-occurrence-key-required'));

  const noStore = await seedScheduledMission({ store: {}, mission: MISSION, occurrenceKey: OCCURRENCE });
  assert.equal(noStore.ok, false);
  assert.ok(noStore.reasonCodes.includes('store-log-and-list-required'));
});

test('a saturated scan refuses to seed rather than risking a duplicate run', async () => {
  // "No such run" and "the run is past the scan bound" are the same observation
  // from inside the store, and seeding on that ambiguity creates a second run
  // for one occurrence.
  const saturated = {
    async log(type, detail) { return { id: 'a1', type, detail, createdAt: new Date().toISOString() }; },
    async list() {
      return Array.from({ length: 2000 }, (_, index) => ({
        id: `a${index + 1}`,
        type: 'agent_autonomy_run_snapshot',
        detail: { runId: 'someone_else', createdAt: new Date().toISOString(), run: null },
        createdAt: new Date().toISOString()
      }));
    }
  };
  const result = await seedScheduledMission({ store: saturated, mission: MISSION, occurrenceKey: OCCURRENCE });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('autonomy-run-snapshot-scan-saturated'));
});

test('the occurrence-identity layer is reachable from a production entry point', () => {
  const reachable = reachableFromEntryPoints();
  for (const module of [
    'src/agent-mesh-mission-seed.mjs',
    'src/agent-autonomy-scheduled-run.mjs',
    'src/agent-autonomy-occurrence.mjs'
  ]) {
    assert.ok(reachable.has(module), `${module} is not reachable from any production entry point`);
  }
});
