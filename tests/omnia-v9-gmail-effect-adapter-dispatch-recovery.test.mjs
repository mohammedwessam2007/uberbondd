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
    simulation: { effectPayload: effectPayload || { to: 'recipient@example.test', subject: 'OMNIA V9 Gmail dispatch test', body: 'Automated test body.' } }
  };
}

// external-effect-dispatcher.mjs calls adapter.prepare({businessKey, providerEffectIdentity, executionId, simulation})
// -- GmailEffectAdapter.prepare() expects `effectPayload`, not `simulation`, so this thin bridge maps the dispatcher's
// generic field name onto the Gmail adapter's expected one without changing the frozen dispatcher's own contract.
function bridgeAdapter(adapter) {
  return {
    providerName: adapter.providerName,
    dispatchCallCount: 0,
    prepare: ({ businessKey, providerEffectIdentity, executionId, simulation }) =>
      adapter.prepare({ businessKey, providerEffectIdentity, executionId, effectPayload: simulation?.effectPayload }),
    dispatch(preparedEffect) {
      this.dispatchCallCount += 1;
      return adapter.dispatch(preparedEffect);
    },
    reconcile: identity => adapter.reconcile(identity),
    classifyOutcome: evidence => adapter.classifyOutcome(evidence)
  };
}

test('Gmail adapter through the real dispatcher: definite success reaches PROVIDER_ACCEPTED', { skip: !realPostgresUrl }, async () => {
  const pool = new Pool({ connectionString: realPostgresUrl, max: 5 });
  try {
    await migrateReal(pool);
    const store = new ExternalEffectExecutionStore({ pool });
    const evidenceStore = new ExternalEffectEvidenceStore({ pool });
    const transport = createFakeGmailTransport({ mode: FAKE_GMAIL_MODES.DEFINITE_SUCCESS });
    const adapter = bridgeAdapter(makeAdapter(transport));
    const id = `gmail-happy-${suffix()}`;
    const result = await dispatchExternalEffect({ store, evidenceStore, adapter, effectIntent: baseIntent({ id }) });
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
    const rawAdapter = makeAdapter(transport);
    const adapter = bridgeAdapter(rawAdapter);
    const id = `gmail-checkpoint-c-${suffix()}`;
    const intent = baseIntent({ id });

    await assert.rejects(
      () => dispatchExternalEffect({ store, evidenceStore, adapter, effectIntent: intent, crashAt: CRASH_POINTS.IMMEDIATELY_AFTER_PROVIDER_ACCEPTS }),
      CrashInjected
    );
    assert.equal(transport.mailbox.length, 1, 'sanity: Gmail (fake) truly received and stored the message before the crash');

    const executionId = `exec-${id}`;
    const afterCrash = await store.getById(executionId);
    assert.equal(afterCrash.status, 'DISPATCHING');

    const freshTransportSharedMailbox = transport; // "process restart" reuses the same external Gmail mailbox, just like a real crash would
    const freshAdapter = bridgeAdapter(makeAdapter(freshTransportSharedMailbox));
    const recovered = await recoverOneExecution({ store, evidenceStore, adapter: freshAdapter, execution: afterCrash });

    assert.equal(freshAdapter.dispatchCallCount, 0, 'MISSION-CRITICAL: recovery must never call Gmail send again');
    assert.equal(recovered.action, RECOVERY_ACTIONS.FINALIZE_CONFIRMED);
    assert.equal(recovered.status, 'RECONCILED_ACCEPTED');
    assert.equal(transport.mailbox.length, 1, 'exactly one message ever existed in the (fake) Gmail mailbox');
  } finally { await pool.end(); }
});

test('Gmail adapter: provider never received the request (proven via reconciliation NOT_FOUND) -- frees the business key for a real retry', { skip: !realPostgresUrl }, async () => {
  const pool = new Pool({ connectionString: realPostgresUrl, max: 5 });
  try {
    await migrateReal(pool);
    const store = new ExternalEffectExecutionStore({ pool });
    const evidenceStore = new ExternalEffectEvidenceStore({ pool });
    const transport = createFakeGmailTransport({ mode: FAKE_GMAIL_MODES.TIMEOUT_BEFORE_REQUEST_RECEIVED });
    const adapter = bridgeAdapter(makeAdapter(transport));
    const id = `gmail-not-found-${suffix()}`;
    const intent = baseIntent({ id });
    const result = await dispatchExternalEffect({ store, evidenceStore, adapter, effectIntent: intent });
    assert.equal(result.status, 'RESULT_UNCERTAIN');

    const execution = await store.getById(`exec-${id}`);
    const recovered = await recoverOneExecution({ store, evidenceStore, adapter, execution });
    assert.equal(recovered.action, RECOVERY_ACTIONS.ABORTED_BEFORE_DISPATCH);
    assert.equal(recovered.status, 'RECONCILED_NOT_SUBMITTED');
    assert.equal(adapter.dispatchCallCount, 1, 'the ORIGINAL attempt counted once -- recovery itself never dispatches again');
  } finally { await pool.end(); }
});

test('Gmail adapter: two concurrent recovery workers on the same stuck Gmail-bound execution converge on exactly one outcome', { skip: !realPostgresUrl }, async () => {
  const pool = new Pool({ connectionString: realPostgresUrl, max: 10 });
  try {
    await migrateReal(pool);
    const store = new ExternalEffectExecutionStore({ pool });
    const evidenceStore = new ExternalEffectEvidenceStore({ pool });
    const transport = createFakeGmailTransport({ mode: FAKE_GMAIL_MODES.TIMEOUT_BEFORE_REQUEST_RECEIVED });
    const adapter = bridgeAdapter(makeAdapter(transport));
    const id = `gmail-race-${suffix()}`;
    const intent = baseIntent({ id });
    await dispatchExternalEffect({ store, evidenceStore, adapter, effectIntent: intent });

    const workerA = bridgeAdapter(makeAdapter(transport));
    const workerB = bridgeAdapter(makeAdapter(transport));
    // A generous limit (not just enough for this one row) keeps this assertion robust
    // against unrelated unresolved rows a long-lived local database may carry from other
    // tests/dev iterations -- a disposable per-run database (the CI/final-regression
    // convention for this suite) would never have this pollution; see the identical
    // reasoning in tests/omnia-v9-external-effect-crash-recovery.test.mjs's batch-worker test.
    const [resultsA, resultsB] = await Promise.all([
      recoverUnresolvedExecutions({ store, adapter: workerA, limit: 1000 }),
      recoverUnresolvedExecutions({ store, adapter: workerB, limit: 1000 })
    ]);
    const executionId = `exec-${id}`;
    const claimedByA = resultsA.some(r => r.executionId === executionId);
    const claimedByB = resultsB.some(r => r.executionId === executionId);
    assert.equal(claimedByA !== claimedByB, true, 'exactly one worker claims this Gmail-bound execution, never both, never neither');

    const finalExecution = await store.getById(executionId);
    assert.equal(finalExecution.status, 'RECONCILED_NOT_SUBMITTED');
    assert.equal(workerA.dispatchCallCount + workerB.dispatchCallCount, 0, 'no recovery worker ever calls Gmail send');
  } finally { await pool.end(); }
});
