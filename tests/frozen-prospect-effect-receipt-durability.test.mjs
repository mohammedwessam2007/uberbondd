import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.mjs';
import { executeFrozenProspectEffect, verifyFrozenProspectAuthorization } from '../src/frozen-prospect-effect-runtime.mjs';
import { buildEncryptedSmtpAccount } from '../src/uberfleet.mjs';
import { compileContactHistory } from '../src/prospect-contact-history.mjs';

const PACKAGE = 'uberbond.prospect-effect-package.v1';
const secret = 'runtime-freeze-secret-000000000000000000000000';
const approvalSecret = 'runtime-approval-secret-00000000000000000000000';
const encryptionKey = 'a'.repeat(64);
const approverId = 'founder';
const at = new Date('2026-10-04T12:00:00.000Z');
const canonical = x => Array.isArray(x) ? x.map(canonical) : x && typeof x === 'object'
  ? Object.fromEntries(Object.keys(x).sort().filter(k => x[k] !== undefined).map(k => [k, canonical(x[k])])) : x;
const digestOf = participants => createHash('sha256').update(JSON.stringify(canonical({ version: PACKAGE, participants }))).digest('hex');

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'frozen-receipt-durability-'));
  const store = new Store(dir);
  await store.init();
  const participants = {
    expiresAt: new Date(+at + 3600000).toISOString(),
    maxEffects: 1,
    recipient: 'partnerships@intelo.ai',
    sender: { slot: 'winnr:nadia.chen@cedarpointdomains.com', provider: 'smtp-relay' },
    provider: 'smtp-relay',
    subject: 'Integration release gate',
    body: 'A frozen company-level message.\n\nUnsubscribe: https://control.example/unsubscribe/token',
    footerAndUnsubscribe: {
      unsubUrl: 'https://control.example/unsubscribe/token',
      oneClick: 'https://control.example/api/unsubscribe/token'
    },
    route: {
      routeClass: 'INVITED_GREEN',
      providerRouteType: 'INVITED_BUSINESS_CONTACT',
      policyEvidenceDigest: 'd'.repeat(64)
    },
    contactHistoryReceiptDigest: 'h'.repeat(64)
  };
  const digest = digestOf(participants);
  await store.setSetting(`frozenProspectEffect:${digest}`, {
    version: 'uberbond.frozen-prospect-effect.v1',
    digest,
    input: { campaign: { campaignId: 'campaign-1' } },
    result: {
      globalRoute: { routeDigest: 'c'.repeat(64) },
      effectPackage: { version: PACKAGE, participants, expiresAt: participants.expiresAt, maxEffects: 1, finalEffectDigest: digest }
    }
  });
  await store.add('campaigns', { id: 'campaign-1' });
  const smtp = buildEncryptedSmtpAccount({
    slot: participants.sender.slot,
    email: 'nadia.chen@cedarpointdomains.com',
    provider: 'smtp-relay',
    host: 'smtp.winnr.test',
    port: 465,
    secure: true,
    username: 'fixture-user',
    password: 'fixture-pass',
    sendingDomainId: 'domain-1',
    sendingMailboxId: 'mailbox-1',
    sendingWorkspaceId: 'workspace-1',
    routeEvidenceRef: 'winnr:route',
    routeAuthorized: true,
    termsCompatible: true,
    plannedDailyCap: 1,
    plannedHourlyCap: 1,
    minGapSeconds: 0
  }, encryptionKey);
  assert.equal(smtp.ok, true);
  await store.add('accounts', { ...smtp.account, id: 'nadia-smtp', minGapSeconds: 0 });

  const validate = async requestedDigest => {
    assert.equal(requestedDigest, digest);
    const settings = await store.getSettings();
    const authorization = settings[`frozenProspectAuthorization:${digest}`];
    const auth = verifyFrozenProspectAuthorization({ record: authorization, digest, participants, secret: approvalSecret, now: at });
    return {
      ok: true,
      state: 'READY_FOR_AUTHORIZATION',
      validation: { valid: true, frozenEffectDigest: digest },
      contactHistory: { status: 'CLEAN', hit: false },
      globalRoute: {
        green: true,
        routeDigest: 'c'.repeat(64),
        governanceGate: { refused: false, routeType: 'INVITED_BUSINESS_CONTACT' },
        sendPrerequisites: Object.fromEntries(
          ['suppressionClean', 'historyClean', 'identityComplete', 'senderEligible', 'providerAllowed'].map(key => [key, { status: 'PASS' }])
        )
      },
      sender: { ok: true, slot: participants.sender.slot },
      effectPackage: { version: PACKAGE, finalEffectDigest: digest, maxEffects: 1, participants },
      oneButton: { gates: { authorizationValid: { status: auth.ok ? 'PASS' : 'FAIL' } } }
    };
  };
  const execute = dispatch => executeFrozenProspectEffect({
    store,
    digest,
    secret,
    approvalSecret,
    approverId,
    encryptionKey,
    validate,
    dispatch,
    now: at
  });
  return { dir, store, digest, execute };
}

test('provider acceptance is checkpointed before a secondary outbound-event ledger failure and cannot replay', async () => {
  const f = await fixture();
  let calls = 0;
  let observedMessageId = '';
  try {
    f.store._recordOutboundEventDirect = () => { throw new Error('simulated-outbound-event-ledger-failure'); };
    const result = await f.execute(async ({ message }) => {
      calls += 1;
      observedMessageId = message.messageId;
      return {
        classification: 'ACCEPTED',
        providerReferenceId: 'smtp250:durable-provider-reference',
        messageId: message.messageId
      };
    });

    assert.equal(result.ok, false);
    assert.equal(result.state, 'LEDGER_RECONCILIATION_REQUIRED');
    assert.equal(result.automaticRetryAuthorized, false);
    assert.equal(result.reconciliationRequired, true);
    assert.equal(result.receipt.providerReferenceId, 'smtp250:durable-provider-reference');
    assert.equal(result.receipt.providerMessageId, observedMessageId);
    assert.equal(result.receipt.remainingEffectCap, 0);
    assert.equal(observedMessageId, `<ubf-${f.digest.slice(0, 56)}@cedarpointdomains.com>`);
    assert.equal(calls, 1);

    const settings = await f.store.getSettings();
    const execution = settings[`frozenProspectExecution:${f.digest}`];
    assert.equal(execution.status, 'PROVIDER_ACCEPTED_CHECKPOINTED');
    assert.equal(execution.effectCapRemaining, 0);
    assert.equal(execution.receipt.providerReferenceId, 'smtp250:durable-provider-reference');
    assert.equal((await f.store.list('outboundReservations'))[0].status, 'dispatching');

    const replay = await f.execute(async () => {
      calls += 1;
      return { classification: 'ACCEPTED', providerReferenceId: 'must-not-replay' };
    });
    assert.equal(replay.reason, 'effect-cap-already-claimed');
    assert.equal(replay.effectCapRemaining, 0);
    assert.equal(calls, 1);
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});

test('malformed post-adapter outcomes stay uncertain, preserve blocking history, and cannot be replayed under another digest', async () => {
  for (const [label, rawResult] of [
    ['accepted-without-provider-reference', { classification: 'ACCEPTED' }],
    ['rejected-without-pre-effect-proof', { classification: 'REJECTED' }],
    ['unknown-classification', { classification: 'MAYBE' }],
    ['missing-result', null],
    ['unknown-classification-after-provider-attempt', { classification: 'MAYBE', providerCallAttempted: true, effectBoundaryCrossed: true }]
  ]) {
    const f = await fixture();
    let calls = 0;
    try {
      const result = await f.execute(async () => { calls++; return rawResult; });
      assert.equal(result.state, 'PROVIDER_RESULT_UNCERTAIN', label);
      assert.equal(result.ok, false, label);
      assert.equal(result.automaticRetryAuthorized, false, label);
      assert.equal(result.providerCalls, rawResult?.providerCallAttempted === true ? 1 : null, label);
      assert.equal(result.dispatchAdapterCalls, 1, label);
      assert.equal(result.receipt.classification, 'UNCERTAIN', label);
      assert.equal(result.receipt.deliveryState, 'UNCERTAIN_REQUIRES_RECONCILIATION', label);
      assert.equal(result.receipt.effectLedger.dispatchAdapterCalls, 1, label);
      assert.equal(result.receipt.effectLedger.customerMessages, 'UNKNOWN', label);
      assert.equal(result.receipt.remainingEffectCap, 0, label);
      assert.equal(calls, 1, label);

      const settings = await f.store.getSettings();
      assert.equal(settings[`frozenProspectExecution:${f.digest}`].status, 'UNCERTAIN', label);
      assert.equal(settings[`frozenProspectExecution:${f.digest}`].effectCapRemaining, 0, label);
      assert.equal((await f.store.list('outboundReservations'))[0].status, 'uncertain', label);
      assert.equal((await f.store.list('outboundEvents'))[0].eventType, 'send_uncertain', label);

      const reads = {};
      for (const name of ['suppressions', 'prospects', 'outboundReservations', 'outboundEvents', 'replies', 'messages', 'providerEvents']) {
        reads[name] = { ok: true, rows: await f.store.list(name) };
      }
      const history = compileContactHistory({ email: f.participants?.recipient || 'partnerships@intelo.ai', reads, now: at });
      assert.equal(history.status, 'HIT', `${label}: an alternate digest must not erase this uncertain contact history`);

      const replay = await f.execute(async () => { calls++; return { classification: 'ACCEPTED', providerReferenceId: 'must-not-replay' }; });
      assert.equal(replay.reason, 'effect-cap-already-claimed', label);
      assert.equal(calls, 1, label);
    } finally { await rm(f.dir, { recursive: true, force: true }); }
  }
});

test('only explicit pre-effect rejection may report zero provider calls', async () => {
  const f = await fixture();
  let calls = 0;
  try {
    const result = await f.execute(async () => {
      calls++;
      return { classification: 'REJECTED', providerCallAttempted: false, effectBoundaryCrossed: false, reasonCodes: ['smtp-transport-not-ready'] };
    });
    assert.equal(result.state, 'PROVIDER_REJECTED');
    assert.equal(result.providerCalls, 0);
    assert.equal(result.dispatchAdapterCalls, 1);
    assert.equal(result.receipt.providerCallAttempted, false);
    assert.equal(result.receipt.effectBoundaryCrossed, false);
    assert.equal(result.receipt.deliveryState, 'REJECTED');
    assert.equal(calls, 1);
    assert.equal((await f.store.list('outboundReservations'))[0].status, 'cancelled');
  } finally { await rm(f.dir, { recursive: true, force: true }); }
});
