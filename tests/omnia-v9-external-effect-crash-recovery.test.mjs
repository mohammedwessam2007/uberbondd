import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Pool } from 'pg';
import { ExternalEffectExecutionStore } from '../src/omnia-v9/integrations/external-effect-execution-store.mjs';
import { ExternalEffectEvidenceStore } from '../src/omnia-v9/integrations/external-effect-evidence-store.mjs';
import { NullSinkV2Adapter, SIMULATION_MODES } from '../src/omnia-v9/integrations/null-sink-v2.mjs';
import { dispatchExternalEffect, CRASH_POINTS, CrashInjected } from '../src/omnia-v9/integrations/external-effect-dispatcher.mjs';
import { recoverOneExecution, recoverUnresolvedExecutions, RECOVERY_ACTIONS } from '../src/omnia-v9/integrations/external-effect-recovery.mjs';

const realPostgresUrl = process.env.OMNIA_V9_TEST_DATABASE_URL || '';

function suffix() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

async function migrateReal(pool) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', ['omnia-v9-external-effect-test-migrate']);
    await client.query(await fs.readFile(new URL('../migrations/011_omnia_v9_external_effect_executions.sql', import.meta.url), 'utf8'));
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', ['omnia-v9-external-effect-test-migrate']).catch(() => {});
    client.release();
  }
}

function baseIntent({ id, simulation }) {
  return {
    executionId: `exec-${id}`,
    actionIntentDigest: 'a'.repeat(64),
    authorizationDigest: 'authdigest',
    tenantId: 'tenant-crash',
    operation: 'outbound.external_effect_execute',
    resource: `resource:${id}`,
    businessKey: `bk-${id}`,
    provider: 'null-sink-v2',
    providerEffectIdentity: `peid-${id}`,
    approvalId: 'approval-1',
    constitutionDigest: 'cd1',
    policyDigest: 'pd1',
    consequenceClass: 'WRITE_EXTERNAL',
    simulation
  };
}

async function harness(pool) {
  const store = new ExternalEffectExecutionStore({ pool });
  const evidenceStore = new ExternalEffectEvidenceStore({ pool });
  const adapter = new NullSinkV2Adapter({ pool });
  return { store, evidenceStore, adapter };
}

test('happy path: DEFINITE_SUCCESS dispatches once and lands in PROVIDER_ACCEPTED', { skip: !realPostgresUrl }, async () => {
  const pool = new Pool({ connectionString: realPostgresUrl, max: 5 });
  try {
    await migrateReal(pool);
    const { store, evidenceStore, adapter } = await harness(pool);
    const id = `happy-${suffix()}`;
    const result = await dispatchExternalEffect({ store, evidenceStore, adapter, effectIntent: baseIntent({ id, simulation: { mode: SIMULATION_MODES.DEFINITE_SUCCESS } }) });
    assert.equal(result.status, 'PROVIDER_ACCEPTED');
    assert.equal(adapter.dispatchCallCount, 1);
    const execution = await store.getById(`exec-${id}`);
    assert.equal(execution.status, 'PROVIDER_ACCEPTED');
  } finally { await pool.end(); }
});

test('happy path: DEFINITE_FAILURE dispatches once and lands in PROVIDER_REJECTED', { skip: !realPostgresUrl }, async () => {
  const pool = new Pool({ connectionString: realPostgresUrl, max: 5 });
  try {
    await migrateReal(pool);
    const { store, evidenceStore, adapter } = await harness(pool);
    const id = `fail-${suffix()}`;
    const result = await dispatchExternalEffect({ store, evidenceStore, adapter, effectIntent: baseIntent({ id, simulation: { mode: SIMULATION_MODES.DEFINITE_FAILURE } }) });
    assert.equal(result.status, 'PROVIDER_REJECTED');
    assert.equal(adapter.dispatchCallCount, 1);
  } finally { await pool.end(); }
});

test('a thrown dispatch() (TIMEOUT_BEFORE_PROVIDER_RECEIPT) lands in RESULT_UNCERTAIN, never PROVIDER_REJECTED', { skip: !realPostgresUrl }, async () => {
  const pool = new Pool({ connectionString: realPostgresUrl, max: 5 });
  try {
    await migrateReal(pool);
    const { store, evidenceStore, adapter } = await harness(pool);
    const id = `timeout-${suffix()}`;
    const result = await dispatchExternalEffect({ store, evidenceStore, adapter, effectIntent: baseIntent({ id, simulation: { mode: SIMULATION_MODES.TIMEOUT_BEFORE_PROVIDER_RECEIPT } }) });
    assert.equal(result.status, 'RESULT_UNCERTAIN');
  } finally { await pool.end(); }
});

// ---------------------------------------------------------------------------
// Deterministic crash injection at every meaningful step, then recovery.
// ---------------------------------------------------------------------------

for (const [point, mode, expectFinalStatus, expectDispatchCallsAfterRecovery] of [
  [CRASH_POINTS.AFTER_AUTHORITY_RESERVATION, SIMULATION_MODES.DEFINITE_SUCCESS, null, 0],
  [CRASH_POINTS.AFTER_EXECUTION_OBJECT_CREATED, SIMULATION_MODES.DEFINITE_SUCCESS, 'ABORTED_BEFORE_DISPATCH', 0],
  [CRASH_POINTS.AFTER_DISPATCHING_DURABLE, SIMULATION_MODES.DEFINITE_SUCCESS, null, 0],
  [CRASH_POINTS.IMMEDIATELY_BEFORE_PROVIDER_CALL, SIMULATION_MODES.DEFINITE_SUCCESS, null, 0]
]) {
  test(`crash injection at ${point}: recovery never redispatches`, { skip: !realPostgresUrl }, async () => {
    const pool = new Pool({ connectionString: realPostgresUrl, max: 5 });
    try {
      await migrateReal(pool);
      const { store, evidenceStore, adapter } = await harness(pool);
      const id = `crash-${point.toLowerCase()}-${suffix()}`;
      const intent = baseIntent({ id, simulation: { mode } });

      if (point === CRASH_POINTS.AFTER_AUTHORITY_RESERVATION) {
        await assert.rejects(() => dispatchExternalEffect({ store, evidenceStore, adapter, effectIntent: intent, crashAt: point }), CrashInjected);
        // Nothing durable exists at all -- "crash before any reservation attempt" from a recovery
        // point of view is simply: there is nothing to recover. A fresh dispatch attempt is safe.
        const nothing = await store.findActiveByBusinessKey(intent.businessKey);
        assert.equal(nothing, null);
        const fresh = await dispatchExternalEffect({ store, evidenceStore, adapter, effectIntent: intent });
        assert.equal(fresh.status, 'PROVIDER_ACCEPTED');
        assert.equal(adapter.dispatchCallCount, 1);
        return;
      }

      await assert.rejects(() => dispatchExternalEffect({ store, evidenceStore, adapter, effectIntent: intent, crashAt: point }), CrashInjected);
      const executionId = `exec-${id}`;
      const afterCrash = await store.getById(executionId);
      assert(afterCrash, 'the durable execution object must exist after this crash point');

      // "Restart": a fresh adapter instance standing in for a restarted process's clean memory.
      const freshAdapter = new NullSinkV2Adapter({ pool });
      const recovered = await recoverOneExecution({ store, evidenceStore, adapter: freshAdapter, execution: afterCrash });

      if (expectFinalStatus) {
        assert.equal(recovered.status, expectFinalStatus);
      } else {
        // Where recovery must reconcile, the null sink's ledger has nothing recorded for
        // AFTER_DISPATCHING_DURABLE / IMMEDIATELY_BEFORE_PROVIDER_CALL (dispatch() itself never
        // ran), so reconciliation proves non-submission -- safe to finalize as not-submitted.
        assert.equal(recovered.action, RECOVERY_ACTIONS.ABORTED_BEFORE_DISPATCH);
        const finalExecution = await store.getById(executionId);
        assert.equal(finalExecution.status, 'RECONCILED_NOT_SUBMITTED');
      }
      assert.equal(freshAdapter.dispatchCallCount, expectDispatchCallsAfterRecovery, 'recovery must NEVER call adapter.dispatch() again');
    } finally { await pool.end(); }
  });
}

test('CHECKPOINT C KILL-SHOT: crash immediately after the provider accepts but before local receipt persistence -- recovery must finalize from evidence, never redispatch', { skip: !realPostgresUrl }, async () => {
  const pool = new Pool({ connectionString: realPostgresUrl, max: 5 });
  try {
    await migrateReal(pool);
    const { store, evidenceStore, adapter } = await harness(pool);
    const id = `checkpoint-c-${suffix()}`;
    const intent = baseIntent({ id, simulation: { mode: SIMULATION_MODES.DEFINITE_SUCCESS } });

    await assert.rejects(
      () => dispatchExternalEffect({ store, evidenceStore, adapter, effectIntent: intent, crashAt: CRASH_POINTS.IMMEDIATELY_AFTER_PROVIDER_ACCEPTS }),
      CrashInjected
    );

    const executionId = `exec-${id}`;
    const afterCrash = await store.getById(executionId);
    assert.equal(afterCrash.status, 'DISPATCHING', 'sanity: the crash truly landed before the local receipt/evidence write and before the authorization-binding transition');
    const evidenceBeforeRecovery = await evidenceStore.listForExecution(executionId);
    assert.equal(evidenceBeforeRecovery.length, 0, 'sanity: no local evidence was persisted before the crash');

    // The provider truly did accept the request (the null-sink-v2 ledger row was written
    // before dispatch() returned to the caller, exactly as writing to Gmail's own mailbox
    // would survive our process crashing) -- only OUR local receipt write was lost.
    const providerLedger = await pool.query('SELECT * FROM omnia_v9_null_provider_ledger WHERE business_identity=$1', [intent.businessKey]);
    assert.equal(providerLedger.rows[0].outcome, 'ACCEPTED', 'sanity: the provider truly processed this request before our process died');

    const freshAdapter = new NullSinkV2Adapter({ pool });
    const recovered = await recoverOneExecution({ store, evidenceStore, adapter: freshAdapter, execution: afterCrash });

    assert.equal(freshAdapter.dispatchCallCount, 0, 'MISSION-CRITICAL: recovery must NEVER call dispatch() again once DISPATCHING was durable and the provider may have already acted');
    assert.equal(recovered.action, RECOVERY_ACTIONS.FINALIZE_CONFIRMED);
    // No local evidence survived the crash, so this is legitimately resolved through
    // provider reconciliation, not a direct local observation -- RECONCILED_ACCEPTED,
    // not PROVIDER_ACCEPTED. Keeping these two terminal states distinct (rather than
    // collapsing them) is itself the epistemic-honesty property this mission requires:
    // "locally observed" and "reconciled after the fact" are different claims.
    assert.equal(recovered.status, 'RECONCILED_ACCEPTED');

    const finalExecution = await store.getById(executionId);
    assert.equal(finalExecution.status, 'RECONCILED_ACCEPTED');

    // Exactly one logical external effect occurred, proven by the provider's own ledger having
    // exactly one row for this business key, and the recovery path attaching evidence rather
    // than re-triggering dispatch.
    const ledgerCount = await pool.query('SELECT count(*)::int AS n FROM omnia_v9_null_provider_ledger WHERE business_identity=$1', [intent.businessKey]);
    assert.equal(ledgerCount.rows[0].n, 1, 'exactly one external effect, never a duplicate');
  } finally { await pool.end(); }
});

test('checkpoint C, response-lost variant: dispatch() throws after the provider truly accepted -- lands in RESULT_UNCERTAIN, recovery reconciles to PROVIDER_ACCEPTED-equivalent without ever redispatching', { skip: !realPostgresUrl }, async () => {
  const pool = new Pool({ connectionString: realPostgresUrl, max: 5 });
  try {
    await migrateReal(pool);
    const { store, evidenceStore, adapter } = await harness(pool);
    const id = `resp-lost-success-${suffix()}`;
    const intent = baseIntent({ id, simulation: { mode: SIMULATION_MODES.RESPONSE_LOST_AFTER_SUCCESS } });

    const result = await dispatchExternalEffect({ store, evidenceStore, adapter, effectIntent: intent });
    assert.equal(result.status, 'RESULT_UNCERTAIN');
    assert.equal(adapter.dispatchCallCount, 1);

    const freshAdapter = new NullSinkV2Adapter({ pool });
    const execution = await store.getById(`exec-${id}`);
    const recovered = await recoverOneExecution({ store, evidenceStore, adapter: freshAdapter, execution });

    assert.equal(freshAdapter.dispatchCallCount, 0, 'reconciliation must never call dispatch()');
    assert.equal(recovered.action, RECOVERY_ACTIONS.FINALIZE_CONFIRMED);
    assert.equal(recovered.status, 'RECONCILED_ACCEPTED');
  } finally { await pool.end(); }
});

test('response-lost-after-failure: reconciliation finds the true rejection, never treats it as accepted', { skip: !realPostgresUrl }, async () => {
  const pool = new Pool({ connectionString: realPostgresUrl, max: 5 });
  try {
    await migrateReal(pool);
    const { store, evidenceStore, adapter } = await harness(pool);
    const id = `resp-lost-failure-${suffix()}`;
    const intent = baseIntent({ id, simulation: { mode: SIMULATION_MODES.RESPONSE_LOST_AFTER_FAILURE } });
    await dispatchExternalEffect({ store, evidenceStore, adapter, effectIntent: intent });
    const execution = await store.getById(`exec-${id}`);
    const freshAdapter = new NullSinkV2Adapter({ pool });
    const recovered = await recoverOneExecution({ store, evidenceStore, adapter: freshAdapter, execution });
    assert.equal(recovered.action, RECOVERY_ACTIONS.FINALIZE_REJECTED);
    assert.equal(recovered.status, 'RECONCILED_REJECTED');
    assert.equal(freshAdapter.dispatchCallCount, 0);
  } finally { await pool.end(); }
});

test('provider never saw the request (proven NOT_FOUND): reconciliation finalizes as RECONCILED_NOT_SUBMITTED and frees the business key for a brand-new attempt', { skip: !realPostgresUrl }, async () => {
  const pool = new Pool({ connectionString: realPostgresUrl, max: 5 });
  try {
    await migrateReal(pool);
    const { store, evidenceStore, adapter } = await harness(pool);
    const id = `not-found-${suffix()}`;
    const intent = baseIntent({ id, simulation: { mode: SIMULATION_MODES.TIMEOUT_BEFORE_PROVIDER_RECEIPT } });
    const result = await dispatchExternalEffect({ store, evidenceStore, adapter, effectIntent: intent });
    assert.equal(result.status, 'RESULT_UNCERTAIN');

    const execution = await store.getById(`exec-${id}`);
    const freshAdapter = new NullSinkV2Adapter({ pool });
    const recovered = await recoverOneExecution({ store, evidenceStore, adapter: freshAdapter, execution });
    assert.equal(recovered.action, RECOVERY_ACTIONS.ABORTED_BEFORE_DISPATCH);
    assert.equal(recovered.status, 'RECONCILED_NOT_SUBMITTED');

    // Business key is now free: a brand-new execution attempt is legal (a real "retry"), because
    // non-submission was PROVEN, not merely assumed.
    const retryIntent = { ...baseIntent({ id: `${id}-attempt2`, simulation: { mode: SIMULATION_MODES.DEFINITE_SUCCESS } }), businessKey: intent.businessKey, providerEffectIdentity: `${intent.providerEffectIdentity}-attempt2` };
    const retryResult = await dispatchExternalEffect({ store, evidenceStore, adapter: freshAdapter, effectIntent: retryIntent });
    assert.equal(retryResult.status, 'PROVIDER_ACCEPTED');
  } finally { await pool.end(); }
});

test('while the ORIGINAL non-terminal execution for a business key is still unresolved, a second PREPARE for the same business key is refused by the database', { skip: !realPostgresUrl }, async () => {
  const pool = new Pool({ connectionString: realPostgresUrl, max: 5 });
  try {
    await migrateReal(pool);
    const { store, evidenceStore, adapter } = await harness(pool);
    const id = `double-active-${suffix()}`;
    const intent = baseIntent({ id, simulation: { mode: SIMULATION_MODES.DEFINITE_SUCCESS } });
    await store.prepare(intent);
    await assert.rejects(
      () => store.prepare({ ...baseIntent({ id: `${id}-dup`, simulation: {} }), businessKey: intent.businessKey }),
      error => error.code === 'BUSINESS_KEY_ALREADY_ACTIVE'
    );
  } finally { await pool.end(); }
});

test('ambiguous/contradictory reconciliation fails closed to OWNER_REVIEW_REQUIRED and is never auto-resolved by another recovery pass', { skip: !realPostgresUrl }, async () => {
  const pool = new Pool({ connectionString: realPostgresUrl, max: 5 });
  try {
    await migrateReal(pool);
    const { store, evidenceStore, adapter } = await harness(pool);
    const id = `ambiguous-${suffix()}`;
    const intent = baseIntent({ id, simulation: { mode: SIMULATION_MODES.AMBIGUOUS_RECONCILIATION } });
    const result = await dispatchExternalEffect({ store, evidenceStore, adapter, effectIntent: intent });
    assert.equal(result.status, 'RESULT_UNCERTAIN');

    let execution = await store.getById(`exec-${id}`);
    const recovered = await recoverOneExecution({ store, evidenceStore, adapter, execution });
    assert.equal(recovered.action, RECOVERY_ACTIONS.OWNER_REVIEW_REQUIRED);
    assert.equal(recovered.status, 'OWNER_REVIEW_REQUIRED');

    execution = await store.getById(`exec-${id}`);
    const secondPass = await recoverOneExecution({ store, evidenceStore, adapter, execution });
    assert.equal(secondPass.action, RECOVERY_ACTIONS.OWNER_REVIEW_REQUIRED, 'must stay parked for owner review, never auto-resolve on a later pass');
    assert.equal(adapter.dispatchCallCount, 1, 'exactly the one original dispatch attempt -- no redispatch across either recovery pass');
  } finally { await pool.end(); }
});

test('delayed reconciliation: not-yet-visible evidence loops back to RESULT_UNCERTAIN (RECONCILE_PROVIDER), only resolves once the provider-side delay elapses', { skip: !realPostgresUrl }, async () => {
  const pool = new Pool({ connectionString: realPostgresUrl, max: 5 });
  try {
    await migrateReal(pool);
    const { store, evidenceStore, adapter } = await harness(pool);
    const id = `delayed-${suffix()}`;
    const intent = baseIntent({ id, simulation: { mode: SIMULATION_MODES.DELAYED_RECONCILIATION, revealDelayMs: 150 } });
    const result = await dispatchExternalEffect({ store, evidenceStore, adapter, effectIntent: intent });
    assert.equal(result.status, 'RESULT_UNCERTAIN');

    let execution = await store.getById(`exec-${id}`);
    const firstPass = await recoverOneExecution({ store, evidenceStore, adapter, execution });
    assert.equal(firstPass.action, RECOVERY_ACTIONS.RECONCILE_PROVIDER);
    assert.equal(firstPass.status, 'RESULT_UNCERTAIN');

    await new Promise(resolve => setTimeout(resolve, 200));
    execution = await store.getById(`exec-${id}`);
    const secondPass = await recoverOneExecution({ store, evidenceStore, adapter, execution });
    assert.equal(secondPass.action, RECOVERY_ACTIONS.FINALIZE_CONFIRMED);
    assert.equal(secondPass.status, 'RECONCILED_ACCEPTED');
    assert.equal(adapter.dispatchCallCount, 1, 'the provider was only ever actually dispatched to once, regardless of how many recovery passes it took to observe that');
  } finally { await pool.end(); }
});

test('recoverUnresolvedExecutions batch worker resolves a mix of unresolved executions in one pass', { skip: !realPostgresUrl }, async () => {
  const pool = new Pool({ connectionString: realPostgresUrl, max: 5 });
  try {
    await migrateReal(pool);
    const { store, evidenceStore, adapter } = await harness(pool);
    const batchId = suffix();
    const modes = [SIMULATION_MODES.DEFINITE_SUCCESS, SIMULATION_MODES.DEFINITE_FAILURE, SIMULATION_MODES.TIMEOUT_BEFORE_PROVIDER_RECEIPT];
    for (const [index, mode] of modes.entries()) {
      const id = `batch-${batchId}-${index}`;
      const intent = baseIntent({ id, simulation: { mode } });
      if (mode === SIMULATION_MODES.TIMEOUT_BEFORE_PROVIDER_RECEIPT) {
        await dispatchExternalEffect({ store, evidenceStore, adapter, effectIntent: intent });
      } else {
        // Leave these mid-flight (DISPATCHING durable, no local evidence, no store.transition to final state)
        // by crashing right before the provider call -- exactly like a batch of processes that all died.
        await assert.rejects(() => dispatchExternalEffect({ store, evidenceStore, adapter, effectIntent: intent, crashAt: 'IMMEDIATELY_BEFORE_PROVIDER_CALL' }));
      }
    }
    // A high limit (not just "3") is deliberate: this test's own database may carry
    // unrelated unresolved rows left behind by other tests/dev iterations against a
    // long-lived local database; a disposable per-run database (the CI/final-regression
    // convention for this suite) would never have this pollution, but a generous limit
    // keeps the assertion about THIS batch robust either way.
    const results = await recoverUnresolvedExecutions({ store, adapter, limit: 500 });
    const relevant = results.filter(r => r.executionId && r.executionId.startsWith(`exec-batch-${batchId}`));
    assert.equal(relevant.length, 3, 'all three unresolved executions from this batch were claimed and resolved in one pass');
    assert(relevant.every(r => r.action === RECOVERY_ACTIONS.ABORTED_BEFORE_DISPATCH), 'none of these ever reached the provider, so all three resolve as proven non-submissions');
  } finally { await pool.end(); }
});
