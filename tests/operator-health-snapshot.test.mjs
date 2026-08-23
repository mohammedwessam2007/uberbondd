// The escalation kernel knows eleven ways the system is in trouble and had no
// way to look at the store, so nothing called it. This composes the snapshot it
// evaluates, from durable truth only.
//
// The property worth guarding is the one that makes a health report worth
// reading: a dimension this store could not answer is reported as unreadable,
// not defaulted to zero. "Nothing is wrong" and "we did not look" must never be
// the same value, because the second one is how a dead system looks healthy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { composeOperatorHealthSnapshot } from '../src/operator-health-snapshot.mjs';
import { evaluateOperatorHealth, persistOperatorEscalations } from '../src/operator-escalation.mjs';
import { DELIVERY_PROOF } from '../src/operator-escalation-transport.mjs';
import {
  beginAgentMeshCycleReceipt,
  finishAgentMeshCycleReceipt
} from '../src/agent-mesh-cycle-receipts.mjs';

const NOW = new Date('2026-08-23T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;

function memoryStore({ jobs = [] } = {}) {
  const rows = new Map();
  const order = [];
  return {
    rows,
    async get(key, id) { return structuredClone(rows.get(id) || null); },
    async add(key, item) {
      if (rows.has(item.id)) throw new Error('duplicate');
      rows.set(item.id, structuredClone(item));
      order.push(item.id);
      return structuredClone(item);
    },
    async log(type, detail) {
      const id = `a${order.length + 1}`;
      const row = { id, type, detail: structuredClone(detail), createdAt: detail.createdAt || NOW.toISOString() };
      rows.set(id, row);
      order.push(id);
      return structuredClone(row);
    },
    async list(key, options = {}) {
      if (key === 'jobs') return structuredClone(jobs);
      let out = order.map(id => rows.get(id)).filter(Boolean);
      if (options.filters?.type) out = out.filter(row => row.type === options.filters.type);
      return structuredClone(out.reverse().slice(0, options.limit || out.length));
    }
  };
}

async function cycle(store, key, startedAt, status = 'ADVANCED') {
  const begun = await beginAgentMeshCycleReceipt({
    store, occurrenceKey: key, startedAt, sourceCommit: 'health', policyVersions: ['p1']
  });
  await finishAgentMeshCycleReceipt({
    store, cycleId: begun.cycleId, finishedAt: new Date(startedAt.getTime() + 60_000),
    sourceCommit: 'health', policyVersions: ['p1'], status
  });
}

test('a healthy recent cycle produces a snapshot with no incidents', async () => {
  const store = memoryStore();
  await cycle(store, 'health/recent', new Date(NOW.getTime() - 10 * 60_000));

  const health = await composeOperatorHealthSnapshot({
    store, schedulerEnabled: true, expectedIntervalMinutes: 60, date: NOW
  });
  assert.equal(health.ok, true);
  assert.deepEqual(health.unreadable, []);
  assert.equal(health.snapshot.queue.abandonedCycles, 0);
  assert.equal(health.snapshot.queue.openDeadLetters, 0);
  assert.equal(health.snapshot.truth.nonZeroUnauthorizedEffects, 0);

  const report = evaluateOperatorHealth({ snapshot: health.snapshot, date: NOW });
  assert.equal(report.ok, true);
  assert.equal(report.health, 'HEALTHY');
  assert.equal(report.paging.decision, 'NO_NEW_PAGE_REQUIRED');
});

test('a scheduler that went silent past its interval is escalated', async () => {
  const store = memoryStore();
  await cycle(store, 'health/old', new Date(NOW.getTime() - 48 * HOUR));

  const health = await composeOperatorHealthSnapshot({
    store, schedulerEnabled: true, expectedIntervalMinutes: 60, date: NOW
  });
  const report = evaluateOperatorHealth({ snapshot: health.snapshot, date: NOW });
  assert.notEqual(report.health, 'HEALTHY');
  assert.ok(report.escalations.length > 0);
  assert.equal(report.paging.decision, 'PAGE_OWNER_REQUIRED');
});

test('an abandoned cycle reaches the owner action queue', async () => {
  const store = memoryStore();
  await cycle(store, 'health/recent', new Date(NOW.getTime() - 10 * 60_000));
  await beginAgentMeshCycleReceipt({
    store, occurrenceKey: 'health/crashed', startedAt: new Date(NOW.getTime() - 5 * HOUR),
    sourceCommit: 'health', policyVersions: ['p1']
  });

  const health = await composeOperatorHealthSnapshot({
    store, schedulerEnabled: true, expectedIntervalMinutes: 60, date: NOW
  });
  assert.equal(health.snapshot.queue.abandonedCycles, 1);

  const report = evaluateOperatorHealth({ snapshot: health.snapshot, date: NOW });
  assert.notEqual(report.health, 'HEALTHY');
  assert.ok(report.ownerActionQueue.length > 0);
  for (const item of report.ownerActionQueue) assert.ok(item.action, 'an escalation with no recommended action');
});

test('open dead letters are counted from the queue, not assumed', async () => {
  const store = memoryStore({ jobs: [{ status: 'dead-letter' }, { status: 'dead-letter' }, { status: 'done' }] });
  await cycle(store, 'health/recent', new Date(NOW.getTime() - 10 * 60_000));
  const health = await composeOperatorHealthSnapshot({ store, schedulerEnabled: true, date: NOW });
  assert.equal(health.snapshot.queue.openDeadLetters, 2);
});

test('a dimension the store cannot answer is reported unreadable, never as zero', async () => {
  const blind = {
    async log() { return { id: 'a1' }; },
    async list(key) {
      if (key === 'jobs') throw new Error('jobs unavailable');
      return [];
    },
    async get() { return null; },
    async add(_key, item) { return item; }
  };
  const health = await composeOperatorHealthSnapshot({ store: blind, schedulerEnabled: true, date: NOW });
  assert.ok(health.unreadable.includes('queue.openDeadLetters'));
  assert.equal(health.snapshot.queue.openDeadLetters, undefined,
    'an unreadable dimension was reported as zero, which is how a dead system looks healthy');
});

test('the report never claims a page was delivered', async () => {
  const store = memoryStore();
  await cycle(store, 'health/old', new Date(NOW.getTime() - 48 * HOUR));
  const health = await composeOperatorHealthSnapshot({
    store, schedulerEnabled: true, expectedIntervalMinutes: 60, date: NOW
  });
  const report = evaluateOperatorHealth({ snapshot: health.snapshot, date: NOW });

  assert.equal(report.paging.transport, 'UNCONFIGURED');
  // Was the literal 'NOT_AVAILABLE'. Same claim, more information: this is the
  // "nobody is configured to be told" case, not a failed or unknown delivery.
  assert.equal(report.paging.deliveryProof, DELIVERY_PROOF.NO_TRANSPORT_CONFIGURED);
  assert.notEqual(report.paging.deliveryProof, DELIVERY_PROOF.HUMAN_DELIVERY_PROVEN);
  assert.equal(report.businessEffectAuthority, 'NONE');
  for (const value of Object.values(report.externalEffectLedger)) assert.equal(value, 0);
});

test('escalations persist durably and are marked as not dispatched', async () => {
  const store = memoryStore();
  await cycle(store, 'health/old', new Date(NOW.getTime() - 48 * HOUR));
  const health = await composeOperatorHealthSnapshot({
    store, schedulerEnabled: true, expectedIntervalMinutes: 60, date: NOW
  });
  const report = evaluateOperatorHealth({ snapshot: health.snapshot, date: NOW });
  const persisted = await persistOperatorEscalations(store, report);

  assert.ok(persisted.length > 0);
  for (const row of persisted) {
    assert.equal(row.detail.transportStatus, 'NOT_DISPATCHED');
    assert.equal(row.detail.ownerRequired, true);
    assert.equal(row.detail.businessEffectAuthority, 'NONE');
  }
});

test('the same condition twice does not page twice', async () => {
  const store = memoryStore();
  await cycle(store, 'health/old', new Date(NOW.getTime() - 48 * HOUR));
  const health = await composeOperatorHealthSnapshot({
    store, schedulerEnabled: true, expectedIntervalMinutes: 60, date: NOW
  });
  const first = evaluateOperatorHealth({ snapshot: health.snapshot, date: NOW });
  const fingerprints = first.escalations.map(item => item.fingerprint);
  const second = evaluateOperatorHealth({ snapshot: health.snapshot, activeFingerprints: fingerprints, date: NOW });

  assert.ok(first.newEscalationCount > 0);
  assert.equal(second.newEscalationCount, 0);
  assert.equal(second.paging.decision, 'NO_NEW_PAGE_REQUIRED');
});
