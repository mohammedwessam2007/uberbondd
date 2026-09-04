import crypto from 'node:crypto';
import { config } from '../../src/config.mjs';
import { createStore } from '../../src/store.mjs';
import { DurableQueue } from '../../src/queue.mjs';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff'
};

function send(res, status, payload) {
  if (typeof res?.status === 'function' && typeof res?.json === 'function') return res.status(status).json(payload);
  res.writeHead(status, JSON_HEADERS);
  res.end(JSON.stringify(payload));
}

function bearerHeader(value) {
  if (Array.isArray(value)) return value.length === 1 && typeof value[0] === 'string' ? value[0] : '';
  return typeof value === 'string' ? value : '';
}

function equalBearer(header, secret) {
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(bearerHeader(header));
  const b = Buffer.from(expected);
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function parseBody(req) {
  const value = req?.body;
  if (value == null || value === '') return {};
  if (typeof value === 'string') {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('json-body-object-required');
    return parsed;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('json-body-object-required');
  return value;
}

function cleanJobId(value) {
  const id = String(value ?? '').trim();
  return id && id.length <= 240 ? id : '';
}

async function defaultRequeue({ jobId, reconciliationReceipt, date, startupConfig = config }) {
  if (startupConfig.storeBackend !== 'postgres' || !startupConfig.databaseUrl) {
    const error = new Error('admin-retry-postgres-runtime-not-configured');
    error.code = 'ADMIN_RETRY_RUNTIME_NOT_CONFIGURED';
    throw error;
  }
  const store = createStore(startupConfig);
  await store.init();
  try {
    const queue = new DurableQueue(store, startupConfig, { error() {}, warn() {}, info() {} });
    return await queue.requeueDeadLetter(jobId, { reconciliationReceipt, date });
  } finally {
    await store.close?.();
  }
}

function publicResult(job) {
  return {
    ok: true,
    status: 'REQUEUED',
    jobId: job.id,
    queueStatus: job.status,
    attempts: Number(job.attempts || 0),
    reconciliationRequired: job.reconciliationRequired === true,
    reconciledAt: job.reconciledAt || null
  };
}

export function createHandler(deps = {}) {
  const env = deps.env || process.env;
  const startupConfig = deps.startupConfig || config;
  const requeue = deps.requeueDeadLetter || (input => defaultRequeue({ ...input, startupConfig }));
  const now = deps.now || (() => new Date());

  return async function handler(req, res) {
    if (String(req?.method || '').toUpperCase() !== 'POST') {
      return send(res, 405, { ok: false, status: 'REFUSED', reasonCodes: ['post-required'] });
    }
    const adminSecret = String(env.ADMIN_TOKEN || startupConfig.adminToken || '');
    if (!adminSecret) {
      return send(res, 503, { ok: false, status: 'REFUSED', reasonCodes: ['admin-retry-secret-not-configured'] });
    }
    if (!equalBearer(req?.headers?.authorization, adminSecret)) {
      return send(res, 401, { ok: false, status: 'REFUSED', reasonCodes: ['unauthorized'] });
    }

    let body;
    try { body = parseBody(req); }
    catch {
      return send(res, 400, { ok: false, status: 'REFUSED', reasonCodes: ['json-body-object-required'] });
    }
    const jobId = cleanJobId(body.jobId);
    if (!jobId) return send(res, 400, { ok: false, status: 'REFUSED', reasonCodes: ['job-id-required'] });

    try {
      const job = await requeue({
        jobId,
        reconciliationReceipt: body.reconciliationReceipt,
        date: now()
      });
      if (!job) return send(res, 404, { ok: false, status: 'NOT_FOUND', reasonCodes: ['dead-letter-job-not-found'] });
      return send(res, 200, publicResult(job));
    } catch (error) {
      if (error?.code === 'JOB_RECONCILIATION_REQUIRED') {
        return send(res, 409, { ok: false, status: 'RECONCILIATION_REQUIRED', reasonCodes: ['job-reconciliation-required'] });
      }
      if (error?.code === 'JOB_RECONCILIATION_RECEIPT_INVALID') {
        return send(res, 422, {
          ok: false,
          status: 'RECONCILIATION_RECEIPT_INVALID',
          reasonCodes: Array.isArray(error.reasonCodes) && error.reasonCodes.length
            ? [...new Set(error.reasonCodes)]
            : ['job-reconciliation-receipt-invalid']
        });
      }
      if (error?.code === 'ADMIN_RETRY_RUNTIME_NOT_CONFIGURED') {
        return send(res, 503, { ok: false, status: 'REFUSED', reasonCodes: ['admin-retry-postgres-runtime-not-configured'] });
      }
      return send(res, 503, { ok: false, status: 'REFUSED', reasonCodes: ['admin-retry-failed'] });
    }
  };
}

export default createHandler();
