import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { Pool } from 'pg';
import { sealTokens } from '../src/gmail.mjs';
import { GmailEffectAdapter, generateMessageId } from '../src/omnia-v9/integrations/providers/gmail-effect-adapter.mjs';
import { ExternalEffectExecutionStore } from '../src/omnia-v9/integrations/external-effect-execution-store.mjs';
import { ExternalEffectEvidenceStore } from '../src/omnia-v9/integrations/external-effect-evidence-store.mjs';
import { dispatchExternalEffect, CRASH_POINTS, CrashInjected } from '../src/omnia-v9/integrations/external-effect-dispatcher.mjs';
import { recoverOneExecution, recoverUnresolvedExecutions, RECOVERY_ACTIONS } from '../src/omnia-v9/integrations/external-effect-recovery.mjs';
import { createFakeGmailTransport, FAKE_GMAIL_MODES } from './helpers/fake-gmail-transport.mjs';

/**
 * Proves the Gmail adapter is a genuine drop-in implementation of the
 * SAME provider-neutral contract null-sink-v2.mjs implements, by running
 * it through the exact same real dispatcher, real recovery worker, and
 * real PostgreSQL-backed execution store built in Mission 6 -- zero
 * Gmail-specific code anywhere in the dispatcher or recovery worker.
 */

const realPostgresUrl = process.env.OMNIA_V9_TEST_DATABASE_URL || '';
const ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
const CFG_BASE = { clientId: 'fake-client', clientSecret: 'fake-secret', redirectUri: 'https://example.test/callback' };
const MESSAGE_ID_DOMAIN = 'uberbond-controlled-test.example';

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

function freshAccount() {
  const tokens = { access_token: 'fresh-token', refresh_token: 'fresh-refresh', expires_at: Date.now() + 3600_000 };
  return { tokens: sealTokens(tokens, ENCRYPTION_KEY) };
}

function makeAdapter(transport) {
  return new GmailEffectAdapter({
    cfg: { ...CFG_BASE, fetchImpl: transport.fetchImpl },
    account: freshAccount(),
    encryptionKey: ENCRYPTION_KEY,
    messageIdDomain: MESSAGE_ID_DOMAIN,
    fromAddress: 'sender@uberbond-controlled-test.example'
  });
}

function baseIntent({ id, effectPayload }) {
  return {
    executionId: `exec-${id}`, actionIntentDigest: 'a'.repeat(64), authorizationDigest: 'auth',
    tenantId: 'tenant-gmail-preflight', operation: 'op', resource: `res:${id}`, businessKey: `bk-${id}`,
    provider: 'gmail', providerEffectIdentity: generateMessageId(`exec-${id}`, MESSAGE_ID_DOMAIN),
    approvalId: 'ap-gmail-preflight', constitutionDigest: 'cd', policyDigest: 'pd', consequenceClass: 'COMMUNICATE_EXTERNAL',
    effectPayload: effectPayload || { to: 'recipient@example.test', subject: 'OMNIA V9 Gmail dispatch test', body: 'Automated test body.' }
  };
}

function testOnlyFinalAdmission({ preparedEffect, effectIntent }) {
  return {
    decision: 'ALLOW',
    authoritative: true,
    enforced: true,
    executionId: effectIntent.executionId,
    businessKey: effectIntent.businessKey,
    actionIntentDigest: effectIntent.actionIntentDigest,
    authorizationDigest: effectIntent.authorizationDigest,
    providerEffectIdentity: effectIntent.providerEffectIdentity,
    approvalId: effectIntent.approvalId,
    policyDigest: effectIntent.policyDigest,
    constitutionDigest: effectIntent.constitutionDigest,
    argumentsDigest: preparedEffect.argumentsDigest
  };
}

function dispatchAuthorized(args) {
  return dispatchExternalEffect({ ...args, finalAdmissionCheck: testOnlyFinalAdmission });
}

test('Gmail adapter through the real dispatcher: definite success reaches PROVIDER_ACCEPTED', { skip: !realPostgresUrl }, async () => {
  const pool = new Pool({ connectionString: realPostgresUrl, max: 5 });
  try {
    await migrateReal(pool);
    const store = new ExternalEffectExecutionStore({ pool });
    const evidenceStore = new ExternalEffectEvidenceStore({ pool });
    const transport = createFakeGmailTransport({ mode: FAKE_GMAIL_MODES.DEFINITE_SUCCESS });
    const adapter = makeAdapter(transport);
    const id = `gmail-happy-${suffix()}`;
    const result = await dispatchAuthorized({ store, evidenceStore, adapter, effectIntent: baseIntent({ id }) });
    assert.equal(result.status, 'PROVIDER_ACCEPTED');
    assert.equal(adapter.dispatchCallCount, 1);
  } finally { await pool.end(); }
});

test('Gmail adapter checkpoint-C shape: crash immediately after Gmail accepts but before local evidence -- recovery finalizes from Gmail reconciliation, never resends', { skip: !realPostgresUrl }, async () => {
  const pool = new Pool({ connectionString: realPostgresUrl, max: 5 });
  try {
    await migrateReal(pool);
    const store = new ExternalEffectExecutionStore({ pool });
    const evidenceStore = new ExternalEffectEvidenceStore({ pool });
    const transport = createFakeGmailTransport({ mode: FAKE_GMAIL_MODES.DEFINITE_SUCCESS });
    const adapter = makeAdapter(transport);
    const id = `gmail-checkpoint-c-${suffix()}`;
    const intent = baseIntent({ id });

    await assert.rejects(
      () => dispatchAuthorized({ store, evidenceStore, adapter, effectIntent: intent, crashAt: CRASH_POINTS.IMMEDIATELY_AFTER_PROVIDER_ACCEPTS }),
      CrashInjected
    );
    assert.equal(transport.mailbox.length, 1, 'sanity: Gmail (fake) truly received and stored the message before the crash');

    const executionId = `exec-${id}`;
    const afterCrash = await store.getById(executionId);
    assert.equal(afterCrash.status, 'DISPATCHING');

    const freshTransportSharedMailbox = transport; // "process restart" reuses the same external Gmail mailbox, just like a real crash would
    const freshAdapter = makeAdapter(freshTransportSharedMailbox);
    const recovered = await recoverOneExecution({ store, evidenceStore, adapter: freshAdapter, execution: afterCrash });

    assert.equal(freshAdapter.dispatchCallCount, 0, 'MISSION-CRITICAL: recovery must never call Gmail send again');
    assert.equal(recovered.action, RECOVERY_ACTIONS.FINALIZE_CONFIRMED);
    assert.equal(recovered.status, 'RECONCILED_ACCEPTED');
    assert.equal(transport.mailbox.length, 1, 'exactly one message ever existed in the (fake) Gmail mailbox');
  } finally { await pool.end(); }
});

test('Gmail adapter: zero search matches remain uncertain and never free the business key for a retry', { skip: !realPostgresUrl }, async () => {
  const pool = new Pool({ connectionString: realPostgresUrl, max: 5 });
  try {
    await migrateReal(pool);
    const store = new ExternalEffectExecutionStore({ pool });
    const evidenceStore = new ExternalEffectEvidenceStore({ pool });
    const transport = createFakeGmailTransport({ mode: FAKE_GMAIL_MODES.TIMEOUT_BEFORE_REQUEST_RECEIVED });
    const adapter = makeAdapter(transport);
    const id = `gmail-zero-match-${suffix()}`;
    const intent = baseIntent({ id });
    const result = await dispatchAuthorized({ store, evidenceStore, adapter, effectIntent: intent });
    assert.equal(result.status, 'RESULT_UNCERTAIN');

    const execution = await store.getById(`exec-${id}`);
    const recovered = await recoverOneExecution({ store, evidenceStore, adapter, execution });
    assert.equal(recovered.action, RECOVERY_ACTIONS.RECONCILE_PROVIDER);
    assert.equal(recovered.status, 'RESULT_UNCERTAIN');
    const stillActive = await store.findActiveByBusinessKey(intent.businessKey);
    assert.equal(stillActive.executionId, intent.executionId, 'uncertainty must retain the business-key lock');
    assert.equal(adapter.dispatchCallCount, 1, 'the ORIGINAL attempt counted once -- recovery itself never dispatches again');
  } finally { await pool.end(); }
});

test('Gmail adapter: a second recovery worker cannot claim an execution the first is holding', { skip: !realPostgresUrl }, async () => {
  // This used to start two workers with Promise.all and assert that exactly one
  // of them claimed the row. That is not a test of the locking primitive, it is
  // a test of whether the two transactions happened to overlap -- and on a fast
  // disposable database they stopped overlapping, so both workers claimed the
  // row and the assertion failed.
  //
  // Both claims were legitimate. RESULT_UNCERTAIN is itself an unresolved
  // status, so once the first worker has committed the row back to
  // RESULT_UNCERTAIN it is a valid candidate again. Nothing was double-dispatched
  // -- the adapter call count below is the invariant that actually matters --
  // but "exactly one worker claims it" was never true of sequential runs, and a
  // concurrency test that depends on losing a race proves nothing on the days it
  // wins one.
  //
  // So the overlap is made real instead of hoped for: the first worker's
  // transaction is held open, and the second must find nothing to claim while it
  // is. That is FOR UPDATE SKIP LOCKED being tested rather than assumed.
  // lock_timeout, so that a regression fails instead of hanging.
  //
  // The second worker below must find nothing to claim. If FOR UPDATE SKIP
  // LOCKED were ever dropped from the claim query it would instead wait on the
  // held row -- forever, since the holder waits for it -- and the suite would
  // stall rather than report. Verified in both directions: with SKIP LOCKED
  // removed this test fails on the timeout; with it present nothing waits.
  const pool = new Pool({ connectionString: realPostgresUrl, max: 10 });
  // Set per connection rather than through the `options` connection parameter,
  // which was tried first and silently did nothing: the suite still stalled with
  // SKIP LOCKED removed instead of failing. A timeout that is not actually in
  // force is worse than none, because it looks like protection.
  pool.on('connect', client => { client.query("SET lock_timeout = '5s'; SET statement_timeout = '15s'").catch(() => {}); });
  try {
    await migrateReal(pool);
    const store = new ExternalEffectExecutionStore({ pool });
    const evidenceStore = new ExternalEffectEvidenceStore({ pool });
    const transport = createFakeGmailTransport({ mode: FAKE_GMAIL_MODES.TIMEOUT_BEFORE_REQUEST_RECEIVED });
    const adapter = makeAdapter(transport);
    const id = `gmail-race-${suffix()}`;
    const intent = baseIntent({ id });
    await dispatchAuthorized({ store, evidenceStore, adapter, effectIntent: intent });
    const executionId = `exec-${id}`;

    const unresolved = ['PREPARED', 'DISPATCHING', 'RESULT_UNCERTAIN', 'RECONCILING'];
    let signalClaimed;
    const claimTaken = new Promise(resolve => { signalClaimed = resolve; });
    let releaseHolder;
    const holderMayFinish = new Promise(resolve => { releaseHolder = resolve; });

    const holder = store.withTransaction(async scopedStore => {
      const claimed = await scopedStore.claimUnresolvedForRecovery({ statuses: unresolved, limit: 1000 });
      signalClaimed(claimed.map(row => row.executionId));
      // The lock lives until this transaction commits, which is what the second
      // worker below has to run into.
      await holderMayFinish;
      return claimed;
    });

    const heldIds = await claimTaken;
    assert.ok(heldIds.includes(executionId), 'the first worker did not claim the execution it was supposed to hold');

    const workerB = makeAdapter(transport);
    let resultsB;
    try {
      resultsB = await recoverUnresolvedExecutions({ store, adapter: workerB, limit: 1000 });
    } finally {
      // Released here, not after the assertion.
      //
      // The holder's transaction is parked on this promise, and pool.end() in
      // the outer finally waits for that client. So anything that leaves the
      // holder parked -- a failed assertion, or the second worker erroring
      // because it waited on a lock it should have skipped -- deadlocks the
      // cleanup and the suite stalls instead of reporting. That is exactly what
      // happened while proving this test can fail.
      releaseHolder();
      await holder.catch(() => { /* the assertion below is the finding, not this */ });
    }

    assert.equal(resultsB.some(row => row.executionId === executionId), false,
      'a second worker claimed a row the first was still holding -- FOR UPDATE SKIP LOCKED is not partitioning the unresolved set');

    const finalExecution = await store.getById(executionId);
    assert.equal(finalExecution.status, 'RESULT_UNCERTAIN');
    // The invariant the whole test exists for. Whatever a worker claims, a
    // recovery sweep must never send anything.
    //
    // Counted on the recovery worker only. `adapter` above performed the
    // original authorized dispatch, so its count is 1 by design, and folding it
    // in would make this assertion pass or fail for the wrong reason.
    assert.equal(workerB.dispatchCallCount, 0, 'a recovery worker called Gmail send');
    assert.equal(adapter.dispatchCallCount, 1, 'the original authorized dispatch should have happened exactly once');
  } finally { await pool.end(); }
});
