import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import { createActionIntent } from '../src/omnia-v9/kernel.mjs';
import { digestObject } from '../src/omnia-v9/canonical.mjs';
import { buildReceiptFromDurableReservation } from '../src/omnia-v9/execution-receipt-shadow.mjs';
import { reconcilePreEffectAuthority } from '../src/omnia-v9/pre-effect-authority-reconciler.mjs';

const OBSERVED_AT = '2026-08-08T11:02:00.000Z';
const OCCURRED_AT = '2026-08-08T11:03:00.000Z';
const POLICY = 'a'.repeat(64);
const CONSTITUTION = 'b'.repeat(64);

const transitionProofResolver = async () => ({
  ok: true,
  headDigest: 'f'.repeat(64),
  reservedEvent: {
    eventDigest: 'e'.repeat(64),
    sequenceNo: 2,
    occurredAt: '2026-08-08T11:01:30.000Z'
  }
});

function reconcile(args) {
  return reconcilePreEffectAuthority({ ...args, transitionProofResolver });
}

async function dbFixture() {
  const db = new PGlite();
  for (const migration of ['005_omnia_v9_proof_store.sql','006_omnia_v9_execution_receipt_uniqueness.sql','007_omnia_v9_authorization_bound_receipts.sql']) {
    await db.exec(await fs.readFile(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
  }
  return db;
}

function makeIntent(overrides = {}) {
  return createActionIntent({
    missionId: 'm1', tenantId: 'tenant1', actorId: 'worker1',
    operation: 'OUTBOUND_EMAIL_SEND', resource: 'gmail:slot1', purpose: 'qualified-outreach',
    effectClass: 'COMMUNICATE_EXTERNAL', arguments: { prospectId: 'p1' }, evidenceIds: ['e1'],
    maxCostUsd: 0.01, blastRadius: 1, rollback: 'NOT_POSSIBLE_AFTER_PROVIDER_ACCEPTANCE',
    createdAt: '2026-08-08T10:55:00.000Z', expiresAt: '2026-08-08T12:00:00.000Z',
    nonce: 'n1', idempotencyKey: 'send:p1:0', ...overrides
  }, new Date('2026-08-08T10:55:00.000Z'));
}

function approval(overrides = {}) {
  const base = {
    schemaVersion: 'omnia.v9.p0', approvalId: 'approval1', tenantId: 'tenant1', approverId: 'owner1',
    purpose: 'qualified-outreach', allowedOperations: ['OUTBOUND_EMAIL_SEND'], allowedResources: ['gmail:slot1'],
    maxUses: 10, maxCostUsd: 1, maxBlastRadius: 10,
    notBefore: '2026-08-08T10:00:00.000Z', expiresAt: '2026-08-08T12:00:00.000Z',
    issuedAt: '2026-08-08T10:30:00.000Z', ...overrides
  };
  return { ...base, approvalDigest: digestObject(base) };
}

function decision(intent, overrides = {}) {
  const base = {
    schemaVersion: 'omnia.v9.p0', decision: 'ALLOW', intentDigest: intent.intentDigest,
    approvalId: 'approval1', policyVersion: 'policy-v1', policyDigest: POLICY,
    constitutionDigest: CONSTITUTION, reasons: ['ok'], decidedAt: '2026-08-08T11:00:00.000Z',
    ...overrides
  };
  return { ...base, decisionDigest: digestObject(base) };
}

function observation(overrides = {}) {
  return {
    schemaVersion: 'omnia.v9.outbound-final-shadow-observation.p4', authoritative: false, enforced: false,
    boundary: 'AFTER_DURABLE_DISPATCH_RESERVATION_BEFORE_GMAIL', reservationId: 'res1',
    contextDigest: 'c'.repeat(64), observedAt: OBSERVED_AT, status: 'OBSERVED', decision: 'ALLOW',
    reasons: ['shadow-match'], policyDigest: POLICY, constitutionDigest: CONSTITUTION, ...overrides
  };
}

function executionReceipt(obs = observation(), overrides = {}) {
  const reservation = {
    id: 'res1', prospectId: 'p1', campaignId: 'c1', inbox: 'slot1', recipientEmail: 'buyer@example.com',
    kind: 'initial', followup: 0, idempotencyKey: 'send:p1:0', status: 'sent', sentAt: OCCURRED_AT,
    gmailId: 'gmail1', threadId: 'thread1', rfcMessageId: '<m1@example.com>', ...overrides
  };
  return buildReceiptFromDurableReservation({ reservation, shadowObservation: obs, occurredAt: reservation.sentAt });
}

async function insertObject(db, type, id, tenant, digest, data, createdAt = '2026-08-08T10:50:00.000Z') {
  await db.query(
    `INSERT INTO omnia_v9_objects(object_type,object_id,tenant_id,digest,data,created_at)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6::timestamptz)`,
    [type, id, tenant, digest, JSON.stringify(data), createdAt]
  );
}

async function seedAuthority(db, { intent = makeIntent(), approvalObject = approval(), decisionObject = null, authorityCreatedAt = '2026-08-08T11:01:00.000Z', decisionCreatedAt = '2026-08-08T11:00:30.000Z', approvalCreatedAt = '2026-08-08T10:40:00.000Z', intentCreatedAt = '2026-08-08T10:56:00.000Z' } = {}) {
  const d = decisionObject || decision(intent);
  await insertObject(db, 'ACTION_INTENT', intent.intentDigest, 'tenant1', intent.intentDigest, intent, intentCreatedAt);
  await insertObject(db, 'OWNER_APPROVAL', approvalObject.approvalId, 'tenant1', approvalObject.approvalDigest, approvalObject, approvalCreatedAt);
  await insertObject(db, 'AUTHORIZATION_DECISION', d.decisionDigest, 'tenant1', d.decisionDigest, d, decisionCreatedAt);
  await db.query(
    `INSERT INTO omnia_v9_authority_reservations(idempotency_key,intent_digest,approval_id,tenant_id,use_delta,cost_delta_usd,blast_radius,status,created_at,updated_at)
     VALUES ('send:p1:0',$1,$2,'tenant1',1,0.01,1,'RESERVED',$3::timestamptz,$3::timestamptz)`,
    [intent.intentDigest, approvalObject.approvalId, authorityCreatedAt]
  );
  return { intent, approvalObject, decisionObject: d };
}

async function seedP6(db, receipt, createdAt = '2026-08-08T11:03:10.000Z') {
  await db.query(
    `INSERT INTO omnia_v9_execution_receipt_bindings(reservation_id,receipt_digest,tenant_id,outcome,pre_effect_context_digest,pre_effect_observation_digest,receipt,created_at)
     VALUES ($1,$2,'tenant1',$3,$4,$5,$6::jsonb,$7::timestamptz)`,
    [receipt.reservation.id, receipt.receiptDigest, receipt.outcome, receipt.preEffectContextDigest, receipt.preEffectObservationDigest, JSON.stringify(receipt), createdAt]
  );
}

test('P8 reconciles only a complete durable authority chain that predates the pre-effect observation', async () => {
  const db = await dbFixture();
  try {
    const obs = observation();
    const receipt = executionReceipt(obs);
    await seedAuthority(db);
    await seedP6(db, receipt);
    const result = await reconcile({ pool: db, shadowObservation: obs, executionReceipt: receipt });
    assert.equal(result.status, 'RECONCILED');
    assert.equal(result.reconciled, true);
    assert.equal(result.binding.tenantId, 'tenant1');
    assert.equal(result.binding.consequence.receiptDigest, receipt.receiptDigest);
  } finally { await db.close(); }
});

test('P8 refuses a P4 observation that was not ALLOW', async () => {
  const db = await dbFixture();
  try {
    const obs = observation({ decision: 'REVIEW' });
    const receipt = executionReceipt(obs);
    await seedAuthority(db);
    await seedP6(db, receipt);
    const result = await reconcile({ pool: db, shadowObservation: obs, executionReceipt: receipt });
    assert.equal(result.status, 'INCOMPLETE');
    assert.equal(result.reason, 'shadow-observation-not-allow');
  } finally { await db.close(); }
});

test('P8 refuses an authorization decision persisted after the pre-effect observation', async () => {
  const db = await dbFixture();
  try {
    const obs = observation();
    const receipt = executionReceipt(obs);
    await seedAuthority(db, { decisionCreatedAt: '2026-08-08T11:02:30.000Z' });
    await seedP6(db, receipt);
    const result = await reconcile({ pool: db, shadowObservation: obs, executionReceipt: receipt });
    assert.equal(result.reason, 'missing-matching-pre-effect-authorization-decision');
  } finally { await db.close(); }
});

test('P8 refuses an approval persisted after the pre-effect observation', async () => {
  const db = await dbFixture();
  try {
    const obs = observation();
    const receipt = executionReceipt(obs);
    await seedAuthority(db, { approvalCreatedAt: '2026-08-08T11:02:30.000Z' });
    await seedP6(db, receipt);
    const result = await reconcile({ pool: db, shadowObservation: obs, executionReceipt: receipt });
    assert.equal(result.reason, 'owner-approval-not-proven-before-effect');
  } finally { await db.close(); }
});

test('P8 refuses an approval whose signed content says it was issued after the observation', async () => {
  const db = await dbFixture();
  try {
    const obs = observation();
    const receipt = executionReceipt(obs);
    await seedAuthority(db, { approvalObject: approval({ issuedAt: '2026-08-08T11:02:30.000Z' }) });
    await seedP6(db, receipt);
    const result = await reconcile({ pool: db, shadowObservation: obs, executionReceipt: receipt });
    assert.equal(result.reason, 'approval-content-issued-after-observation');
  } finally { await db.close(); }
});

test('P8 refuses an authority reservation first persisted after the observation', async () => {
  const db = await dbFixture();
  try {
    const obs = observation();
    const receipt = executionReceipt(obs);
    await seedAuthority(db, { authorityCreatedAt: '2026-08-08T11:02:30.000Z' });
    await seedP6(db, receipt);
    const result = await reconcile({ pool: db, shadowObservation: obs, executionReceipt: receipt });
    assert.equal(result.reason, 'authority-reservation-not-proven-before-effect');
  } finally { await db.close(); }
});

test('P8 refuses policy or constitution lineage that disagrees with the live P4 observation', async () => {
  const db = await dbFixture();
  try {
    const obs = observation();
    const receipt = executionReceipt(obs);
    const i = makeIntent();
    await seedAuthority(db, { intent: i, decisionObject: decision(i, { policyDigest: 'd'.repeat(64), constitutionDigest: 'e'.repeat(64) }) });
    await seedP6(db, receipt);
    const result = await reconcile({ pool: db, shadowObservation: obs, executionReceipt: receipt });
    assert.equal(result.reason, 'missing-matching-pre-effect-authorization-decision');
  } finally { await db.close(); }
});

test('P8 refuses a shadow observation whose digest is not the one bound into the execution receipt', async () => {
  const db = await dbFixture();
  try {
    const original = observation();
    const receipt = executionReceipt(original);
    const tampered = { ...original, reasons: ['changed-after-effect'] };
    await seedAuthority(db);
    await seedP6(db, receipt);
    const result = await reconcile({ pool: db, shadowObservation: tampered, executionReceipt: receipt });
    assert.equal(result.reason, 'shadow-observation-digest-mismatch');
  } finally { await db.close(); }
});

test('P8 refuses when the durable P6 receipt binding is absent', async () => {
  const db = await dbFixture();
  try {
    const obs = observation();
    const receipt = executionReceipt(obs);
    await seedAuthority(db);
    const result = await reconcile({ pool: db, shadowObservation: obs, executionReceipt: receipt });
    assert.equal(result.reason, 'missing-durable-p6-receipt-binding');
  } finally { await db.close(); }
});

test('P8 refuses ambiguous matching ALLOW decisions instead of choosing whichever is newest', async () => {
  const db = await dbFixture();
  try {
    const obs = observation();
    const receipt = executionReceipt(obs);
    const seeded = await seedAuthority(db);
    const d2 = decision(seeded.intent, { reasons: ['second-valid-looking-decision'], decidedAt: '2026-08-08T11:01:30.000Z' });
    await insertObject(db, 'AUTHORIZATION_DECISION', d2.decisionDigest, 'tenant1', d2.decisionDigest, d2, '2026-08-08T11:01:31.000Z');
    await seedP6(db, receipt);
    const result = await reconcile({ pool: db, shadowObservation: obs, executionReceipt: receipt });
    assert.equal(result.reason, 'ambiguous-pre-effect-authorization-decisions');
  } finally { await db.close(); }
});

test('P8 refuses an observation timestamp that occurs after the provider result', async () => {
  const db = await dbFixture();
  try {
    const obs = observation({ observedAt: '2026-08-08T11:04:00.000Z' });
    const receipt = executionReceipt(obs);
    await seedAuthority(db);
    await seedP6(db, receipt);
    const result = await reconcile({ pool: db, shadowObservation: obs, executionReceipt: receipt });
    assert.equal(result.reason, 'pre-effect-observation-occurs-after-effect');
  } finally { await db.close(); }
});

const realPostgresUrl = process.env.OMNIA_V9_TEST_DATABASE_URL || '';

async function realDbFixture() {
  const pool = new Pool({ connectionString: realPostgresUrl, max: 2 });
  for (const migration of ['005_omnia_v9_proof_store.sql', '006_omnia_v9_execution_receipt_uniqueness.sql', '007_omnia_v9_authorization_bound_receipts.sql']) {
    await pool.query(await fs.readFile(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
  }
  return pool;
}

test('real PostgreSQL: an authority reservation created a few hundred milliseconds after the pre-effect observation is still refused, not rounded away', { skip: !realPostgresUrl }, async () => {
  // node-postgres parses timestamptz columns into JS Date objects. A prior defect
  // compared such Date objects against ISO strings using Date.parse(String(dateObject)),
  // which truncates to whole-second precision via Date.prototype.toString() and can
  // silently round a *later* sub-second timestamp down to look earlier than the
  // pre-effect boundary. This test pins a sub-second race that only a real
  // PostgreSQL driver (not PGlite's string-typed columns) can expose.
  //
  // Unlike the PGlite-backed tests above, this database is a persistent disposable
  // instance shared across the whole test run, so every identifier must be
  // unique per invocation to avoid colliding with rows from earlier runs.
  const db = await realDbFixture();
  try {
    // seedAuthority's shared reservation INSERT hardcodes idempotency_key='send:p1:0',
    // which is safe for the PGlite tests above (each gets a fresh in-memory database)
    // but collides on a persistent real-Postgres instance across repeated runs, so this
    // test seeds its own uniquely-keyed rows instead of reusing that helper's insert.
    const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const idempotencyKey = `p8pg:${suffix}`;
    const reservationId = `res_${suffix}`;
    const approvalId = `approval_${suffix}`;
    const intent = makeIntent({ idempotencyKey, nonce: `nonce:${suffix}` });
    const approvalObject = approval({ approvalId });
    const decisionObject = decision(intent, { approvalId });
    const obs = observation({ reservationId, observedAt: '2026-08-08T11:02:00.800Z' });
    const receipt = executionReceipt(obs, { id: reservationId, idempotencyKey, sentAt: '2026-08-08T11:03:00.000Z' });

    await insertObject(db, 'ACTION_INTENT', intent.intentDigest, 'tenant1', intent.intentDigest, intent, '2026-08-08T10:56:00.000Z');
    await insertObject(db, 'OWNER_APPROVAL', approvalObject.approvalId, 'tenant1', approvalObject.approvalDigest, approvalObject, '2026-08-08T10:40:00.000Z');
    await insertObject(db, 'AUTHORIZATION_DECISION', decisionObject.decisionDigest, 'tenant1', decisionObject.decisionDigest, decisionObject, '2026-08-08T11:00:30.000Z');
    await db.query(
      `INSERT INTO omnia_v9_authority_reservations(idempotency_key,intent_digest,approval_id,tenant_id,use_delta,cost_delta_usd,blast_radius,status,created_at,updated_at)
       VALUES ($1,$2,$3,'tenant1',1,0.01,1,'RESERVED',$4::timestamptz,$4::timestamptz)`,
      [idempotencyKey, intent.intentDigest, approvalId, '2026-08-08T11:02:00.950Z']
    );
    await seedP6(db, receipt);

    const result = await reconcile({ pool: db, shadowObservation: obs, executionReceipt: receipt });
    assert.equal(result.status, 'INCOMPLETE');
    assert.equal(result.reason, 'authority-reservation-not-proven-before-effect');
  } finally { await db.end(); }
});

test('real PostgreSQL: an authority reservation created a few hundred milliseconds BEFORE the pre-effect observation is legitimately accepted', { skip: !realPostgresUrl }, async () => {
  // Companion to the test above: proves the fix does not overcorrect. A reservation
  // genuinely created a few hundred milliseconds *before* the pre-effect observation
  // (the legitimate ordering) must still reconcile successfully — sub-second
  // precision must be preserved in both directions, not just used to reject.
  const db = await realDbFixture();
  try {
    const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const idempotencyKey = `p8pglegit:${suffix}`;
    const reservationId = `res_${suffix}`;
    const approvalId = `approval_${suffix}`;
    const intent = makeIntent({ idempotencyKey, nonce: `nonce:${suffix}` });
    const approvalObject = approval({ approvalId });
    const decisionObject = decision(intent, { approvalId });
    const obs = observation({ reservationId, observedAt: '2026-08-08T11:02:00.900Z' });
    const receipt = executionReceipt(obs, { id: reservationId, idempotencyKey, sentAt: '2026-08-08T11:03:00.000Z' });

    await insertObject(db, 'ACTION_INTENT', intent.intentDigest, 'tenant1', intent.intentDigest, intent, '2026-08-08T10:56:00.000Z');
    await insertObject(db, 'OWNER_APPROVAL', approvalObject.approvalId, 'tenant1', approvalObject.approvalDigest, approvalObject, '2026-08-08T10:40:00.000Z');
    await insertObject(db, 'AUTHORIZATION_DECISION', decisionObject.decisionDigest, 'tenant1', decisionObject.decisionDigest, decisionObject, '2026-08-08T11:00:30.000Z');
    await db.query(
      `INSERT INTO omnia_v9_authority_reservations(idempotency_key,intent_digest,approval_id,tenant_id,use_delta,cost_delta_usd,blast_radius,status,created_at,updated_at)
       VALUES ($1,$2,$3,'tenant1',1,0.01,1,'RESERVED',$4::timestamptz,$4::timestamptz)`,
      [idempotencyKey, intent.intentDigest, approvalId, '2026-08-08T11:02:00.500Z']
    );
    await seedP6(db, receipt);

    const result = await reconcile({ pool: db, shadowObservation: obs, executionReceipt: receipt });
    assert.equal(result.status, 'RECONCILED');
    assert.equal(result.reconciled, true);
  } finally { await db.end(); }
});
