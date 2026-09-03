import os from 'node:os';
import crypto from 'node:crypto';
import { id, now } from './utils.mjs';
import { ConflictError } from './store.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const RECOVERY_POLICIES = new Set(['legacy', 'replay-safe', 'reconcile']);

function normalizeRecoveryPolicy(options = {}) {
  const requested = options.recoveryPolicy
    ?? (options.nonIdempotent === true ? 'reconcile' : options.idempotent === true ? 'replay-safe' : 'legacy');
  const policy = String(requested || 'legacy');
  if (!RECOVERY_POLICIES.has(policy)) throw new Error(`Invalid queue recoveryPolicy: ${policy}`);
  return policy;
}

function uncertainTimeoutError(maxRuntimeMs) {
  const error = new Error(`Job exceeded ${maxRuntimeMs}ms runtime limit; execution outcome is uncertain and automatic retry is blocked`);
  error.name = 'JobRuntimeTimeoutError';
  error.code = 'JOB_RUNTIME_TIMEOUT_UNCERTAIN';
  error.retryable = false;
  error.uncertainExecution = true;
  return error;
}

function leaseLostError() {
  const error = new Error('Job lease ownership was lost while the handler was still running');
  error.name = 'JobLeaseLostError';
  error.code = 'JOB_LEASE_LOST';
  error.retryable = false;
  error.uncertainExecution = true;
  return error;
}

function reconciliationRequiredError(jobId) {
  const error = new Error(`Job ${jobId} has uncertain execution and requires an explicit reconciliation receipt before requeue`);
  error.name = 'JobReconciliationRequiredError';
  error.code = 'JOB_RECONCILIATION_REQUIRED';
  error.retryable = false;
  return error;
}

function reconcileReplayFenceError(job) {
  const error = new Error(`Reconcile job ${job.id} reached execution on attempt ${job.attempts}; possible prior external effect must be reconciled before any replay`);
  error.name = 'JobReconcileReplayFenceError';
  error.code = 'JOB_RECONCILE_REPLAY_BLOCKED';
  error.retryable = false;
  error.uncertainExecution = true;
  return error;
}

export const QUEUE_RECONCILIATION_RECEIPT_VERSION = 'uberbond.queue-reconciliation.v1';
const RECONCILIATION_SOURCE_CLASSES = new Set([
  'PROVIDER_READBACK',
  'INDEPENDENT_EXTERNAL_EVIDENCE',
  'DETERMINISTIC_NO_EFFECT_RECEIPT'
]);

function reconciliationReceiptInvalidError(jobId, reasonCodes = []) {
  const error = new Error(`Job ${jobId} reconciliation receipt is invalid: ${reasonCodes.join(', ')}`);
  error.name = 'JobReconciliationReceiptInvalidError';
  error.code = 'JOB_RECONCILIATION_RECEIPT_INVALID';
  error.retryable = false;
  error.reasonCodes = [...new Set(reasonCodes.filter(Boolean))];
  return error;
}

function queueText(value, max = 1000) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}

function reconciliationReasonCode(job = {}) {
  return queueText(job.uncertainReasonCode, 200)
    || (job.recoveryPolicy === 'reconcile' ? 'RECOVERY_POLICY_RECONCILE' : null);
}

export function validateQueueReconciliationReceipt(job = {}, receipt = null, { date = new Date() } = {}) {
  const reasons = [];
  if (!job?.id || job.status !== 'dead-letter') reasons.push('dead-letter-job-required');
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    return { ok: false, reasonCodes: ['structured-reconciliation-receipt-required'], receipt: null };
  }

  const schemaVersion = queueText(receipt.schemaVersion, 120);
  const receiptJobId = queueText(receipt.jobId, 180);
  const outcome = queueText(receipt.outcome, 120)?.toUpperCase();
  const sourceClass = queueText(receipt.sourceClass, 120)?.toUpperCase();
  const evidenceRef = queueText(receipt.evidenceRef, 2000);
  const reasonCode = queueText(receipt.uncertainReasonCode, 200);
  const attempts = Number(receipt.attempts);
  const observedAt = new Date(receipt.observedAt || '');
  const receiptDeadLetteredAt = new Date(receipt.deadLetteredAt || '');
  const jobDeadLetteredAt = new Date(job.deadLetteredAt || '');
  const reference = date instanceof Date ? date : new Date(date);
  const expectedReasonCode = reconciliationReasonCode(job);

  if (schemaVersion !== QUEUE_RECONCILIATION_RECEIPT_VERSION) reasons.push('reconciliation-schema-version-required');
  if (receiptJobId !== String(job.id || '')) reasons.push('reconciliation-job-id-mismatch');
  if (outcome !== 'VERIFIED_NO_EXTERNAL_EFFECT') reasons.push('verified-no-external-effect-required');
  if (!RECONCILIATION_SOURCE_CLASSES.has(sourceClass)) reasons.push('recognized-reconciliation-source-class-required');
  if (!evidenceRef) reasons.push('reconciliation-evidence-ref-required');
  if (!Number.isSafeInteger(attempts) || attempts !== Number(job.attempts)) reasons.push('reconciliation-attempt-mismatch');
  if (!expectedReasonCode || reasonCode !== expectedReasonCode) reasons.push('reconciliation-reason-code-mismatch');
  if (!Number.isFinite(jobDeadLetteredAt.getTime()) || !Number.isFinite(receiptDeadLetteredAt.getTime())
      || receiptDeadLetteredAt.getTime() !== jobDeadLetteredAt.getTime()) {
    reasons.push('reconciliation-dead-letter-occurrence-mismatch');
  }
  if (!Number.isFinite(observedAt.getTime()) || !Number.isFinite(reference.getTime())) {
    reasons.push('valid-reconciliation-observation-time-required');
  } else {
    if (Number.isFinite(jobDeadLetteredAt.getTime()) && observedAt.getTime() < jobDeadLetteredAt.getTime()) {
      reasons.push('reconciliation-cannot-predate-dead-letter');
    }
    if (observedAt.getTime() > reference.getTime() + 60_000) reasons.push('future-reconciliation-evidence-rejected');
  }

  if (reasons.length) return { ok: false, reasonCodes: [...new Set(reasons)], receipt: null };
  return {
    ok: true,
    reasonCodes: [],
    receipt: {
      schemaVersion: QUEUE_RECONCILIATION_RECEIPT_VERSION,
      jobId: receiptJobId,
      deadLetteredAt: jobDeadLetteredAt.toISOString(),
      attempts,
      uncertainReasonCode: expectedReasonCode,
      outcome,
      sourceClass,
      evidenceRef,
      observedAt: observedAt.toISOString(),
      reconciledBy: queueText(receipt.reconciledBy, 240) || null
    }
  };
}

export class DurableQueue {
  constructor(store, cfg, log = console) {
    this.store = store;
    this.cfg = cfg;
    this.log = log;
    this.workerId = `${os.hostname()}:${process.pid}:${crypto.randomBytes(4).toString('hex')}`;
    this.startedAt = now();
    this.stopping = false;
    this.active = 0;
    this.loopPromise = null;
    this.heartbeatTimer = null;
  }

  async enqueue(type, payload = {}, options = {}) {
    const runAt = options.runAt ? new Date(options.runAt) : new Date(Date.now() + Math.max(0, Number(options.delayMs || 0)));
    if (Number.isNaN(runAt.getTime())) throw new Error('Invalid queue runAt value');
    const recoveryPolicy = normalizeRecoveryPolicy(options);
    const requestedMaxAttempts = Math.max(1, Number(options.maxAttempts || this.cfg.queue.maxAttempts || 5));
    const maxAttempts = recoveryPolicy === 'reconcile' ? 1 : requestedMaxAttempts;
    const job = {
      id: id('job'), type: String(type), queue: String(options.queue || type), status: 'queued',
      payload: structuredClone(payload || {}), priority: Number(options.priority || 0), attempts: 0,
      maxAttempts,
      runAt: runAt.toISOString(), scheduledAt: runAt.toISOString(), dedupeKey: options.dedupeKey ? String(options.dedupeKey) : null,
      singletonKey: options.singletonKey ? String(options.singletonKey) : null,
      recoveryPolicy,
      createdAt: now(), lastError: ''
    };
    try {
      await this.store.add('jobs', job);
      return job;
    } catch (error) {
      if (error instanceof ConflictError) {
        if (job.dedupeKey) {
          const existing = await this.store.findOne('jobs', { dedupeKey: job.dedupeKey });
          if (existing) return existing;
        }
        if (job.singletonKey) {
          const existing = (await this.store.list('jobs')).find(item => item.singletonKey === job.singletonKey && ['queued', 'retry', 'active'].includes(item.status));
          if (existing) return existing;
        }
      }
      throw error;
    }
  }

  async stats() { return this.store.queueStats(); }

  async isPaused() {
    const settings = await this.store.getSettings();
    const value = settings.workerPaused;
    return typeof value === 'object' && value !== null ? Boolean(value.paused) : Boolean(value);
  }

  async setPaused(paused, actor = 'admin') {
    const value = { paused: Boolean(paused), actor, changedAt: now() };
    await this.store.setSetting('workerPaused', value);
    await this.store.log(paused ? 'worker_paused' : 'worker_resumed', value);
    return value;
  }

  async pausedState() {
    const settings = await this.store.getSettings();
    const value = settings.workerPaused;
    return typeof value === 'object' ? value : { paused: Boolean(value), changedAt: null };
  }

  async recordWorkerHeartbeat(extra = {}) {
    const record = {
      id: this.workerId, role: 'worker', hostname: os.hostname(), pid: process.pid,
      version: this.cfg.version || '1.3.0', startedAt: this.startedAt, heartbeatAt: now(),
      active: this.active, stopping: this.stopping, ...extra, createdAt: this.startedAt, updatedAt: now()
    };
    await this.store.upsert('workerHeartbeats', record);
    return record;
  }

  async liveWorkers(maxAgeMs = this.cfg.queue.workerStaleMs || 90000) {
    const cutoff = Date.now() - Number(maxAgeMs);
    return (await this.store.list('workerHeartbeats')).filter(worker => Date.parse(worker.heartbeatAt || 0) >= cutoff);
  }

  async quarantineUncertainStaleJobs(lockTimeoutMs = this.cfg.queue.lockTimeoutMs || 300000) {
    const cutoff = Date.now() - Math.max(1000, Number(lockTimeoutMs || 300000));
    const candidates = (await this.store.list('jobs')).filter(job => {
      if (job.status !== 'active' || job.recoveryPolicy !== 'reconcile') return false;
      const stamp = Date.parse(job.heartbeatAt || job.lockedAt || job.startedAt || 0);
      return Number.isFinite(stamp) && stamp <= cutoff;
    }).map(job => ({ id: job.id, type: job.type, lockedBy: job.lockedBy, recoveryPolicy: job.recoveryPolicy }));

    if (!candidates.length) return { quarantined: 0 };

    await this.store.recoverStaleJobs(lockTimeoutMs);

    let quarantined = 0;
    for (const candidate of candidates) {
      const current = await this.store.get('jobs', candidate.id);
      if (!current || current.status !== 'dead-letter' || current.recoveryPolicy !== 'reconcile') continue;
      const patched = await this.store.patch('jobs', candidate.id, {
        lastError: current.lastError || 'Worker lease expired while execution outcome may be non-idempotent; reconciliation required before replay',
        uncertainExecution: true,
        uncertainReasonCode: current.uncertainReasonCode || 'JOB_STALE_NON_IDEMPOTENT_UNCERTAIN',
        reconciliationRequired: true,
        reconciledAt: null,
        reconciliationReceipt: null
      });
      if (!patched || patched.status !== 'dead-letter') continue;
      quarantined += 1;
      await this.store.log('queue_job_stale_execution_quarantined', {
        jobId: candidate.id, type: candidate.type, previousWorkerId: candidate.lockedBy,
        recoveryPolicy: candidate.recoveryPolicy,
        uncertainExecution: true,
        errorCode: 'JOB_STALE_NON_IDEMPOTENT_UNCERTAIN'
      });
    }
    return { quarantined };
  }

  async runJob(job, handlers) {
    const handler = handlers[job.type] || handlers[job.queue];
    if (!handler) {
      await this.store.failJobIfOwned(job.id, this.workerId, new Error(`No handler registered for ${job.type}`), { maxAttempts: 1, baseDelayMs: 1000 });
      return;
    }
    if (job.recoveryPolicy === 'reconcile' && Number(job.attempts || 0) > 1) {
      const error = reconcileReplayFenceError(job);
      const failed = await this.store.failJobIfOwned(job.id, this.workerId, error, { maxAttempts: 1, baseDelayMs: 1000 });
      if (failed?.status === 'dead-letter') {
        await this.store.patch('jobs', job.id, {
          uncertainExecution: true,
          uncertainReasonCode: error.code,
          reconciliationRequired: true,
          reconciledAt: null,
          reconciliationReceipt: null
        });
      }
      await this.store.log('queue_job_reconcile_replay_blocked', {
        jobId: job.id, type: job.type, workerId: this.workerId, attempts: job.attempts,
        recoveryPolicy: job.recoveryPolicy, uncertainExecution: true, errorCode: error.code
      });
      return;
    }
    this.active += 1;
    const abortController = new AbortController();
    const heartbeatEvery = Math.max(1000, Number(this.cfg.queue.jobHeartbeatMs || 15000));
    const heartbeat = setInterval(() => {
      this.store.heartbeatJob(job.id, this.workerId)
        .then(async owned => {
          if (owned || abortController.signal.aborted) return;
          const error = leaseLostError();
          abortController.abort(error);
          await this.store.log('queue_job_lease_lost_during_execution', {
            jobId: job.id, type: job.type, workerId: this.workerId, attempts: job.attempts,
            uncertainExecution: true, errorCode: error.code
          }).catch(() => {});
        })
        .catch(error => this.log.error('job heartbeat failed', error));
    }, heartbeatEvery);
    heartbeat.unref?.();
    try {
      const maxRuntimeMs = Math.max(1000, Number(this.cfg.queue.maxRuntimeMs || 900000));
      let runtimeTimer;
      try {
        const timeoutPromise = new Promise((_, reject) => {
          runtimeTimer = setTimeout(() => {
            const error = uncertainTimeoutError(maxRuntimeMs);
            reject(error);
            abortController.abort(error);
          }, maxRuntimeMs);
        });
        const result = await Promise.race([
          Promise.resolve(handler(job.payload || {}, job, {
            signal: abortController.signal,
            workerId: this.workerId,
            leaseOwned: async () => Boolean(await this.store.heartbeatJob(job.id, this.workerId))
          })),
          timeoutPromise
        ]);
        const completed = await this.store.completeJobIfOwned(job.id, this.workerId, result ?? {});
        if (!completed) {
          await this.store.log('queue_job_lease_lost_before_completion', {
            jobId: job.id, type: job.type, workerId: this.workerId, attempts: job.attempts
          });
          return;
        }
      } finally {
        if (runtimeTimer) clearTimeout(runtimeTimer);
      }
      await this.store.log('queue_job_completed', { jobId: job.id, type: job.type, workerId: this.workerId, attempts: job.attempts });
    } catch (error) {
      const failed = await this.store.failJobIfOwned(job.id, this.workerId, error, {
        baseDelayMs: this.cfg.queue.retryBaseMs,
        maxDelayMs: this.cfg.queue.retryMaxMs,
        maxAttempts: error?.retryable === false ? 1 : job.maxAttempts
      });
      if (!failed) {
        await this.store.log('queue_job_lease_lost_before_failure', {
          jobId: job.id, type: job.type, workerId: this.workerId, attempts: job.attempts,
          error: String(error?.message || error).slice(0, 1000),
          uncertainExecution: Boolean(error?.uncertainExecution)
        });
        this.log.error(`Queue job ${job.type} ${job.id} lost lease before failure could be recorded`, error);
        return;
      }
      if (error?.uncertainExecution && failed.status === 'dead-letter') {
        await this.store.patch('jobs', job.id, {
          uncertainExecution: true,
          uncertainReasonCode: error?.code || 'UNCERTAIN_EXECUTION',
          reconciliationRequired: true,
          reconciledAt: null,
          reconciliationReceipt: null
        });
      }
      await this.store.log(failed.status === 'dead-letter' ? 'queue_job_dead_lettered' : 'queue_job_retry_scheduled', {
        jobId: job.id, type: job.type, workerId: this.workerId, attempts: job.attempts,
        error: String(error?.message || error).slice(0, 1000), nextRunAt: failed.runAt || null,
        uncertainExecution: Boolean(error?.uncertainExecution), errorCode: error?.code || null
      });
      this.log.error(`Queue job ${job.type} ${job.id} failed`, error);
    } finally {
      abortController.abort(new Error('queue-job-finished'));
      clearInterval(heartbeat);
      this.active -= 1;
    }
  }

  async runOnce(handlers, options = {}) {
    if (await this.isPaused()) return { paused: true, claimed: 0 };
    await this.quarantineUncertainStaleJobs(this.cfg.queue.lockTimeoutMs);
    const concurrency = Math.max(1, Number(options.concurrency || this.cfg.queue.concurrency || 2));
    const available = Math.max(0, concurrency - this.active);
    if (!available) return { paused: false, claimed: 0 };
    const jobs = await this.store.claimJobs(this.workerId, available, this.cfg.queue.lockTimeoutMs, { excludeTypes: ['prometheus.agent.relay'] });
    if (!jobs.length) return { paused: false, claimed: 0 };
    await Promise.all(jobs.map(job => this.runJob(job, handlers)));
    return { paused: false, claimed: jobs.length };
  }

  async startWorker(handlers, options = {}) {
    if (this.loopPromise) return this.loopPromise;
    this.stopping = false;
    await this.quarantineUncertainStaleJobs(this.cfg.queue.lockTimeoutMs);
    await this.store.recoverStaleJobs(this.cfg.queue.lockTimeoutMs);
    await this.recordWorkerHeartbeat({ state: 'starting' });
    this.heartbeatTimer = setInterval(() => {
      this.recordWorkerHeartbeat({ state: this.stopping ? 'stopping' : 'running' }).catch(error => this.log.error('worker heartbeat failed', error));
    }, Math.max(1000, Number(this.cfg.queue.workerHeartbeatMs || 15000)));
    this.heartbeatTimer.unref?.();
    const pollMs = Math.max(100, Number(options.pollMs || this.cfg.queue.pollMs || 1000));
    this.loopPromise = (async () => {
      while (!this.stopping) {
        try {
          const result = await this.runOnce(handlers, options);
          if (!result.claimed) await sleep(result.paused ? Math.max(pollMs, 2000) : pollMs);
        } catch (error) {
          this.log.error('queue polling failed', error);
          await sleep(Math.max(pollMs, 2000));
        }
      }
      while (this.active > 0) await sleep(100);
      await this.recordWorkerHeartbeat({ state: 'stopped' }).catch(() => {});
    })();
    return this.loopPromise;
  }

  async stopWorker() {
    this.stopping = true;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    await this.loopPromise;
    this.loopPromise = null;
  }

  async requeueDeadLetter(jobId, options = {}) {
    const job = await this.store.get('jobs', jobId);
    if (!job || job.status !== 'dead-letter') return null;
    const requiresReconciliation = job.reconciliationRequired || job.recoveryPolicy === 'reconcile';
    if (requiresReconciliation) {
      const suppliedReceipt = options.reconciliationReceipt;
      const durableReceipt = job.reconciliationRequired === false ? job.reconciliationReceipt : null;
      const candidateReceipt = suppliedReceipt || durableReceipt;
      if (!candidateReceipt) throw reconciliationRequiredError(jobId);
      const validation = validateQueueReconciliationReceipt(job, candidateReceipt, { date: options.date || new Date() });
      if (!validation.ok) throw reconciliationReceiptInvalidError(jobId, validation.reasonCodes);
      const receipt = validation.receipt;

      if (durableReceipt) {
        const durableValidation = validateQueueReconciliationReceipt(job, durableReceipt, { date: options.date || new Date() });
        if (!durableValidation.ok || JSON.stringify(durableValidation.receipt) !== JSON.stringify(receipt)) {
          throw reconciliationReceiptInvalidError(jobId, ['reconciliation-receipt-conflict']);
        }
      } else {
        await this.store.patch('jobs', jobId, {
          reconciliationRequired: false,
          reconciledAt: now(),
          reconciliationReceipt: structuredClone(receipt)
        });
        await this.store.log('queue_job_uncertain_execution_reconciled', {
          jobId: job.id, type: job.type, workerId: this.workerId,
          uncertainReasonCode: reconciliationReasonCode(job),
          receipt: structuredClone(receipt)
        });
      }
    }
    if (job.singletonKey) {
      const existing = (await this.store.list('jobs')).find(item => item.id !== job.id && item.singletonKey === job.singletonKey && ['queued', 'retry', 'active'].includes(item.status));
      if (existing) return existing;
    }
    return this.store.patch('jobs', jobId, {
      status: 'queued', attempts: 0, runAt: now(), deadLetteredAt: null,
      lastError: '', lockedAt: null, lockedBy: null, heartbeatAt: null
    });
  }
}
