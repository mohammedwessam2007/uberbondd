import { tickActiveAutonomyRuns } from './agent-autonomy-job.mjs';
import { runAgentWorkerTick } from './agent-worker-job.mjs';
import { ZERO_EFFECTS } from './cloud-agent-relay.mjs';
import {
  beginAgentMeshCycleReceipt,
  finishAgentMeshCycleReceipt,
  getAgentMeshCycleReceipt
} from './agent-mesh-cycle-receipts.mjs';

export const AGENT_MESH_CONTROL_PLANE_POLICY_VERSION = 'agent-mesh-control-plane-1.1.0';

const MAX_WORKERS_PER_CYCLE = 4;
const MAX_AUTONOMY_RUNS_PER_SWEEP = 10;

function text(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function timestamp(value) {
  const d = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function fail(reasonCodes, status = 'BLOCKED', extra = {}) {
  return {
    ok: false,
    policyVersion: AGENT_MESH_CONTROL_PLANE_POLICY_VERSION,
    status,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS },
    ...extra
  };
}

function validWorker(worker) {
  if (!worker || typeof worker !== 'object' || Array.isArray(worker)) return false;
  if (!text(worker.budgetId, 160)) return false;
  if (!text(worker.targetAgent, 80)) return false;
  if (!text(worker.workerId, 160)) return false;
  if (!text(worker.provider, 80)) return false;
  if (typeof worker.modelExecutor !== 'function') return false;
  return true;
}

function workerReceipt(result, config) {
  return {
    targetAgent: text(config.targetAgent, 80).toLowerCase(),
    provider: text(config.provider, 80).toLowerCase(),
    model: text(config.model, 160) || null,
    workerId: text(config.workerId, 160),
    status: result?.status || 'UNKNOWN',
    ok: result?.ok !== false,
    taskId: result?.taskId || null,
    reasonCodes: Array.isArray(result?.reasonCodes) ? result.reasonCodes.slice(0, 20) : []
  };
}

function summarizeSweep(sweep) {
  return sweep ? {
    status: sweep.status || null,
    runsConsidered: sweep.runsConsidered ?? null,
    runsTicked: sweep.runsTicked ?? null,
    failed: sweep.failed ?? null,
    ok: sweep.ok !== false
  } : null;
}

function classifyCycle({ firstSweep, workers, secondSweep }) {
  const uncertainWorker = workers.some(item => /UNCERTAIN|PENDING|BLOCKED|FAILED|VIOLATION|LOST/i.test(String(item.status || '')) || item.ok === false);
  const failedSweep = firstSweep?.ok === false || secondSweep?.ok === false;
  if (failedSweep) return 'BLOCKED';
  if (uncertainWorker) return 'DEGRADED';
  const active = (firstSweep?.runsTicked || 0) + workers.filter(item => item.status !== 'IDLE').length + (secondSweep?.runsTicked || 0);
  return active > 0 ? 'ADVANCED' : 'IDLE';
}

function resultFromTerminalReceipt(receipt, { duplicateDelivery = false } = {}) {
  return {
    ok: receipt.status !== 'BLOCKED',
    policyVersion: AGENT_MESH_CONTROL_PLANE_POLICY_VERSION,
    status: receipt.status,
    reasonCodes: receipt.reasonCodes || [],
    cycleId: receipt.cycleId,
    cycleReceiptState: 'TERMINAL',
    duplicateDelivery,
    firstSweep: receipt.firstSweep || null,
    workers: receipt.workers || [],
    secondSweep: receipt.secondSweep || null,
    at: receipt.finishedAt || receipt.startedAt,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

// One finite cloud-scheduler cycle for the GPT ↔ UberBond ↔ Claude mesh.
// Every enabled invocation must carry a scheduler occurrence key. That identity
// is persisted before any sweep or worker tick, so a killed process leaves a
// durable STARTED record rather than allowing the absence of a return value to
// masquerade as "nothing happened". Re-delivery of a terminal occurrence is a
// read-only replay. Re-delivery of an incomplete STARTED occurrence fails
// closed because repeating a provider-backed worker after an unknown crash
// boundary could pay twice.
export async function runAgentMeshCycle({
  enabled = false,
  store,
  adapterFactory,
  compileRelayTask,
  workers = [],
  autonomyRunLimit = 5,
  ingestAfterWorkers = true,
  schedulerOccurrenceKey = '',
  sourceCommit = null,
  date = new Date(),
  tickRuns = tickActiveAutonomyRuns,
  workerTick = runAgentWorkerTick
} = {}) {
  if (!enabled) {
    return {
      ok: true,
      policyVersion: AGENT_MESH_CONTROL_PLANE_POLICY_VERSION,
      status: 'DISABLED',
      workersConfigured: Array.isArray(workers) ? workers.length : 0,
      at: timestamp(date),
      businessEffectAuthority: 'NONE',
      externalEffectLedger: { ...ZERO_EFFECTS }
    };
  }

  const reasons = [];
  if (!store || typeof store !== 'object') reasons.push('store-required');
  if (store && (typeof store.get !== 'function' || typeof store.add !== 'function')) reasons.push('durable-cycle-receipt-store-required');
  if (typeof adapterFactory !== 'function') reasons.push('adapter-factory-required');
  if (typeof compileRelayTask !== 'function') reasons.push('relay-task-compiler-required');
  if (!Array.isArray(workers)) reasons.push('workers-array-required');
  if (typeof tickRuns !== 'function') reasons.push('autonomy-tick-function-required');
  if (typeof workerTick !== 'function') reasons.push('worker-tick-function-required');
  if (!text(schedulerOccurrenceKey, 300)) reasons.push('scheduler-occurrence-key-required');
  if (reasons.length) return fail(reasons);

  const boundedRunLimit = Number.isSafeInteger(Number(autonomyRunLimit))
    ? Math.max(1, Math.min(MAX_AUTONOMY_RUNS_PER_SWEEP, Number(autonomyRunLimit)))
    : 5;
  const configuredWorkers = workers.slice(0, MAX_WORKERS_PER_CYCLE);
  if (configuredWorkers.length !== workers.length) return fail(['worker-count-exceeds-cycle-cap']);
  if (configuredWorkers.some(worker => !validWorker(worker))) return fail(['invalid-worker-configuration']);

  const existing = await getAgentMeshCycleReceipt({ store, occurrenceKey: schedulerOccurrenceKey });
  if (existing.state === 'TERMINAL') {
    return resultFromTerminalReceipt(existing.receipt, { duplicateDelivery: true });
  }
  if (existing.state === 'STARTED') {
    return fail(['scheduler-occurrence-already-started-incomplete'], 'BLOCKED', {
      cycleId: existing.cycleId,
      cycleReceiptState: 'STARTED',
      duplicateDelivery: true,
      startedAt: existing.receipt?.startedAt || null,
      at: timestamp(date)
    });
  }

  const startedAt = timestamp(date);
  const begun = await beginAgentMeshCycleReceipt({
    store,
    occurrenceKey: schedulerOccurrenceKey,
    startedAt,
    sourceCommit,
    policyVersions: [AGENT_MESH_CONTROL_PLANE_POLICY_VERSION],
    workers: configuredWorkers
  });
  const cycleId = begun.cycleId;

  const firstSweep = await tickRuns({
    store,
    adapterFactory,
    compileRelayTask,
    limit: boundedRunLimit,
    date
  });
  if (firstSweep?.ok === false) {
    const reasonCodes = firstSweep.reasonCodes || ['initial-autonomy-sweep-failed'];
    const terminal = await finishAgentMeshCycleReceipt({
      store,
      cycleId,
      startedAt,
      finishedAt: date,
      sourceCommit,
      policyVersions: [AGENT_MESH_CONTROL_PLANE_POLICY_VERSION],
      status: 'BLOCKED',
      reasonCodes,
      firstSweep,
      workers: [],
      secondSweep: null
    });
    return resultFromTerminalReceipt(terminal.receipt);
  }

  const workerResults = [];
  for (const config of configuredWorkers) {
    let result;
    try {
      result = await workerTick({
        store,
        budgetId: config.budgetId,
        targetAgent: config.targetAgent,
        workerId: config.workerId,
        provider: config.provider,
        model: config.model || '',
        costCeilingCents: config.costCeilingCents ?? 0,
        tokenCeiling: config.tokenCeiling ?? 50_000,
        modelExecutor: config.modelExecutor,
        lockTimeoutMs: config.lockTimeoutMs ?? 300000,
        date
      });
    } catch (error) {
      result = {
        ok: false,
        status: 'WORKER_TICK_THREW',
        reasonCodes: ['worker-tick-threw', text(error?.message, 300)]
      };
    }
    workerResults.push(workerReceipt(result, config));
  }

  let secondSweep = null;
  if (ingestAfterWorkers) {
    secondSweep = await tickRuns({
      store,
      adapterFactory,
      compileRelayTask,
      limit: boundedRunLimit,
      date
    });
  }

  const status = classifyCycle({ firstSweep, workers: workerResults, secondSweep });
  const reasonCodes = status === 'BLOCKED'
    ? [...new Set([...(firstSweep?.reasonCodes || []), ...(secondSweep?.reasonCodes || [])])]
    : [];
  const terminal = await finishAgentMeshCycleReceipt({
    store,
    cycleId,
    startedAt,
    finishedAt: date,
    sourceCommit,
    policyVersions: [AGENT_MESH_CONTROL_PLANE_POLICY_VERSION],
    status,
    reasonCodes,
    firstSweep,
    workers: workerResults,
    secondSweep
  });

  return {
    ok: status !== 'BLOCKED',
    policyVersion: AGENT_MESH_CONTROL_PLANE_POLICY_VERSION,
    status,
    reasonCodes,
    cycleId,
    cycleReceiptState: 'TERMINAL',
    duplicateDelivery: false,
    firstSweep: summarizeSweep(firstSweep),
    workers: workerResults,
    secondSweep: summarizeSweep(secondSweep),
    at: terminal.receipt.finishedAt,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}
