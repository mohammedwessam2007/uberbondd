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
import { ZERO_EXTERNAL_EFFECTS, EFFECT_LEDGER_FIELDS, isKnownEffectLedgerField } from './effect-ledgers.mjs';

export const AGENT_RELAY_JOB_TYPE = 'prometheus.agent.relay';
export const CLOUD_AGENT_RELAY_POLICY_VERSION = 'cloud-agent-relay-1.1.0';

// Exported so alternative relay transports (see src/github-relay.mjs) reuse
// the exact same zero-external-effect contract rather than declaring a second,
// driftable copy of it. The shape itself now lives in one module with the
// autonomy loop's ledger, so the secret scanner has a single list to consult.
export { ZERO_EXTERNAL_EFFECTS as ZERO_EFFECTS } from './effect-ledgers.mjs';
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

// A compute counter is a plain non-negative integer, or null meaning "not
// measured". Nothing that shape can carry a credential.
function isComputeCount(value) {
  return value === null || (Number.isSafeInteger(value) && value >= 0);
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, canonicalValue(value[key])])
  );
}

// Exported so other modules compare records the same way. Two copies of
// "are these the same object?" is how one of them ends up key-order sensitive
// while the other is not.
export function sameJson(left, right) {
  try {
    return JSON.stringify(canonicalValue(left)) === JSON.stringify(canonicalValue(right));
  } catch {
    return false;
  }
}

function completedSubmissionMatches(job, { worker, outcome, result, receipt }) {
  if (job?.status !== 'completed' || outcome !== 'COMPLETED') return false;
  const stored = job?.result && typeof job.result === 'object' && !Array.isArray(job.result)
    ? job.result : null;
  const relayReceipt = stored?.relayReceipt;
  if (!stored || !relayReceipt) return false;
  if (relayReceipt.workerId !== worker || relayReceipt.status !== 'COMPLETED') return false;
  if (!sameJson(relayReceipt.receipt ?? null, receipt ?? null)) return false;
  const { relayReceipt: _ignoredRelayReceipt, ...storedResult } = stored;
  return sameJson(storedResult, result);
}

// Exported for reuse by alternative relay transports. One scanner, one set of
// patterns -- a second copy would drift and silently weaken over time.
export function hasSecret(value) {
  if (typeof value === 'string') return SECRET_VALUE.test(value);
  if (Array.isArray(value)) return value.some(hasSecret);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, item]) => {
    // A ledger's own key names (`credentialChanges`) trip the credential
    // pattern, so a perfectly clean ledger would be rejected as secret-bearing.
    // Three field names spell a ledger in this codebase and the exemption used
    // to list two of them; `effect-ledgers.mjs` now holds the whole list, along
    // with which keys each shape may contain. A ledger carrying a key outside
    // its shape is not a ledger and falls through to the scanner below.
    if (Object.hasOwn(EFFECT_LEDGER_FIELDS, key)) {
      return !isKnownEffectLedgerField(key, item);
    }
    // This codebase counts compute in units it keeps calling tokens: maxTokens
    // on a task budget, tokens in receipt cost accounting, tokenBudget in a
    // coordination packet. Every one of them matches the token-shaped key
    // pattern, and every one of them was a separate false positive that
    // rejected a legitimate payload. Naming three exceptions was treating the
    // symptom; the rule is what was wrong.
    //
    // An authentication token is a string. A counter is a number. So a
    // token-shaped key holding a non-negative integer -- or an explicitly
    // unmeasured null -- is a counter and is allowed through, whatever it is
    // called. A string under the same key still falls to the scanner below, so
    // a real credential hidden under `tokenBudget` is caught exactly as before.
    //
    // Deliberately narrow to /token/i: `password`, `secret`, `apikey` and
    // friends have no legitimate counter meaning, so a number under those keys
    // stays rejected.
    if (/token/i.test(key) && isComputeCount(item)) return false;
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
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
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

// A zero-effect claim is only worth anything if it is complete. An omitted key
// used to read as zero here (`Number(undefined || 0)`), so a worker could
// assert "no effects" by shipping `{}` -- silence scored the same as a signed
// zero. So did a NaN, and so did an array. Require the exact canonical key set
// carrying real numeric zeros; anything else is a refusal with its own reason.
export function canonicalZeroEffectLedger(ledger) {
  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) return ['external-effect-ledger-required'];
  const canonical = Object.keys(ZERO_EXTERNAL_EFFECTS);
  if (canonical.some(key => !Object.hasOwn(ledger, key))) return ['incomplete-external-effect-ledger-rejected'];
  if (Object.keys(ledger).some(key => !Object.hasOwn(ZERO_EXTERNAL_EFFECTS, key))) return ['unknown-external-effect-key-rejected'];
  const nonZero = canonical.some(key => {
    const value = ledger[key];
    return typeof value !== 'number' || !Number.isFinite(value) || value !== ZERO_EXTERNAL_EFFECTS[key];
  });
  return nonZero ? ['nonzero-external-effect-ledger-rejected'] : [];
}

export function validResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return ['result-object-required'];
  const required = ['outcome', 'changedArtifacts', 'testsActuallyRun', 'truthTable', 'externalEffectLedger', 'decision'];
  const missing = required.filter(key => !(key in result));
  if (missing.length) return ['required-result-fields-missing'];
  if (sizeOf(result) > MAX_RESULT_BYTES) return ['result-too-large'];
  // Ledger shape first: an unknown effect key also trips the secret scanner,
  // and `secret-like-result-rejected` is a misleading thing to tell an
  // operator whose worker simply invented a counter.
  const ledgerErrors = canonicalZeroEffectLedger(result.externalEffectLedger);
  if (ledgerErrors.length) return ledgerErrors;
  if (hasSecret(result)) return ['secret-like-result-rejected'];
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
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
  if (store && typeof store.log === 'function') {
    await store.log('cloud_agent_relay_task_created', {
      policyVersion: CLOUD_AGENT_RELAY_POLICY_VERSION,
      sourcePolicyVersion: AGENT_RELAY_POLICY_VERSION,
      taskId: task.taskId,
      jobId: job.id,
      targetAgent,
      status: 'QUEUED',
      externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
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
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
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
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
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
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
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
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
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
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
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

  // A worker may crash after the durable queue transition succeeds but before
  // its local execution receipt is marked RESULT_SUBMITTED. On restart the
  // worker replays the persisted MODEL_RESULT_READY record. Treat that replay
  // as success only when it is byte-semantically the same completed result,
  // worker, and receipt already stored on the terminal job. Any difference is
  // a terminal conflict, never permission to rewrite history.
  if (job.status === 'completed') {
    if (!completedSubmissionMatches(job, { worker, outcome, result, receipt })) {
      return errorResult(['terminal-result-conflict']);
    }
    return {
      ok: true,
      policyVersion: CLOUD_AGENT_RELAY_POLICY_VERSION,
      status: 'ALREADY_RECEIVED',
      taskId: id,
      jobId: job.id,
      jobStatus: job.status,
      workerId: worker,
      externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
    };
  }

  if (job.status !== 'active' || job.lockedBy !== worker) return errorResult(['lease-owner-mismatch']);
  const relayReceipt = {
    policyVersion: CLOUD_AGENT_RELAY_POLICY_VERSION,
    taskId: id,
    workerId: worker,
    status: outcome,
    receivedAt: at(date),
    receipt: receipt || null,
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
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
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  });
  return {
    ok: true,
    policyVersion: CLOUD_AGENT_RELAY_POLICY_VERSION,
    status: 'RECEIVED',
    taskId: id,
    jobId: job.id,
    jobStatus: updated.status,
    workerId: worker,
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}
