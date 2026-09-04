import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../api/admin/retry-dead-letter.mjs';

const SECRET = 'admin-secret-abcdefghijklmnopqrstuvwxyz';
const AUTH = `Bearer ${SECRET}`;

function response() {
  return {
    statusCode: null,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return payload; }
  };
}

async function invoke({ method = 'POST', authorization = AUTH, body = {}, requeue, env = { ADMIN_TOKEN: SECRET } } = {}) {
  const res = response();
  const handler = createHandler({
    env,
    startupConfig: { adminToken: env.ADMIN_TOKEN || '', storeBackend: 'postgres', databaseUrl: 'postgres://unused' },
    requeueDeadLetter: requeue || (async ({ jobId }) => ({ id: jobId, status: 'queued', attempts: 0, reconciliationRequired: false })),
    now: () => new Date('2026-09-04T00:02:00.000Z')
  });
  await handler({ method, headers: { authorization }, body }, res);
  return res;
}

test('admin retry route is POST only', async () => {
  const res = await invoke({ method: 'GET' });
  assert.equal(res.statusCode, 405);
  assert.deepEqual(res.payload.reasonCodes, ['post-required']);
});

test('admin retry route fails closed when ADMIN_TOKEN is absent', async () => {
  const res = await invoke({ env: {} });
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.payload.reasonCodes, ['admin-retry-secret-not-configured']);
});

test('admin retry route refuses wrong or ambiguous bearer authorization', async () => {
  const wrong = await invoke({ authorization: 'Bearer wrong' });
  assert.equal(wrong.statusCode, 401);
  const ambiguous = response();
  const handler = createHandler({
    env: { ADMIN_TOKEN: SECRET },
    startupConfig: { adminToken: SECRET },
    requeueDeadLetter: async () => ({ id: 'job_1', status: 'queued', attempts: 0 })
  });
  await handler({ method: 'POST', headers: { authorization: [AUTH, AUTH] }, body: { jobId: 'job_1' } }, ambiguous);
  assert.equal(ambiguous.statusCode, 401);
});

test('admin retry route requires an object body and bounded job id', async () => {
  const malformed = await invoke({ body: '[]' });
  assert.equal(malformed.statusCode, 400);
  assert.deepEqual(malformed.payload.reasonCodes, ['json-body-object-required']);
  const missing = await invoke({ body: {} });
  assert.equal(missing.statusCode, 400);
  assert.deepEqual(missing.payload.reasonCodes, ['job-id-required']);
});

test('ordinary legacy dead letter can be retried without reconciliation evidence', async () => {
  let seen;
  const res = await invoke({
    body: { jobId: 'job_legacy' },
    requeue: async input => {
      seen = input;
      return { id: input.jobId, status: 'queued', attempts: 0, reconciliationRequired: false };
    }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.status, 'REQUEUED');
  assert.equal(res.payload.jobId, 'job_legacy');
  assert.equal(seen.reconciliationReceipt, undefined);
});

test('uncertain reconcile job without evidence maps to explicit 409 instead of generic failure', async () => {
  const error = new Error('reconciliation required');
  error.code = 'JOB_RECONCILIATION_REQUIRED';
  const res = await invoke({ body: { jobId: 'job_uncertain' }, requeue: async () => { throw error; } });
  assert.equal(res.statusCode, 409);
  assert.equal(res.payload.status, 'RECONCILIATION_REQUIRED');
});

test('invalid reconciliation evidence preserves exact queue reason codes', async () => {
  const error = new Error('invalid reconciliation receipt');
  error.code = 'JOB_RECONCILIATION_RECEIPT_INVALID';
  error.reasonCodes = ['reconciliation-job-id-mismatch', 'verified-no-external-effect-required'];
  const res = await invoke({
    body: { jobId: 'job_uncertain', reconciliationReceipt: { yes: true } },
    requeue: async () => { throw error; }
  });
  assert.equal(res.statusCode, 422);
  assert.equal(res.payload.status, 'RECONCILIATION_RECEIPT_INVALID');
  assert.deepEqual(res.payload.reasonCodes, error.reasonCodes);
});

test('valid reconciliation evidence is passed through but never echoed in the public result', async () => {
  const receipt = {
    schemaVersion: 'queue-reconciliation-receipt-1.0.0',
    jobId: 'job_uncertain',
    outcome: 'VERIFIED_NO_EXTERNAL_EFFECT',
    evidenceRef: 'provider:readback:no-submission'
  };
  let seen;
  const res = await invoke({
    body: { jobId: 'job_uncertain', reconciliationReceipt: receipt },
    requeue: async input => {
      seen = input;
      return {
        id: input.jobId,
        status: 'queued',
        attempts: 0,
        reconciliationRequired: false,
        reconciledAt: '2026-09-04T00:02:00.000Z',
        payload: { secretBusinessContext: 'must-not-leak' },
        reconciliationReceipt: receipt
      };
    }
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(seen.reconciliationReceipt, receipt);
  assert.equal(res.payload.jobId, 'job_uncertain');
  assert.equal(res.payload.reconciledAt, '2026-09-04T00:02:00.000Z');
  assert.equal('payload' in res.payload, false);
  assert.equal('reconciliationReceipt' in res.payload, false);
  assert.equal(JSON.stringify(res.payload).includes('secretBusinessContext'), false);
});

test('missing dead letter is a 404, not a successful no-op', async () => {
  const res = await invoke({ body: { jobId: 'job_missing' }, requeue: async () => null });
  assert.equal(res.statusCode, 404);
  assert.equal(res.payload.status, 'NOT_FOUND');
});
