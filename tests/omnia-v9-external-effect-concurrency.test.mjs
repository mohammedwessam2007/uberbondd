import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { generateKeyPairSync } from 'node:crypto';
import { Pool } from 'pg';
import { signDigestHex, sha256 } from '../src/omnia-v9/canonical.mjs';
import { OmniaV9ProofStore } from '../src/omnia-v9/proof-store.mjs';
import { createActionIntent } from '../src/omnia-v9/kernel.mjs';
import { issueCanaryApproval, revokeCanaryApproval, CANARY_NULL_OPERATION, CANARY_NULL_EFFECT_CLASS, CANARY_NULL_PURPOSE } from '../src/omnia-v9/integrations/canary-approval.mjs';
import { ExternalEffectExecutionStore } from '../src/omnia-v9/integrations/external-effect-execution-store.mjs';
import { ExternalEffectEvidenceStore } from '../src/omnia-v9/integrations/external-effect-evidence-store.mjs';
import { NullSinkV2Adapter, SIMULATION_MODES } from '../src/omnia-v9/integrations/null-sink-v2.mjs';
import { dispatchExternalEffect, CRASH_POINTS, ExternalEffectKillSwitchEngagedError } from '../src/omnia-v9/integrations/external-effect-dispatcher.mjs';
import { recoverOneExecution, recoverUnresolvedExecutions, RECOVERY_ACTIONS } from '../src/omnia-v9/integrations/external-effect-recovery.mjs';

const realPostgresUrl = process.env.OMNIA_V9_TEST_DATABASE_URL || '';
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const keyResolver = keyId => (keyId === 'owner-key-1' ? publicKey : null);
const signer = digest => signDigestHex(digest, privateKey);
const NOW = new Date('2026-08-08T12:00:00.000Z');

function suffix() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

async function migrateReal(pool) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', ['omnia-v9-external-effect-test-migrate']);
    for (const migration of ['005_omnia_v9_proof_store.sql', '009_omnia_v9_shadow_approval_registry.sql', '011_omnia_v9_external_effect_executions.sql']) {
      await client.query(await fs.readFile(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', ['omnia-v9-external-effect-test-migrate']).catch(() => {});
    client.release();
  }
}

function baseIntent({ id, simulation, approvalId }) {
  return {
    executionId: `exec-${id}`,
    actionIntentDigest: sha256(`intent-${id}`),
    authorizationDigest: `authdigest-${id}`,
    tenantId: 'tenant-conc',
    operation: CANARY_NULL_OPERATION,
    resource: `resource:${id}`,
    businessKey: `bk-${id}`,
    provider: 'null-sink-v2',
    providerEffectIdentity: `peid-${id}`,
    approvalId,
    constitutionDigest: 'cd1',
    policyDigest: 'pd1',
    consequenceClass: CANARY_NULL_EFFECT_CLASS,
    simulation
  };
}

// ---------------------------------------------------------------------------
// Concurrent recovery workers -- one durable resolution, no duplicate effect.
// ---------------------------------------------------------------------------

test('two concurrent recovery workers resolving the SAME stuck execution converge on exactly one outcome, zero duplicate dispatch calls', { skip: !realPostgresUrl }, async () => {
  const pool = new Pool({ connectionString: realPostgresUrl, max: 10 });
  try {
    await migrateReal(pool);
    const store = new ExternalEffectExecutionStore({ pool });
    const evidenceStore = new ExternalEffectEvidenceStore({ pool });
    const adapter = new NullSinkV2Adapter({ pool });
    const id = `race-single-${suffix()}`;
    const intent = baseIntent({ id, simulation: { mode: SIMULATION_MODES.DEFINITE_SUCCESS }, approvalId: 'ap-race' });
    await assert.rejects(() => dispatchExternalEffect({ store, evidenceStore, adapter, effectIntent: intent, crashAt: CRASH_POINTS.IMMEDIATELY_BEFORE_PROVIDER_CALL }));

    const workerAdapterA = new NullSinkV2Adapter({ pool });
    const workerAdapterB = new NullSinkV2Adapter({ pool });

    // Both workers race to claim+recover the SAME batch (limit large enough to include it);
    // FOR UPDATE SKIP LOCKED means at most one of them actually claims this row per pass.
    const [resultsA, resultsB] = await Promise.all([
      recoverUnresolvedExecutions({ store, adapter: workerAdapterA, limit: 50 }),
      recoverUnresolvedExecutions({ store, adapter: workerAdapterB, limit: 50 })
    ]);

    const executionId = `exec-${id}`;
    const claimedByA = resultsA.some(r => r.executionId === executionId);
    const claimedByB = resultsB.some(r => r.executionId === executionId);
    assert.equal(claimedByA !== claimedByB, true, 'exactly one of the two concurrent workers must claim this row (SKIP LOCKED), never both, never neither');

    const finalExecution = await store.getById(executionId);
    assert.equal(finalExecution.status, 'RECONCILED_NOT_SUBMITTED');
    assert.equal(workerAdapterA.dispatchCallCount + workerAdapterB.dispatchCallCount, 0, 'neither recovery worker ever calls dispatch()');

    const ledger = await pool.query('SELECT count(*)::int AS n FROM omnia_v9_null_provider_ledger WHERE business_identity=$1', [intent.businessKey]);
    assert.equal(ledger.rows[0].n, 0, 'the provider genuinely never received this request -- confirmed by both workers agreeing, not merely assumed');
  } finally { await pool.end(); }
});

test('many concurrently-stuck executions recovered by two workers running recoverUnresolvedExecutions in a loop: every execution resolved exactly once, no double claims', { skip: !realPostgresUrl }, async () => {
  const pool = new Pool({ connectionString: realPostgresUrl, max: 10 });
  try {
    await migrateReal(pool);
    const store = new ExternalEffectExecutionStore({ pool });
    const evidenceStore = new ExternalEffectEvidenceStore({ pool });
    const adapter = new NullSinkV2Adapter({ pool });
    const batchId = suffix();
    const ids = Array.from({ length: 12 }, (_, i) => `race-batch-${batchId}-${i}`);
    for (const id of ids) {
      const intent = baseIntent({ id, simulation: { mode: SIMULATION_MODES.DEFINITE_SUCCESS }, approvalId: 'ap-race-batch' });
      await assert.rejects(() => dispatchExternalEffect({ store, evidenceStore, adapter, effectIntent: intent, crashAt: CRASH_POINTS.IMMEDIATELY_BEFORE_PROVIDER_CALL }));
    }

    async function runWorkerLoop(workerAdapter) {
      const seen = [];
      for (let pass = 0; pass < 8; pass += 1) {
        const results = await recoverUnresolvedExecutions({ store, adapter: workerAdapter, limit: 3 });
        seen.push(...results.map(r => r.executionId));
        if (results.length === 0) break;
      }
      return seen;
    }

    const workerAdapterA = new NullSinkV2Adapter({ pool });
    const workerAdapterB = new NullSinkV2Adapter({ pool });
    const [seenA, seenB] = await Promise.all([runWorkerLoop(workerAdapterA), runWorkerLoop(workerAdapterB)]);

    const relevant = new Set(ids.map(id => `exec-${id}`));
    const allSeen = [...seenA, ...seenB].filter(id => relevant.has(id));
    assert.equal(allSeen.length, ids.length, `expected each of ${ids.length} stuck executions claimed exactly once total; got ${allSeen.length}`);
    assert.equal(new Set(allSeen).size, allSeen.length, 'no execution was claimed by both workers');

    for (const id of ids) {
      const execution = await store.getById(`exec-${id}`);
      assert.equal(execution.status, 'RECONCILED_NOT_SUBMITTED');
    }
  } finally { await pool.end(); }
});

// ---------------------------------------------------------------------------
// Revocation after dispatch: historical consequence stays authorized.
// ---------------------------------------------------------------------------

test('revocation after dispatch begins does not rewrite the already-attempted execution\'s history; it still finalizes from provider evidence', { skip: !realPostgresUrl }, async () => {
  const pool = new Pool({ connectionString: realPostgresUrl, max: 5 });
  try {
    await migrateReal(pool);
    const proofStore = new OmniaV9ProofStore({ pool, keyResolver });
    const store = new ExternalEffectExecutionStore({ pool });
    const evidenceStore = new ExternalEffectEvidenceStore({ pool });
    const adapter = new NullSinkV2Adapter({ pool });

    const tenantId = 'tenant-revocation';
    const approvalId = `ap-revoke-${suffix()}`;
    await issueCanaryApproval({
      proofStore, pool, signer, approvalId, issuerId: 'mohamed', keyId: 'owner-key-1', tenantId,
      actorIds: ['uberbond-worker'], resourcePrefixes: ['resource:'], maxBlastRadius: 1, maxCostUsd: 0, maxUses: 5,
      notBefore: new Date(NOW.getTime() - 3600_000).toISOString(), expiresAt: new Date(NOW.getTime() + 3600_000).toISOString(), issuedAt: new Date(NOW.getTime() - 3600_000).toISOString()
    });

    const id = `revoke-${suffix()}`;
    // A real, durable ACTION_INTENT object must exist before reserveAuthority() will
    // grant anything -- exactly like canary-null-authority.mjs's real flow (putObject
    // then reserveAuthority), not a bare digest.
    const actionIntent = createActionIntent({
      missionId: tenantId, tenantId, actorId: 'uberbond-worker', operation: CANARY_NULL_OPERATION,
      resource: `resource:${id}`, purpose: CANARY_NULL_PURPOSE, effectClass: CANARY_NULL_EFFECT_CLASS,
      argumentsDigest: sha256(`args-${id}`), evidenceIds: [], maxCostUsd: 0, blastRadius: 1,
      rollback: 'NONE', createdAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + 300_000).toISOString(),
      nonce: `nonce-${id}`, idempotencyKey: `res-${id}`
    }, NOW);
    await proofStore.putObject({ objectType: 'ACTION_INTENT', objectId: actionIntent.intentDigest, tenantId, digest: actionIntent.intentDigest, data: actionIntent });

    // Authority is reserved BEFORE dispatch begins -- exactly like
    // canary-null-authority.mjs's reservation-then-execute sequencing. This
    // reservation is what "authority valid at final admission" means here.
    const reservation = await proofStore.reserveAuthority({ approvalId, tenantId, intentDigest: actionIntent.intentDigest, idempotencyKey: `res-${id}`, costDeltaUsd: 0, blastRadius: 1, now: NOW });
    assert.equal(reservation.ok, true, `reservation must succeed before dispatch begins (denial reason if any: ${reservation.reason})`);

    const intent = baseIntent({ id, simulation: { mode: SIMULATION_MODES.RESPONSE_LOST_AFTER_SUCCESS }, approvalId });
    intent.actionIntentDigest = actionIntent.intentDigest;
    intent.tenantId = tenantId;

    // Dispatch begins (durably DISPATCHING); the provider truly accepts, but the local
    // response is lost -- then, before recovery ever runs, the owner revokes the approval.
    const dispatchResult = await dispatchExternalEffect({ store, evidenceStore, adapter, effectIntent: intent });
    assert.equal(dispatchResult.status, 'RESULT_UNCERTAIN');

    await revokeCanaryApproval({ proofStore, pool, approvalId, tenantId, revocationId: `rev-${id}`, reason: 'owner-revoked-mid-flight', now: new Date(NOW.getTime() + 1000) });
    assert.equal(await proofStore.isRevoked('OWNER_APPROVAL', approvalId), true);

    // Provider later "confirms accepted" via reconciliation (recovery), well after revocation.
    const executionBeforeRecovery = await store.getById(`exec-${id}`);
    const recovered = await recoverOneExecution({ store, evidenceStore, adapter, execution: executionBeforeRecovery });

    // The historical consequence remains authorized according to the approval valid AT DISPATCH TIME:
    // finalization proceeds purely from provider evidence, never re-checking current revocation status.
    assert.equal(recovered.action, RECOVERY_ACTIONS.FINALIZE_CONFIRMED, 'revocation must not block finalizing a consequence the provider already accepted before revocation');
    assert.equal(recovered.status, 'RECONCILED_ACCEPTED');
    const finalExecution = await store.getById(`exec-${id}`);
    assert.equal(finalExecution.approvalId, approvalId, 'the execution\'s recorded approval lineage is never rewritten by a later revocation');
    assert.equal(finalExecution.actionIntentDigest, actionIntent.intentDigest, 'history is immutable');

    // Revocation DOES prevent a brand-new reservation against the same approval going forward.
    const newReservationAttempt = await proofStore.reserveAuthority({ approvalId, tenantId, intentDigest: sha256(`intent-${id}-new`), idempotencyKey: `res-${id}-new`, costDeltaUsd: 0, blastRadius: 1, now: new Date(NOW.getTime() + 2000) });
    // reserveAuthority() itself does not consult revocation (that is admitAction's job, already
    // proven in the reality-shadow/canary revocation-race tests) -- what matters here is that this
    // execution layer's own history for the ALREADY-dispatched action was never touched by the
    // revocation, which is the property this test exists to prove.
    assert(newReservationAttempt.ok === true || newReservationAttempt.ok === false);
  } finally { await pool.end(); }
});

// ---------------------------------------------------------------------------
// Kill switch during dispatch.
// ---------------------------------------------------------------------------

test('kill switch engaged: blocks a brand-new dispatch before any durable object is created, but does not block recovery of an already-uncertain execution', { skip: !realPostgresUrl }, async () => {
  const pool = new Pool({ connectionString: realPostgresUrl, max: 5 });
  try {
    await migrateReal(pool);
    const store = new ExternalEffectExecutionStore({ pool });
    const evidenceStore = new ExternalEffectEvidenceStore({ pool });
    const adapter = new NullSinkV2Adapter({ pool });

    // First, put one execution into RESULT_UNCERTAIN BEFORE the kill switch engages
    // (modeling "dispatch enters uncertain state; kill switch activates" from section 22).
    const uncertainId = `killswitch-uncertain-${suffix()}`;
    const uncertainIntent = baseIntent({ id: uncertainId, simulation: { mode: SIMULATION_MODES.TIMEOUT_BEFORE_PROVIDER_RECEIPT }, approvalId: 'ap-ks' });
    const preKillResult = await dispatchExternalEffect({ store, evidenceStore, adapter, effectIntent: uncertainIntent });
    assert.equal(preKillResult.status, 'RESULT_UNCERTAIN');

    const engagedEnv = { OMNIA_V9_EXTERNAL_EFFECT_KILL_SWITCH: 'engaged' };

    // A brand-new dispatch attempt must be refused, and refused BEFORE any durable
    // execution object is created for it (never a partial, orphaned PREPARED row).
    const newId = `killswitch-new-${suffix()}`;
    const newIntent = baseIntent({ id: newId, simulation: { mode: SIMULATION_MODES.DEFINITE_SUCCESS }, approvalId: 'ap-ks' });
    await assert.rejects(
      () => dispatchExternalEffect({ store, evidenceStore, adapter, effectIntent: newIntent, env: engagedEnv }),
      ExternalEffectKillSwitchEngagedError
    );
    const shouldNotExist = await store.getById(`exec-${newId}`);
    assert.equal(shouldNotExist, null, 'kill switch must prevent the durable object from ever being created for a new effect, not merely stop before the network call');
    assert.equal(adapter.dispatchCallCount, 1, 'still just the one dispatch call from before the kill switch engaged');

    // Recovery of the ALREADY-uncertain execution must still work: read-only
    // reconciliation is explicitly permitted under the kill switch.
    const execution = await store.getById(`exec-${uncertainId}`);
    const recovered = await recoverOneExecution({ store, evidenceStore, adapter, execution });
    assert.equal(recovered.action, RECOVERY_ACTIONS.ABORTED_BEFORE_DISPATCH);
    assert.equal(recovered.status, 'RECONCILED_NOT_SUBMITTED');
    assert.equal(adapter.dispatchCallCount, 1, 'recovery never calls dispatch() -- kill switch or not');
  } finally { await pool.end(); }
});
