import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { generateKeyPairSync } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { signDigestHex, sha256 } from '../src/omnia-v9/canonical.mjs';
import { createActionIntent, createApproval, createEvidenceRecord } from '../src/omnia-v9/kernel.mjs';
import { OmniaV9ProofStore } from '../src/omnia-v9/proof-store.mjs';
import { persistAndReserveAdmission } from '../src/omnia-v9/persistent-admission.mjs';

const now = new Date('2026-08-08T00:00:00Z');
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const keyResolver = keyId => keyId === 'owner-key-1' ? publicKey : null;

async function storeDb() {
  const db = new PGlite();
  await db.exec(await fs.readFile(new URL('../migrations/005_omnia_v9_proof_store.sql', import.meta.url), 'utf8'));
  return { db, store: new OmniaV9ProofStore({ pool: db, keyResolver }) };
}

function approval(overrides = {}) {
  return createApproval({ approvalId: 'ap1', issuerId: 'mohamed', keyId: 'owner-key-1', tenantId: 'tenant1', actorIds: ['worker1'],
    operations: ['email.send'], resourcePrefixes: ['email:'], purposes: ['qualified-b2b-outreach'], effectClasses: ['COMMUNICATE_EXTERNAL'],
    maxBlastRadius: 5, maxCostUsd: 1, maxUses: 2, notBefore: '2026-08-07T00:00:00Z', expiresAt: '2026-08-09T00:00:00Z',
    issuedAt: '2026-08-07T00:00:00Z', ...overrides }, digest => signDigestHex(digest, privateKey));
}

async function persistApproval(store, ap = approval()) {
  await store.putObject({ objectType: 'OWNER_APPROVAL', objectId: ap.approvalId, tenantId: ap.tenantId, digest: ap.approvalDigest, data: ap });
  return ap;
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
    await assert.rejects(store.putObject({ objectType: 'OWNER_APPROVAL', objectId: ap.approvalId, tenantId: ap.tenantId, digest: ap.approvalDigest, data: tampered }), /immutable|digest/i);
  } finally { await db.close(); }
});

test('proof object identity must match the identity inside signed content', async () => {
  const { db, store } = await storeDb();
  try {
    const ap = approval();
    await assert.rejects(store.putObject({ objectType: 'OWNER_APPROVAL', objectId: 'alias', tenantId: ap.tenantId, digest: ap.approvalDigest, data: ap }), /approvalId|identity/i);
  } finally { await db.close(); }
});

test('stored but cryptographically invalid approval cannot spend authority', async () => {
  const { db, store } = await storeDb();
  try {
    const ap = approval();
    const tampered = { ...ap, maxUses: 99 };
    await store.putObject({ objectType: 'OWNER_APPROVAL', objectId: tampered.approvalId, tenantId: 'tenant1', digest: tampered.approvalDigest, data: tampered });
    const result = await store.reserveAuthority({ approvalId: tampered.approvalId, tenantId: 'tenant1', intentDigest: sha256('i'), idempotencyKey: 'k', costDeltaUsd: 0, blastRadius: 1, now });
    assert.equal(result.ok, false);
    assert.match(result.reason, /unverified/);
  } finally { await db.close(); }
});

test('authority reservation consumes signed approval budgets exactly once', async () => {
  const { db, store } = await storeDb();
  try {
    await persistApproval(store);
    const first = await store.reserveAuthority({ approvalId: 'ap1', tenantId: 'tenant1', intentDigest: sha256('i1'), idempotencyKey: 'k1', costDeltaUsd: 0.25, blastRadius: 1, now });
    assert.equal(first.ok, true);
    const duplicate = await store.reserveAuthority({ approvalId: 'ap1', tenantId: 'tenant1', intentDigest: sha256('i1'), idempotencyKey: 'k1', costDeltaUsd: 0.25, blastRadius: 1, now });
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
    await store.reserveAuthority({ approvalId: 'ap1', tenantId: 'tenant1', intentDigest: sha256('i1'), idempotencyKey: 'same', costDeltaUsd: 0, blastRadius: 1, now });
    await assert.rejects(store.reserveAuthority({ approvalId: 'ap1', tenantId: 'tenant1', intentDigest: sha256('i2'), idempotencyKey: 'same', costDeltaUsd: 0, blastRadius: 1, now }), /idempotency/i);
    assert.equal((await store.getApprovalUsage('ap1')).uses, 1);
  } finally { await db.close(); }
});

test('maxUses is enforced by persistent usage', async () => {
  const { db, store } = await storeDb();
  try {
    await persistApproval(store, approval({ maxUses: 1 }));
    assert.equal((await store.reserveAuthority({ approvalId: 'ap1', tenantId: 'tenant1', intentDigest: sha256('i1'), idempotencyKey: 'k1', blastRadius: 1, now })).ok, true);
    const second = await store.reserveAuthority({ approvalId: 'ap1', tenantId: 'tenant1', intentDigest: sha256('i2'), idempotencyKey: 'k2', blastRadius: 1, now });
    assert.equal(second.ok, false);
    assert.equal(second.reason, 'uses-exhausted');
  } finally { await db.close(); }
});

test('cost budget is enforced by persistent usage', async () => {
  const { db, store } = await storeDb();
  try {
    await persistApproval(store, approval({ maxCostUsd: 0.5 }));
    assert.equal((await store.reserveAuthority({ approvalId: 'ap1', tenantId: 'tenant1', intentDigest: sha256('i1'), idempotencyKey: 'k1', costDeltaUsd: 0.4, blastRadius: 1, now })).ok, true);
    const second = await store.reserveAuthority({ approvalId: 'ap1', tenantId: 'tenant1', intentDigest: sha256('i2'), idempotencyKey: 'k2', costDeltaUsd: 0.2, blastRadius: 1, now });
    assert.equal(second.ok, false);
    assert.equal(second.reason, 'cost-budget-exhausted');
  } finally { await db.close(); }
});

test('revocation blocks future reservations', async () => {
  const { db, store } = await storeDb();
  try {
    await persistApproval(store);
    await store.revoke({ targetType: 'OWNER_APPROVAL', targetId: 'ap1', revocationId: 'rev1', tenantId: 'tenant1', reason: 'owner-stop' });
    const result = await store.reserveAuthority({ approvalId: 'ap1', tenantId: 'tenant1', intentDigest: sha256('i'), idempotencyKey: 'k', blastRadius: 1, now });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'approval-revoked');
  } finally { await db.close(); }
});

test('release refunds a reserved budget once, commit does not', async () => {
  const { db, store } = await storeDb();
  try {
    await persistApproval(store);
    await store.reserveAuthority({ approvalId: 'ap1', tenantId: 'tenant1', intentDigest: sha256('i1'), idempotencyKey: 'k1', costDeltaUsd: 0.25, blastRadius: 1, now });
    await store.finalizeAuthorityReservation({ idempotencyKey: 'k1', outcome: 'RELEASED', reason: 'pre-execution-cancel' });
    await store.finalizeAuthorityReservation({ idempotencyKey: 'k1', outcome: 'RELEASED', reason: 'duplicate' });
    let usage = await store.getApprovalUsage('ap1');
    assert.equal(usage.uses, 0); assert.equal(usage.costUsd, 0);
    await store.reserveAuthority({ approvalId: 'ap1', tenantId: 'tenant1', intentDigest: sha256('i2'), idempotencyKey: 'k2', costDeltaUsd: 0.25, blastRadius: 1, now });
    await store.finalizeAuthorityReservation({ idempotencyKey: 'k2', outcome: 'COMMITTED' });
    usage = await store.getApprovalUsage('ap1');
    assert.equal(usage.uses, 1); assert.equal(usage.costUsd, 0.25);
  } finally { await db.close(); }
});

test('persistent admission only becomes executable after atomic authority reservation', async () => {
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
