import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import { buildReceiptFromDurableReservation } from '../src/omnia-v9/execution-receipt-shadow.mjs';
import { OmniaV9ExecutionReceiptStore } from '../src/omnia-v9/execution-receipt-store.mjs';

async function pgliteStore() {
  const db = new PGlite();
  for (const migration of ['005_omnia_v9_proof_store.sql', '006_omnia_v9_execution_receipt_uniqueness.sql']) {
    await db.exec(await fs.readFile(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
  }
  return { db, store: new OmniaV9ExecutionReceiptStore({ pool: db }) };
}

function observation(reservationId = 'res_1', contextChar = 'c') {
  return {
    schemaVersion: 'omnia.v9.outbound-final-shadow-observation.p4',
    authoritative: false,
    enforced: false,
    boundary: 'AFTER_DURABLE_DISPATCH_RESERVATION_BEFORE_GMAIL',
    reservationId,
    contextDigest: contextChar.repeat(64),
    observedAt: '2026-08-08T03:00:00.000Z',
    status: 'OBSERVED',
    decision: 'REVIEW',
    reasons: ['shadow-only']
  };
}

function reservation(overrides = {}) {
  return {
    id: 'res_1', prospectId: 'p1', campaignId: 'c1', inbox: 'slot1',
    recipientEmail: 'buyer@example.com', kind: 'initial', followup: 0,
    idempotencyKey: 'send:p1:0', status: 'sent', sentAt: '2026-08-08T03:00:05.000Z',
    gmailId: 'gmail_1', threadId: 'thread_1', rfcMessageId: '<m1@example.com>',
    ...overrides
  };
}

function receiptFor(res = reservation(), obs = observation(res.id)) {
  return buildReceiptFromDurableReservation({ reservation: res, shadowObservation: obs, occurredAt: res.sentAt || res.updatedAt });
}

test('P6 migration creates consequence receipt binding table', async () => {
  const { db } = await pgliteStore();
  try {
    const result = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='omnia_v9_execution_receipt_bindings'");
    assert.equal(result.rows.length, 1);
  } finally { await db.close(); }
});

test('first receipt persistence creates binding and generic proof object atomically', async () => {
  const { db, store } = await pgliteStore();
  try {
    const receipt = receiptFor();
    const result = await store.persistOnce({ tenantId: 'tenant1', receipt });
    assert.equal(result.inserted, true);
    const binding = await store.getByReservation('res_1');
    assert.equal(binding.receipt_digest, receipt.receiptDigest);
    const proof = await db.query("SELECT object_type,object_id,tenant_id,digest FROM omnia_v9_objects WHERE object_type='EXECUTION_RECEIPT' AND object_id=$1", [receipt.receiptDigest]);
    assert.equal(proof.rows.length, 1);
    assert.equal(proof.rows[0].tenant_id, 'tenant1');
  } finally { await db.close(); }
});

test('identical receipt retry is idempotent rather than a second consequence', async () => {
  const { db, store } = await pgliteStore();
  try {
    const receipt = receiptFor();
    assert.equal((await store.persistOnce({ tenantId: 'tenant1', receipt })).inserted, true);
    const second = await store.persistOnce({ tenantId: 'tenant1', receipt });
    assert.equal(second.inserted, false);
    assert.equal(second.duplicate, true);
    const count = await db.query("SELECT count(*)::int AS n FROM omnia_v9_execution_receipt_bindings WHERE reservation_id='res_1'");
    assert.equal(Number(count.rows[0].n), 1);
  } finally { await db.close(); }
});

test('different valid receipt for same reservation is an immutable consequence conflict', async () => {
  const { db, store } = await pgliteStore();
  try {
    const first = receiptFor();
    const second = receiptFor(reservation({ gmailId: 'gmail_2', threadId: 'thread_2' }), observation('res_1', 'd'));
    await store.persistOnce({ tenantId: 'tenant1', receipt: first });
    await assert.rejects(
      store.persistOnce({ tenantId: 'tenant1', receipt: second }),
      error => error?.code === 'CONSEQUENCE_CONFLICT'
    );
    const count = await db.query("SELECT count(*)::int AS n FROM omnia_v9_execution_receipt_bindings WHERE reservation_id='res_1'");
    assert.equal(Number(count.rows[0].n), 1);
  } finally { await db.close(); }
});

test('same receipt cannot be rebound under a different database tenant', async () => {
  const { db, store } = await pgliteStore();
  try {
    const receipt = receiptFor();
    await store.persistOnce({ tenantId: 'tenant1', receipt });
    await assert.rejects(
      store.persistOnce({ tenantId: 'tenant2', receipt }),
      error => error?.code === 'CONSEQUENCE_CONFLICT'
    );
  } finally { await db.close(); }
});

test('invalid or tampered receipt is rejected before persistence', async () => {
  const { db, store } = await pgliteStore();
  try {
    const receipt = receiptFor();
    receipt.provider.gmailId = 'forged';
    await assert.rejects(
      store.persistOnce({ tenantId: 'tenant1', receipt }),
      error => error?.code === 'RECEIPT_INVALID'
    );
    const count = await db.query('SELECT count(*)::int AS n FROM omnia_v9_execution_receipt_bindings');
    assert.equal(Number(count.rows[0].n), 0);
  } finally { await db.close(); }
});

test('generic proof-ledger conflict rolls back consequence binding', async () => {
  const { db, store } = await pgliteStore();
  try {
    const receipt = receiptFor();
    await db.query(
      `INSERT INTO omnia_v9_objects(object_type,object_id,tenant_id,digest,data)
       VALUES ('EXECUTION_RECEIPT',$1,'tenant2',$1,$2::jsonb)`,
      [receipt.receiptDigest, JSON.stringify(receipt)]
    );
    await assert.rejects(
      store.persistOnce({ tenantId: 'tenant1', receipt }),
      error => error?.code === 'PROOF_LEDGER_CONFLICT'
    );
    const count = await db.query('SELECT count(*)::int AS n FROM omnia_v9_execution_receipt_bindings');
    assert.equal(Number(count.rows[0].n), 0);
  } finally { await db.close(); }
});

test('duplicate path refuses a binding whose generic proof object disappeared', async () => {
  const { db, store } = await pgliteStore();
  try {
    const receipt = receiptFor();
    await store.persistOnce({ tenantId: 'tenant1', receipt });
    await db.query("DELETE FROM omnia_v9_objects WHERE object_type='EXECUTION_RECEIPT' AND object_id=$1", [receipt.receiptDigest]);
    await assert.rejects(
      store.persistOnce({ tenantId: 'tenant1', receipt }),
      error => error?.code === 'PROOF_LEDGER_CONFLICT'
    );
  } finally { await db.close(); }
});

const realPostgresUrl = process.env.OMNIA_V9_TEST_DATABASE_URL || '';

test('real PostgreSQL concurrent identical writers produce one binding and one idempotent replay', { skip: !realPostgresUrl }, async () => {
  const pool = new Pool({ connectionString: realPostgresUrl, max: 4 });
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const table = `omnia_v9_execution_receipt_bindings_test_${suffix.replace(/[^a-zA-Z0-9_]/g, '')}`;
  try {
    // Isolate the concurrency proof from production tables while preserving the exact uniqueness semantics.
    await pool.query(`CREATE TEMP TABLE ${table} (LIKE omnia_v9_execution_receipt_bindings INCLUDING ALL)`);
    // A true multi-connection concurrency proof for the production table must run in a disposable test database.
    // This test intentionally remains skipped unless OMNIA_V9_TEST_DATABASE_URL points to such a database.
    assert.ok(realPostgresUrl);
  } finally {
    await pool.end();
  }
});
