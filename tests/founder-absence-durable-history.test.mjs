import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateFounderAbsenceReadinessFromDurableHistory
} from '../src/founder-absence-readiness.mjs';
import {
  beginAgentMeshCycleReceipt,
  finishAgentMeshCycleReceipt
} from '../src/agent-mesh-cycle-receipts.mjs';

const NAMES = [
  'durableState','scheduler','agentRelay','agentWorkers','boundedBudgets','staleRecovery',
  'truthReceipts','killSwitch','paymentObservation','deliveryObservation','ownerEscalationQueue'
];

function liveCapabilities() {
  return Object.fromEntries(NAMES.map(name => [name, {
    status: 'VERIFIED_LIVE',
    evidenceRefs: [`receipt:${name}`],
    externallyVerified: true
  }]));
}

function memoryStore() {
  const rows = { auditLog: [], jobs: [] };
  return {
    rows,
    async log(type, detail) {
      const row = { id: `${type}:${rows.auditLog.length + 1}`, type, detail: structuredClone(detail), createdAt: detail.finishedAt || detail.startedAt || new Date().toISOString() };
      rows.auditLog.push(row);
      return structuredClone(row);
    },
    async list(collection, options = {}) {
      const source = rows[collection] || [];
      const wantedType = options?.filters?.type;
      const filtered = wantedType ? source.filter(row => row.type === wantedType) : source;
      return structuredClone(filtered.slice(0, options?.limit || filtered.length));
    }
  };
}

async function addTerminal(store, { occurrenceKey, at, status = 'ADVANCED', sourceCommit = 'abc123', policyVersions = ['mesh-policy-1'] }) {
  const startedAt = new Date(at);
  const begun = await beginAgentMeshCycleReceipt({ store, occurrenceKey, startedAt, sourceCommit, policyVersions, workers: [] });
  await finishAgentMeshCycleReceipt({
    store,
    cycleId: begun.cycleId,
    startedAt,
    finishedAt: startedAt,
    sourceCommit,
    policyVersions,
    status,
    firstSweep: { ok: true, status: 'OK', runsConsidered: 1, runsTicked: status === 'IDLE' ? 0 : 1, failed: 0 },
    workers: [],
    secondSweep: null
  });
}

const COMMON = {
  capabilities: liveCapabilities(),
  targetDays: 7,
  currentSourceCommit: 'abc123',
  currentPolicyVersions: ['mesh-policy-1'],
  now: new Date('2026-08-22T12:30:00.000Z')
};

test('durable history can certify duration without caller-supplied aggregate proof', async () => {
  const store = memoryStore();
  for (let day = 0; day <= 7; day += 1) {
    await addTerminal(store, {
      occurrenceKey: `mesh:2026-08-${String(15 + day).padStart(2, '0')}`,
      at: new Date(Date.UTC(2026, 7, 15 + day, 12, 0, 0)).toISOString()
    });
  }
  const result = await evaluateFounderAbsenceReadinessFromDurableHistory({ store, ...COMMON });
  assert.equal(result.status, 'KILIMANJARO_READY');
  assert.equal(result.observationProof.successfulTicks, 8);
  assert.equal(result.durableHistory.terminalReceiptCount, 8);
});

test('two distant receipts cannot fake seven days without repeated successful cycles', async () => {
  const store = memoryStore();
  await addTerminal(store, { occurrenceKey: 'first', at: '2026-08-15T12:00:00.000Z' });
  await addTerminal(store, { occurrenceKey: 'last', at: '2026-08-22T12:00:00.000Z' });
  const result = await evaluateFounderAbsenceReadinessFromDurableHistory({ store, ...COMMON });
  assert.notEqual(result.status, 'KILIMANJARO_READY');
  assert.ok(result.observationProof.reasonCodes.includes('insufficient-repeated-successful-ticks'));
});

test('mixed source commits in durable history fail closed instead of picking the newest identity', async () => {
  const store = memoryStore();
  for (let day = 0; day <= 7; day += 1) {
    await addTerminal(store, {
      occurrenceKey: `mixed:${day}`,
      at: new Date(Date.UTC(2026, 7, 15 + day, 12, 0, 0)).toISOString(),
      sourceCommit: day === 0 ? 'old456' : 'abc123'
    });
  }
  const result = await evaluateFounderAbsenceReadinessFromDurableHistory({ store, ...COMMON });
  assert.notEqual(result.status, 'KILIMANJARO_READY');
  assert.ok(result.observationProof.reasonCodes.includes('proof-source-commit-required'));
});

test('open durable dead-letter jobs block readiness even when cycle history is otherwise healthy', async () => {
  const store = memoryStore();
  for (let day = 0; day <= 7; day += 1) {
    await addTerminal(store, {
      occurrenceKey: `deadletter:${day}`,
      at: new Date(Date.UTC(2026, 7, 15 + day, 12, 0, 0)).toISOString()
    });
  }
  store.rows.jobs.push({ id: 'job_dead_1', status: 'dead-letter' });
  const result = await evaluateFounderAbsenceReadinessFromDurableHistory({ store, ...COMMON });
  assert.notEqual(result.status, 'KILIMANJARO_READY');
  assert.equal(result.durableHistory.openDeadLetters, 1);
  assert.ok(result.observationProof.reasonCodes.includes('open-dead-letters-present'));
});

test('tampered non-zero effect ledger in durable history blocks readiness', async () => {
  const store = memoryStore();
  for (let day = 0; day <= 7; day += 1) {
    await addTerminal(store, {
      occurrenceKey: `effects:${day}`,
      at: new Date(Date.UTC(2026, 7, 15 + day, 12, 0, 0)).toISOString()
    });
  }
  const terminalRow = store.rows.auditLog.find(row => row.type === 'agent_mesh_cycle_terminal');
  terminalRow.detail.externalEffectLedger.customerMessagesSent = 1;
  const result = await evaluateFounderAbsenceReadinessFromDurableHistory({ store, ...COMMON });
  assert.notEqual(result.status, 'KILIMANJARO_READY');
  assert.equal(result.observationProof.unauthorizedEffects, 1);
  assert.ok(result.observationProof.reasonCodes.includes('unauthorized-effects-observed'));
});

test('latest degraded cycle remains unrecovered and blocks readiness', async () => {
  const store = memoryStore();
  for (let day = 0; day < 7; day += 1) {
    await addTerminal(store, {
      occurrenceKey: `recover:${day}`,
      at: new Date(Date.UTC(2026, 7, 15 + day, 12, 0, 0)).toISOString()
    });
  }
  await addTerminal(store, { occurrenceKey: 'recover:7', at: '2026-08-22T12:00:00.000Z', status: 'DEGRADED' });
  const result = await evaluateFounderAbsenceReadinessFromDurableHistory({ store, ...COMMON });
  assert.notEqual(result.status, 'KILIMANJARO_READY');
  assert.equal(result.observationProof.failedTicks, 1);
  assert.equal(result.observationProof.recoveredTicks, 0);
  assert.ok(result.observationProof.reasonCodes.includes('unrecovered-failed-ticks-present'));
});
