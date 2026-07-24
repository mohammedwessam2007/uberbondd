// Revenue OS's own store -- entirely separate from ../../src/store.mjs and from lite/. Follows the
// exact generic pattern proven in this session's sibling missions (JSON backend, transaction
// queue, _xDirect/public-wrapper split to avoid nested-transaction deadlock) so this package's
// DurableQueue usage (imported from ../../src/queue.mjs, unmodified) works against this store
// without any adapter code. See docs/REUSE_VS_REPLACE_DECISION.md: only the JSON backend is
// implemented and tested this session -- a full PostgresStore mirror is disclosed as not
// attempted, though migrations/*.sql is written to the same Postgres-compatible shape.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ConflictError as RootConflictError } from '../../src/store.mjs';

export const COLLECTIONS = Object.freeze([
  'organizations', 'websites', 'opportunities', 'evidenceItems', 'offers', 'messageDrafts',
  'approvals', 'sendRecords', 'replies', 'suppressions', 'proposals', 'invoiceHandoffs', 'payments',
  'diagnosticProjects', 'checkRuns', 'defects', 'reports', 'repairTasks', 'deliveries',
  'monitoringOffers', 'experiments', 'ownerActions', 'blockers', 'auditEvents', 'jobs', 'auditLog'
]);

const EMPTY = Object.fromEntries([...COLLECTIONS.map(key => [key, []]), ['settings', {}], ['version', 1]]);

export const now = () => new Date().toISOString();
export const id = prefix => `${prefix}_${crypto.randomUUID()}`;

export class StoreError extends Error {
  constructor(message, code = 'STORE_ERROR', cause) {
    super(message, { cause });
    this.name = 'StoreError';
    this.code = code;
  }
}

export class ConflictError extends RootConflictError {
  constructor(message, cause) { super(message, cause); this.name = 'ConflictError'; }
}

function normalizeRecord(item) {
  const copy = structuredClone(item);
  if (!copy.id) copy.id = id('ros');
  return copy;
}

export class JsonStore {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'revenue-os.json');
    this.queue = Promise.resolve();
    this.data = structuredClone(EMPTY);
  }

  async init() {
    await fs.mkdir(this.dir, { recursive: true });
    try {
      const loaded = JSON.parse(await fs.readFile(this.file, 'utf8'));
      this.data = { ...structuredClone(EMPTY), ...loaded };
      for (const key of Object.keys(EMPTY)) if (!(key in this.data)) this.data[key] = structuredClone(EMPTY[key]);
      await this.save();
    } catch (error) {
      if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
      await this.save();
    }
    return this;
  }

  async close() {}
  async save() {
    const temp = `${this.file}.tmp-${crypto.randomBytes(4).toString('hex')}`;
    await fs.writeFile(temp, JSON.stringify(this.data, null, 2));
    await fs.rename(temp, this.file);
  }

  /** Serializes every mutation through one promise chain, rolling back the in-memory snapshot on
   * failure -- the same pattern this session's sibling missions use, which prevents concurrent
   * callers from interleaving a read-modify-write and losing an update. */
  async transaction(fn) {
    const task = this.queue.then(async () => {
      const snapshot = structuredClone(this.data);
      try {
        const result = await fn(this);
        await this.save();
        return result;
      } catch (error) { this.data = snapshot; throw error; }
    });
    this.queue = task.catch(() => {});
    return task;
  }

  _checkUnique(key, record, excludeId = '') {
    const rows = this.data[key] || [];
    const other = predicate => rows.some(item => item.id !== excludeId && predicate(item));
    if (other(item => item.id === record.id)) throw new ConflictError(`Duplicate ${key} id: ${record.id}`);
    if (key === 'websites' && other(item => item.organizationId === record.organizationId && String(item.domain).toLowerCase() === String(record.domain).toLowerCase())) throw new ConflictError(`Duplicate website domain for organization: ${record.domain}`);
    if (key === 'opportunities' && other(item => String(item.organizationDomain || '').toLowerCase() === String(record.organizationDomain || '').toLowerCase() && item.channel === record.channel)) throw new ConflictError(`Duplicate opportunity: ${record.organizationDomain}/${record.channel}`);
    if (key === 'sendRecords' && record.idempotencyKey && other(item => item.idempotencyKey === record.idempotencyKey)) throw new ConflictError(`Duplicate send-record idempotency key: ${record.idempotencyKey}`);
    if (key === 'payments' && record.evidenceHash && other(item => item.evidenceHash === record.evidenceHash)) throw new ConflictError(`Payment evidence already used: ${record.evidenceHash}`);
    if (key === 'checkRuns' && record.idempotencyKey && other(item => item.idempotencyKey === record.idempotencyKey)) throw new ConflictError(`Duplicate check-run idempotency key: ${record.idempotencyKey}`);
    if (key === 'jobs' && record.dedupeKey && other(item => item.dedupeKey === record.dedupeKey)) throw new ConflictError(`Duplicate job dedupe key: ${record.dedupeKey}`);
    if (key === 'jobs' && record.singletonKey && ['queued', 'retry', 'active'].includes(record.status) && other(item => item.singletonKey === record.singletonKey && ['queued', 'retry', 'active'].includes(item.status))) throw new ConflictError(`Active singleton job already exists: ${record.singletonKey}`);
    return true;
  }

  async list(key, options = {}) {
    let rows = structuredClone(this.data[key] || []);
    if (options.filters) rows = rows.filter(row => Object.entries(options.filters).every(([k, v]) => row?.[k] === v));
    if (options.orderBy) {
      const direction = options.direction === 'asc' ? 1 : -1;
      rows.sort((a, b) => String(a?.[options.orderBy] ?? '').localeCompare(String(b?.[options.orderBy] ?? '')) * direction);
    }
    if (options.offset) rows = rows.slice(options.offset);
    if (Number.isInteger(options.limit)) rows = rows.slice(0, Math.max(0, options.limit));
    return rows;
  }

  async get(key, recordId) { return structuredClone((this.data[key] || []).find(x => x.id === recordId) || null); }
  async findOne(key, filters = {}) { const rows = await this.list(key, { filters, limit: 1 }); return rows[0] || null; }
  async count(key, filters = {}) { return (await this.list(key, { filters })).length; }

  // _addDirect/_upsertDirect/_patchDirect are pure mutation bodies -- they never call
  // this.transaction() themselves, so composed multi-step operations (payment reconciliation,
  // credit-style ledgers) can call these directly from inside their own transaction() callback
  // without deadlocking (see watchtower's sibling mission for the exact bug class this avoids).
  _addDirect(key, item) {
    if (!Array.isArray(this.data[key])) this.data[key] = [];
    const record = normalizeRecord({ ...item, createdAt: item.createdAt || now(), updatedAt: now() });
    this._checkUnique(key, record);
    this.data[key].push(record);
    return structuredClone(record);
  }

  _upsertDirect(key, item) {
    if (!Array.isArray(this.data[key])) this.data[key] = [];
    const record = normalizeRecord({ ...item, updatedAt: now() });
    const index = this.data[key].findIndex(existing => existing.id === record.id);
    this._checkUnique(key, record, record.id);
    if (index >= 0) this.data[key][index] = record; else this.data[key].push(record);
    return structuredClone(record);
  }

  _patchDirect(key, recordId, patch) {
    const item = (this.data[key] || []).find(existing => existing.id === recordId);
    if (!item) return null;
    const record = normalizeRecord({ ...item, ...patch, updatedAt: now() });
    this._checkUnique(key, record, recordId);
    Object.assign(item, record);
    return structuredClone(item);
  }

  async add(key, item) { return this.transaction(() => this._addDirect(key, item)); }
  async upsert(key, item) { return this.transaction(() => this._upsertDirect(key, item)); }
  async patch(key, recordId, patch) { return this.transaction(() => this._patchDirect(key, recordId, patch)); }

  async getSettings() { return structuredClone(this.data.settings || {}); }
  async setSetting(key, value) { return this.transaction(() => { this.data.settings[key] = structuredClone(value); return value; }); }
  async log(type, detail = {}) { return this.transaction(() => this._addDirect('auditLog', { id: id('audit'), type, detail })); }

  _recoverStaleJobsDirect(lockTimeoutMs = 300000) {
    const cutoff = Date.now() - Math.max(1000, Number(lockTimeoutMs || 300000));
    let recovered = 0, deadLettered = 0;
    for (const job of this.data.jobs || []) {
      if (job.status !== 'active') continue;
      const stamp = Date.parse(job.heartbeatAt || job.lockedAt || job.startedAt || 0);
      if (!Number.isFinite(stamp) || stamp > cutoff) continue;
      if (Number(job.attempts || 0) >= Number(job.maxAttempts || 5)) { job.status = 'dead-letter'; job.deadLetteredAt = now(); deadLettered += 1; }
      else { job.status = 'queued'; job.runAt = now(); recovered += 1; }
      job.lockedAt = null; job.lockedBy = null; job.heartbeatAt = null; job.updatedAt = now();
    }
    return { recovered, deadLettered };
  }
  async recoverStaleJobs(lockTimeoutMs = 300000) { return this.transaction(() => this._recoverStaleJobsDirect(lockTimeoutMs)); }

  async claimJobs(workerId, limit = 1, lockTimeoutMs = 300000) {
    return this.transaction(() => {
      this._recoverStaleJobsDirect(lockTimeoutMs);
      const current = Date.now();
      const jobs = (this.data.jobs || [])
        .filter(job => ['queued', 'retry'].includes(job.status) && Date.parse(job.runAt || job.createdAt || 0) <= current)
        .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
        .slice(0, Math.max(0, limit));
      for (const job of jobs) {
        job.status = 'active'; job.attempts = Number(job.attempts || 0) + 1;
        job.lockedBy = workerId; job.lockedAt = now(); job.heartbeatAt = job.lockedAt;
        job.startedAt = job.startedAt || job.lockedAt; job.updatedAt = now();
      }
      return structuredClone(jobs);
    });
  }

  async completeJob(jobId, result = {}) {
    return this.transaction(() => {
      const job = (this.data.jobs || []).find(item => item.id === jobId);
      if (!job) return null;
      Object.assign(job, { status: 'completed', result, completedAt: now(), lockedAt: null, lockedBy: null, heartbeatAt: null, lastError: '', updatedAt: now() });
      return structuredClone(job);
    });
  }

  async failJob(jobId, error, options = {}) {
    return this.transaction(() => {
      const job = (this.data.jobs || []).find(item => item.id === jobId);
      if (!job) return null;
      const attempts = Number(job.attempts || 0);
      const maxAttempts = Number(options.maxAttempts || job.maxAttempts || 5);
      const message = String(error?.message || error || 'Unknown job failure').slice(0, 2000);
      if (attempts >= maxAttempts) {
        Object.assign(job, { status: 'dead-letter', deadLetteredAt: now(), lastError: message, lockedAt: null, lockedBy: null, heartbeatAt: null, updatedAt: now() });
      } else {
        const base = Math.max(1000, Number(options.baseDelayMs || 30000));
        const delay = Math.min(Number(options.maxDelayMs || 3600000), base * (2 ** Math.max(0, attempts - 1)));
        Object.assign(job, { status: 'retry', runAt: new Date(Date.now() + delay).toISOString(), lastError: message, lockedAt: null, lockedBy: null, heartbeatAt: null, updatedAt: now() });
      }
      return structuredClone(job);
    });
  }

  async heartbeatJob(jobId, workerId) {
    return this.transaction(() => {
      const job = (this.data.jobs || []).find(item => item.id === jobId && item.status === 'active' && item.lockedBy === workerId);
      if (!job) return null;
      job.heartbeatAt = now(); job.updatedAt = now();
      return structuredClone(job);
    });
  }

  async queueStats() {
    const counts = {};
    for (const job of this.data.jobs || []) counts[job.status || 'unknown'] = (counts[job.status || 'unknown'] || 0) + 1;
    const next = (this.data.jobs || []).filter(job => ['queued', 'retry'].includes(job.status)).sort((a, b) => String(a.runAt || '').localeCompare(String(b.runAt || '')))[0];
    return { counts, nextRunAt: next?.runAt || null, total: (this.data.jobs || []).length };
  }
}

export class Store extends JsonStore {}
