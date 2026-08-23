// The fail-closed half of a mid-cycle crash was already right: the occurrence
// can never be re-delivered, so no consequence happens twice. The other half
// was silent. Founder-absence readiness is derived from terminal receipts, and
// a cycle that died between STARTED and TERMINAL wrote no terminal receipt --
// so it was not a failed tick, it was nothing at all. A mesh crashing every
// other cycle could present an unbroken run of healthy cycles and certify a
// seven-day absence on it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  beginAgentMeshCycleReceipt,
  finishAgentMeshCycleReceipt,
  findAbandonedAgentMeshCycles,
  listStartedAgentMeshCycleReceipts,
  listTerminalAgentMeshCycleReceipts,
  reconcileAbandonedAgentMeshCycles
} from '../src/agent-mesh-cycle-receipts.mjs';
import { evaluateFounderAbsenceReadinessFromDurableHistory } from '../src/founder-absence-readiness.mjs';

const COMMIT = 'deadbee';
const POLICIES = ['agent-mesh-control-plane-1.2.0'];
const HOUR = 60 * 60 * 1000;

function memoryStore() {
  const rows = new Map();
  const order = [];
  return {
    rows,
    async get(key, id) { return structuredClone(rows.get(id) || null); },
    async add(key, item) {
      if (rows.has(item.id)) throw new Error(`duplicate:${item.id}`);
      rows.set(item.id, structuredClone(item));
      order.push(item.id);
      return structuredClone(item);
    },
    async list(key, options = {}) {
      if (key === 'jobs') return [];
      let out = order.map(id => rows.get(id));
      if (options.filters?.type) out = out.filter(row => row.type === options.filters.type);
      return structuredClone(out.slice(0, options.limit || out.length));
    }
  };
}

function capabilities() {
  const caps = {};
  for (const name of ['durableState', 'scheduler', 'agentRelay', 'agentWorkers', 'boundedBudgets',
    'staleRecovery', 'truthReceipts', 'killSwitch', 'paymentObservation', 'deliveryObservation',
    'ownerEscalationQueue']) {
    caps[name] = { status: 'VERIFIED_LIVE', evidenceRefs: [`receipt:${name}`], externallyVerified: true };
  }
  return caps;
}

/** A history that genuinely spans eight days of healthy cycles ending just before `now`. */
async function healthyHistory(store, now, { cycles = 24 } = {}) {
  const spanMs = 8 * 24 * HOUR;
  const step = spanMs / (cycles - 1);
  const start = now.getTime() - spanMs - 5 * 60_000;
  for (let index = 0; index < cycles; index += 1) {
    const startedAt = new Date(start + index * step);
    const begun = await beginAgentMeshCycleReceipt({
      store, occurrenceKey: `occ-${index}`, startedAt, sourceCommit: COMMIT, policyVersions: POLICIES
    });
    await finishAgentMeshCycleReceipt({
      store, cycleId: begun.cycleId, finishedAt: new Date(startedAt.getTime() + 60_000),
      sourceCommit: COMMIT, policyVersions: POLICIES, status: 'ADVANCED'
    });
  }
}

async function crash(store, key, startedAt) {
  return beginAgentMeshCycleReceipt({
    store, occurrenceKey: key, startedAt, sourceCommit: COMMIT, policyVersions: POLICIES
  });
}

async function readiness(store, now) {
  return evaluateFounderAbsenceReadinessFromDurableHistory({
    store,
    capabilities: capabilities(),
    targetDays: 7,
    now,
    currentSourceCommit: COMMIT,
    currentPolicyVersions: POLICIES
  });
}

test('a clean eight-day history certifies a seven-day absence', async () => {
  const store = memoryStore();
  const now = new Date('2026-08-23T00:00:00.000Z');
  await healthyHistory(store, now);
  const result = await readiness(store, now);
  assert.equal(result.status, 'KILIMANJARO_READY');
  assert.equal(result.observationProof.abandonedCycles, 0);
  assert.equal(result.durableHistory.abandonedCycles, 0);
});

test('a cycle that crashed before terminalizing blocks that same certification', async () => {
  const store = memoryStore();
  const now = new Date('2026-08-23T00:00:00.000Z');
  await healthyHistory(store, now);
  await crash(store, 'killed-mid-cycle', new Date(now.getTime() - 3 * HOUR));

  const result = await readiness(store, now);
  assert.notEqual(result.status, 'KILIMANJARO_READY');
  assert.equal(result.durableHistory.abandonedCycles, 1);
  assert.ok(result.observationProof.reasonCodes.includes('abandoned-mesh-cycles-present'));
});

test('a cycle still inside its horizon is presumed running, not abandoned', async () => {
  const store = memoryStore();
  const now = new Date('2026-08-23T00:00:00.000Z');
  await healthyHistory(store, now);
  await crash(store, 'still-running', new Date(now.getTime() - 5 * 60_000));

  const abandoned = await findAbandonedAgentMeshCycles({ store, now, abandonedAfterMs: HOUR });
  assert.equal(abandoned.length, 0);
  const result = await readiness(store, now);
  assert.equal(result.status, 'KILIMANJARO_READY');
});

test('reconciliation turns an abandoned cycle into a recorded DEGRADED failure', async () => {
  const store = memoryStore();
  const now = new Date('2026-08-23T00:00:00.000Z');
  await healthyHistory(store, now);
  await crash(store, 'killed-mid-cycle', new Date(now.getTime() - 3 * HOUR));

  const reconciliation = await reconcileAbandonedAgentMeshCycles({ store, now, abandonedAfterMs: HOUR });
  assert.equal(reconciliation.abandonedFound, 1);
  assert.equal(reconciliation.reconciled.length, 1);

  const terminal = await listTerminalAgentMeshCycleReceipts({ store });
  const recorded = terminal.find(receipt => receipt.reasonCodes?.includes('cycle-abandoned-before-terminal'));
  assert.ok(recorded, 'the crash was not written down');
  assert.equal(recorded.status, 'DEGRADED');
  assert.equal(recorded.businessEffectAuthority, 'NONE');

  // The failure is now visible as a failure -- and one that nothing has
  // recovered from yet, so it still refuses to certify.
  const result = await readiness(store, now);
  assert.equal(result.durableHistory.abandonedCycles, 0);
  assert.ok(result.observationProof.failedTicks >= 1);
  assert.notEqual(result.status, 'KILIMANJARO_READY');
  assert.ok(result.observationProof.reasonCodes.includes('unrecovered-failed-ticks-present'));
});

test('a healthy cycle after the recorded failure counts as a recovery', async () => {
  const store = memoryStore();
  const now = new Date('2026-08-23T00:00:00.000Z');
  await healthyHistory(store, now, { cycles: 23 });
  await crash(store, 'killed-mid-cycle', new Date(now.getTime() - 5 * HOUR));
  await reconcileAbandonedAgentMeshCycles({ store, now: new Date(now.getTime() - 3 * HOUR), abandonedAfterMs: HOUR });

  const recoveredAt = new Date(now.getTime() - 2 * HOUR);
  const begun = await beginAgentMeshCycleReceipt({
    store, occurrenceKey: 'recovery-cycle', startedAt: recoveredAt, sourceCommit: COMMIT, policyVersions: POLICIES
  });
  await finishAgentMeshCycleReceipt({
    store, cycleId: begun.cycleId, finishedAt: new Date(recoveredAt.getTime() + 60_000),
    sourceCommit: COMMIT, policyVersions: POLICIES, status: 'ADVANCED'
  });

  const result = await readiness(store, now);
  assert.equal(result.observationProof.failedTicks, 1);
  assert.equal(result.observationProof.recoveredTicks, 1);
  assert.equal(result.status, 'KILIMANJARO_READY');
});

test('reconciling twice is idempotent and does not invent a second failure', async () => {
  const store = memoryStore();
  const now = new Date('2026-08-23T00:00:00.000Z');
  await healthyHistory(store, now);
  await crash(store, 'killed-mid-cycle', new Date(now.getTime() - 3 * HOUR));

  const first = await reconcileAbandonedAgentMeshCycles({ store, now, abandonedAfterMs: HOUR });
  const second = await reconcileAbandonedAgentMeshCycles({ store, now, abandonedAfterMs: HOUR });
  assert.equal(first.abandonedFound, 1);
  assert.equal(second.abandonedFound, 0);

  const terminal = await listTerminalAgentMeshCycleReceipts({ store });
  const degraded = terminal.filter(receipt => receipt.status === 'DEGRADED');
  assert.equal(degraded.length, 1);
});

test('started receipts are listable in start order and separate from terminal ones', async () => {
  const store = memoryStore();
  const now = new Date('2026-08-23T00:00:00.000Z');
  await crash(store, 'b', new Date(now.getTime() - 2 * HOUR));
  await crash(store, 'a', new Date(now.getTime() - 4 * HOUR));
  const started = await listStartedAgentMeshCycleReceipts({ store });
  assert.equal(started.length, 2);
  assert.ok(Date.parse(started[0].startedAt) < Date.parse(started[1].startedAt));
  assert.deepEqual(await listTerminalAgentMeshCycleReceipts({ store }), []);
});
