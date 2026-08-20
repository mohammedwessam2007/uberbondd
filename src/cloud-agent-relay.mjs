// Cloud transport for the bounded GPT/Claude Code relay.
//
// UberBond owns the durable task, lease, receipt, and consequence boundary.
// This module carries task packets over the existing jobs collection only. It
// never calls a model provider, sends a message, spends money, or performs a
// production mutation.

import {
  AGENT_RELAY_POLICY_VERSION,
  compileAgentTask,
  logAgentRelayReceipt
} from './agent-relay.mjs';

export const AGENT_RELAY_JOB_TYPE = 'prometheus.agent.relay';
export const CLOUD_AGENT_RELAY_POLICY_VERSION = 'cloud-agent-relay-1.0.0';

// Exported so alternative relay transports (see src/github-relay.mjs) reuse
// the exact same zero-external-effect contract rather than declaring a second,
// driftable copy of it.
export const ZERO_EFFECTS = Object.freeze({
  providerCalls: 0,
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
});
const MAX_LIST_LIMIT = 50;
const MAX_TASK_BYTES = 200_000;
const MAX_RESULT_BYTES = 250_000;
const SECRET_KEY = /token|secret|password|credential|privatekey|apikey|authorization/i;
// \b before sk-/ghp_ matters: without it, any ordinary identifier that happens
// to contain "sk-" or "ghp_" as a substring (e.g. a generated taskId like
// "e2e-task-1787174626471" contains "sk-1787174626471") false-positives as a
// secret. \b anchors the match to a real token boundary instead.
const SECRET_VALUE = /(?:\bsk-[A-Za-z0-9]{12,}|\bghp_[A-Za-z0-9]{12,}|-----BEGIN|Bearer\s+\S+)/;

function at(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function sizeOf(value) {
  return Buffer.byteLength(JSON.stringify(value ?? null), 'utf8');
}

// Exported for reuse by alternative relay transports. One scanner, one set of
// patterns -- a second copy would drift and silently weaken over time.
export function hasSecret(value) {
  if (typeof value === 'string') return SECRET_VALUE.test(value);
  if (Array.isArray(value)) return value.some(hasSecret);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, item]) => {
    if (key === 'externalEffectLedger') {
      return Object.keys(item || {}).some(effect => !Object.hasOwn(ZERO_EFFECTS, effect));
    }
    // `maxTokens` is the canonical bounded-compute field in AgentTask.budget,
    // not an authentication token. Keep every other token-shaped key blocked.
    if (key === 'maxTokens' && Number.isInteger(item) && item > 0) return false;
    return SECRET_KEY.test(key) || hasSecret(item);
  });
}

function errorResult(reasonCodes, detail = '') {
  return {
    ok: false,
    policyVersion: CLOUD_AGENT_RELAY_POLICY_VERSION,
    status: 'REJECTED',
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    detail: String(detail || '').slice(0, 500),
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

function publicJob(job) {
  const task = job?.payload && typeof job.payload === 'object' ? job.payload : null;
  return {
    jobId: job?.id || null,
    taskId: task?.taskId || null,
    targetAgent: task?.targetAgent || null,
    status: job?.status || null,
    attempts: Number(job?.attempts || 0),
    maxAttempts: Number(job?.maxAttempts || 0),
    runAt: job?.runAt || null,
    createdAt: job?.createdAt || null,
    lockedAt: job?.lockedAt || null,
    lockedBy: job?.lockedBy || null,
    task
  };
}

async function relayJobs(store) {
  if (!store || typeof store.list !== 'function') return [];
  return store.list('jobs', { filters: { type: AGENT_RELAY_JOB_TYPE }, limit: 500 });
}

async function findRelayJob(store, taskId) {
  if (store && typeof store.findOne === 'function') {
    const job = await store.findOne('jobs', { dedupeKey: `agent-relay:${taskId}` });
    if (job?.type === AGENT_RELAY_JOB_TYPE && job?.payload?.taskId === taskId) return job;
  }
  const jobs = await relayJobs(store);
  return jobs.find(job => job?.payload?.taskId === taskId) || null;
}

function taskIdentity(task) {
  if (!task || typeof task !== 'object') return null;
  return {
    policyVersion: task.policyVersion,
    taskId: task.taskId,
    objective: task.objective,
    originAgent: task.originAgent,
    targetAgent: task.targetAgent,
    parentTask: task.parentTask,
    contextRefs: task.contextRefs,
    evidenceRefs: task.evidenceRefs,
    constraints: task.constraints,
    forbiddenActions: task.forbiddenActions,
    requiredOutputs: task.requiredOutputs,
    acceptanceTests: task.acceptanceTests,
    budget: task.budget,
    deadline: task.deadline,
    economicObjective: task.economicObjective,
    consequenceClass: task.consequenceClass
  };
}

function normalizeWorkerId(value) {
  const workerId = String(value || '').trim();
  return /^[a-z0-9][a-z0-9._:-]{0,119}$/i.test(workerId) ? workerId : '';
}

function normalizeTargetAgent(value) {
  const targetAgent = String(value || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{0,63}$/.test(targetAgent) ? targetAgent : '';
}

export function validResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return ['result-object-required'];
  const required = ['outcome', 'changedArtifacts', 'testsActuallyRun', 'truthTable', 'externalEffectLedger', 'decision'];
  const missing = required.filter(key => !(key in result));
  if (missing.length) return ['required-result-fields-missing'];
  if (sizeOf(result) > MAX_RESULT_BYTES) return ['result-too-large'];
  if (hasSecret(result)) return ['secret-like-result-rejected'];
  const ledger = result.externalEffectLedger && typeof result.externalEffectLedger === 'object'
    ? result.externalEffectLedger : null;
  if (!ledger) return ['external-effect-ledger-required'];
  const nonZero = Object.entries(ZERO_EFFECTS).some(([key, zero]) => Number(ledger[key] || 0) !== zero);
  if (nonZero) return ['nonzero-external-effect-ledger-rejected'];
  return [];
}

export async function createCloudRelayTask({ queue, store, input = {}, date = new Date() } = {}) {
  if (!queue || typeof queue.enqueue !== 'function') return errorResult(['queue-required']);
  if (sizeOf(input) > MAX_TASK_BYTES || hasSecret(input)) return errorResult(['secret-or-oversized-task-rejected']);
  const task = compileAgentTask({ ...input, date });
  if (!task.ok) return task;
  const targetAgent = normalizeTargetAgent(task.targetAgent);
  if (!targetAgent) return errorResult(['valid-target-agent-required']);
  const job = await queue.enqueue(AGENT_RELAY_JOB_TYPE, task, {
    queue: 'agent-relay',
    priority: 100,
    maxAttempts: 3,
    dedupeKey: `agent-relay:${task.taskId}`
  });
  const storedTask = job?.payload && typeof job.payload === 'object' ? job.payload : task;
  if (storedTask.taskId !== task.taskId
    || JSON.stringify(taskIdentity(storedTask)) !== JSON.stringify(taskIdentity(task))) {
    return errorResult(['task-id-conflict'], 'The task id already belongs to a different immutable task packet.');
  }
  const queued = {
    ...storedTask,
    status: 'QUEUED',
    relayPolicyVersion: CLOUD_AGENT_RELAY_POLICY_VERSION,
    relay: { jobId: job.id, queue: job.queue, status: job.status },
    execution: { ...task.execution, status: 'QUEUED', workerReceipt: null, externalAction: false },
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
  if (store && typeof store.log === 'function') {
    await store.log('cloud_agent_relay_task_created', {
      policyVersion: CLOUD_AGENT_RELAY_POLICY_VERSION,
      sourcePolicyVersion: AGENT_RELAY_POLICY_VERSION,
      taskId: task.taskId,
      jobId: job.id,
      targetAgent,
      status: 'QUEUED',
      externalEffectLedger: { ...ZERO_EFFECTS }
    });
  }
  return queued;
}

// Compact observability summary for /api/agent-relay/health -- the mission's
// Wave 9 requires queued/active/completed/dead-letter counts, oldest queued
// task, and stale-lease visibility without exposing any task payload or
// secret. Read-only; never mutates a job.
export async function relayHealthSummary({ store, staleLeaseMs = 300000 } = {}) {
  const rows = await relayJobs(store);
  const counts = { queued: 0, retry: 0, active: 0, completed: 0, 'dead-letter': 0 };
  let oldestQueuedAt = null;
  let staleLeases = 0;
  const cutoff = Date.now() - Math.max(0, Number(staleLeaseMs || 0));
  for (const job of rows) {
    if (Object.hasOwn(counts, job.status)) counts[job.status] += 1;
    if ((job.status === 'queued' || job.status === 'retry') && (!oldestQueuedAt || String(job.createdAt || '') < oldestQueuedAt)) {
      oldestQueuedAt = job.createdAt || null;
    }
    if (job.status === 'active' && Date.parse(job.heartbeatAt || job.lockedAt || 0) < cutoff) staleLeases += 1;
  }
  return {
    ok: true,
    policyVersion: CLOUD_AGENT_RELAY_POLICY_VERSION,
    counts,
    total: rows.length,
    oldestQueuedAt,
    staleLeases,
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

export async function listCloudRelayTasks({ store, targetAgent = '', status = '', limit = 20 } = {}) {
  const target = targetAgent ? normalizeTargetAgent(targetAgent) : '';
  if (targetAgent && !target) return errorResult(['invalid-target-agent']);
  const allowedStatuses = new Set(['queued', 'retry', 'active', 'completed', 'dead-letter']);
  const requestedStatus = status ? String(status).trim().toLowerCase() : '';
  if (requestedStatus && !allowedStatuses.has(requestedStatus)) return errorResult(['invalid-status']);
  const rows = await relayJobs(store);
  const tasks = rows
    .filter(job => (!target || job?.payload?.targetAgent === target) && (!requestedStatus || job.status === requestedStatus))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, Math.max(1, Math.min(MAX_LIST_LIMIT, Number(limit || 20))))
    .map(publicJob);
  return {
    ok: true,
    policyVersion: CLOUD_AGENT_RELAY_POLICY_VERSION,
    count: tasks.length,
    tasks,
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

export async function claimCloudRelayTask({ store, targetAgent = 'claude-code', workerId = `claude-code:${process.pid}`, lockTimeoutMs = 300000 } = {}) {
  const target = normalizeTargetAgent(targetAgent);
  const worker = normalizeWorkerId(workerId);
  if (!target) return errorResult(['invalid-target-agent']);
  if (!worker) return errorResult(['invalid-worker-id']);
  if (!store || typeof store.claimJobsByType !== 'function') return errorResult(['relay-claim-not-supported']);
  const claimed = await store.claimJobsByType(AGENT_RELAY_JOB_TYPE, target, worker, 1, lockTimeoutMs);
  if (!claimed?.length) return {
    ok: false,
    policyVersion: CLOUD_AGENT_RELAY_POLICY_VERSION,
    status: 'EMPTY',
    reasonCodes: ['no-eligible-task'],
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
  const job = claimed[0];
  return {
    ok: true,
    policyVersion: CLOUD_AGENT_RELAY_POLICY_VERSION,
    status: 'CLAIMED',
    taskId: job.payload?.taskId || null,
    jobId: job.id,
    workerId: worker,
    lease: { status: job.status, lockedAt: job.lockedAt, heartbeatAt: job.heartbeatAt },
    task: job.payload,
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

// A relay task's lease has the same lockTimeoutMs as any other queue job
// (default 300s). A Claude Code task that legitimately runs longer than
// that must heartbeat or risk recoverStaleJobs() reclaiming it out from
// under the still-working owner -- the same stale-lease race the mission's
// hostile-test list calls out explicitly. Ownership is checked twice: once
// against the fetched job (fails closed as 'lease-owner-mismatch' without
// ever touching the store), and store.heartbeatJob() re-checks atomically
// at write time (status==='active' && lockedBy===workerId) so a lease lost
// between the read and the write is reported as 'lease-lost-before-heartbeat'
// rather than silently extended.
export async function heartbeatCloudRelayTask({ store, taskId, workerId } = {}) {
  const id = String(taskId || '').trim();
  const worker = normalizeWorkerId(workerId);
  if (!id) return errorResult(['task-id-required']);
  if (!worker) return errorResult(['invalid-worker-id']);
  if (!store || typeof store.heartbeatJob !== 'function') return errorResult(['relay-heartbeat-not-supported']);
  const job = await findRelayJob(store, id);
  if (!job) return errorResult(['task-not-found']);
  if (job.status !== 'active' || job.lockedBy !== worker) return errorResult(['lease-owner-mismatch']);
  const updated = await store.heartbeatJob(job.id, worker);
  if (!updated) return errorResult(['lease-lost-before-heartbeat']);
  return {
    ok: true,
    policyVersion: CLOUD_AGENT_RELAY_POLICY_VERSION,
    status: 'HEARTBEAT_ACCEPTED',
    taskId: id,
    jobId: job.id,
    workerId: worker,
    heartbeatAt: updated.heartbeatAt || null,
    lease: { status: updated.status, lockedAt: updated.lockedAt, heartbeatAt: updated.heartbeatAt },
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

export async function submitCloudRelayResult({
  store,
  taskId,
  workerId,
  status = 'COMPLETED',
  result = {},
  receipt = null,
  date = new Date()
} = {}) {
  const id = String(taskId || '').trim();
  const worker = normalizeWorkerId(workerId);
  const outcome = String(status || '').toUpperCase();
  if (!id) return errorResult(['task-id-required']);
  if (!worker) return errorResult(['invalid-worker-id']);
  if (!['COMPLETED', 'FAILED'].includes(outcome)) return errorResult(['invalid-result-status']);
  const resultErrors = validResult(result);
  if (resultErrors.length) return errorResult(resultErrors);
  if (receipt != null && (typeof receipt !== 'object' || hasSecret(receipt) || sizeOf(receipt) > 50_000)) {
    return errorResult(['invalid-receipt']);
  }
  const job = await findRelayJob(store, id);
  if (!job) return errorResult(['task-not-found']);
  if (job.status !== 'active' || job.lockedBy !== worker) return errorResult(['lease-owner-mismatch']);
  const relayReceipt = {
    policyVersion: CLOUD_AGENT_RELAY_POLICY_VERSION,
    taskId: id,
    workerId: worker,
    status: outcome,
    receivedAt: at(date),
    receipt: receipt || null,
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
  let updated;
  if (outcome === 'COMPLETED') {
    if (typeof store.completeJobIfOwned !== 'function') return errorResult(['relay-completion-not-supported']);
    updated = await store.completeJobIfOwned(job.id, worker, { ...result, relayReceipt });
  } else {
    if (typeof store.failJobIfOwned !== 'function') return errorResult(['relay-failure-not-supported']);
    updated = await store.failJobIfOwned(job.id, worker, 'Worker reported a bounded relay failure', { maxAttempts: 1 });
  }
  if (!updated) return errorResult(['lease-lost-before-submit']);
  await logAgentRelayReceipt(store, 'cloud_agent_relay_result_received', {
    ok: true,
    policyVersion: CLOUD_AGENT_RELAY_POLICY_VERSION,
    taskId: id,
    status: outcome,
    execution: { status: outcome, workerReceipt: relayReceipt, externalAction: false },
    externalEffectLedger: { ...ZERO_EFFECTS }
  });
  return {
    ok: true,
    policyVersion: CLOUD_AGENT_RELAY_POLICY_VERSION,
    status: 'RECEIVED',
    taskId: id,
    jobId: job.id,
    jobStatus: updated.status,
    workerId: worker,
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}
