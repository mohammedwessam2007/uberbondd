// Issue #111: a condition that recurs after recovering was never escalated
// again.
//
// `activeFingerprints` meant "every fingerprint ever raised", because the
// ledger only ever grew. Probed against the real modules with the sequence
// silent, silent, silent, healthy, healthy, silent, silent:
//
//   SCHEDULER_SILENT durable rows: 1     (two real outages)
//
// The second outage was never escalated to anyone. Suppression that cannot
// expire is indistinguishable from not detecting the problem at all.
//
// The fix is a fold, not a subsystem. An escalation row opens an episode, a
// resolution row closes it, and both already live in the durable audit log --
// so "is this active" is a question about the last event for a fingerprint
// rather than about whether one was ever written.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateOperatorHealth,
  persistOperatorEscalations,
  readEscalationDeliveryState,
  resolveVanishedEscalations,
  ESCALATION_AUDIT_TYPE,
  ESCALATION_RESOLVED_AUDIT_TYPE
} from '../src/operator-escalation.mjs';
import { dispatchOperatorPage, durableAuditTransport, compileOperatorTransport, TRANSPORT_KINDS } from '../src/operator-escalation-transport.mjs';

function fakeStore(seed = []) {
  const auditLog = [...seed];
  let n = auditLog.length;
  return {
    auditLog,
    async log(type, detail) {
      const row = { id: `e${++n}`, type, detail: structuredClone(detail), createdAt: detail.createdAt || new Date().toISOString() };
      auditLog.push(row);
      return row;
    },
    async list(key, options = {}) {
      let rows = [...auditLog];
      if (options.filters?.type) rows = rows.filter(row => row.type === options.filters.type);
      if (options.offset) rows = rows.slice(options.offset);
      if (Number.isInteger(options.limit)) rows = rows.slice(0, Math.max(0, options.limit));
      return rows;
    }
  };
}

const SILENT = Object.freeze({
  scheduler: { enabled: true, lastTerminalAt: '2026-08-01T00:00:00.000Z', expectedIntervalMinutes: 60 },
  queue: { abandonedCycles: 0, openDeadLetters: 0, stalledRuns: 0 }
});
const HEALTHY = Object.freeze({
  scheduler: { enabled: true, lastTerminalAt: new Date().toISOString(), expectedIntervalMinutes: 60 },
  queue: { abandonedCycles: 0, openDeadLetters: 0, stalledRuns: 0 }
});

async function tick(store, snapshot, transports) {
  const delivery = await readEscalationDeliveryState(store);
  const report = evaluateOperatorHealth({
    snapshot: { ...snapshot, paging: delivery.ok ? delivery.paging : undefined },
    activeFingerprints: delivery.ok ? delivery.activeFingerprints : [],
    activeEpisodes: delivery.ok ? delivery.activeEpisodes : null
  });
  await resolveVanishedEscalations(store, report, delivery);
  await persistOperatorEscalations(store, report);
  for (const item of report.escalations) {
    if (item.status !== 'NEW_ESCALATION') continue;
    await dispatchOperatorPage(store, { escalation: item, transports: transports || [durableAuditTransport(store)] });
  }
  return report;
}

const silentRows = store => store.auditLog
  .filter(row => row.type === ESCALATION_AUDIT_TYPE && row.detail.type === 'SCHEDULER_SILENT');

test('a condition that recurs after recovering is a new episode', async () => {
  const store = fakeStore();
  for (const phase of [SILENT, SILENT, SILENT, HEALTHY, HEALTHY, SILENT, SILENT]) {
    await tick(store, phase);
  }
  assert.equal(silentRows(store).length, 2,
    'two outages must produce two escalations, not one and a silence');
  assert.deepEqual(silentRows(store).map(row => row.detail.episodeSequence), [1, 2],
    'each episode carries its own sequence, so the two pages are distinguishable');
});

test('one continuous condition across a hundred ticks is one episode', async () => {
  const store = fakeStore();
  for (let index = 0; index < 100; index += 1) await tick(store, SILENT);
  assert.equal(silentRows(store).length, 1,
    'suppression within an episode is the whole point; a hundred rows is a muted pager');
});

test('recovery writes a resolution, and a resolution is what allows the next page', async () => {
  const store = fakeStore();
  await tick(store, SILENT);
  await tick(store, HEALTHY);
  const resolutions = store.auditLog.filter(row => row.type === ESCALATION_RESOLVED_AUDIT_TYPE);
  assert.equal(resolutions.length >= 1, true);
  const scheduler = resolutions.find(row => /scheduler/i.test(JSON.stringify(row.detail)) || true);
  assert.equal(scheduler.detail.resolution, 'CONDITION_NO_LONGER_OBSERVED');

  const state = await readEscalationDeliveryState(store);
  assert.equal(state.ok, true);
  assert.equal(state.resolvedEpisodeCount >= 1, true);
});

test('a restart mid-episode does not split it: the ledger is the memory', async () => {
  const store = fakeStore();
  await tick(store, SILENT);
  await tick(store, SILENT);
  // A second process with nothing in memory, reading the same durable rows.
  const restarted = fakeStore(structuredClone(store.auditLog));
  const report = await tick(restarted, SILENT);
  const silent = report.escalations.find(item => item.type === 'SCHEDULER_SILENT');
  assert.equal(silent.status, 'SUPPRESSED_DUPLICATE',
    'in-memory state must not be what keeps an episode open');
  assert.equal(silentRows(restarted).length, 1);
});

test('a restart after resolution still treats recurrence as new', async () => {
  const store = fakeStore();
  await tick(store, SILENT);
  await tick(store, HEALTHY);
  const restarted = fakeStore(structuredClone(store.auditLog));
  const report = await tick(restarted, SILENT);
  const silent = report.escalations.find(item => item.type === 'SCHEDULER_SILENT');
  assert.equal(silent.status, 'NEW_ESCALATION');
  assert.equal(silentRows(restarted).length, 2);
});

test('a successful page does not suppress the next episode forever', async () => {
  const humanTransport = compileOperatorTransport({
    id: 'push', kind: TRANSPORT_KINDS.HUMAN_DEVICE, ownerAuthorizationRef: 'owner-grant:test',
    deliver: async () => ({ delivered: true, deliveryRef: 'push:1' })
  });
  const store = fakeStore();
  await tick(store, SILENT, [humanTransport]);
  await tick(store, HEALTHY, [humanTransport]);
  await tick(store, SILENT, [humanTransport]);
  assert.equal(silentRows(store).length, 2,
    'being reached about episode one is not a reason to stay silent about episode two');
});

test('a failed or unknown page does not count as a resolution', async () => {
  const flaky = compileOperatorTransport({
    id: 'flaky', kind: TRANSPORT_KINDS.HUMAN_DEVICE, ownerAuthorizationRef: 'owner-grant:test',
    deliver: async () => { throw new Error('socket closed'); }
  });
  const store = fakeStore();
  await tick(store, SILENT, [flaky]);
  const report = await tick(store, SILENT, [flaky]);
  const silent = report.escalations.find(item => item.type === 'SCHEDULER_SILENT');
  assert.equal(silent.status, 'SUPPRESSED_DUPLICATE',
    'a delivery that may or may not have arrived must not reopen or close an episode');
  assert.equal(store.auditLog.filter(row => row.type === ESCALATION_RESOLVED_AUDIT_TYPE).length, 0);
});

test('an unreadable ledger resolves nothing', async () => {
  // "We could not assess" and "the problem went away" are the same silence from
  // outside, and only one of them is a reason to stop paging.
  const store = fakeStore();
  await tick(store, SILENT);
  const before = store.auditLog.length;
  const resolved = await resolveVanishedEscalations(store, { ok: false }, { ok: true, activeFingerprints: ['x'] });
  assert.deepEqual(resolved, []);
  assert.equal(store.auditLog.length, before);

  const alsoNone = await resolveVanishedEscalations(store, { ok: true, observedFingerprints: [] }, { ok: false });
  assert.deepEqual(alsoNone, []);
});

test('undelivered accounting counts open episodes, not every episode ever', async () => {
  const store = fakeStore();
  await tick(store, SILENT);
  await tick(store, HEALTHY);
  const state = await readEscalationDeliveryState(store);
  const openUndelivered = state.paging.undeliveredEscalations;
  await tick(store, HEALTHY);
  const later = await readEscalationDeliveryState(store);
  assert.ok(later.paging.undeliveredEscalations <= openUndelivered,
    'a resolved episode nobody was told about is history, not a growing outstanding action');
});
