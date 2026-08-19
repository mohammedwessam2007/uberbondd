import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { generateKeyPairSync } from 'node:crypto';
import { Pool } from 'pg';
import { signDigestHex, sha256 } from '../src/omnia-v9/canonical.mjs';
import { createActionIntent, createEvidenceRecord } from '../src/omnia-v9/kernel.mjs';
import { OmniaV9ProofStore } from '../src/omnia-v9/proof-store.mjs';
import { issueCanaryApproval, revokeCanaryApproval, CANARY_NULL_OPERATION, CANARY_NULL_EFFECT_CLASS, CANARY_NULL_PURPOSE } from '../src/omnia-v9/integrations/canary-approval.mjs';
import { NullConsequenceAdapter } from '../src/omnia-v9/integrations/null-consequence-adapter.mjs';
import { CanaryReceiptStore, CanaryReceiptStoreError } from '../src/omnia-v9/integrations/canary-receipt-store.mjs';
import { bindRealCedarAuthority } from '../src/omnia-v9/integrations/reality-shadow-cedar.mjs';
import { evaluateAndGateCanaryNull } from '../src/omnia-v9/integrations/canary-null-authority.mjs';

const realPostgresUrl = process.env.OMNIA_V9_TEST_DATABASE_URL || '';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const keyResolver = keyId => (keyId === 'owner-key-1' ? publicKey : null);
const signer = digest => signDigestHex(digest, privateKey);
const NOW = new Date('2026-08-08T12:00:00.000Z');

async function migrateReal(pool) {
  // Advisory-locked: node --test runs test files concurrently, and multiple files
  // migrating the same shared real-Postgres database at once can race on
  // "CREATE TABLE IF NOT EXISTS" (Postgres's own IF NOT EXISTS check is not atomic
  // against concurrent DDL, producing duplicate-key errors against pg_type) --
  // exactly the same real-world hazard src/store.mjs's own migrate() already
  // guards against with an advisory lock, applied here for the same reason.
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', ['omnia-v9-canary-test-migrate']);
    for (const migration of ['005_omnia_v9_proof_store.sql', '009_omnia_v9_shadow_approval_registry.sql', '010_omnia_v9_canary_null_receipts.sql']) {
      await client.query(await fs.readFile(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', ['omnia-v9-canary-test-migrate']).catch(() => {});
    client.release();
  }
}

function suffix() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function canaryIntent({ id, evidenceId, tenantId, idempotencyKey }) {
  return createActionIntent({
    missionId: tenantId, tenantId, actorId: 'uberbond-canary-worker', operation: CANARY_NULL_OPERATION,
    resource: `null-sink:${id}`, purpose: CANARY_NULL_PURPOSE, effectClass: CANARY_NULL_EFFECT_CLASS,
    argumentsDigest: sha256(`args-${id}`), evidenceIds: [evidenceId], maxCostUsd: 0, blastRadius: 1,
    rollback: 'NONE', createdAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + 300_000).toISOString(),
    nonce: `nonce:${id}`, idempotencyKey: idempotencyKey || `res_${id}`
  }, NOW);
}

function canaryEvidence(id, tenantId) {
  return createEvidenceRecord({
    evidenceId: id, tenantId, subject: 'canary-subject', origin: 'SYNTHETIC_FIXTURE',
    relation: 'DIRECT', verificationClaims: [], lifecycleFlags: ['ACTIVE'], sourceRef: 'synthetic:fixture',
    payloadDigest: sha256('canary-payload'), observedAt: NOW.toISOString()
  });
}

// ---------------------------------------------------------------------------
// Double-spend
// ---------------------------------------------------------------------------

test('double-spend: N concurrent candidates against a one-use canary approval produce exactly one real null execution', { skip: !realPostgresUrl }, async () => {
  const pool = new Pool({ connectionString: realPostgresUrl, max: 10 });
  const tenantId = `campaign:canary-dspend-${suffix()}`;
  const approvalId = `canary-ap-dspend-${suffix()}`;
  try {
    await migrateReal(pool);
    const store = new OmniaV9ProofStore({ pool, keyResolver });
    const cedarAuthority = await bindRealCedarAuthority();
    await issueCanaryApproval({
      proofStore: store, pool, signer, approvalId, issuerId: 'mohamed', keyId: 'owner-key-1', tenantId,
      actorIds: ['uberbond-canary-worker'], resourcePrefixes: ['null-sink:'], maxBlastRadius: 1, maxCostUsd: 0, maxUses: 1,
      notBefore: new Date(NOW.getTime() - 3600_000).toISOString(), expiresAt: new Date(NOW.getTime() + 3600_000).toISOString(), issuedAt: new Date(NOW.getTime() - 3600_000).toISOString()
    });

    const adapter = new NullConsequenceAdapter();
    const receiptStore = new CanaryReceiptStore({ pool });
    const N = 8;
    const runs = Array.from({ length: N }, (_, i) => {
      const id = `dspend-${i}`;
      const evidence = canaryEvidence(`ev-${id}`, tenantId);
      return evaluateAndGateCanaryNull({
        pool, proofStore: store, tenantId, cedarAuthority, keyResolver, adapter, receiptStore,
        intent: canaryIntent({ id, evidenceId: `ev-${id}`, tenantId }), evidence, now: NOW
      });
    });
    const results = await Promise.all(runs);

    const executedCount = results.filter(r => r.executed).length;
    assert.equal(executedCount, 1, `expected exactly one execution out of ${N} concurrent candidates racing a one-use approval, got ${executedCount}`);
    assert.equal(adapter.executionCount(), 1);
    const denied = results.filter(r => !r.executed);
    assert.equal(denied.length, N - 1);
    for (const r of denied) assert.match(r.reason, /no-execution:(reservation-denied|REVIEW)/);
  } finally {
    await pool.end();
  }
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

test('idempotency: concurrent identical retries of the same allowed action converge on one logical null consequence', { skip: !realPostgresUrl }, async () => {
  const pool = new Pool({ connectionString: realPostgresUrl, max: 10 });
  const tenantId = `campaign:canary-idem-${suffix()}`;
  const approvalId = `canary-ap-idem-${suffix()}`;
  try {
    await migrateReal(pool);
    const store = new OmniaV9ProofStore({ pool, keyResolver });
    const cedarAuthority = await bindRealCedarAuthority();
    await issueCanaryApproval({
      proofStore: store, pool, signer, approvalId, issuerId: 'mohamed', keyId: 'owner-key-1', tenantId,
      actorIds: ['uberbond-canary-worker'], resourcePrefixes: ['null-sink:'], maxBlastRadius: 1, maxCostUsd: 0, maxUses: 5,
      notBefore: new Date(NOW.getTime() - 3600_000).toISOString(), expiresAt: new Date(NOW.getTime() + 3600_000).toISOString(), issuedAt: new Date(NOW.getTime() - 3600_000).toISOString()
    });

    const adapter = new NullConsequenceAdapter();
    const receiptStore = new CanaryReceiptStore({ pool });
    const evidenceId = 'ev-idem';
    const evidence = canaryEvidence(evidenceId, tenantId);
    const idempotencyKey = `idem-retry-${suffix()}`;
    const N = 6;
    const runs = Array.from({ length: N }, () => evaluateAndGateCanaryNull({
      pool, proofStore: store, tenantId, cedarAuthority, keyResolver, adapter, receiptStore,
      intent: canaryIntent({ id: 'idem', evidenceId, tenantId, idempotencyKey }), evidence, now: NOW
    }));
    const results = await Promise.all(runs);

    assert(results.every(r => r.executed === true), 'every retry of the same allowed action must report executed:true (the logical consequence occurred)');
    assert.equal(adapter.executionCount(), 1, 'the null sink itself must be called exactly once for N identical concurrent retries');
    const receiptDigests = new Set(results.map(r => r.receipt.receiptDigest));
    assert.equal(receiptDigests.size, 1, 'no duplicate receipt -- every retry must observe the exact same receipt digest');

    const usage = await store.getApprovalUsage(approvalId);
    assert.equal(usage.uses, 1, 'no duplicate authority usage -- the approval must be consumed exactly once despite N concurrent identical retries');
  } finally {
    await pool.end();
  }
});

// ---------------------------------------------------------------------------
// Contradictory receipt / conflicting authorization
// ---------------------------------------------------------------------------

test('contradictory receipt: attaching a second, different simulated result to the same consequence is rejected, one durable truth wins', { skip: !realPostgresUrl }, async () => {
  const pool = new Pool({ connectionString: realPostgresUrl, max: 5 });
  try {
    await migrateReal(pool);
    const receiptStore = new CanaryReceiptStore({ pool });
    const reservationId = `contradiction-${suffix()}`;
    const base = {
      reservationId, intentDigest: 'a'.repeat(64), authorizationDigest: 'b'.repeat(64),
      tenantId: 'campaign:contradiction', actionClass: CANARY_NULL_OPERATION, result: 'NULL_SINK_ACCEPTED',
      attemptedAt: NOW.toISOString()
    };
    const first = await receiptStore.persistOnce({ ...base, receiptDigest: sha256({ ...base, marker: 1 }) });
    assert.equal(first.inserted, true);
    await assert.rejects(
      receiptStore.persistOnce({ ...base, receiptDigest: sha256({ ...base, marker: 2 }) }),
      error => error instanceof CanaryReceiptStoreError && error.code === 'CONTRADICTORY_RECEIPT'
    );
    const stillOriginal = await receiptStore.getByReservationId(reservationId);
    assert.equal(stillOriginal.receipt_digest, first.receipt.receipt_digest, 'the original receipt must remain the one durable truth');
  } finally {
    await pool.end();
  }
});

test('conflicting authorization: binding a second, different authorization history to the same consequence is rejected', { skip: !realPostgresUrl }, async () => {
  const pool = new Pool({ connectionString: realPostgresUrl, max: 5 });
  try {
    await migrateReal(pool);
    const receiptStore = new CanaryReceiptStore({ pool });
    const reservationId = `auth-conflict-${suffix()}`;
    const receiptDigest = sha256({ reservationId, marker: 'fixed' });
    const base = {
      reservationId, intentDigest: 'c'.repeat(64), tenantId: 'campaign:auth-conflict',
      actionClass: CANARY_NULL_OPERATION, result: 'NULL_SINK_ACCEPTED', attemptedAt: NOW.toISOString(), receiptDigest
    };
    await receiptStore.persistOnce({ ...base, authorizationDigest: 'd'.repeat(64) });
    await assert.rejects(
      receiptStore.persistOnce({ ...base, authorizationDigest: 'e'.repeat(64) }),
      error => error instanceof CanaryReceiptStoreError && error.code === 'CONFLICTING_AUTHORIZATION'
    );
  } finally {
    await pool.end();
  }
});

// ---------------------------------------------------------------------------
// Revocation race
// ---------------------------------------------------------------------------

test('revocation race: no candidate whose final admission occurs after effective revocation may execute', { skip: !realPostgresUrl }, async () => {
  const pool = new Pool({ connectionString: realPostgresUrl, max: 5 });
  const tenantId = `campaign:canary-revrace-${suffix()}`;
  const approvalId = `canary-ap-revrace-${suffix()}`;
  try {
    await migrateReal(pool);
    const store = new OmniaV9ProofStore({ pool, keyResolver });
    const cedarAuthority = await bindRealCedarAuthority();
    await issueCanaryApproval({
      proofStore: store, pool, signer, approvalId, issuerId: 'mohamed', keyId: 'owner-key-1', tenantId,
      actorIds: ['uberbond-canary-worker'], resourcePrefixes: ['null-sink:'], maxBlastRadius: 1, maxCostUsd: 0, maxUses: 10,
      notBefore: new Date(NOW.getTime() - 3600_000).toISOString(), expiresAt: new Date(NOW.getTime() + 3600_000).toISOString(), issuedAt: new Date(NOW.getTime() - 3600_000).toISOString()
    });
    const adapter = new NullConsequenceAdapter();
    const receiptStore = new CanaryReceiptStore({ pool });

    // Before revocation: must be able to execute.
    const before = await evaluateAndGateCanaryNull({
      pool, proofStore: store, tenantId, cedarAuthority, keyResolver, adapter, receiptStore,
      intent: canaryIntent({ id: 'rev-before', evidenceId: 'ev-rev-before', tenantId }), evidence: canaryEvidence('ev-rev-before', tenantId), now: NOW
    });
    assert.equal(before.executed, true);

    await revokeCanaryApproval({ proofStore: store, pool, approvalId, tenantId, revocationId: `rev-${suffix()}`, reason: 'revocation-race-drill', now: NOW });

    // After effective revocation: every subsequent final admission must not execute,
    // including ones "in flight" concurrently with the revocation write completing.
    const after = await Promise.all(Array.from({ length: 5 }, (_, i) => evaluateAndGateCanaryNull({
      pool, proofStore: store, tenantId, cedarAuthority, keyResolver, adapter, receiptStore,
      intent: canaryIntent({ id: `rev-after-${i}`, evidenceId: `ev-rev-after-${i}`, tenantId }), evidence: canaryEvidence(`ev-rev-after-${i}`, tenantId), now: NOW
    })));
    assert(after.every(r => r.executed === false), 'no candidate evaluated after the revocation write completed may execute');
    assert.equal(adapter.executionCount(), 1, 'exactly the one before-revocation execution, and none after');
  } finally {
    await pool.end();
  }
});

// ---------------------------------------------------------------------------
// Expiry race (sub-second boundary)
// ---------------------------------------------------------------------------

test('expiry race: sub-second boundary is enforced by real PostgreSQL timestamp comparison, no string-rounding regression', { skip: !realPostgresUrl }, async () => {
  const pool = new Pool({ connectionString: realPostgresUrl, max: 5 });
  const tenantId = `campaign:canary-exprace-${suffix()}`;
  const approvalId = `canary-ap-exprace-${suffix()}`;
  try {
    await migrateReal(pool);
    const store = new OmniaV9ProofStore({ pool, keyResolver });
    const cedarAuthority = await bindRealCedarAuthority();
    const issuedAt = new Date('2026-08-08T12:00:00.000Z');
    const expiresAt = new Date(issuedAt.getTime() + 1500); // 1.5s window
    await issueCanaryApproval({
      proofStore: store, pool, signer, approvalId, issuerId: 'mohamed', keyId: 'owner-key-1', tenantId,
      actorIds: ['uberbond-canary-worker'], resourcePrefixes: ['null-sink:'], maxBlastRadius: 1, maxCostUsd: 0, maxUses: 10,
      notBefore: issuedAt.toISOString(), expiresAt: expiresAt.toISOString(), issuedAt: issuedAt.toISOString()
    });
    const adapter = new NullConsequenceAdapter();
    const receiptStore = new CanaryReceiptStore({ pool });

    const withinWindow = new Date(issuedAt.getTime() + 400); // 400ms in, well within
    const withinResult = await evaluateAndGateCanaryNull({
      pool, proofStore: store, tenantId, cedarAuthority, keyResolver, adapter, receiptStore,
      intent: canaryIntent({ id: 'exp-within', evidenceId: 'ev-exp-within', tenantId }), evidence: canaryEvidence('ev-exp-within', tenantId), now: withinWindow
    });
    assert.equal(withinResult.executed, true);

    const afterExpiryBy300ms = new Date(expiresAt.getTime() + 300);
    const afterResult = await evaluateAndGateCanaryNull({
      pool, proofStore: store, tenantId, cedarAuthority, keyResolver, adapter, receiptStore,
      intent: canaryIntent({ id: 'exp-after', evidenceId: 'ev-exp-after', tenantId }), evidence: canaryEvidence('ev-exp-after', tenantId), now: afterExpiryBy300ms
    });
    assert.equal(afterResult.executed, false, 'a candidate evaluated 300ms after a sub-second expiry boundary must not execute');
    assert.equal(adapter.executionCount(), 1);
  } finally {
    await pool.end();
  }
});
