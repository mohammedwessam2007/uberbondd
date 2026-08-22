import crypto from 'node:crypto';

export const AGENT_MESH_CYCLE_RECEIPT_VERSION = 'agent-mesh-cycle-receipt-1.0.0';
const START_TYPE = 'agent_mesh_cycle_started';
const TERMINAL_TYPE = 'agent_mesh_cycle_terminal';
const TERMINAL_STATUSES = new Set(['ADVANCED', 'IDLE', 'DEGRADED', 'BLOCKED']);
const ZERO_EFFECTS = Object.freeze({
  customerMessages: 0,
  providerCalls: 0,
  spendCents: 0,
  dnsChanges: 0,
  credentialChanges: 0,
  paymentChanges: 0,
  kycSubmissions: 0,
  liveOutbound: 0,
  productionMutations: 0,
  customerMutations: 0
});

function text(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function iso(value) {
  const d = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(d.getTime())) throw new Error('invalid-cycle-receipt-timestamp');
  return d.toISOString();
}

function safeSummary(sweep) {
  if (!sweep) return null;
  return {
    status: text(sweep.status, 80) || null,
    runsConsidered: Number.isSafeInteger(sweep.runsConsidered) ? sweep.runsConsidered : null,
    runsTicked: Number.isSafeInteger(sweep.runsTicked) ? sweep.runsTicked : null,
    failed: Number.isSafeInteger(sweep.failed) ? sweep.failed : null,
    ok: sweep.ok !== false
  };
}

function safeWorkers(workers = []) {
  return workers.slice(0, 8).map(worker => ({
    targetAgent: text(worker?.targetAgent, 80).toLowerCase(),
    provider: text(worker?.provider, 80).toLowerCase(),
    model: text(worker?.model, 160) || null,
    workerId: text(worker?.workerId, 160),
    status: text(worker?.status, 80) || 'UNKNOWN',
    ok: worker?.ok !== false,
    taskId: text(worker?.taskId, 180) || null,
    reasonCodes: Array.isArray(worker?.reasonCodes)
      ? worker.reasonCodes.slice(0, 20).map(code => text(code, 180)).filter(Boolean)
      : []
  }));
}

function requireStore(store) {
  if (!store || typeof store.get !== 'function' || typeof store.add !== 'function') {
    throw new Error('cycle-receipt-store-get-add-required');
  }
}

export function deriveAgentMeshCycleId(occurrenceKey) {
  const key = text(occurrenceKey, 300);
  if (!key) throw new Error('scheduler-occurrence-key-required');
  return `meshcycle_${crypto.createHash('sha256').update(key).digest('hex').slice(0, 32)}`;
}

function recordId(cycleId, phase) {
  return `${cycleId}:${phase}`;
}

export async function beginAgentMeshCycleReceipt({
  store,
  occurrenceKey,
  startedAt = new Date(),
  sourceCommit = null,
  policyVersions = [],
  workers = []
} = {}) {
  requireStore(store);
  const cycleId = deriveAgentMeshCycleId(occurrenceKey);
  const id = recordId(cycleId, 'started');
  const existing = await store.get('auditLog', id);
  if (existing) {
    return { cycleId, duplicate: true, receipt: structuredClone(existing.detail || {}) };
  }

  const detail = {
    receiptVersion: AGENT_MESH_CYCLE_RECEIPT_VERSION,
    cycleId,
    occurrenceKeyHash: crypto.createHash('sha256').update(text(occurrenceKey, 300)).digest('hex'),
    phase: 'STARTED',
    startedAt: iso(startedAt),
    sourceCommit: text(sourceCommit, 80) || null,
    policyVersions: [...new Set((policyVersions || []).map(v => text(v, 120)).filter(Boolean))].slice(0, 20),
    workers: safeWorkers(workers.map(worker => ({ ...worker, status: 'CONFIGURED', ok: true }))),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
  await store.add('auditLog', { id, type: START_TYPE, detail, createdAt: detail.startedAt });
  return { cycleId, duplicate: false, receipt: structuredClone(detail) };
}

export async function finishAgentMeshCycleReceipt({
  store,
  cycleId,
  startedAt,
  finishedAt = new Date(),
  sourceCommit = null,
  policyVersions = [],
  status,
  reasonCodes = [],
  firstSweep = null,
  workers = [],
  secondSweep = null
} = {}) {
  requireStore(store);
  const normalizedCycleId = text(cycleId, 80);
  if (!/^meshcycle_[a-f0-9]{32}$/.test(normalizedCycleId)) throw new Error('valid-cycle-id-required');
  if (!TERMINAL_STATUSES.has(status)) throw new Error('terminal-cycle-status-required');

  const id = recordId(normalizedCycleId, 'terminal');
  const existing = await store.get('auditLog', id);
  if (existing) return { duplicate: true, receipt: structuredClone(existing.detail || {}) };

  const startRecord = await store.get('auditLog', recordId(normalizedCycleId, 'started'));
  if (!startRecord) throw new Error('cycle-start-receipt-required-before-terminal');

  const detail = {
    receiptVersion: AGENT_MESH_CYCLE_RECEIPT_VERSION,
    cycleId: normalizedCycleId,
    phase: 'TERMINAL',
    startedAt: iso(startedAt || startRecord.detail?.startedAt),
    finishedAt: iso(finishedAt),
    sourceCommit: text(sourceCommit, 80) || text(startRecord.detail?.sourceCommit, 80) || null,
    policyVersions: [...new Set((policyVersions || startRecord.detail?.policyVersions || []).map(v => text(v, 120)).filter(Boolean))].slice(0, 20),
    status,
    reasonCodes: [...new Set((reasonCodes || []).map(code => text(code, 180)).filter(Boolean))].slice(0, 30),
    firstSweep: safeSummary(firstSweep),
    workers: safeWorkers(workers),
    secondSweep: safeSummary(secondSweep),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
  await store.add('auditLog', { id, type: TERMINAL_TYPE, detail, createdAt: detail.finishedAt });
  return { duplicate: false, receipt: structuredClone(detail) };
}

export async function getAgentMeshCycleReceipt({ store, occurrenceKey } = {}) {
  requireStore(store);
  const cycleId = deriveAgentMeshCycleId(occurrenceKey);
  const terminal = await store.get('auditLog', recordId(cycleId, 'terminal'));
  if (terminal) return { cycleId, state: 'TERMINAL', receipt: structuredClone(terminal.detail || {}) };
  const started = await store.get('auditLog', recordId(cycleId, 'started'));
  if (started) return { cycleId, state: 'STARTED', receipt: structuredClone(started.detail || {}) };
  return { cycleId, state: 'ABSENT', receipt: null };
}

export async function countTerminalAgentMeshCycles({ store, occurrenceKeys = [] } = {}) {
  requireStore(store);
  let count = 0;
  for (const occurrenceKey of [...new Set(occurrenceKeys.map(key => text(key, 300)).filter(Boolean))]) {
    const state = await getAgentMeshCycleReceipt({ store, occurrenceKey });
    if (state.state === 'TERMINAL') count += 1;
  }
  return count;
}
