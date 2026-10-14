import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { Pool } from 'pg';
import { sealTokens } from '../src/gmail.mjs';
import { GmailEffectAdapter, generateMessageId } from '../src/omnia-v9/integrations/providers/gmail-effect-adapter.mjs';
import { ExternalEffectExecutionStore } from '../src/omnia-v9/integrations/external-effect-execution-store.mjs';
import { ExternalEffectEvidenceStore } from '../src/omnia-v9/integrations/external-effect-evidence-store.mjs';
import { ADAPTER_OUTCOMES } from '../src/omnia-v9/integrations/external-effect-adapter.mjs';
import { dispatchExternalEffect, CRASH_POINTS, CrashInjected } from '../src/omnia-v9/integrations/external-effect-dispatcher.mjs';
import { recoverOneExecution, recoverUnresolvedExecutions, RECOVERY_ACTIONS } from '../src/omnia-v9/integrations/external-effect-recovery.mjs';
import { createFakeGmailTransport, FAKE_GMAIL_MODES } from './helpers/fake-gmail-transport.mjs';
import { validRoutePackage, ALLOW_CONSENT } from './helpers/outbound-route-package.mjs';

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
const MESSAGE_ID_DOMAIN = 'sovereign-controlled-test.example';

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

// The package supplier builds a complete package for the exact message. gmail-api is not an admitted route, so the refusal that
// remains is provider-not-smtp-relay: every dispatch is REJECTED before the counter, the credential and the transport.
function makeAdapter(transport) {
  return new GmailEffectAdapter({
    cfg: { ...CFG_BASE, fetchImpl: transport.fetchImpl },
    account: freshAccount(),
    encryptionKey: ENCRYPTION_KEY,
    messageIdDomain: MESSAGE_ID_DOMAIN,
    fromAddress: 'sender@sovereign-controlled-test.example',
    outboundAuthorizationFn: ({ message, account }) => validRoutePackage({ account, message }),
    outboundConsentVerifier: ALLOW_CONSENT
  });
}

// The dispatcher reports only the classification, so the refusal reason is read from what adapter.dispatch returned for each call.
function recordDispatchOutcomes(adapter) {
  const outcomes = [];
  const dispatch = adapter.dispatch.bind(adapter);
  adapter.dispatch = async preparedEffect => {
    const outcome = await dispatch(preparedEffect);
    outcomes.push(outcome);
    return outcome;
  };
  return outcomes;
}

function assertRouteRefused(outcome, transport) {
  assert.equal(outcome.classification, ADAPTER_OUTCOMES.REJECTED);
  assert.equal(outcome.dispatchError, 'outbound-authorization-refused');
  assert.deepEqual(outcome.outboundRefusal.reasonCodes, ['provider-not-smtp-relay']);
  assert.equal(outcome.evidence, null, 'a refused dispatch produces no evidence');
  assert.equal(transport.mailbox.length, 0, 'a refused dispatch never reaches the provider');
}

// Provider-side state only: the copy a real Gmail would hold after an accepted send. The adapter never writes it. It is seeded only
// where a scenario is about reconciling a copy the provider already holds, because the gated route can never accept a send itself.
function seedProviderCopy(transport, intent) {
  const { to, subject, body } = intent.effectPayload;
  transport.injectMailboxEntry({ threadId: `gmail-thread-seed-${intent.executionId}`, headers: { 'message-id': intent.providerEffectIdentity, to, subject }, body });
}

// A crash injected before the provider call leaves the durable execution in DISPATCHING with no local evidence and no provider send,
// which is the state recovery must reconcile. It is the only way to reach an unresolved execution without an ACCEPTED dispatch.
async function crashBeforeProviderCall({ store, evidenceStore, adapter, intent }) {
  await assert.rejects(
    () => dispatchAuthorized({ store, evidenceStore, adapter, effectIntent: intent, crashAt: CRASH_POINTS.IMMEDIATELY_BEFORE_PROVIDER_CALL }),
    CrashInjected
  );
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

test('Gmail adapter through the real dispatcher: a definite-success send is REFUSED -- gmail-api is not an admitted route, so the execution ends PROVIDER_REJECTED with zero provider sends', { skip: !realPostgresUrl }, async () => {
  const pool = new Pool({ connectionString: realPostgresUrl, max: 5 });
  try {
    await migrateReal(pool);
    const store = new ExternalEffectExecutionStore({ pool });
    const evidenceStore = new ExternalEffectEvidenceStore({ pool });
    const transport = createFakeGmailTransport({ mode: FAKE_GMAIL_MODES.DEFINITE_SUCCESS });
    const adapter = makeAdapter(transport);
    const outcomes = recordDispatchOutcomes(adapter);
    const id = `gmail-happy-${suffix()}`;
    const intent = baseIntent({ id });
    const result = await dispatchAuthorized({ store, evidenceStore, adapter, effectIntent: intent });
    assert.equal(result.status, 'PROVIDER_REJECTED');
    assert.equal(result.classification, ADAPTER_OUTCOMES.REJECTED);
    assert.equal(outcomes.length, 1, 'the dispatcher reached adapter.dispatch exactly once');
    assertRouteRefused(outcomes[0], transport);
    assert.equal(adapter.dispatchCallCount, 0, 'the refusal happens before the dispatch counter');
    assert.equal((await evidenceStore.findByType(intent.executionId, 'DISPATCH_RESPONSE')).length, 0, 'a refused dispatch writes no dispatch-response evidence');
    const durable = await store.getById(intent.executionId);
    assert.equal(durable.status, 'PROVIDER_REJECTED');
  } finally { await pool.end(); }
});

test('Gmail adapter checkpoint-C shape (route refused): the crash is injected before the refused provider call, a provider-side mailbox copy is seeded via injectMailboxEntry to stand in for the accepted send, and recovery finalizes from reconciliation -- never resends', { skip: !realPostgresUrl }, async () => {
  const pool = new Pool({ connectionString: realPostgresUrl, max: 5 });
  try {
    await migrateReal(pool);
    const store = new ExternalEffectExecutionStore({ pool });
    const evidenceStore = new ExternalEffectEvidenceStore({ pool });
    const transport = createFakeGmailTransport({ mode: FAKE_GMAIL_MODES.DEFINITE_SUCCESS });
    const adapter = makeAdapter(transport);
    const id = `gmail-checkpoint-c-${suffix()}`;
    const intent = baseIntent({ id });

    await crashBeforeProviderCall({ store, evidenceStore, adapter, intent });
    assert.equal(adapter.dispatchCallCount, 0, 'sanity: the crash fired before any provider call was counted');
    assert.equal(transport.mailbox.length, 0, 'sanity: nothing reached the (fake) Gmail mailbox through the gated route');

    // The copy a real Gmail would hold had the send been accepted before the crash. Seeded on the provider side only.
    seedProviderCopy(transport, intent);
    assert.equal(transport.mailbox.length, 1, 'sanity: the seeded provider-side copy is present for reconciliation');

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

test('Gmail adapter: zero search matches remain uncertain and never free the business key for a retry (route refused: the crash is injected before the provider call, so the execution is left DISPATCHING; no provider copy is seeded, so reconciliation finds zero matches)', { skip: !realPostgresUrl }, async () => {
  const pool = new Pool({ connectionString: realPostgresUrl, max: 5 });
  try {
    await migrateReal(pool);
    const store = new ExternalEffectExecutionStore({ pool });
    const evidenceStore = new ExternalEffectEvidenceStore({ pool });
    const transport = createFakeGmailTransport({ mode: FAKE_GMAIL_MODES.TIMEOUT_BEFORE_REQUEST_RECEIVED });
    const adapter = makeAdapter(transport);
    const id = `gmail-zero-match-${suffix()}`;
    const intent = baseIntent({ id });
    await crashBeforeProviderCall({ store, evidenceStore, adapter, intent });
    assert.equal((await store.getById(`exec-${id}`)).status, 'DISPATCHING');
    assert.equal(transport.mailbox.length, 0, 'sanity: no provider copy exists, so the reconciliation search must return zero matches');

    const execution = await store.getById(`exec-${id}`);
    const recovered = await recoverOneExecution({ store, evidenceStore, adapter, execution });
    assert.equal(recovered.action, RECOVERY_ACTIONS.RECONCILE_PROVIDER);
    assert.equal(recovered.status, 'RESULT_UNCERTAIN');
    const stillActive = await store.findActiveByBusinessKey(intent.businessKey);
    assert.equal(stillActive.executionId, intent.executionId, 'uncertainty must retain the business-key lock');
    assert.equal(adapter.dispatchCallCount, 0, 'neither the refused attempt nor recovery reached the provider -- recovery itself never dispatches');
  } finally { await pool.end(); }
});

test('Gmail adapter: a second recovery worker cannot claim an execution the first is holding (route refused: the crash is injected before the provider call, so the execution is left DISPATCHING; no provider copy is seeded)', { skip: !realPostgresUrl }, async () => {
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
    await crashBeforeProviderCall({ store, evidenceStore, adapter, intent });
    const executionId = `exec-${id}`;
    assert.equal((await store.getById(executionId)).status, 'DISPATCHING', 'the held execution must be unresolved for the claim to mean anything');

    const unresolved = ['PREPARED', 'DISPATCHING', 'RESULT_UNCERTAIN', 'RECONCILING'];
    let signalClaimed;
    const claimTaken = new Promise(resolve => { signalClaimed = resolve; });
    let releaseHolder;
    const holderMayFinish = new Promise(resolve => { releaseHolder = resolve; });

    const holder = store.withTransaction(async scopedStore => {
      // Signalled in finally, so a failed claim fails the test instead of leaving it waiting on claimTaken forever.
      let claimed = [];
      try {
        claimed = await scopedStore.claimUnresolvedForRecovery({ statuses: unresolved, limit: 1000 });
      } finally {
        signalClaimed(claimed.map(row => row.executionId));
      }
      // The lock lives until this transaction commits, which is what the second
      // worker below has to run into.
      await holderMayFinish;
      return claimed;
    });

    const heldIds = await claimTaken;
    const workerB = makeAdapter(transport);
    let resultsB;
    try {
      // Inside the try: a failed claim assertion must still release the holder, or the cleanup deadlocks on the parked transaction.
      assert.ok(heldIds.includes(executionId), 'the first worker did not claim the execution it was supposed to hold');
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
    assert.equal(finalExecution.status, 'DISPATCHING', 'the held row is untouched: the second worker neither claimed nor transitioned it');
    // The invariant the whole test exists for. Whatever a worker claims, a
    // recovery sweep must never send anything.
    //
    // Counted on the recovery worker only. `adapter` above performed the
    // crashed-before-call attempt, which never reached the provider, so its
    // count is 0 by design and folding it in would make this assertion pass or
    // fail for the wrong reason.
    assert.equal(workerB.dispatchCallCount, 0, 'a recovery worker called Gmail send');
    assert.equal(adapter.dispatchCallCount, 0, 'the crashed attempt was injected before the provider call, so no provider dispatch happened');
  } finally { await pool.end(); }
});
