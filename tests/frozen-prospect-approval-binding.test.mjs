import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.mjs';
import { executeFrozenProspectEffect, verifyFrozenProspectAuthorization } from '../src/frozen-prospect-effect-runtime.mjs';
import { buildEncryptedSmtpAccount } from '../src/uberfleet.mjs';
import { validRoutePackage, ALLOW_CONSENT } from './helpers/outbound-route-package.mjs';

// The approval is an owner record supplied by the caller. These tests sign it the way an external approval path would,
// with the approval secret, and prove the runtime neither mints nor accepts a record it did not receive for this call.
const PACKAGE = 'uberbond.prospect-effect-package.v1';
const ROUTE_ACCOUNT = { id: 'nadia-smtp', slot: 'winnr:nadia.chen@cedarpointdomains.com', email: 'nadia.chen@cedarpointdomains.com' };
const routeGate = { outboundAuthorization: ({ message }) => validRoutePackage({ account: ROUTE_ACCOUNT, message }), consentVerifier: ALLOW_CONSENT };
const secret = 'runtime-freeze-secret-000000000000000000000000';
const approvalSecret = 'runtime-approval-secret-00000000000000000000000';
const encryptionKey = 'a'.repeat(64);
const approverId = 'founder';
const at = new Date('2026-10-05T09:00:00.000Z');
const ROUTE_DIGEST = 'c'.repeat(64);
const canonical = x => Array.isArray(x) ? x.map(canonical) : x && typeof x === 'object'
  ? Object.fromEntries(Object.keys(x).sort().filter(k => x[k] !== undefined).map(k => [k, canonical(x[k])])) : x;
const digestOf = participants => createHash('sha256').update(JSON.stringify(canonical({ version: PACKAGE, participants }))).digest('hex');

// Signs an approval record exactly as an external owner approval would: HMAC over the canonical bytes without the signature.
function signApproval(base) {
  const { signature, ...unsigned } = base;
  return { ...unsigned, signature: createHmac('sha256', approvalSecret).update(JSON.stringify(canonical(unsigned))).digest('hex') };
}

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'frozen-approval-binding-'));
  const store = new Store(dir); await store.init();
  const participants = {
    expiresAt: new Date(+at + 3600000).toISOString(), maxEffects: 1,
    recipient: 'partnerships@intelo.ai', sender: { slot: ROUTE_ACCOUNT.slot, provider: 'smtp-relay' },
    provider: 'smtp-relay', subject: 'Integration release gate', body: 'A frozen company-level message.\n\nUnsubscribe: https://control.example/unsubscribe/token',
    footerAndUnsubscribe: { unsubUrl: 'https://control.example/unsubscribe/token', oneClick: 'https://control.example/api/unsubscribe/token' },
    route: { routeClass: 'INVITED_GREEN', providerRouteType: 'INVITED_BUSINESS_CONTACT', policyEvidenceDigest: 'd'.repeat(64) },
    contactHistoryReceiptDigest: 'h'.repeat(64)
  };
  const digest = digestOf(participants);
  await store.setSetting(`frozenProspectEffect:${digest}`, {
    version: 'uberbond.frozen-prospect-effect.v1', digest, input: { campaign: { campaignId: 'campaign-1' } },
    result: { globalRoute: { routeDigest: ROUTE_DIGEST }, effectPackage: { version: PACKAGE, participants, expiresAt: participants.expiresAt, maxEffects: 1, finalEffectDigest: digest } }
  });
  await store.add('campaigns', { id: 'campaign-1' });
  const smtp = buildEncryptedSmtpAccount({
    slot: participants.sender.slot, email: ROUTE_ACCOUNT.email, provider: 'smtp-relay', host: 'smtp.winnr.test', port: 465, secure: true,
    username: 'fixture-user', password: 'fixture-pass', sendingDomainId: 'domain-1', sendingMailboxId: 'mailbox-1', sendingWorkspaceId: 'workspace-1',
    routeEvidenceRef: 'winnr:route', routeAuthorized: true, termsCompatible: true, plannedDailyCap: 1, plannedHourlyCap: 1, minGapSeconds: 0
  }, encryptionKey);
  assert.equal(smtp.ok, true);
  await store.add('accounts', { ...smtp.account, id: 'nadia-smtp', minGapSeconds: 0 });
  const validate = async requestedDigest => {
    assert.equal(requestedDigest, digest);
    const settings = await store.getSettings();
    const auth = verifyFrozenProspectAuthorization({ record: settings[`frozenProspectAuthorization:${digest}`], digest, participants, secret: approvalSecret, now: at });
    return {
      ok: true, state: 'READY_FOR_AUTHORIZATION', validation: { valid: true, frozenEffectDigest: digest },
      contactHistory: { status: 'CLEAN', hit: false },
      globalRoute: {
        green: true, routeDigest: ROUTE_DIGEST, governanceGate: { refused: false, routeType: 'INVITED_BUSINESS_CONTACT' },
        sendPrerequisites: Object.fromEntries(['suppressionClean', 'historyClean', 'identityComplete', 'senderEligible', 'providerAllowed'].map(k => [k, { status: 'PASS' }]))
      },
      sender: { ok: true, slot: participants.sender.slot },
      effectPackage: { finalEffectDigest: digest, maxEffects: 1, participants },
      oneButton: { gates: { authorizationValid: { status: auth.ok ? 'PASS' : 'FAIL' } } }
    };
  };
  // The approval defaults to a valid external record for this exact digest. Passing null exercises the missing-approval path.
  const validApproval = (overrides = {}, tamper = null) => {
    const base = {
      schemaVersion: 'uberbond.frozen-effect-authorization.v1', effectDigest: digest, recipient: 'partnerships@intelo.ai',
      senderSlot: participants.sender.slot, senderAddress: ROUTE_ACCOUNT.email, provider: 'smtp-relay', routeClass: 'INVITED_GREEN',
      routeDigest: ROUTE_DIGEST, effectCap: 1, approvedBy: approverId, approvedAt: at.toISOString(),
      expiresAt: new Date(Math.min(+at + 24 * 3600000, Date.parse(participants.expiresAt))).toISOString(), ...overrides
    };
    const record = signApproval(base);
    return tamper ? tamper(record) : record;
  };
  const run = (dispatch, authorization = validApproval(), extra = {}) => executeFrozenProspectEffect({
    store, digest, secret, approvalSecret, approverId, encryptionKey, validate, dispatch, now: at, ...routeGate, authorization, ...extra
  });
  return { dir, store, participants, digest, validApproval, run };
}

test('missing approval is refused before any credential open, claim, reservation or adapter call', async () => {
  const f = await fixture(); let calls = 0;
  try {
    // Corrupt tokens: a credential open would fail with bound-smtp-credentials-unavailable, so the explicit approval refusal
    // also proves the bound credential is never opened on this path.
    await f.store.patch('accounts', 'nadia-smtp', { tokens: { ciphertext: 'not-a-valid-account-token' } });
    const result = await f.run(async () => { calls += 1; return { classification: 'ACCEPTED', providerReferenceId: 'must-not-send' }; }, null);
    assert.equal(result.ok, false);
    assert.equal(result.state, 'NOT_SENT');
    assert.equal(result.reason, 'frozen-effect-authorization-missing');
    assert.equal(result.sendAuthority, false);
    assert.equal(calls, 0);
    const after = await f.store.getSettings();
    assert.equal(after[`frozenProspectAuthorization:${f.digest}`], undefined, 'no approval record is minted or persisted');
    assert.equal(after[`frozenProspectExecution:${f.digest}`], undefined, 'no one-use effect is claimed');
    assert.deepEqual(await f.store.list('outboundReservations'), []);
  } finally { await rm(f.dir, { recursive: true, force: true }); }
});

test('a self-issued record already in settings is not an approval for this call', async () => {
  const f = await fixture(); let calls = 0;
  try {
    // A record shaped like the one the runtime used to mint, signed with the approval secret, sitting in settings.
    // Without a caller-supplied approval it must not be read as permission.
    const seeded = f.validApproval();
    await f.store.setSetting(`frozenProspectAuthorization:${f.digest}`, seeded);
    const result = await f.run(async () => { calls += 1; return { classification: 'ACCEPTED', providerReferenceId: 'must-not-send' }; }, null);
    assert.equal(result.reason, 'frozen-effect-authorization-missing');
    assert.equal(calls, 0);
    const after = await f.store.getSettings();
    assert.deepEqual(after[`frozenProspectAuthorization:${f.digest}`], seeded, 'the stored record is left exactly as it was');
    assert.equal(after[`frozenProspectExecution:${f.digest}`], undefined);
    assert.deepEqual(await f.store.list('outboundReservations'), []);
  } finally { await rm(f.dir, { recursive: true, force: true }); }
});

for (const [name, overrides, tamper, wanted] of [
  ['mismatched effect digest', { effectDigest: 'e'.repeat(64) }, null, 'authorization-effectDigest-mismatch'],
  ['mismatched route digest', { routeDigest: 'e'.repeat(64) }, null, 'authorization-routeDigest-mismatch'],
  ['mismatched sender address', { senderAddress: 'other.sender@example.com' }, null, 'authorization-senderAddress-mismatch'],
  ['mismatched recipient', { recipient: 'other@example.com' }, null, 'authorization-recipient-mismatch'],
  ['tampered signature', {}, record => ({ ...record, signature: '0'.repeat(64) }), 'authorization-signature-invalid'],
  ['record altered after signing', {}, record => ({ ...record, expiresAt: new Date(+at + 7200000).toISOString() }), 'authorization-signature-invalid'],
  ['expired approval', { expiresAt: '2026-10-05T08:59:59.000Z' }, null, 'authorization-expired'],
  ['approval with cap other than one', { effectCap: 2 }, null, 'authorization-cap-or-approver-invalid'],
  ['approval by a different approver', { approvedBy: 'someone-else' }, null, 'frozen-effect-authorization-approver-mismatch']
]) test(`${name} is refused with zero provider calls`, async () => {
  const f = await fixture(); let calls = 0;
  try {
    const result = await f.run(async () => { calls += 1; return { classification: 'ACCEPTED', providerReferenceId: 'must-not-send' }; }, f.validApproval(overrides, tamper));
    assert.equal(result.ok, false);
    assert.equal(result.reason, wanted);
    assert.equal(result.state, 'NOT_SENT');
    assert.equal(calls, 0);
    const settings = await f.store.getSettings();
    assert.equal(settings[`frozenProspectAuthorization:${f.digest}`], undefined, 'a refused approval is not persisted');
    assert.equal(settings[`frozenProspectExecution:${f.digest}`], undefined);
    assert.deepEqual(await f.store.list('outboundReservations'), []);
  } finally { await rm(f.dir, { recursive: true, force: true }); }
});

test('a valid external approval succeeds exactly once and a replay is refused', async () => {
  const f = await fixture(); let calls = 0;
  try {
    const approval = f.validApproval();
    const first = await f.run(async ({ message }) => {
      calls += 1;
      assert.equal(message.to, 'partnerships@intelo.ai');
      return { classification: 'ACCEPTED', providerReferenceId: 'smtp-250-approved-1', messageId: message.messageId };
    }, approval);
    assert.equal(first.state, 'SENT_EXACTLY_ONCE', JSON.stringify(first));
    assert.equal(first.providerCalls, 1);
    assert.equal(calls, 1);
    const settings = await f.store.getSettings();
    assert.deepEqual(settings[`frozenProspectAuthorization:${f.digest}`], approval, 'the caller record is persisted exactly as supplied');
    const replay = await f.run(async () => { calls += 1; return { classification: 'ACCEPTED', providerReferenceId: 'must-not-replay' }; }, approval);
    assert.equal(replay.reason, 'effect-cap-already-claimed');
    assert.equal(calls, 1);
  } finally { await rm(f.dir, { recursive: true, force: true }); }
});

test('a REFUSED dispatch is released as NOT_SENT and is not recorded as UNCERTAIN', async () => {
  const f = await fixture(); let calls = 0;
  try {
    const result = await f.run(async () => {
      calls += 1;
      return { classification: 'REFUSED', providerCallAttempted: false, effectBoundaryCrossed: false, reasonCodes: ['consent-receipt-missing'], decisionDigest: 'f'.repeat(64) };
    });
    assert.equal(result.state, 'NOT_SENT', JSON.stringify(result));
    assert.equal(result.ok, false);
    assert.equal(result.providerCalls, 0);
    assert.equal(result.dispatchAdapterCalls, 1);
    assert.equal(result.automaticRetryAuthorized, false);
    assert.equal(result.receipt.classification, 'NOT_SENT');
    assert.equal(result.receipt.deliveryState, 'NOT_SENT');
    assert.equal(result.receipt.providerCallAttempted, false);
    assert.equal(result.receipt.effectBoundaryCrossed, false);
    assert.deepEqual(result.receipt.effectLedger, { dispatchAdapterCalls: 1, providerCalls: 0, customerMessages: 0 });
    assert.equal(result.receipt.remainingEffectCap, 1);
    assert.equal(calls, 1);
    const settings = await f.store.getSettings();
    const execution = settings[`frozenProspectExecution:${f.digest}`];
    assert.equal(execution.status, 'NOT_SENT');
    assert.equal(execution.effectCapRemaining, 1, 'a refusal crossed no boundary, so the cap is not consumed');
    assert.equal(execution.providerCallAttempted, false);
    assert.equal((await f.store.list('outboundReservations'))[0].status, 'cancelled');
    assert.deepEqual(await f.store.list('outboundEvents'), [], 'no send-failure or uncertainty event is recorded for a refusal');
    // The store's reservation idempotency key still stops a same-key re-dispatch, so the release cannot open a second path.
    const retry = await f.run(async () => { calls += 1; return { classification: 'ACCEPTED', providerReferenceId: 'must-not-send' }; });
    assert.equal(retry.ok, false);
    assert.equal(retry.state, 'NOT_SENT');
    assert.equal(calls, 1);
  } finally { await rm(f.dir, { recursive: true, force: true }); }
});

test('a REFUSED result that reports a provider attempt is not treated as pre-dispatch', async () => {
  const f = await fixture(); let calls = 0;
  try {
    const result = await f.run(async () => { calls += 1; return { classification: 'REFUSED', providerCallAttempted: true, effectBoundaryCrossed: true, reasonCodes: ['smtp-unclear'] }; });
    assert.equal(result.state, 'PROVIDER_RESULT_UNCERTAIN');
    assert.equal(result.receipt.classification, 'UNCERTAIN');
    assert.equal(result.receipt.effectLedger.providerCalls, 1);
    assert.equal(result.automaticRetryAuthorized, false);
    const replay = await f.run(async () => { calls += 1; return { classification: 'ACCEPTED', providerReferenceId: 'must-not-replay' }; });
    assert.equal(replay.reason, 'effect-cap-already-claimed');
    assert.equal(calls, 1);
  } finally { await rm(f.dir, { recursive: true, force: true }); }
});

test('a REFUSED result without explicit pre-dispatch flags stays UNCERTAIN and consumes the cap', async () => {
  const f = await fixture(); let calls = 0;
  try {
    const result = await f.run(async () => { calls += 1; return { classification: 'REFUSED', reasonCodes: ['unexplained'] }; });
    assert.equal(result.state, 'PROVIDER_RESULT_UNCERTAIN');
    assert.equal(result.receipt.classification, 'UNCERTAIN');
    assert.equal(result.receipt.remainingEffectCap, 0);
    const replay = await f.run(async () => { calls += 1; return { classification: 'ACCEPTED', providerReferenceId: 'must-not-replay' }; });
    assert.equal(replay.reason, 'effect-cap-already-claimed');
    assert.equal(calls, 1);
  } finally { await rm(f.dir, { recursive: true, force: true }); }
});
