import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import { createActionIntent } from '../src/omnia-v9/kernel.mjs';
import { digestObject } from '../src/omnia-v9/canonical.mjs';
import { buildReceiptFromDurableReservation } from '../src/omnia-v9/execution-receipt-shadow.mjs';
import {
  buildAuthorizationBoundExecutionReceipt,
  verifyAuthorizationBoundExecutionReceipt
} from '../src/omnia-v9/authorization-bound-receipt.mjs';
import { OmniaV9ExecutionReceiptStore } from '../src/omnia-v9/execution-receipt-store.mjs';
import { OmniaV9AuthorizationBoundReceiptStore } from '../src/omnia-v9/authorization-bound-receipt-store.mjs';

const NOW = '2026-08-08T12:00:00.000Z';
const POLICY = 'a'.repeat(64);
const CONSTITUTION = 'b'.repeat(64);

function intent(overrides = {}) {
  return createActionIntent({
    missionId: 'mission1', tenantId: 'tenant1', actorId: 'worker1',
    operation: 'OUTBOUND_EMAIL_SEND', resource: 'gmail:slot1', purpose: 'qualified-outreach',
    effectClass: 'COMMUNICATE_EXTERNAL', arguments: { prospectId: 'p1', recipientEmail: 'buyer@example.com' },
    evidenceIds: ['e1'], maxCostUsd: 0.01, blastRadius: 1, rollback: 'NOT_POSSIBLE_AFTER_PROVIDER_ACCEPTANCE',
    createdAt: '2026-08-08T11:00:00.000Z', expiresAt: '2026-08-08T13:00:00.000Z', nonce: 'nonce1',
    idempotencyKey: 'send:p1:0',
    ...overrides
  }, new Date('2026-08-08T11:00:00.000Z'));
}

function decisionFor(i = intent(), overrides = {}) {
  const base = {
    schemaVersion: 'omnia.v9.p0', decision: 'ALLOW', intentDigest: i.intentDigest, approvalId: 'approval1',
    policyVersion: 'cedar-2026-08-08', policyDigest: POLICY, constitutionDigest: CONSTITUTION,
    reasons: ['admission:all-gates-satisfied'], decidedAt: '2026-08-08T11:01:00.000Z',
    ...overrides
  };
  return { ...base, decisionDigest: digestObject(base) };
}

function observation(reservationId = 'res1') {
  return {
    schemaVersion: 'omnia.v9.outbound-final-shadow-observation.p4', authoritative: false, enforced: false,
    boundary: 'AFTER_DURABLE_DISPATCH_RESERVATION_BEFORE_GMAIL', reservationId,
    contextDigest: 'c'.repeat(64), observedAt: '2026-08-08T11:02:00.000Z',
    status: 'OBSERVED', decision: 'REVIEW', reasons: ['shadow-only']
  };
}

function reservation(overrides = {}) {
  return {
    id: 'res1', prospectId: 'p1', campaignId: 'c1', inbox: 'slot1', recipientEmail: 'buyer@example.com',
    kind: 'initial', followup: 0, idempotencyKey: 'send:p1:0', status: 'sent',
    sentAt: '2026-08-08T11:03:00.000Z', gmailId: 'gmail1', threadId: 'thread1', rfcMessageId: '<m1@example.com>',
    ...overrides
  };
}

function receiptFor(res = reservation()) {
  return buildReceiptFromDurableReservation({ reservation: res, shadowObservation: observation(res.id), occurredAt: res.sentAt });
}

function bindingFixture(overrides = {}) {
  const i = overrides.intent || intent();
  const d = overrides.decision || decisionFor(i);
  const r = overrides.receipt || receiptFor();
  const binding = buildAuthorizationBoundExecutionReceipt({ tenantId: overrides.tenantId || 'tenant1', intent: i, authorizationDecision: d, executionReceipt: r, boundAt: NOW });
  return { i, d, r, binding };
}

async function migratedDb() {
  const db = new PGlite();
  for (const migration of ['005_omnia_v9_proof_store.sql','006_omnia_v9_execution_receipt_uniqueness.sql','007_omnia_v9_authorization_bound_receipts.sql']) {
    await db.exec(await fs.readFile(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
  }
  return db;
}

test('P7 builds a shadow binding over tenant, intent, authorization, policy, constitution, and consequence', () => {
  const { i, d, r, binding } = bindingFixture();
  assert.equal(binding.tenantId, 'tenant1');
  assert.equal(binding.intentDigest, i.intentDigest);
  assert.equal(binding.authorizationDecisionDigest, d.decisionDigest);
  assert.equal(binding.policyDigest, POLICY);
  assert.equal(binding.constitutionDigest, CONSTITUTION);
  assert.equal(binding.consequence.receiptDigest, r.receiptDigest);
  assert.equal(binding.authoritative, false);
  assert.equal(binding.enforced, false);
  assert.equal(verifyAuthorizationBoundExecutionReceipt(binding, { intent: i, authorizationDecision: d, executionReceipt: r }).ok, true);
});

test('tampering any bound field breaks the binding digest', () => {
  const { binding } = bindingFixture();
  binding.policyDigest = 'd'.repeat(64);
  assert.equal(verifyAuthorizationBoundExecutionReceipt(binding).ok, false);
});

test('DENY and REVIEW decisions cannot be laundered into execution authorization', () => {
  for (const value of ['DENY', 'REVIEW']) {
    const i = intent();
    const d = decisionFor(i, { decision: value });
    const r = receiptFor();
    assert.throws(() => buildAuthorizationBoundExecutionReceipt({ tenantId: 'tenant1', intent: i, authorizationDecision: d, executionReceipt: r, boundAt: NOW }), error => error?.code === 'AUTHORIZATION_NOT_ALLOW');
  }
});

test('authorization decision must cryptographically bind the exact intent digest', () => {
  const i = intent();
  const other = intent({ nonce: 'other' });
  const d = decisionFor(other);
  assert.throws(() => buildAuthorizationBoundExecutionReceipt({ tenantId: 'tenant1', intent: i, authorizationDecision: d, executionReceipt: receiptFor(), boundAt: NOW }), error => error?.code === 'INTENT_DECISION_MISMATCH');
});

test('caller tenant cannot override the intent tenant', () => {
  const i = intent();
  assert.throws(() => buildAuthorizationBoundExecutionReceipt({ tenantId: 'tenant2', intent: i, authorizationDecision: decisionFor(i), executionReceipt: receiptFor(), boundAt: NOW }), error => error?.code === 'TENANT_MISMATCH');
});

test('execution consequence idempotency must match the authorized intent', () => {
  const i = intent();
  const r = receiptFor(reservation({ idempotencyKey: 'send:other:0' }));
  assert.throws(() => buildAuthorizationBoundExecutionReceipt({ tenantId: 'tenant1', intent: i, authorizationDecision: decisionFor(i), executionReceipt: r, boundAt: NOW }), error => error?.code === 'CONSEQUENCE_INTENT_MISMATCH');
});

test('policy and constitution substitution are detected even when attacker supplies valid-looking sha256 values', () => {
  const { i, d, r, binding } = bindingFixture();
  const changed = decisionFor(i, { policyDigest: 'd'.repeat(64), constitutionDigest: 'e'.repeat(64) });
  const check = verifyAuthorizationBoundExecutionReceipt(binding, { intent: i, authorizationDecision: changed, executionReceipt: r });
  assert.equal(check.ok, false);
  assert.match(check.reason, /authorization-digest|policy|constitution/);
});

test('receipt swapping is rejected', () => {
  const { i, d, binding } = bindingFixture();
  const otherReceipt = receiptFor(reservation({ id: 'res2', gmailId: 'gmail2', idempotencyKey: 'send:p1:0' }));
  const check = verifyAuthorizationBoundExecutionReceipt(binding, { intent: i, authorizationDecision: d, executionReceipt: otherReceipt });
  assert.equal(check.ok, false);
  assert.match(check.reason, /reservation|receipt/);
});

test('P7 migration creates immutable authorization binding table', async () => {
  const db = await migratedDb();
  try {
    const result = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='omnia_v9_execution_authorization_bindings'");
    assert.equal(result.rows.length, 1);
  } finally { await db.close(); }
});

test('store refuses P7 binding when immutable P6 parent receipt is absent', async () => {
  const db = await migratedDb();
  try {
    const { i, d, r, binding } = bindingFixture();
    const store = new OmniaV9AuthorizationBoundReceiptStore({ pool: db });
    await assert.rejects(store.persistOnce({ binding, intent: i, authorizationDecision: d, executionReceipt: r }), error => error?.code === 'RECEIPT_BINDING_MISSING');
  } finally { await db.close(); }
});

test('store persists one authorization binding only after P6 receipt exists', async () => {
  const db = await migratedDb();
  try {
    const { i, d, r, binding } = bindingFixture();
    const receiptStore = new OmniaV9ExecutionReceiptStore({ pool: db });
    await receiptStore.persistOnce({ tenantId: 'tenant1', receipt: r });
    const store = new OmniaV9AuthorizationBoundReceiptStore({ pool: db });
    const first = await store.persistOnce({ binding, intent: i, authorizationDecision: d, executionReceipt: r });
    assert.equal(first.inserted, true);
    const second = await store.persistOnce({ binding, intent: i, authorizationDecision: d, executionReceipt: r });
    assert.equal(second.duplicate, true);
    const rows = await db.query("SELECT count(*)::int AS n FROM omnia_v9_execution_authorization_bindings WHERE reservation_id='res1'");
    assert.equal(Number(rows.rows[0].n), 1);
  } finally { await db.close(); }
});

test('store rejects different authorization lineage for the same consequence', async () => {
  const db = await migratedDb();
  try {
    const first = bindingFixture();
    const receiptStore = new OmniaV9ExecutionReceiptStore({ pool: db });
    await receiptStore.persistOnce({ tenantId: 'tenant1', receipt: first.r });
    const store = new OmniaV9AuthorizationBoundReceiptStore({ pool: db });
    await store.persistOnce({ binding: first.binding, intent: first.i, authorizationDecision: first.d, executionReceipt: first.r });

    const changedDecision = decisionFor(first.i, { approvalId: 'approval2' });
    const changedBinding = buildAuthorizationBoundExecutionReceipt({ tenantId: 'tenant1', intent: first.i, authorizationDecision: changedDecision, executionReceipt: first.r, boundAt: NOW });
    await assert.rejects(store.persistOnce({ binding: changedBinding, intent: first.i, authorizationDecision: changedDecision, executionReceipt: first.r }), error => error?.code === 'AUTHORIZATION_BINDING_CONFLICT');
  } finally { await db.close(); }
});

test('duplicate path refuses missing generic proof object', async () => {
  const db = await migratedDb();
  try {
    const { i, d, r, binding } = bindingFixture();
    const receiptStore = new OmniaV9ExecutionReceiptStore({ pool: db });
    await receiptStore.persistOnce({ tenantId: 'tenant1', receipt: r });
    const store = new OmniaV9AuthorizationBoundReceiptStore({ pool: db });
    await store.persistOnce({ binding, intent: i, authorizationDecision: d, executionReceipt: r });
    await db.query("DELETE FROM omnia_v9_objects WHERE object_type='EXECUTION_AUTHORIZATION_BINDING' AND object_id=$1", [binding.bindingDigest]);
    await assert.rejects(store.persistOnce({ binding, intent: i, authorizationDecision: d, executionReceipt: r }), error => error?.code === 'PROOF_LEDGER_CONFLICT');
  } finally { await db.close(); }
});

const realPostgresUrl = process.env.OMNIA_V9_TEST_DATABASE_URL || '';

async function realMigratedDb() {
  const pool = new Pool({ connectionString: realPostgresUrl, max: 4 });
  for (const migration of ['005_omnia_v9_proof_store.sql', '006_omnia_v9_execution_receipt_uniqueness.sql', '007_omnia_v9_authorization_bound_receipts.sql']) {
    await pool.query(await fs.readFile(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
  }
  return pool;
}

test('real PostgreSQL: two concurrent workers binding conflicting authorization lineage to the same consequence yield one durable winner', { skip: !realPostgresUrl }, async () => {
  const db = await realMigratedDb();
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const reservationId = `res_${suffix}`;
  const idempotencyKey = `send:${suffix}:0`;
  try {
    const i = intent({ idempotencyKey, nonce: `nonce_${suffix}` });
    const r = receiptFor(reservation({ id: reservationId, idempotencyKey, prospectId: `p_${suffix}`, gmailId: `gmail_${suffix}`, threadId: `thread_${suffix}`, rfcMessageId: `<${suffix}@example.com>` }));
    const receiptStore = new OmniaV9ExecutionReceiptStore({ pool: db });
    await receiptStore.persistOnce({ tenantId: 'tenant1', receipt: r });

    const store = new OmniaV9AuthorizationBoundReceiptStore({ pool: db });
    const decisionA = decisionFor(i, { approvalId: `approval_a_${suffix}` });
    const decisionB = decisionFor(i, { approvalId: `approval_b_${suffix}` });
    const bindingA = buildAuthorizationBoundExecutionReceipt({ tenantId: 'tenant1', intent: i, authorizationDecision: decisionA, executionReceipt: r, boundAt: NOW });
    const bindingB = buildAuthorizationBoundExecutionReceipt({ tenantId: 'tenant1', intent: i, authorizationDecision: decisionB, executionReceipt: r, boundAt: NOW });

    const results = await Promise.allSettled([
      store.persistOnce({ binding: bindingA, intent: i, authorizationDecision: decisionA, executionReceipt: r }),
      store.persistOnce({ binding: bindingB, intent: i, authorizationDecision: decisionB, executionReceipt: r })
    ]);

    const fulfilled = results.filter(item => item.status === 'fulfilled');
    const rejected = results.filter(item => item.status === 'rejected');
    assert.equal(fulfilled.length, 1, 'exactly one conflicting authorization binding must durably win');
    assert.equal(rejected.length, 1);
    assert.match(rejected[0].reason?.code || '', /AUTHORIZATION_BINDING_CONFLICT|AUTHORIZATION_BINDING_IDENTITY_CONFLICT/);

    const rows = await db.query('SELECT approval_id FROM omnia_v9_execution_authorization_bindings WHERE reservation_id=$1', [reservationId]);
    assert.equal(rows.rows.length, 1, 'one consequence cannot durably carry two conflicting authorization bindings');
    assert([decisionA.approvalId, decisionB.approvalId].includes(rows.rows[0].approval_id));
  } finally { await db.end(); }
});
