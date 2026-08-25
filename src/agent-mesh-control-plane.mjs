import { tickActiveAutonomyRuns } from './agent-autonomy-job.mjs';
import { runAgentWorkerTick } from './agent-worker-job.mjs';
import { ZERO_EFFECTS } from './cloud-agent-relay.mjs';
import { redactSecrets } from './secret-patterns.mjs';
import {
  AGENT_MODEL_ROUTING_CONFIG_POLICY_VERSION,
  routeActivationPermittedWorkers
} from './agent-model-routing-config.mjs';
import {
  beginAgentMeshCycleReceipt,
  finishAgentMeshCycleReceipt,
  getAgentMeshCycleReceipt,
  reconcileAbandonedAgentMeshCycles,
  supportsAgentMeshCycleReceipts
} from './agent-mesh-cycle-receipts.mjs';

export const AGENT_MESH_CONTROL_PLANE_POLICY_VERSION = 'agent-mesh-control-plane-1.4.0';

const MAX_WORKERS_PER_CYCLE = 4;
const MAX_AUTONOMY_RUNS_PER_SWEEP = 10;

function text(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

// A thrown provider or store error carries whatever the library felt like
// putting in the message, which is regularly a URL with credentials in it.
// These strings become reason codes on a durable receipt, so they are redacted
// before they get that far rather than merely truncated.
function errorText(value, max = 300) {
  return redactSecrets(String(value ?? '').trim()).slice(0, max);
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

function resultFromTerminalReceipt(receipt, { duplicateDelivery = false, abandonedReconciled = 0 } = {}) {
  return {
    abandonedCyclesReconciled: abandonedReconciled,
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
  abandonedCycleAfterMs = 60 * 60 * 1000,
  date = new Date(),
  tickRuns = tickActiveAutonomyRuns,
  workerTick = runAgentWorkerTick,
  routingEnv = process.env,
  routingRandom = Math.random
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
  if (store && !supportsAgentMeshCycleReceipts(store)) reasons.push('durable-cycle-receipt-store-required');
  if (typeof adapterFactory !== 'function') reasons.push('adapter-factory-required');
  if (typeof compileRelayTask !== 'function') reasons.push('relay-task-compiler-required');
  if (!Array.isArray(workers)) reasons.push('workers-array-required');
  if (typeof tickRuns !== 'function') reasons.push('autonomy-tick-function-required');
  if (typeof workerTick !== 'function') reasons.push('worker-tick-function-required');
  if (reasons.length) return fail(reasons);
  if (!text(schedulerOccurrenceKey, 300)) return fail(['scheduler-occurrence-key-required']);

  const boundedRunLimit = Number.isSafeInteger(Number(autonomyRunLimit))
    ? Math.max(1, Math.min(MAX_AUTONOMY_RUNS_PER_SWEEP, Number(autonomyRunLimit)))
    : 5;
  const configuredWorkers = workers.slice(0, MAX_WORKERS_PER_CYCLE);
  if (configuredWorkers.length !== workers.length) return fail(['worker-count-exceeds-cycle-cap']);
  if (configuredWorkers.some(worker => !validWorker(worker))) return fail(['invalid-worker-configuration']);

  // The caller may already have narrowed workers through activation/consequence
  // authority. Routing is intentionally second: it can choose among that set,
  // but no benchmark or env configuration can resurrect a worker omitted by
  // the authority layer. This happens before the durable occurrence identity
  // is built so a retry that would route to a different worker fails closed as
  // an identity conflict instead of silently changing provider/model mid-cycle.
  const routing = routeActivationPermittedWorkers({
    workers: configuredWorkers,
    env: routingEnv,
    random: routingRandom,
    date
  });
  if (!routing.ok) {
    return fail(routing.reasonCodes || ['model-routing-blocked'], 'BLOCKED', {
      routingStatus: routing.status || 'BLOCKED',
      routingMode: routing.mode || null,
      at: timestamp(date)
    });
  }
  const routedWorkers = routing.workers;
  // A cycle that served some queues and not others is not a cycle that
  // advanced. Carrying the blocked agents forward keeps a partial run from
  // reporting itself as a full one.
  const routingBlockedTargetAgents = Array.isArray(routing.blockedTargetAgents) ? routing.blockedTargetAgents : [];

  const occurrenceIdentity = {
    sourceCommit,
    policyVersions: [
      AGENT_MESH_CONTROL_PLANE_POLICY_VERSION,
      AGENT_MODEL_ROUTING_CONFIG_POLICY_VERSION
    ],
    workers: routedWorkers,
    configuration: {
      autonomyRunLimit: boundedRunLimit,
      ingestAfterWorkers: Boolean(ingestAfterWorkers)
    }
  };

  let existing;
  try {
    existing = await getAgentMeshCycleReceipt({
      store,
      occurrenceKey: schedulerOccurrenceKey,
      ...occurrenceIdentity
    });
  } catch (error) {
    if (error?.message === 'scheduler-occurrence-identity-conflict') {
      return fail(['scheduler-occurrence-identity-conflict'], 'BLOCKED', {
        duplicateDelivery: true,
        at: timestamp(date)
      });
    }
    throw error;
  }
  if (existing.state === 'TERMINAL') return resultFromTerminalReceipt(existing.receipt, { duplicateDelivery: true });
  if (existing.state === 'STARTED') {
    // A same-occurrence redelivery is normally an in-flight duplicate. Once
    // the durable STARTED receipt is older than the abandonment horizon,
    // however, leaving it here wedges that exact scheduler occurrence forever:
    // the reconciliation pass below the early-return was unreachable. Re-run
    // only the receipt reconciliation, never the abandoned work itself, then
    // re-read the exact occurrence so a concurrent reconciler is idempotent.
    let abandonedReconciliation = { reconciled: [] };
    if (typeof store.list === 'function') {
      try {
        abandonedReconciliation = await reconcileAbandonedAgentMeshCycles({
          store,
          now: date,
          abandonedAfterMs: abandonedCycleAfterMs
        });
      } catch (error) {
        return fail(['abandoned-cycle-reconciliation-failed', errorText(error?.message)], 'BLOCKED', {
          cycleId: existing.cycleId,
          cycleReceiptState: 'STARTED',
          duplicateDelivery: true,
          at: timestamp(date)
        });
      }

      const afterReconciliation = await getAgentMeshCycleReceipt({
        store,
        occurrenceKey: schedulerOccurrenceKey,
        ...occurrenceIdentity
      });
      if (afterReconciliation.state === 'TERMINAL') {
        return resultFromTerminalReceipt(afterReconciliation.receipt, {
          duplicateDelivery: true,
          abandonedReconciled: abandonedReconciliation.reconciled?.length || 0
        });
      }
    }
    return fail(['scheduler-occurrence-already-started-incomplete'], 'BLOCKED', {
      cycleId: existing.cycleId,
      cycleReceiptState: 'STARTED',
      duplicateDelivery: true,
      startedAt: existing.receipt?.startedAt || null,
      abandonedCyclesReconciled: abandonedReconciliation.reconciled?.length || 0,
      at: timestamp(date)
    });
  }

  // Before starting a new cycle, write down the ones that died in a previous
  // one. An abandoned STARTED receipt is a crash nobody recorded, and readiness
  // refuses to certify while any are outstanding -- so this has to happen on
  // the scheduler's own path, not on an operator remembering to run it. It
  // replays no work; it only records that the work never finished.
  let abandonedReconciliation = { abandonedFound: 0, reconciled: [] };
  if (typeof store.list === 'function') {
    try {
      abandonedReconciliation = await reconcileAbandonedAgentMeshCycles({
        store,
        now: date,
        abandonedAfterMs: abandonedCycleAfterMs
      });
    } catch (error) {
      // A cycle that cannot reconcile old crashes must not silently proceed as
      // though there were none: the history it is about to add to is unsound.
      return fail(['abandoned-cycle-reconciliation-failed', errorText(error?.message)], 'BLOCKED', {
        at: timestamp(date)
      });
    }
  }

  const startedAt = timestamp(date);
  const begun = await beginAgentMeshCycleReceipt({
    store,
    occurrenceKey: schedulerOccurrenceKey,
    startedAt,
    ...occurrenceIdentity
  });
  const cycleId = begun.cycleId;
  if (begun.duplicate) {
    return fail(['scheduler-occurrence-already-started-incomplete'], 'BLOCKED', {
      cycleId,
      cycleReceiptState: 'STARTED',
      duplicateDelivery: true,
      startedAt: begun.receipt?.startedAt || null,
      at: timestamp(date)
    });
  }

  const firstSweep = await tickRuns({ store, adapterFactory, compileRelayTask, limit: boundedRunLimit, date });
  if (firstSweep?.ok === false) {
    const reasonCodes = firstSweep.reasonCodes || ['initial-autonomy-sweep-failed'];
    const terminal = await finishAgentMeshCycleReceipt({
      store, cycleId, startedAt, finishedAt: date, sourceCommit,
      policyVersions: occurrenceIdentity.policyVersions,
      status: 'BLOCKED', reasonCodes, firstSweep, workers: [], secondSweep: null
    });
    return resultFromTerminalReceipt(terminal.receipt);
  }

  const workerResults = [];
  for (const config of routedWorkers) {
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
      result = { ok: false, status: 'WORKER_TICK_THREW', reasonCodes: ['worker-tick-threw', errorText(error?.message)] };
    }
    workerResults.push(workerReceipt(result, config));
  }

  let secondSweep = null;
  if (ingestAfterWorkers) {
    secondSweep = await tickRuns({ store, adapterFactory, compileRelayTask, limit: boundedRunLimit, date });
  }

  const classified = classifyCycle({ firstSweep, workers: workerResults, secondSweep });
  // ADVANCED with a starved queue is the lie this guard exists to prevent.
  const status = classified === 'ADVANCED' && routingBlockedTargetAgents.length ? 'DEGRADED' : classified;
  const reasonCodes = [...new Set([
    ...(status === 'BLOCKED'
      ? [...(firstSweep?.reasonCodes || []), ...(secondSweep?.reasonCodes || [])]
      : []),
    ...(routingBlockedTargetAgents.length
      ? ['model-routing-withheld-target-agents', ...(routing.reasonCodes || [])]
      : [])
  ])];
  const terminal = await finishAgentMeshCycleReceipt({
    store, cycleId, startedAt, finishedAt: date, sourceCommit,
    policyVersions: occurrenceIdentity.policyVersions,
    status, reasonCodes, firstSweep, workers: workerResults, secondSweep
  });

  return {
    ok: status !== 'BLOCKED',
    policyVersion: AGENT_MESH_CONTROL_PLANE_POLICY_VERSION,
    status,
    reasonCodes,
    cycleId,
    cycleReceiptState: 'TERMINAL',
    duplicateDelivery: false,
    abandonedCyclesReconciled: abandonedReconciliation.abandonedFound,
    firstSweep: summarizeSweep(firstSweep),
    workers: workerResults,
    secondSweep: summarizeSweep(secondSweep),
    routingStatus: routing.status,
    routingMode: routing.mode || null,
    routedWorkerId: routing.selected?.workerId || null,
    routingSelections: routing.selections || [],
    routingBlockedTargetAgents,
    servicedTargetAgents: routing.servicedTargetAgents || [],
    at: terminal.receipt.finishedAt,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}
