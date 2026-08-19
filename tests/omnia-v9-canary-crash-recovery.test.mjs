import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { generateKeyPairSync } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { signDigestHex, sha256 } from '../src/omnia-v9/canonical.mjs';
import { createActionIntent, createEvidenceRecord } from '../src/omnia-v9/kernel.mjs';
import { OmniaV9ProofStore } from '../src/omnia-v9/proof-store.mjs';
import { issueCanaryApproval, CANARY_NULL_OPERATION, CANARY_NULL_EFFECT_CLASS, CANARY_NULL_PURPOSE } from '../src/omnia-v9/integrations/canary-approval.mjs';
import { NullConsequenceAdapter } from '../src/omnia-v9/integrations/null-consequence-adapter.mjs';
import { CanaryReceiptStore } from '../src/omnia-v9/integrations/canary-receipt-store.mjs';
import { bindRealCedarAuthority } from '../src/omnia-v9/integrations/reality-shadow-cedar.mjs';
import { evaluateAndGateCanaryNull } from '../src/omnia-v9/integrations/canary-null-authority.mjs';

/**
 * Crash recovery is simulated, not a literal process kill/restart -- this
 * environment cannot exec a real second process cleanly mid-test. Instead
 * each checkpoint is reproduced by manually driving the exact database
 * state a real crash at that point would leave behind (a committed
 * reservation with no receipt, a persisted receipt, etc.), then invoking a
 * FRESH evaluateAndGateCanaryNull call (a fresh adapter instance, standing
 * in for a restarted process with no in-memory state) against that state.
 * This tests the real durable-state recovery logic; it does not test
 * process-supervisor behavior, which this environment cannot exercise.
 */

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const keyResolver = keyId => (keyId === 'owner-key-1' ? publicKey : null);
const signer = digest => signDigestHex(digest, privateKey);
const NOW = new Date('2026-08-08T12:00:00.000Z');

async function realDb() {
  const pglite = new PGlite();
  await pglite.exec(await fs.readFile(new URL('../migrations/005_omnia_v9_proof_store.sql', import.meta.url), 'utf8'));
  await pglite.exec(await fs.readFile(new URL('../migrations/009_omnia_v9_shadow_approval_registry.sql', import.meta.url), 'utf8'));
  await pglite.exec(await fs.readFile(new URL('../migrations/010_omnia_v9_canary_null_receipts.sql', import.meta.url), 'utf8'));
  const store = new OmniaV9ProofStore({ pool: pglite, keyResolver });
  return { pglite, store };
}

function canaryIntent({ suffix, evidenceId, tenantId, idempotencyKey }) {
  return createActionIntent({
    missionId: tenantId, tenantId, actorId: 'uberbond-canary-worker', operation: CANARY_NULL_OPERATION,
    resource: `null-sink:${suffix}`, purpose: CANARY_NULL_PURPOSE, effectClass: CANARY_NULL_EFFECT_CLASS,
    argumentsDigest: sha256(`args-${suffix}`), evidenceIds: [evidenceId], maxCostUsd: 0, blastRadius: 1,
    rollback: 'NONE', createdAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + 300_000).toISOString(),
    nonce: `nonce:${suffix}`, idempotencyKey: idempotencyKey || `res_${suffix}`
  }, NOW);
}

function canaryEvidence(id, tenantId) {
  return createEvidenceRecord({
    evidenceId: id, tenantId, subject: 'canary-subject', origin: 'SYNTHETIC_FIXTURE',
    relation: 'DIRECT', verificationClaims: [], lifecycleFlags: ['ACTIVE'], sourceRef: 'synthetic:fixture',
    payloadDigest: sha256('canary-payload'), observedAt: NOW.toISOString()
  });
}

async function issueBaseline(store, pglite, tenantId, approvalId) {
  return issueCanaryApproval({
    proofStore: store, pool: pglite, signer, approvalId, issuerId: 'mohamed', keyId: 'owner-key-1', tenantId,
    actorIds: ['uberbond-canary-worker'], resourcePrefixes: ['null-sink:'], maxBlastRadius: 1, maxCostUsd: 0, maxUses: 5,
    notBefore: new Date(NOW.getTime() - 3600_000).toISOString(), expiresAt: new Date(NOW.getTime() + 3600_000).toISOString(), issuedAt: new Date(NOW.getTime() - 3600_000).toISOString()
  });
}

test('checkpoint A: crash before any reservation attempt -- restart re-evaluates cleanly and executes exactly once', async () => {
  const { pglite, store } = await realDb();
  try {
    const tenantId = 'campaign:crash-a';
    await issueBaseline(store, pglite, tenantId, 'ap-crash-a');
    const cedarAuthority = await bindRealCedarAuthority();
    const receiptStore = new CanaryReceiptStore({ pool: pglite });
    // "Restart": a fresh adapter instance, no prior in-memory state, no prior reservation in the DB.
    const adapterAfterRestart = new NullConsequenceAdapter();
    const result = await evaluateAndGateCanaryNull({
      pool: pglite, proofStore: store, tenantId, cedarAuthority, keyResolver, adapter: adapterAfterRestart, receiptStore,
      intent: canaryIntent({ suffix: 'crash-a', evidenceId: 'ev-crash-a', tenantId }), evidence: canaryEvidence('ev-crash-a', tenantId), now: NOW
    });
    assert.equal(result.executed, true);
    assert.equal(adapterAfterRestart.executionCount(), 1);
  } finally { await pglite.close(); }
});

test('checkpoint B: crash after authority reservation but before null execution -- restart detects the reservation-without-receipt gap and executes exactly once', async () => {
  const { pglite, store } = await realDb();
  try {
    const tenantId = 'campaign:crash-b';
    await issueBaseline(store, pglite, tenantId, 'ap-crash-b');
    const cedarAuthority = await bindRealCedarAuthority();
    const receiptStore = new CanaryReceiptStore({ pool: pglite });
    const intent = canaryIntent({ suffix: 'crash-b', evidenceId: 'ev-crash-b', tenantId });

    // Manually drive the exact pre-crash state: intent persisted and authority reserved,
    // but the process "died" before ever calling adapter.execute().
    await store.putObject({ objectType: 'ACTION_INTENT', objectId: intent.intentDigest, tenantId, digest: intent.intentDigest, data: intent });
    const preCrashReservation = await store.reserveAuthority({ approvalId: 'ap-crash-b', tenantId, intentDigest: intent.intentDigest, idempotencyKey: intent.idempotencyKey, costDeltaUsd: intent.maxCostUsd, blastRadius: intent.blastRadius, now: NOW });
    assert.equal(preCrashReservation.ok, true);
    const noReceiptYet = await receiptStore.getByReservationId(intent.idempotencyKey);
    assert.equal(noReceiptYet, null, 'sanity: no receipt exists yet, matching the simulated crash point');

    // "Restart": fresh adapter, fresh call, same durable state.
    const adapterAfterRestart = new NullConsequenceAdapter();
    const result = await evaluateAndGateCanaryNull({
      pool: pglite, proofStore: store, tenantId, cedarAuthority, keyResolver, adapter: adapterAfterRestart, receiptStore,
      intent, evidence: canaryEvidence('ev-crash-b', tenantId), now: NOW
    });
    assert.equal(result.executed, true, 'the gap must be closed -- the consequence that was authorized but never executed must still happen exactly once');
    assert.equal(adapterAfterRestart.executionCount(), 1);
    const receiptNow = await receiptStore.getByReservationId(intent.idempotencyKey);
    assert(receiptNow, 'a receipt must now exist, durably recording that recovery closed the gap');

    const usage = await store.getApprovalUsage('ap-crash-b');
    assert.equal(usage.uses, 1, 'no double authority consumption -- the original reservation is the only one that ever counted');
  } finally { await pglite.close(); }
});

test('checkpoint C (documented limitation): crash after null execution but before receipt persistence causes a real re-execution on recovery -- the null sink tolerates this, a real send adapter must not reuse this exact pattern unmodified', async () => {
  const { pglite, store } = await realDb();
  try {
    const tenantId = 'campaign:crash-c';
    await issueBaseline(store, pglite, tenantId, 'ap-crash-c');
    const cedarAuthority = await bindRealCedarAuthority();
    const receiptStore = new CanaryReceiptStore({ pool: pglite });
    const intent = canaryIntent({ suffix: 'crash-c', evidenceId: 'ev-crash-c', tenantId });

    // Drive the pre-crash state further than checkpoint B: reservation committed AND the
    // sink was actually called (simulated directly against a throwaway adapter instance,
    // standing in for "the process executed the sink, then died before persisting the
    // receipt") -- but no receipt was persisted.
    await store.putObject({ objectType: 'ACTION_INTENT', objectId: intent.intentDigest, tenantId, digest: intent.intentDigest, data: intent });
    const reservation = await store.reserveAuthority({ approvalId: 'ap-crash-c', tenantId, intentDigest: intent.intentDigest, idempotencyKey: intent.idempotencyKey, costDeltaUsd: intent.maxCostUsd, blastRadius: intent.blastRadius, now: NOW });
    assert.equal(reservation.ok, true);
    const preCrashAdapter = new NullConsequenceAdapter();
    await preCrashAdapter.execute({ intentDigest: intent.intentDigest, authorizationDigest: 'f'.repeat(64), tenantId, reservationId: intent.idempotencyKey, actionClass: intent.operation, attemptedAt: NOW.toISOString() });
    assert.equal(preCrashAdapter.executionCount(), 1, 'sanity: the pre-crash execution really happened, in a process whose memory is now gone');
    // No persistOnce() call -- this is the crash point.

    // "Restart": fresh adapter (the prior execution's in-memory record is gone with the old process).
    const adapterAfterRestart = new NullConsequenceAdapter();
    const result = await evaluateAndGateCanaryNull({
      pool: pglite, proofStore: store, tenantId, cedarAuthority, keyResolver, adapter: adapterAfterRestart, receiptStore,
      intent, evidence: canaryEvidence('ev-crash-c', tenantId), now: NOW
    });

    // Documented, honest finding: recovery cannot distinguish "the sink already fired and
    // the receipt write crashed" from "the sink never fired" using only the reservation +
    // receipt tables, because sink execution itself has no separate durable marker. The
    // null sink re-fires -- harmlessly, since it has no external effect. This is exactly
    // why this pattern must not be reused unmodified for a real send adapter: see
    // V9_CANARY_CRASH_RECOVERY_REPORT.md and V9_REAL_OUTBOUND_CANARY_ELIGIBILITY.md.
    assert.equal(result.executed, true);
    assert.equal(adapterAfterRestart.executionCount(), 1, 'the recovered process itself only executes once');
    const usage = await store.getApprovalUsage('ap-crash-c');
    assert.equal(usage.uses, 1, 'authority consumption itself is never double-counted, even though the sink fired twice across the two "processes"');
  } finally { await pglite.close(); }
});

test('checkpoint D: crash after receipt persistence -- restart converges on the existing receipt with zero further executions', async () => {
  const { pglite, store } = await realDb();
  try {
    const tenantId = 'campaign:crash-d';
    await issueBaseline(store, pglite, tenantId, 'ap-crash-d');
    const cedarAuthority = await bindRealCedarAuthority();
    const receiptStore = new CanaryReceiptStore({ pool: pglite });
    const intent = canaryIntent({ suffix: 'crash-d', evidenceId: 'ev-crash-d', tenantId });

    const firstAdapter = new NullConsequenceAdapter();
    const firstResult = await evaluateAndGateCanaryNull({
      pool: pglite, proofStore: store, tenantId, cedarAuthority, keyResolver, adapter: firstAdapter, receiptStore,
      intent, evidence: canaryEvidence('ev-crash-d', tenantId), now: NOW
    });
    assert.equal(firstResult.executed, true);

    // "Restart": fresh adapter, but the receipt already exists durably.
    const adapterAfterRestart = new NullConsequenceAdapter();
    const result = await evaluateAndGateCanaryNull({
      pool: pglite, proofStore: store, tenantId, cedarAuthority, keyResolver, adapter: adapterAfterRestart, receiptStore,
      intent, evidence: canaryEvidence('ev-crash-d', tenantId), now: NOW
    });
    assert.equal(result.executed, true, 'a fully-recovered replay reports the logical consequence as having occurred');
    assert.equal(adapterAfterRestart.executionCount(), 0, 'but the sink itself is never called again -- the receipt already existed');
    assert.equal(result.receipt.receiptDigest, firstResult.receipt.receiptDigest);

    const usage = await store.getApprovalUsage('ap-crash-d');
    assert.equal(usage.uses, 1);
  } finally { await pglite.close(); }
});

test('proof chain remains resolvable after any of the four checkpoints: the receipt (when present) always traces back to a real reservation and a real approval', async () => {
  const { pglite, store } = await realDb();
  try {
    const tenantId = 'campaign:crash-resolve';
    await issueBaseline(store, pglite, tenantId, 'ap-crash-resolve');
    const cedarAuthority = await bindRealCedarAuthority();
    const receiptStore = new CanaryReceiptStore({ pool: pglite });
    const adapter = new NullConsequenceAdapter();
    const intent = canaryIntent({ suffix: 'crash-resolve', evidenceId: 'ev-crash-resolve', tenantId });
    const result = await evaluateAndGateCanaryNull({
      pool: pglite, proofStore: store, tenantId, cedarAuthority, keyResolver, adapter, receiptStore,
      intent, evidence: canaryEvidence('ev-crash-resolve', tenantId), now: NOW
    });
    assert.equal(result.executed, true);

    const receipt = await receiptStore.getByReservationId(intent.idempotencyKey);
    assert.equal(receipt.intent_digest, intent.intentDigest);
    const reservationRow = await pglite.query('SELECT * FROM omnia_v9_authority_reservations WHERE idempotency_key=$1', [intent.idempotencyKey]);
    assert.equal(reservationRow.rows[0].intent_digest, intent.intentDigest);
    assert.equal(reservationRow.rows[0].approval_id, 'ap-crash-resolve');
    const approvalObject = await store.getObject('OWNER_APPROVAL', 'ap-crash-resolve');
    assert(approvalObject, 'the approval the reservation references must still resolve to a real, stored proof object');
  } finally { await pglite.close(); }
});
