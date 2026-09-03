import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DurableQueue,
  validateQueueReconciliationReceipt,
  QUEUE_RECONCILIATION_RECEIPT_VERSION
} from '../src/queue.mjs';

const DEAD = '2026-09-04T00:00:00.000Z';
const OBSERVED = '2026-09-04T00:01:00.000Z';
const REFERENCE = new Date('2026-09-04T00:02:00.000Z');

function deadJob(overrides = {}) {
  return {
    id: 'job_reconcile_1',
    type: 'external.effect',
    queue: 'external.effect',
    status: 'dead-letter',
    attempts: 1,
    maxAttempts: 1,
    recoveryPolicy: 'reconcile',
    deadLetteredAt: DEAD,
    uncertainExecution: true,
    uncertainReasonCode: 'JOB_RUNTIME_TIMEOUT_UNCERTAIN',
    reconciliationRequired: true,
    reconciliationReceipt: null,
    ...overrides
  };
}

function receipt(job = deadJob(), overrides = {}) {
  return {
    schemaVersion: QUEUE_RECONCILIATION_RECEIPT_VERSION,
    jobId: job.id,
    deadLetteredAt: job.deadLetteredAt,
    attempts: job.attempts,
    uncertainReasonCode: job.uncertainReasonCode || 'RECOVERY_POLICY_RECONCILE',
    outcome: 'VERIFIED_NO_EXTERNAL_EFFECT',
    sourceClass: 'PROVIDER_READBACK',
    evidenceRef: 'provider:readback:no-submission',
    observedAt: OBSERVED,
    reconciledBy: 'runtime-verifier',
    ...overrides
  };
}

function fakeStore(seed, { failQueuePatchOnce = false } = {}) {
  let row = structuredClone(seed);
  const logs = [];
  let fail = failQueuePatchOnce;
  return {
    logs,
    async get(collection, id) {
      return collection === 'jobs' && id === row.id ? structuredClone(row) : null;
    },
    async patch(collection, id, patch) {
      if (collection !== 'jobs' || id !== row.id) return null;
      if (patch.status === 'queued' && fail) {
        fail = false;
        throw new Error('simulated-crash-after-receipt-persistence');
      }
      row = { ...row, ...structuredClone(patch) };
      return structuredClone(row);
    },
    async log(type, detail) {
      logs.push({ type, detail: structuredClone(detail) });
      return { id: `log_${logs.length}` };
    },
    async list() { return [structuredClone(row)]; },
    snapshot() { return structuredClone(row); }
  };
}

function queue(store) {
  return new DurableQueue(store, { version: 'test', queue: { maxAttempts: 1 } }, { error() {} });
}

test('arbitrary non-empty object cannot authorize uncertain replay', async () => {
  const job = deadJob();
  const store = fakeStore(job);
  await assert.rejects(
    () => queue(store).requeueDeadLetter(job.id, { reconciliationReceipt: { yes: true }, date: REFERENCE }),
    error => error?.code === 'JOB_RECONCILIATION_RECEIPT_INVALID'
      && error.reasonCodes.includes('reconciliation-schema-version-required')
      && error.reasonCodes.includes('verified-no-external-effect-required')
  );
  assert.equal(store.snapshot().status, 'dead-letter');
});

test('receipt is bound to exact job, dead-letter occurrence, attempt and uncertain reason', () => {
  const job = deadJob();
  const result = validateQueueReconciliationReceipt(job, receipt(job, {
    jobId: 'job_other',
    deadLetteredAt: '2026-09-03T00:00:00.000Z',
    attempts: 2,
    uncertainReasonCode: 'OTHER'
  }), { date: REFERENCE });
  assert.equal(result.ok, false);
  for (const code of [
    'reconciliation-job-id-mismatch',
    'reconciliation-attempt-mismatch',
    'reconciliation-reason-code-mismatch',
    'reconciliation-dead-letter-occurrence-mismatch'
  ]) assert.ok(result.reasonCodes.includes(code), code);
});

test('only verified no-external-effect evidence from a recognized source class is replay eligible', () => {
  const job = deadJob();
  assert.equal(validateQueueReconciliationReceipt(job, receipt(job), { date: REFERENCE }).ok, true);
  const effect = validateQueueReconciliationReceipt(job, receipt(job, { outcome: 'EXTERNAL_EFFECT_CONFIRMED' }), { date: REFERENCE });
  assert.equal(effect.ok, false);
  assert.ok(effect.reasonCodes.includes('verified-no-external-effect-required'));
  const source = validateQueueReconciliationReceipt(job, receipt(job, { sourceClass: 'TRUST_ME' }), { date: REFERENCE });
  assert.equal(source.ok, false);
  assert.ok(source.reasonCodes.includes('recognized-reconciliation-source-class-required'));
});

test('valid bound receipt unlocks one replay and persists normalized evidence', async () => {
  const job = deadJob();
  const store = fakeStore(job);
  const result = await queue(store).requeueDeadLetter(job.id, { reconciliationReceipt: receipt(job), date: REFERENCE });
  assert.equal(result.status, 'queued');
  assert.equal(result.attempts, 0);
  const state = store.snapshot();
  assert.equal(state.reconciliationRequired, false);
  assert.equal(state.reconciliationReceipt.jobId, job.id);
  assert.equal(state.reconciliationReceipt.outcome, 'VERIFIED_NO_EXTERNAL_EFFECT');
  assert.equal(store.logs.filter(row => row.type === 'queue_job_uncertain_execution_reconciled').length, 1);
});

test('crash after durable reconciliation receipt resumes without asking the operator for the same proof twice', async () => {
  const job = deadJob();
  const store = fakeStore(job, { failQueuePatchOnce: true });
  const runtime = queue(store);
  await assert.rejects(
    () => runtime.requeueDeadLetter(job.id, { reconciliationReceipt: receipt(job), date: REFERENCE }),
    /simulated-crash-after-receipt-persistence/
  );
  let state = store.snapshot();
  assert.equal(state.status, 'dead-letter');
  assert.equal(state.reconciliationRequired, false);
  assert.equal(state.reconciliationReceipt.jobId, job.id);

  const resumed = await runtime.requeueDeadLetter(job.id, { date: REFERENCE });
  assert.equal(resumed.status, 'queued');
  assert.equal(store.logs.filter(row => row.type === 'queue_job_uncertain_execution_reconciled').length, 1);
});
