import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { generateKeyPairSync } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import { signDigestHex, sha256 } from '../src/omnia-v9/canonical.mjs';
import { createActionIntent, createApproval, createEvidenceRecord } from '../src/omnia-v9/kernel.mjs';
import { OmniaV9ProofStore } from '../src/omnia-v9/proof-store.mjs';
import { persistAndReserveAdmission } from '../src/omnia-v9/persistent-admission.mjs';

const now = new Date('2026-08-08T00:00:00Z');
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const attackerKeys = generateKeyPairSync('ed25519');
const keyResolver = keyId => keyId === 'owner-key-1' ? publicKey : null;

async function storeDb() {
  const db = new PGlite();
  await db.exec(await fs.readFile(new URL('../migrations/005_omnia_v9_proof_store.sql', import.meta.url), 'utf8'));
  return { db, store: new OmniaV9ProofStore({ pool: db, keyResolver }) };
}

function approval(overrides = {}, signerKey = privateKey) {
  return createApproval({
    approvalId: 'ap1', issuerId: 'mohamed', keyId: 'owner-key-1', tenantId: 'tenant1', actorIds: ['worker1'],
    operations: ['email.send'], resourcePrefixes: ['email:'], purposes: ['qualified-b2b-outreach'], effectClasses: ['COMMUNICATE_EXTERNAL'],
    maxBlastRadius: 5, maxCostUsd: 1, maxUses: 2, notBefore: '2026-08-07T00:00:00Z', expiresAt: '2026-08-09T00:00:00Z',
    issuedAt: '2026-08-07T00:00:00Z', ...overrides
  }, digest => signDigestHex(digest, signerKey));
}

function actionIntent({ idempotencyKey = 'k1', recipient = 'a@example.com', operation = 'email.send', purpose = 'qualified-b2b-outreach', effectClass = 'COMMUNICATE_EXTERNAL', maxCostUsd = 0, blastRadius = 1, tenantId = 'tenant1' } = {}) {
  return createActionIntent({
    missionId: 'm1', tenantId, actorId: 'worker1', operation, resource: `email:${recipient}`, purpose, effectClass,
    arguments: { to: recipient }, evidenceIds: [], maxCostUsd, blastRadius, rollback: 'SUPPRESS_FUTURE_CONTACT',
    expiresAt: '2026-08-08T00:10:00Z', nonce: `nonce:${idempotencyKey}`, idempotencyKey
  }, now);
}

async function persistApproval(store, ap = approval()) {
  await store.putObject({ objectType: 'OWNER_APPROVAL', objectId: ap.approvalId, tenantId: ap.tenantId, digest: ap.approvalDigest, data: ap });
  return ap;
}

async function persistIntent(store, intent = actionIntent()) {
  await store.putObject({ objectType: 'ACTION_INTENT', objectId: intent.intentDigest, tenantId: intent.tenantId, digest: intent.intentDigest, data: intent });
  return intent;
}

async function reserve(store, intent, overrides = {}) {
  return store.reserveAuthority({
    approvalId: overrides.approvalId || 'ap1', tenantId: overrides.tenantId || intent.tenantId,
    intentDigest: overrides.intentDigest || intent.intentDigest, idempotencyKey: overrides.idempotencyKey || intent.idempotencyKey,
    costDeltaUsd: overrides.costDeltaUsd ?? intent.maxCostUsd, blastRadius: overrides.blastRadius ?? intent.blastRadius,
    useDelta: overrides.useDelta ?? 1, now: overrides.now || now
  });
}

test('proof-store migration creates proof, revocation, usage and reservation tables', async () => {
  const { db } = await storeDb();
  try {
    const tables = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    const names = new Set(tables.rows.map(r => r.table_name));
    for (const name of ['omnia_v9_objects','omnia_v9_revocations','omnia_v9_approval_usage','omnia_v9_authority_reservations']) assert(names.has(name), `missing ${name}`);
  } finally { await db.close(); }
});

test('proof objects are content-bound and immutable by identity', async () => {
  const { db, store } = await storeDb();
  try {
    const ap = await persistApproval(store);
    const again = await store.putObject({ objectType: 'OWNER_APPROVAL', objectId: ap.approvalId, tenantId: ap.tenantId, digest: ap.approvalDigest, data: ap });
    assert.equal(again.inserted, false);
    const tampered = { ...ap, maxUses: 99 };
    await assert.rejects(store.putObject({ objectType: 'OWNER_APPROVAL', objectId: ap.approvalId, tenantId: ap.tenantId, digest: ap.approvalDigest, data: tampered }), /recompute|digest|immutable/i);
  } finally { await db.close(); }
});

test('proof object identity must match the identity inside signed content', async () => {
  const { db, store } = await storeDb();
  try {
    const ap = approval();
    await assert.rejects(store.putObject({ objectType: 'OWNER_APPROVAL', objectId: 'alias', tenantId: ap.tenantId, digest: ap.approvalDigest, data: ap }), /approvalId|identity/i);
  } finally { await db.close(); }
});

test('proof object database tenant must match content tenant', async () => {
  const { db, store } = await storeDb();
  try {
    const ap = approval();
    await assert.rejects(store.putObject({ objectType: 'OWNER_APPROVAL', objectId: ap.approvalId, tenantId: 'tenant2', digest: ap.approvalDigest, data: ap }), /tenant/i);
  } finally { await db.close(); }
});

test('unsupported future proof type cannot bypass an undefined digest algorithm', async () => {
  const { db, store } = await storeDb();
  try {
    await assert.rejects(store.putObject({ objectType: 'POLICY_BUNDLE', objectId: 'p1', tenantId: 'tenant1', digest: sha256('policy'), data: { digest: sha256('policy') } }), /unsupported/i);
  } finally { await db.close(); }
});

test('stored content-valid but cryptographically invalid approval cannot spend authority', async () => {
  const { db, store } = await storeDb();
  try {
    const forged = approval({}, attackerKeys.privateKey);
    const i = await persistIntent(store);
    await persistApproval(store, forged);
    const result = await reserve(store, i);
    assert.equal(result.ok, false);
    assert.match(result.reason, /unverified/);
  } finally { await db.close(); }
});

test('an arbitrary or unstored intent digest cannot spend authority', async () => {
  const { db, store } = await storeDb();
  try {
    await persistApproval(store);
    const result = await store.reserveAuthority({ approvalId: 'ap1', tenantId: 'tenant1', intentDigest: sha256('invented-intent'), idempotencyKey: 'invented-k', costDeltaUsd: 0, blastRadius: 1, now });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'intent-not-found');
  } finally { await db.close(); }
});

test('authority reservation independently rechecks approval scope against stored intent', async () => {
  const { db, store } = await storeDb();
  try {
    await persistApproval(store);
    const i = await persistIntent(store, actionIntent({ operation: 'payment.send', effectClass: 'FINANCIAL' }));
    const result = await reserve(store, i);
    assert.equal(result.ok, false);
    assert.match(result.reason, /approval-scope/);
  } finally { await db.close(); }
});

test('reservation parameters must match the stored signed intent', async () => {
  const { db, store } = await storeDb();
  try {
    await persistApproval(store);
    const costIntent = await persistIntent(store, actionIntent({ idempotencyKey: 'cost-k', maxCostUsd: 0.2 }));
    const wrongCost = await reserve(store, costIntent, { costDeltaUsd: 0.1 });
    assert.equal(wrongCost.ok, false);
    assert.equal(wrongCost.reason, 'intent-cost-mismatch');

    const blastIntent = await persistIntent(store, actionIntent({ idempotencyKey: 'blast-k', blastRadius: 2 }));
    const wrongBlast = await reserve(store, blastIntent, { blastRadius: 1 });
    assert.equal(wrongBlast.ok, false);
    assert.equal(wrongBlast.reason, 'intent-blast-radius-mismatch');

    const keyIntent = await persistIntent(store, actionIntent({ idempotencyKey: 'real-k' }));
    const wrongKey = await reserve(store, keyIntent, { idempotencyKey: 'other-k' });
    assert.equal(wrongKey.ok, false);
    assert.equal(wrongKey.reason, 'intent-idempotency-mismatch');
  } finally { await db.close(); }
});

test('P1 rejects multi-use deltas instead of letting a caller reinterpret one intent as many actions', async () => {
  const { db, store } = await storeDb();
  try {
    await persistApproval(store);
    const i = await persistIntent(store);
    await assert.rejects(reserve(store, i, { useDelta: 2 }), /exactly one action/i);
  } finally { await db.close(); }
});

test('authority reservation consumes signed approval budgets exactly once', async () => {
  const { db, store } = await storeDb();
  try {
    await persistApproval(store);
    const i = await persistIntent(store, actionIntent({ maxCostUsd: 0.25 }));
    const first = await reserve(store, i);
    assert.equal(first.ok, true);
    const duplicate = await reserve(store, i);
    assert.equal(duplicate.ok, true);
    assert.equal(duplicate.duplicate, true);
    const usage = await store.getApprovalUsage('ap1');
    assert.equal(usage.uses, 1);
    assert.equal(usage.costUsd, 0.25);
  } finally { await db.close(); }
});

test('same idempotency key cannot represent different intent', async () => {
  const { db, store } = await storeDb();
  try {
    await persistApproval(store);
    const first = await persistIntent(store, actionIntent({ idempotencyKey: 'same', recipient: 'a@example.com' }));
    await reserve(store, first);
    const second = await persistIntent(store, actionIntent({ idempotencyKey: 'same', recipient: 'b@example.com' }));
    await assert.rejects(reserve(store, second), /idempotency/i);
    assert.equal((await store.getApprovalUsage('ap1')).uses, 1);
  } finally { await db.close(); }
});

test('maxUses is enforced by persistent usage', async () => {
  const { db, store } = await storeDb();
  try {
    await persistApproval(store, approval({ maxUses: 1 }));
    const first = await persistIntent(store, actionIntent({ idempotencyKey: 'k1', recipient: 'a@example.com' }));
    const second = await persistIntent(store, actionIntent({ idempotencyKey: 'k2', recipient: 'b@example.com' }));
    assert.equal((await reserve(store, first)).ok, true);
    const result = await reserve(store, second);
    assert.equal(result.ok, false);
    assert.match(result.reason, /uses-exhausted|approval-scope/);
  } finally { await db.close(); }
});

test('cost budget is enforced by persistent usage', async () => {
  const { db, store } = await storeDb();
  try {
    await persistApproval(store, approval({ maxCostUsd: 0.5 }));
    const first = await persistIntent(store, actionIntent({ idempotencyKey: 'k1', recipient: 'a@example.com', maxCostUsd: 0.4 }));
    const second = await persistIntent(store, actionIntent({ idempotencyKey: 'k2', recipient: 'b@example.com', maxCostUsd: 0.2 }));
    assert.equal((await reserve(store, first)).ok, true);
    const result = await reserve(store, second);
    assert.equal(result.ok, false);
    assert.match(result.reason, /budget-exhausted|approval-scope/);
  } finally { await db.close(); }
});

test('expired approval cannot spend persistent authority', async () => {
  const { db, store } = await storeDb();
  try {
    await persistApproval(store, approval({ expiresAt: '2026-08-07T23:59:59Z' }));
    const i = await persistIntent(store);
    const result = await reserve(store, i);
    assert.equal(result.ok, false);
    assert.match(result.reason, /expired|unverified/);
  } finally { await db.close(); }
});

test('revocation resolves the target tenant and blocks future approval reservations', async () => {
  const { db, store } = await storeDb();
  try {
    await persistApproval(store);
    const i = await persistIntent(store);
    await assert.rejects(store.revoke({ targetType: 'OWNER_APPROVAL', targetId: 'ap1', revocationId: 'wrong-tenant', tenantId: 'tenant2', reason: 'invalid' }), /tenant/i);
    await store.revoke({ targetType: 'OWNER_APPROVAL', targetId: 'ap1', revocationId: 'rev1', tenantId: 'tenant1', reason: 'owner-stop' });
    const result = await reserve(store, i);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'approval-revoked');
  } finally { await db.close(); }
});

test('revoked action intent cannot reserve authority', async () => {
  const { db, store } = await storeDb();
  try {
    await persistApproval(store);
    const i = await persistIntent(store);
    await store.revoke({ targetType: 'ACTION_INTENT', targetId: i.intentDigest, revocationId: 'intent-rev1', tenantId: 'tenant1', reason: 'cancel-action' });
    const result = await reserve(store, i);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'intent-revoked');
  } finally { await db.close(); }
});

test('revocation cannot target an object that does not exist', async () => {
  const { db, store } = await storeDb();
  try {
    await assert.rejects(store.revoke({ targetType: 'OWNER_APPROVAL', targetId: 'missing', revocationId: 'rev1', tenantId: 'tenant1', reason: 'owner-stop' }), /does not exist|target/i);
  } finally { await db.close(); }
});

test('release refunds a reserved budget once, commit does not', async () => {
  const { db, store } = await storeDb();
  try {
    await persistApproval(store);
    const first = await persistIntent(store, actionIntent({ idempotencyKey: 'k1', recipient: 'a@example.com', maxCostUsd: 0.25 }));
    await reserve(store, first);
    await store.finalizeAuthorityReservation({ idempotencyKey: 'k1', outcome: 'RELEASED', reason: 'pre-execution-cancel' });
    await store.finalizeAuthorityReservation({ idempotencyKey: 'k1', outcome: 'RELEASED', reason: 'duplicate' });
    let usage = await store.getApprovalUsage('ap1');
    assert.equal(usage.uses, 0);
    assert.equal(usage.costUsd, 0);

    const second = await persistIntent(store, actionIntent({ idempotencyKey: 'k2', recipient: 'b@example.com', maxCostUsd: 0.25 }));
    await reserve(store, second);
    await store.finalizeAuthorityReservation({ idempotencyKey: 'k2', outcome: 'COMMITTED' });
    usage = await store.getApprovalUsage('ap1');
    assert.equal(usage.uses, 1);
    assert.equal(usage.costUsd, 0.25);
  } finally { await db.close(); }
});

test('persistent admission only becomes executable after exact intent scope and atomic authority reservation', async () => {
  const { db, store } = await storeDb();
  try {
    const ap = approval({ maxUses: 1 });
    const ev = createEvidenceRecord({ evidenceId: 'ev1', tenantId: 'tenant1', subject: 'example.com', origin: 'EXTERNAL_SOURCE', relation: 'DIRECT', verificationClaims: [], lifecycleFlags: ['ACTIVE'], sourceRef: 'https://example.com', payload: { observed: true }, observedAt: now.toISOString() });
    const i = createActionIntent({ missionId: 'm1', tenantId: 'tenant1', actorId: 'worker1', operation: 'email.send', resource: 'email:a@example.com', purpose: 'qualified-b2b-outreach', effectClass: 'COMMUNICATE_EXTERNAL', arguments: { to: 'a@example.com' }, evidenceIds: ['ev1'], maxCostUsd: 0.1, blastRadius: 1, rollback: 'SUPPRESS_FUTURE_CONTACT', expiresAt: '2026-08-08T00:10:00Z', nonce: 'n1', idempotencyKey: 'k1' }, now);
    const policyContext = { now, keyResolver, evidenceRequirementResolver: () => ({ minCount: 1, allowedOrigins: ['EXTERNAL_SOURCE'] }), policyAuthorizer: () => ({ decision: 'ALLOW' }), policyVersion: 'p1', policyDigest: sha256('policy'), constitutionDigest: sha256('constitution'), killState: { active: false } };
    const result = await persistAndReserveAdmission({ proofStore: store, intent: i, evidence: [ev], approvals: [ap], context: policyContext });
    assert.equal(result.admission.decision, 'ALLOW');
    assert.equal(result.authorityReservation.ok, true);
    assert.equal(result.executable, true);

    const secondIntent = createActionIntent({ missionId: i.missionId, tenantId: i.tenantId, actorId: i.actorId, operation: i.operation, resource: 'email:b@example.com', purpose: i.purpose, effectClass: i.effectClass, arguments: { to: 'b@example.com' }, evidenceIds: ['ev1'], maxCostUsd: 0.1, blastRadius: 1, rollback: i.rollback, expiresAt: i.expiresAt, nonce: 'n2', idempotencyKey: 'k2' }, now);
    const second = await persistAndReserveAdmission({ proofStore: store, intent: secondIntent, evidence: [ev], approvals: [ap], context: policyContext });
    assert.equal(second.executable, false);
  } finally { await db.close(); }
});

const realPostgresUrl = process.env.OMNIA_V9_TEST_DATABASE_URL || '';

async function realStoreDb() {
  const pool = new Pool({ connectionString: realPostgresUrl, max: 4 });
  await pool.query(await fs.readFile(new URL('../migrations/005_omnia_v9_proof_store.sql', import.meta.url), 'utf8'));
  return { db: pool, store: new OmniaV9ProofStore({ pool, keyResolver }) };
}

test('real PostgreSQL: two concurrent workers racing to reserve a single-use bounded authority produce exactly one winner and no double-spend', { skip: !realPostgresUrl }, async () => {
  const { db, store } = await realStoreDb();
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const approvalId = `ap_race_${suffix}`;
  const tenantId = `tenant_race_${suffix}`;
  try {
    const ap = approval({ approvalId, tenantId, maxUses: 1, maxCostUsd: 1 });
    await persistApproval(store, ap);

    const first = actionIntent({ idempotencyKey: `k1_${suffix}`, recipient: `a_${suffix}@example.com`, tenantId });
    const second = actionIntent({ idempotencyKey: `k2_${suffix}`, recipient: `b_${suffix}@example.com`, tenantId });
    await persistIntent(store, first);
    await persistIntent(store, second);

    const [a, b] = await Promise.all([
      reserve(store, first, { approvalId, tenantId }),
      reserve(store, second, { approvalId, tenantId })
    ]);

    const outcomes = [a, b];
    assert.equal(outcomes.filter(result => result.ok).length, 1, 'exactly one concurrent reservation must win a single-use authority');
    assert.equal(outcomes.filter(result => !result.ok).length, 1);
    const denied = outcomes.find(result => !result.ok);
    assert.match(denied.reason, /uses-exhausted|approval-scope/);

    const usage = await store.getApprovalUsage(approvalId);
    assert.equal(usage.uses, 1, 'concurrent racing reservations must not double-spend a single-use approval');

    const rows = await db.query(
      `SELECT status FROM omnia_v9_authority_reservations WHERE approval_id=$1 ORDER BY idempotency_key`,
      [approvalId]
    );
    assert.equal(rows.rows.filter(row => row.status === 'RESERVED').length, 1);
    assert.equal(rows.rows.filter(row => row.status === 'DENIED').length, 1);
  } finally {
    await db.end();
  }
});

test('real PostgreSQL: concurrent identical idempotent retries of the same reservation converge on one winner', { skip: !realPostgresUrl }, async () => {
  const { db, store } = await realStoreDb();
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const approvalId = `ap_retry_${suffix}`;
  const tenantId = `tenant_retry_${suffix}`;
  try {
    const ap = approval({ approvalId, tenantId, maxUses: 5, maxCostUsd: 5 });
    await persistApproval(store, ap);
    const intent = actionIntent({ idempotencyKey: `retry_${suffix}`, recipient: `r_${suffix}@example.com`, tenantId });
    await persistIntent(store, intent);

    const results = await Promise.all([
      reserve(store, intent, { approvalId, tenantId }),
      reserve(store, intent, { approvalId, tenantId }),
      reserve(store, intent, { approvalId, tenantId })
    ]);
    assert(results.every(result => result.ok === true));
    assert.equal(results.filter(result => result.duplicate).length, 2, 'exactly one attempt should be the original, the rest idempotent replays');

    const usage = await store.getApprovalUsage(approvalId);
    assert.equal(usage.uses, 1, 'concurrent identical idempotent retries must consume budget exactly once');
  } finally {
    await db.end();
  }
});
