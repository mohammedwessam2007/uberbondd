import crypto from 'node:crypto';
import { ZERO_EFFECTS } from './cloud-agent-relay.mjs';

export const AGENT_MESH_CYCLE_RECEIPT_VERSION = 'agent-mesh-cycle-receipt-1.3.0';
const START_TYPE = 'agent_mesh_cycle_started';
const TERMINAL_TYPE = 'agent_mesh_cycle_terminal';
const TERMINAL_STATUSES = new Set(['ADVANCED', 'IDLE', 'DEGRADED', 'BLOCKED']);

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

function normalizedPolicyVersions(policyVersions = []) {
  return [...new Set((policyVersions || []).map(v => text(v, 120)).filter(Boolean))].sort().slice(0, 20);
}

function normalizedConfiguredWorkers(workers = []) {
  return safeWorkers((workers || []).map(worker => ({ ...worker, status: 'CONFIGURED', ok: true })))
    .map(worker => ({
      targetAgent: worker.targetAgent,
      provider: worker.provider,
      model: worker.model,
      workerId: worker.workerId
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function cycleIdentity({ occurrenceKey, sourceCommit = null, policyVersions = [], workers = [] } = {}) {
  const occurrenceKeyHash = crypto.createHash('sha256').update(text(occurrenceKey, 300)).digest('hex');
  const identity = {
    occurrenceKeyHash,
    sourceCommit: text(sourceCommit, 80) || null,
    policyVersions: normalizedPolicyVersions(policyVersions),
    workers: normalizedConfiguredWorkers(workers)
  };
  return {
    ...identity,
    identityHash: crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex')
  };
}

function assertSameCycleIdentity(receipt, expected) {
  const persisted = text(receipt?.identityHash, 80);
  if (!persisted || persisted !== expected.identityHash) {
    throw new Error('scheduler-occurrence-identity-conflict');
  }
}

export function supportsAgentMeshCycleReceipts(store) {
  if (!store || typeof store !== 'object') return false;
  return (typeof store.get === 'function' && typeof store.add === 'function')
    || (typeof store.list === 'function' && typeof store.log === 'function');
}

function requireStore(store) {
  if (!supportsAgentMeshCycleReceipts(store)) throw new Error('durable-cycle-receipt-store-required');
}

export function deriveAgentMeshCycleId(occurrenceKey) {
  const key = text(occurrenceKey, 300);
  if (!key) throw new Error('scheduler-occurrence-key-required');
  return `meshcycle_${crypto.createHash('sha256').update(key).digest('hex').slice(0, 32)}`;
}

function recordId(cycleId, phase) {
  return `${cycleId}:${phase}`;
}

async function lookup(store, type, cycleId, phase) {
  if (typeof store.get === 'function') {
    const row = await store.get('auditLog', recordId(cycleId, phase));
    if (row) return row;
  }
  if (typeof store.list === 'function') {
    const rows = await store.list('auditLog', { filters: { type }, limit: 2000 });
    return rows.find(row => row?.detail?.cycleId === cycleId) || null;
  }
  return null;
}

async function append(store, type, cycleId, phase, detail, createdAt) {
  if (typeof store.add === 'function') {
    return store.add('auditLog', { id: recordId(cycleId, phase), type, detail, createdAt });
  }
  return store.log(type, detail);
}

async function appendOrRecoverDuplicate(store, { type, cycleId, phase, detail, createdAt, expectedIdentity }) {
  try {
    const row = await append(store, type, cycleId, phase, detail, createdAt);
    return { duplicate: false, row };
  } catch (error) {
    // The canonical durable Store uses deterministic record IDs and rejects a
    // duplicate add atomically. Two scheduler deliveries can therefore both
    // observe ABSENT before either writes; the loser of that race must recover
    // the winner's persisted receipt rather than surface a false cycle failure.
    // Do not swallow arbitrary write failures: only convert an error into an
    // idempotent duplicate when the exact deterministic record now exists AND
    // belongs to the exact same immutable scheduler occurrence identity.
    if (typeof store.get === 'function' && typeof store.add === 'function') {
      const raced = await lookup(store, type, cycleId, phase);
      if (raced) {
        if (expectedIdentity) assertSameCycleIdentity(raced.detail, expectedIdentity);
        return { duplicate: true, row: raced };
      }
    }
    throw error;
  }
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
  const identity = cycleIdentity({ occurrenceKey, sourceCommit, policyVersions, workers });
  const existing = await lookup(store, START_TYPE, cycleId, 'started');
  if (existing) {
    assertSameCycleIdentity(existing.detail, identity);
    return { cycleId, duplicate: true, receipt: structuredClone(existing.detail || {}) };
  }

  const detail = {
    receiptVersion: AGENT_MESH_CYCLE_RECEIPT_VERSION,
    cycleId,
    occurrenceKeyHash: identity.occurrenceKeyHash,
    identityHash: identity.identityHash,
    phase: 'STARTED',
    startedAt: iso(startedAt),
    sourceCommit: identity.sourceCommit,
    policyVersions: identity.policyVersions,
    workers: safeWorkers(workers.map(worker => ({ ...worker, status: 'CONFIGURED', ok: true }))),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
  const appended = await appendOrRecoverDuplicate(store, {
    type: START_TYPE,
    cycleId,
    phase: 'started',
    detail,
    createdAt: detail.startedAt,
    expectedIdentity: identity
  });
  return {
    cycleId,
    duplicate: appended.duplicate,
    receipt: structuredClone(appended.row?.detail || detail)
  };
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

  const startRecord = await lookup(store, START_TYPE, normalizedCycleId, 'started');
  if (!startRecord) throw new Error('cycle-start-receipt-required-before-terminal');
  const startDetail = startRecord.detail || {};
  const terminalIdentity = {
    identityHash: text(startDetail.identityHash, 80)
  };
  if (!terminalIdentity.identityHash) throw new Error('scheduler-occurrence-identity-conflict');

  const requestedSourceCommit = text(sourceCommit, 80) || text(startDetail.sourceCommit, 80) || null;
  const requestedPolicies = policyVersions?.length
    ? normalizedPolicyVersions(policyVersions)
    : normalizedPolicyVersions(startDetail.policyVersions || []);
  if (requestedSourceCommit !== (text(startDetail.sourceCommit, 80) || null)
    || JSON.stringify(requestedPolicies) !== JSON.stringify(normalizedPolicyVersions(startDetail.policyVersions || []))) {
    throw new Error('scheduler-occurrence-identity-conflict');
  }

  const existing = await lookup(store, TERMINAL_TYPE, normalizedCycleId, 'terminal');
  if (existing) {
    assertSameCycleIdentity(existing.detail, terminalIdentity);
    return { duplicate: true, receipt: structuredClone(existing.detail || {}) };
  }

  const detail = {
    receiptVersion: AGENT_MESH_CYCLE_RECEIPT_VERSION,
    cycleId: normalizedCycleId,
    identityHash: terminalIdentity.identityHash,
    phase: 'TERMINAL',
    startedAt: iso(startedAt || startDetail.startedAt),
    finishedAt: iso(finishedAt),
    sourceCommit: requestedSourceCommit,
    policyVersions: requestedPolicies,
    status,
    reasonCodes: [...new Set((reasonCodes || []).map(code => text(code, 180)).filter(Boolean))].slice(0, 30),
    firstSweep: safeSummary(firstSweep),
    workers: safeWorkers(workers),
    secondSweep: safeSummary(secondSweep),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
  const appended = await appendOrRecoverDuplicate(store, {
    type: TERMINAL_TYPE,
    cycleId: normalizedCycleId,
    phase: 'terminal',
    detail,
    createdAt: detail.finishedAt,
    expectedIdentity: terminalIdentity
  });
  return {
    duplicate: appended.duplicate,
    receipt: structuredClone(appended.row?.detail || detail)
  };
}

export async function getAgentMeshCycleReceipt({ store, occurrenceKey } = {}) {
  requireStore(store);
  const cycleId = deriveAgentMeshCycleId(occurrenceKey);
  const terminal = await lookup(store, TERMINAL_TYPE, cycleId, 'terminal');
  if (terminal) return { cycleId, state: 'TERMINAL', receipt: structuredClone(terminal.detail || {}) };
  const started = await lookup(store, START_TYPE, cycleId, 'started');
  if (started) return { cycleId, state: 'STARTED', receipt: structuredClone(started.detail || {}) };
  return { cycleId, state: 'ABSENT', receipt: null };
}

export async function listTerminalAgentMeshCycleReceipts({ store, limit = 2000 } = {}) {
  requireStore(store);
  if (typeof store.list !== 'function') throw new Error('cycle-receipt-history-list-required');
  const boundedLimit = Number.isSafeInteger(limit) ? Math.max(1, Math.min(10000, limit)) : 2000;
  const rows = await store.list('auditLog', { filters: { type: TERMINAL_TYPE }, limit: boundedLimit });
  return rows
    .filter(row => row?.detail?.phase === 'TERMINAL' && /^meshcycle_[a-f0-9]{32}$/.test(text(row.detail.cycleId, 80)))
    .map(row => structuredClone(row.detail))
    .sort((a, b) => Date.parse(a.finishedAt || a.startedAt || 0) - Date.parse(b.finishedAt || b.startedAt || 0));
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
