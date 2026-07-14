import os from 'node:os';
import crypto from 'node:crypto';
import { id, now } from './utils.mjs';
import { ConflictError } from './store.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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
    const job = {
      id: id('job'), type: String(type), queue: String(options.queue || type), status: 'queued',
      payload: structuredClone(payload || {}), priority: Number(options.priority || 0), attempts: 0,
      maxAttempts: Math.max(1, Number(options.maxAttempts || this.cfg.queue.maxAttempts || 5)),
      runAt: runAt.toISOString(), scheduledAt: runAt.toISOString(), dedupeKey: options.dedupeKey ? String(options.dedupeKey) : null,
      singletonKey: options.singletonKey ? String(options.singletonKey) : null,
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

  async runJob(job, handlers) {
    const handler = handlers[job.type] || handlers[job.queue];
    if (!handler) {
      await this.store.failJob(job.id, new Error(`No handler registered for ${job.type}`), { maxAttempts: 1, baseDelayMs: 1000 });
      return;
    }
    this.active += 1;
    const heartbeatEvery = Math.max(1000, Number(this.cfg.queue.jobHeartbeatMs || 15000));
    const heartbeat = setInterval(() => {
      this.store.heartbeatJob(job.id, this.workerId).catch(error => this.log.error('job heartbeat failed', error));
    }, heartbeatEvery);
    heartbeat.unref?.();
    try {
      const maxRuntimeMs = Math.max(1000, Number(this.cfg.queue.maxRuntimeMs || 900000));
      let runtimeTimer;
      try {
        const timeoutPromise = new Promise((_, reject) => {
          runtimeTimer = setTimeout(() => reject(new Error(`Job exceeded ${maxRuntimeMs}ms runtime limit`)), maxRuntimeMs);
          runtimeTimer.unref?.();
        });
        const result = await Promise.race([
          Promise.resolve(handler(job.payload || {}, job)),
          timeoutPromise
        ]);
        await this.store.completeJob(job.id, result ?? {});
      } finally {
        if (runtimeTimer) clearTimeout(runtimeTimer);
      }
      await this.store.log('queue_job_completed', { jobId: job.id, type: job.type, workerId: this.workerId, attempts: job.attempts });
    } catch (error) {
      const failed = await this.store.failJob(job.id, error, {
        baseDelayMs: this.cfg.queue.retryBaseMs,
        maxDelayMs: this.cfg.queue.retryMaxMs,
        maxAttempts: error?.retryable === false ? 1 : job.maxAttempts
      });
      await this.store.log(failed?.status === 'dead-letter' ? 'queue_job_dead_lettered' : 'queue_job_retry_scheduled', {
        jobId: job.id, type: job.type, workerId: this.workerId, attempts: job.attempts,
        error: String(error?.message || error).slice(0, 1000), nextRunAt: failed?.runAt || null
      });
      this.log.error(`Queue job ${job.type} ${job.id} failed`, error);
    } finally {
      clearInterval(heartbeat);
      this.active -= 1;
    }
  }

  async runOnce(handlers, options = {}) {
    if (await this.isPaused()) return { paused: true, claimed: 0 };
    const concurrency = Math.max(1, Number(options.concurrency || this.cfg.queue.concurrency || 2));
    const available = Math.max(0, concurrency - this.active);
    if (!available) return { paused: false, claimed: 0 };
    const jobs = await this.store.claimJobs(this.workerId, available, this.cfg.queue.lockTimeoutMs);
    if (!jobs.length) return { paused: false, claimed: 0 };
    await Promise.all(jobs.map(job => this.runJob(job, handlers)));
    return { paused: false, claimed: jobs.length };
  }

  async startWorker(handlers, options = {}) {
    if (this.loopPromise) return this.loopPromise;
    this.stopping = false;
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

  async requeueDeadLetter(jobId) {
    const job = await this.store.get('jobs', jobId);
    if (!job || job.status !== 'dead-letter') return null;
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
