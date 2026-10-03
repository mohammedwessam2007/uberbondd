import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.mjs';
import { executeFrozenProspectEffect, verifyFrozenProspectAuthorization } from '../src/frozen-prospect-effect-runtime.mjs';
import { buildEncryptedSmtpAccount } from '../src/uberfleet.mjs';

const PACKAGE = 'uberbond.prospect-effect-package.v1';
const secret = 'runtime-freeze-secret-000000000000000000000000';
const approvalSecret = 'runtime-approval-secret-00000000000000000000000';
const encryptionKey = 'a'.repeat(64);
const approverId = 'founder';
const at = new Date('2026-10-03T21:30:00.000Z');
const canonical = x => Array.isArray(x) ? x.map(canonical) : x && typeof x === 'object'
  ? Object.fromEntries(Object.keys(x).sort().filter(k => x[k] !== undefined).map(k => [k, canonical(x[k])])) : x;
const digestOf = participants => createHash('sha256').update(JSON.stringify(canonical({ version: PACKAGE, participants }))).digest('hex');

async function fixture(overrides = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'frozen-effect-runtime-'));
  const store = new Store(dir); await store.init();
  const participants = {
    expiresAt: new Date(+at + 3600000).toISOString(), maxEffects: 1,
    recipient: 'partnerships@intelo.ai', sender: { slot: 'winnr:nadia.chen@cedarpointdomains.com', provider: 'smtp-relay' },
    provider: 'smtp-relay', subject: 'Integration release gate', body: 'A frozen company-level message.\n\nUnsubscribe: https://control.example/unsubscribe/token',
    footerAndUnsubscribe: { unsubUrl: 'https://control.example/unsubscribe/token', oneClick: 'https://control.example/api/unsubscribe/token' },
    route: { routeClass: 'INVITED_GREEN', providerRouteType: 'INVITED_BUSINESS_CONTACT', policyEvidenceDigest: 'd'.repeat(64) },
    contactHistoryReceiptDigest: 'h'.repeat(64)
  };
  Object.assign(participants, overrides.participants || {});
  const digest = digestOf(participants);
  const snapshot = {
    version: 'uberbond.frozen-prospect-effect.v1', digest,
    input: { campaign: { campaignId: 'campaign-1' } },
    result: { globalRoute: { routeDigest: 'c'.repeat(64) }, effectPackage: { participants, expiresAt: participants.expiresAt, maxEffects: 1, finalEffectDigest: digest } }
  };
  await store.setSetting(`frozenProspectEffect:${digest}`, snapshot);
  await store.add('campaigns', { id: 'campaign-1' });
  const smtp = buildEncryptedSmtpAccount({
    slot: participants.sender.slot, email: 'nadia.chen@cedarpointdomains.com', provider: 'smtp-relay',
    host: 'smtp.winnr.test', port: 465, secure: true, username: 'fixture-user', password: 'fixture-pass',
    sendingDomainId: 'domain-1', sendingMailboxId: 'mailbox-1', sendingWorkspaceId: 'workspace-1',
    routeEvidenceRef: 'winnr:route', routeAuthorized: true, termsCompatible: true,
    plannedDailyCap: 1, plannedHourlyCap: 1, minGapSeconds: 0
  }, encryptionKey);
  assert.equal(smtp.ok, true);
  await store.add('accounts', { ...smtp.account, id: 'nadia-smtp', minGapSeconds: 0 });
  const validate = async requestedDigest => {
    assert.equal(requestedDigest, digest);
    const settings = await store.getSettings();
    const authorization = settings[`frozenProspectAuthorization:${digest}`];
    const auth = verifyFrozenProspectAuthorization({ record: authorization, digest, participants, secret: approvalSecret, now: at });
    return {
      ok: true, state: 'READY_FOR_AUTHORIZATION', validation: { valid: true, frozenEffectDigest: digest },
      contactHistory: { status: 'CLEAN', hit: false },
      globalRoute: {
        green: true, routeDigest: 'c'.repeat(64), governanceGate: { refused: false, routeType: 'INVITED_BUSINESS_CONTACT' },
        sendPrerequisites: Object.fromEntries(['suppressionClean','historyClean','identityComplete','senderEligible','providerAllowed'].map(k => [k, { status: 'PASS' }]))
      },
      sender: { ok: true, slot: participants.sender.slot },
      effectPackage: { finalEffectDigest: digest, maxEffects: 1, participants },
      oneButton: { gates: { authorizationValid: { status: auth.ok ? 'PASS' : 'FAIL' } } }
    };
  };
  const execute = dispatch => executeFrozenProspectEffect({ store, digest, secret, approvalSecret, approverId, encryptionKey, validate, dispatch, now: at });
  return { dir, store, participants, digest, execute, validate };
}

test('authorized exact invited SMTP effect is revalidated, signed, claimed once, dispatched and reconciled', async () => {
  const f = await fixture(); let calls = 0;
  try {
    const result = await f.execute(async ({ account, message }) => {
      calls++;
      assert.equal(account.email, 'nadia.chen@cedarpointdomains.com');
      assert.equal(message.to, 'partnerships@intelo.ai');
      assert.equal(message.subject, f.participants.subject);
      assert.equal(message.body, f.participants.body);
      assert.equal(message.listUnsubscribe, f.participants.footerAndUnsubscribe.oneClick);
      return { classification: 'ACCEPTED', providerReferenceId: 'smtp-250-accepted-1', messageId: '<intelo-1@cedarpointdomains.com>' };
    });
    assert.equal(result.state, 'SENT_EXACTLY_ONCE');
    assert.equal(result.providerCalls, 1);
    assert.equal(result.receipt.authorizedDigest, f.digest);
    assert.equal(result.receipt.remainingEffectCap, 0);
    assert.equal(result.receipt.deliveryState, 'ACCEPTED_DELIVERY_NOT_CONFIRMED');
    assert.equal(calls, 1);
    const settings = await f.store.getSettings();
    assert.equal(verifyFrozenProspectAuthorization({ record: settings[`frozenProspectAuthorization:${f.digest}`], digest: f.digest, participants: f.participants, secret: approvalSecret, now: at }).ok, true);
    assert.equal(settings[`frozenProspectExecution:${f.digest}`].status, 'SENT');
    assert.equal((await f.store.list('outboundReservations'))[0].status, 'sent');
    assert.equal((await f.store.list('outboundEvents'))[0].eventType, 'sent');
    // The immutable execution claim remains authoritative even if the
    // reservation is archived or compacted later.
    f.store.data.outboundReservations = [];
    assert.equal((await f.execute(async () => { calls++; return { classification: 'ACCEPTED', providerReferenceId: 'duplicate' }; })).reason, 'effect-cap-already-claimed');
    assert.equal(calls, 1);
  } finally { await rm(f.dir, { recursive: true, force: true }); }
});

for (const [name, participants, wanted] of [
  ['generic cold contact', { route: { routeClass: 'US_CANSPAM_GREEN', providerRouteType: 'PUBLIC_BUSINESS_CONTACT' } }, 'authorized-invited-route-not-bound'],
  ['different sender', { sender: { slot: 'winnr:other.sender@example.com', provider: 'smtp-relay' } }, 'authorized-sender-nadia-not-bound-by-slot'],
  ['wrong provider', { provider: 'gmail-api', sender: { slot: 'winnr:nadia.chen@cedarpointdomains.com', provider: 'gmail-api' } }, 'frozen-provider-or-sender-binding-invalid'],
  ['expired effect', { expiresAt: '2026-10-03T21:29:59.000Z' }, 'frozen-effect-expired-or-cap-invalid'],
  ['wrong recipient', { recipient: 'other@example.com' }, 'authorized-recipient-mismatch']
]) test(`${name} cannot reach the SMTP adapter`, async () => {
  const f = await fixture({ participants }); let calls = 0;
  try {
    if (name === 'different sender') await f.store.patch('accounts', 'nadia-smtp', { email: 'other.sender@example.com' });
    const result = await f.execute(async () => { calls++; return { classification: 'ACCEPTED', providerReferenceId: 'must-not-send' }; });
    assert.equal(result.reason, wanted);
    assert.equal(calls, 0);
  } finally { await rm(f.dir, { recursive: true, force: true }); }
});

test('changed preflight facts or missing exact authorization gate prevent provider use', async () => {
  const f = await fixture(); let calls = 0; const validate = f.validate;
  try {
    const bad = async digest => ({ ...(await validate(digest)), validation: { valid: false, frozenEffectDigest: digest, materialChange: ['sender-changed'] } });
    const result = await executeFrozenProspectEffect({ store: f.store, digest: f.digest, secret, approvalSecret, approverId, encryptionKey, validate: bad, dispatch: async () => { calls++; return {}; }, now: at });
    assert.equal(result.reason, 'preflight-not-valid-for-exact-digest');
    assert.equal(calls, 0);
  } finally { await rm(f.dir, { recursive: true, force: true }); }
});

test('one-button authorization gate must verify the durable digest authorization', async () => {
  const f = await fixture(); let calls = 0;
  try {
    const result = await executeFrozenProspectEffect({
      store: f.store, digest: f.digest, secret, approvalSecret, approverId, encryptionKey, now: at,
      validate: async digest => ({ ...(await f.validate(digest)), oneButton: { gates: { authorizationValid: { status: 'FAIL' } } } }),
      dispatch: async () => { calls++; return { classification: 'ACCEPTED', providerReferenceId: 'not-authorized' }; }
    });
    assert.equal(result.reason, 'canonical-authorization-gate-not-pass');
    assert.equal(calls, 0);
  } finally { await rm(f.dir, { recursive: true, force: true }); }
});

test('tampered frozen message cannot dispatch under its stale digest', async () => {
  const f = await fixture(); let calls = 0;
  try {
    const snapshot = (await f.store.getSettings())[`frozenProspectEffect:${f.digest}`];
    snapshot.result.effectPackage.participants.body += ' changed';
    await f.store.setSetting(`frozenProspectEffect:${f.digest}`, snapshot);
    const result = await f.execute(async () => { calls++; return { classification: 'ACCEPTED' }; });
    assert.equal(result.reason, 'frozen-effect-digest-does-not-match-snapshot');
    assert.equal(calls, 0);
  } finally { await rm(f.dir, { recursive: true, force: true }); }
});

test('a live canonical payload change cannot reuse the stored authorized digest', async () => {
  const f = await fixture(); let calls = 0;
  try {
    const result = await f.validate(f.digest);
    result.effectPackage.participants.body += ' materially changed';
    const rejected = await executeFrozenProspectEffect({
      store: f.store, digest: f.digest, secret, approvalSecret, approverId, encryptionKey, now: at,
      validate: async () => result,
      dispatch: async () => { calls++; return { classification: 'ACCEPTED', providerReferenceId: 'must-not-send' }; }
    });
    assert.equal(rejected.reason, 'canonical-payload-digest-changed');
    assert.equal(calls, 0);
  } finally { await rm(f.dir, { recursive: true, force: true }); }
});

test('a current suppression or history hit cannot use prior clean authorization', async () => {
  const f = await fixture(); let calls = 0;
  try {
    const result = await f.validate(f.digest);
    result.contactHistory = { status: 'HIT', hit: true };
    const rejected = await executeFrozenProspectEffect({
      store: f.store, digest: f.digest, secret, approvalSecret, approverId, encryptionKey, now: at,
      validate: async () => result,
      dispatch: async () => { calls++; return { classification: 'ACCEPTED', providerReferenceId: 'must-not-send' }; }
    });
    assert.equal(rejected.reason, 'production-history-not-clean');
    assert.equal(calls, 0);
  } finally { await rm(f.dir, { recursive: true, force: true }); }
});

test('a changed canonical route digest cannot authorize or reach the provider', async () => {
  const f = await fixture(); let calls = 0;
  try {
    const result = await f.validate(f.digest);
    result.globalRoute.routeDigest = 'e'.repeat(64);
    const rejected = await executeFrozenProspectEffect({
      store: f.store, digest: f.digest, secret, approvalSecret, approverId, encryptionKey, now: at,
      validate: async () => result,
      dispatch: async () => { calls++; return { classification: 'ACCEPTED', providerReferenceId: 'must-not-send' }; }
    });
    assert.equal(rejected.reason, 'canonical-route-digest-changed');
    assert.equal(calls, 0);
    assert.equal((await f.store.getSettings())[`frozenProspectAuthorization:${f.digest}`], undefined);
  } finally { await rm(f.dir, { recursive: true, force: true }); }
});

test('uncertain provider result consumes cap and can never be retried automatically', async () => {
  const f = await fixture(); let calls = 0;
  try {
    const result = await f.execute(async () => { calls++; return { classification: 'UNCERTAIN', reasonCodes: ['smtp-timeout'] }; });
    assert.equal(result.state, 'PROVIDER_RESULT_UNCERTAIN');
    assert.equal(result.receipt.remainingEffectCap, 0);
    assert.equal(result.receipt.effectLedger.providerCalls, 1);
    const replay = await f.execute(async () => { calls++; return { classification: 'ACCEPTED' }; });
    assert.equal(replay.reason, 'effect-cap-already-claimed');
    assert.equal(calls, 1);
    assert.equal((await f.store.list('outboundReservations'))[0].status, 'uncertain');
  } finally { await rm(f.dir, { recursive: true, force: true }); }
});

test('unreadable bound SMTP credentials do not consume the provider boundary', async () => {
  const f = await fixture(); let calls = 0;
  try {
    await f.store.patch('accounts', 'nadia-smtp', { tokens: { ciphertext: 'not-a-valid-account-token' } });
    const result = await f.execute(async () => { calls++; return { classification: 'ACCEPTED', providerReferenceId: 'must-not-send' }; });
    assert.equal(result.reason, 'bound-smtp-credentials-unavailable');
    assert.equal(calls, 0);
    assert.deepEqual(await f.store.list('outboundReservations'), []);
  } finally { await rm(f.dir, { recursive: true, force: true }); }
});

test('sender health pause and global outbound pause remain hard holds', async () => {
  for (const paused of ['sender', 'global']) {
    const f = await fixture(); let calls = 0;
    try {
      if (paused === 'sender') await f.store.setSenderPaused(f.participants.sender.slot, true, 'hold');
      else await f.store.setOutboundPaused(true, 'hold');
      const result = await f.execute(async () => { calls++; return { classification: 'ACCEPTED' }; });
      assert.match(result.reason, paused === 'sender' ? /bound-smtp-sender-paused|sender-paused/ : /global-outbound-paused/);
      assert.equal(calls, 0);
    } finally { await rm(f.dir, { recursive: true, force: true }); }
  }
});
