import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash, createHmac } from 'node:crypto';
import { Store } from '../src/store.mjs';
import { Pipeline } from '../src/pipeline.mjs';
import { buildEncryptedSmtpAccount, dispatchSmtpFleetAccount } from '../src/uberfleet.mjs';
import { dispatchPostalCanary } from '../src/postal-live-send.mjs';
import { executeFrozenProspectEffect, verifyFrozenProspectAuthorization } from '../src/frozen-prospect-effect-runtime.mjs';
import { runWinnrPlacementPhenotypeCanary, runWinnrPersonalInboxCanary } from '../src/winnr-placement-phenotype-canary.mjs';
import { runWinnrRuntimeBootstrap } from '../src/winnr-runtime-bootstrap.mjs';
import { RevenueEngine } from '../src/revenue.mjs';
import { governedTransportBytes } from '../src/outreach-100k-runtime-control.mjs';
import { dispatchGovernedOutreach } from '../src/governed-outreach-dispatch.mjs';
import { OUTREACH_LAUNCH_STATES } from '../src/outreach-launch-gate.mjs';
import {
  OUTBOUND_AUTHORIZATION_PACKAGE_MISSING, gateOutboundRoute, outboundMessageDigest, outboundAuthorizationPackageRefusal, requestOutboundPackage
} from '../src/outbound-send-authorization.mjs';
import { allowOutboundConsequenceForTest } from './helpers/outbound-consequence-gate.mjs';
import { validRoutePackage, ALLOW_CONSENT } from './helpers/outbound-route-package.mjs';

// Route-level gate tests. Every live send route is driven with fake transports, credential counters and fetch counters.
// No test touches a real provider, SMTP or IMAP server, Neon, Render, DNS, payment, Winnr or Postal. All identities are synthetic.

const KEY = 'd'.repeat(64);
const MONDAY = new Date('2026-07-13T10:00:00.000Z');
const SENDER = 'outreach@uberbond.example';
const BUYER = 'info@clinic.example';

const campaign = { id: 'camp-route', approved: true, autoSend: true, allowedCountries: ['GB'], minScore: 60, dailyCaps: { A: 10 }, maxFollowups: 0 };
const prospect = {
  id: 'pros-route', campaignId: 'camp-route', company: 'Clinic', website: 'https://clinic.example', domain: 'clinic.example', country: 'United Kingdom',
  inbox: 'A', draft: 'Evidence-backed message with reply no.', subject: 'Website observation',
  unsubscribeUrl: 'https://uberbond.example/unsubscribe?token=test', oneClickUnsubscribeUrl: 'https://uberbond.example/api/public/unsubscribe?token=test',
  contact: { email: BUYER, source: 'website', verified: 'unverified' },
  score: { total: 80 }, issue: { title: 'Booking path issue', confidence: .9, safeForOutreach: true, evidenceUrl: 'https://clinic.example/book', evidenceExcerpt: 'Book button returned an error.' }
};

function routeCfg(outbound = {}) {
  return {
    outbound: {
      enabled: true, dryRun: false, provider: 'smtp-relay', useEffectAdapter: true, allowedCountries: ['United Kingdom'], hourlyCaps: { A: 3 }, minGapSeconds: 0,
      businessHourStart: 9, businessHourEnd: 17, minEvidenceConfidence: .75, maxEvidenceAgeDays: 45, hardBouncePauseThreshold: 2, complaintPauseThreshold: 1, failurePauseThreshold: 3,
      ...outbound
    },
    sender: { name: 'Mohamed', company: 'UberBond', address: 'Business address' }, caps: { A: 10 }, google: {}, encryptionKey: KEY
  };
}

function smtpAccount({ slot = 'A', email = SENDER, provider = 'smtp-relay' } = {}) {
  return buildEncryptedSmtpAccount({
    slot, email, provider, host: 'smtp.example.invalid', username: email, password: 'synthetic-not-a-secret',
    sendingDomainId: 'd1', sendingMailboxId: 'm1', sendingWorkspaceId: 'w1', routeEvidenceRef: 'receipt:route-1',
    routeAuthorized: true, termsCompatible: true, plannedDailyCap: 10, plannedHourlyCap: 3, minGapSeconds: 0
  }, KEY).account;
}

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-route-gating-'));
  const store = new Store(dir);
  await store.init();
  return { store, dir };
}

async function pipelineStore(account = smtpAccount()) {
  const { store, dir } = await tempStore();
  await store.add('campaigns', campaign);
  await store.add('prospects', { ...prospect, status: 'ready', createdAt: MONDAY.toISOString() });
  await store.add('accounts', account);
  return { store, dir };
}

// A fake transport that counts constructions and sends. It never opens a socket.
function countingTransport() {
  const log = { built: 0, sends: [] };
  log.factory = () => {
    log.built += 1;
    return {
      ok: true,
      send: async message => {
        log.sends.push(message);
        return { confirmed: true, providerReceiptId: `smtp250:route-${log.sends.length}`, messageId: `<route-${log.sends.length}@example.invalid>` };
      }
    };
  };
  return log;
}

// A fetch that counts calls. A Postal request is the native HTTPS send boundary, so the count must stay at zero.
function countingFetch() {
  const log = { calls: 0 };
  log.fetch = async () => { log.calls += 1; throw new Error('a route that is refused must not reach the network'); };
  return log;
}

function withEmergencyStop(value, body) {
  return async () => {
    const previous = process.env.OUTBOUND_EMERGENCY_STOP;
    try {
      process.env.OUTBOUND_EMERGENCY_STOP = value;
      await body();
    } finally {
      if (previous === undefined) delete process.env.OUTBOUND_EMERGENCY_STOP;
      else process.env.OUTBOUND_EMERGENCY_STOP = previous;
    }
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Shared gate
// ---------------------------------------------------------------------------------------------------------------------

test('the explicit refusal reason is a stable constant that routes return verbatim', () => {
  assert.equal(OUTBOUND_AUTHORIZATION_PACKAGE_MISSING, 'OUTBOUND_AUTHORIZATION_PACKAGE_MISSING');
  const account = smtpAccount();
  const refused = gateOutboundRoute({ account, message: { from: SENDER, to: BUYER, subject: 'S', body: 'B' } });
  assert.equal(refused.classification, 'REFUSED');
  assert.equal(refused.providerCalls, 0);
  assert.equal(refused.providerCallAttempted, false);
  assert.equal(refused.effectBoundaryCrossed, false);
  assert.deepEqual(refused.reasonCodes, [OUTBOUND_AUTHORIZATION_PACKAGE_MISSING]);
});

test('a complete package still refuses on any provider branch other than smtp-relay', () => {
  const account = smtpAccount();
  const message = { from: SENDER, to: BUYER, subject: 'S', body: 'B' };
  const authorization = validRoutePackage({ account, message });
  assert.equal(gateOutboundRoute({ account, message: { ...message, authorization }, consentVerifier: ALLOW_CONSENT }), null);
  for (const routeProvider of ['gmail-api', 'postal']) {
    const refused = gateOutboundRoute({ account, message: { ...message, authorization }, consentVerifier: ALLOW_CONSENT, routeProvider });
    assert.deepEqual(refused.reasonCodes, ['provider-not-smtp-relay'], routeProvider);
  }
});

test('a supplier that throws, is absent or returns nothing yields no package, never permission', async () => {
  assert.equal(await requestOutboundPackage(undefined, { message: {} }), null);
  assert.equal(await requestOutboundPackage(async () => { throw new Error('synthetic supplier failure'); }, { message: {} }), null);
  assert.equal(await requestOutboundPackage(async () => undefined, { message: {} }), null);
  assert.ok(outboundAuthorizationPackageRefusal(null));
});

test('the package binds exact bytes: a body change after approval is refused as a digest mismatch', () => {
  const account = smtpAccount();
  const approved = { from: SENDER, to: BUYER, subject: 'S', body: 'Approved body.' };
  const authorization = validRoutePackage({ account, message: approved });
  const altered = { ...approved, body: 'Altered body.' };
  const refused = gateOutboundRoute({ account, message: { ...altered, authorization }, consentVerifier: ALLOW_CONSENT });
  assert.ok(refused.reasonCodes.includes('message-digest-mismatch'));
  assert.notEqual(outboundMessageDigest(approved), outboundMessageDigest(altered));
});

// ---------------------------------------------------------------------------------------------------------------------
// Route 1: pipeline SMTP-relay branch -> dispatchSmtpFleetAccount
// ---------------------------------------------------------------------------------------------------------------------

function pipelineFor(store, { cfg = routeCfg(), transport, authorize = ({ message, account }) => validRoutePackage({ account, message }), consentVerifier = ALLOW_CONSENT } = {}) {
  const calls = { smtpSend: 0 };
  const pipeline = new Pipeline(store, cfg, {
    clock: () => MONDAY,
    outboundConsequenceGate: allowOutboundConsequenceForTest,
    outboundAuthorization: authorize,
    consentVerifier,
    smtpSend: async args => { calls.smtpSend += 1; return dispatchSmtpFleetAccount({ ...args, transportFactory: transport.factory }); }
  });
  return { pipeline, calls };
}

test('pipeline SMTP route: no package refuses before the provider, the credential and the transport', async () => {
  const { store, dir } = await pipelineStore();
  try {
    const transport = countingTransport();
    const { pipeline, calls } = pipelineFor(store, { transport, authorize: () => null });
    const result = await pipeline.maybeSend(prospect, campaign);
    assert.equal(result.sent, false);
    assert.equal(result.reason, 'outbound-authorization-refused');
    assert.deepEqual(result.reasonCodes, [OUTBOUND_AUTHORIZATION_PACKAGE_MISSING]);
    assert.equal(calls.smtpSend, 0, 'the SMTP dispatch is never entered without a package');
    assert.equal(transport.built, 0);
    assert.equal(transport.sends.length, 0);
    assert.equal((await store.list('outboundReservations')).filter(row => row.status === 'sent').length, 0);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('pipeline SMTP route: a package for other bytes is refused as a digest mismatch with zero transport calls', async () => {
  const { store, dir } = await pipelineStore();
  try {
    const transport = countingTransport();
    const { pipeline } = pipelineFor(store, {
      transport,
      authorize: ({ message, account }) => validRoutePackage({ account, message: { ...message, body: 'A different body.' } })
    });
    const result = await pipeline.maybeSend(prospect, campaign);
    assert.equal(result.sent, false);
    assert.ok(result.reasonCodes.includes('message-digest-mismatch'), JSON.stringify(result));
    assert.equal(transport.built, 0);
    assert.equal(transport.sends.length, 0);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('pipeline SMTP route: the kill switch (outbound disabled) refuses with zero transport calls even with a valid package', async () => {
  const { store, dir } = await pipelineStore();
  try {
    const transport = countingTransport();
    const { pipeline } = pipelineFor(store, { transport, cfg: routeCfg({ enabled: false }) });
    const result = await pipeline.maybeSend(prospect, campaign);
    assert.equal(result.sent, false);
    assert.equal(transport.built, 0);
    assert.equal(transport.sends.length, 0);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('pipeline SMTP route: the emergency stop refuses with zero transport calls even with a valid package', withEmergencyStop('1', async () => {
  const { store, dir } = await pipelineStore();
  try {
    const transport = countingTransport();
    const { pipeline } = pipelineFor(store, { transport });
    const result = await pipeline.maybeSend(prospect, campaign);
    assert.equal(result.sent, false);
    assert.equal(result.reason, 'outbound-authorization-refused');
    assert.ok(result.reasonCodes.includes('emergency-stop-active'), JSON.stringify(result));
    assert.equal(transport.built, 0);
    assert.equal(transport.sends.length, 0);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}));

test('pipeline SMTP route: a valid package for the exact message yields exactly one transport call and no authorization on the wire', async () => {
  const { store, dir } = await pipelineStore();
  try {
    const transport = countingTransport();
    const { pipeline, calls } = pipelineFor(store, { transport });
    const result = await pipeline.maybeSend(prospect, campaign);
    assert.equal(result.sent, true, JSON.stringify(result));
    assert.equal(calls.smtpSend, 1);
    assert.equal(transport.built, 1);
    assert.equal(transport.sends.length, 1);
    assert.equal('authorization' in transport.sends[0], false);
    assert.equal(transport.sends[0].to, BUYER);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------------------------------------------------
// Route 2: pipeline Postal branch and Route 3: pipeline Gmail-API branch. Neither provider is admitted by the package model.
// ---------------------------------------------------------------------------------------------------------------------

test('pipeline Postal branch: without a package, and even with a valid one, no Postal request is made', async () => {
  for (const authorize of [() => null, ({ message, account }) => validRoutePackage({ account, message })]) {
    const { store, dir } = await pipelineStore(smtpAccount({ provider: 'postal' }));
    try {
      const fetch = countingFetch();
      let postalCalls = 0;
      const pipeline = new Pipeline(store, routeCfg({ provider: 'postal' }), {
        clock: () => MONDAY,
        outboundConsequenceGate: allowOutboundConsequenceForTest,
        outboundAuthorization: authorize,
        consentVerifier: ALLOW_CONSENT,
        postalSend: async args => { postalCalls += 1; return dispatchPostalCanary({ ...args, fetchImpl: fetch.fetch }); }
      });
      const result = await pipeline.maybeSend(prospect, campaign);
      assert.equal(result.sent, false);
      assert.equal(result.reason, 'outbound-authorization-refused');
      assert.equal(postalCalls, 0);
      assert.equal(fetch.calls, 0);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  }
});

test('pipeline Gmail-API branch: an SMTP-relay account in the Gmail branch never sends, even with a valid smtp-relay package', async () => {
  for (const authorize of [() => null, ({ message, account }) => validRoutePackage({ account, message })]) {
    const { store, dir } = await pipelineStore();
    try {
      let gmailCalls = 0;
      const pipeline = new Pipeline(store, routeCfg({ provider: 'gmail-api', useEffectAdapter: false }), {
        clock: () => MONDAY,
        outboundAuthorization: authorize,
        consentVerifier: ALLOW_CONSENT,
        sendEmail: async () => { gmailCalls += 1; return { data: { id: 'gmail-route', threadId: 'thread-route' } }; },
        getMessage: async () => ({ data: { payload: { headers: [{ name: 'Message-ID', value: '<route@example.invalid>' }] } } })
      });
      const result = await pipeline.maybeSend(prospect, campaign);
      assert.equal(result.sent, false);
      assert.equal(result.reason, 'outbound-authorization-refused');
      assert.equal(gmailCalls, 0);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// Route 4: native HTTPS Postal route (postal-live-send.dispatchPostalCanary)
// ---------------------------------------------------------------------------------------------------------------------

function postalCfg() {
  return {
    outbound: { provider: 'postal', useEffectAdapter: true, messageIdDomain: 'uberbond.agency' },
    providers: { postal: { configured: true, apiKey: 'synthetic-postal-key', baseUrl: 'https://postal.example.invalid' } }
  };
}

const postalPayload = { to: 'owner@example.invalid', from: 'mohamed@uberbond.agency', subject: 'S', body: 'B', listUnsubscribe: '<https://uberbond.example/u>' };
const postalReservation = { id: 'reservation-postal', idempotencyKey: 'initial:pros-postal' };

test('native HTTPS Postal route cannot send without a package, and the decision precedes the canonical runtime', async () => {
  const fetch = countingFetch();
  const result = await dispatchPostalCanary({
    cfg: postalCfg(), account: { connected: true, email: 'mohamed@uberbond.agency' }, reservation: postalReservation,
    effectPayload: postalPayload, fetchImpl: fetch.fetch, canonicalRuntime: {}, now: () => MONDAY
  });
  assert.equal(result.classification, 'REFUSED');
  assert.deepEqual(result.reasonCodes, [OUTBOUND_AUTHORIZATION_PACKAGE_MISSING]);
  assert.equal(result.providerCalls, 0);
  assert.equal(fetch.calls, 0);
});

test('native HTTPS Postal route refuses a complete package for a non-SMTP provider and makes no request', async () => {
  const account = { id: 'postal-acct', slot: 'postal-slot', provider: 'postal', connected: true, email: 'mohamed@uberbond.agency', smtpRoute: { authorized: true, termsCompatible: true, evidenceRef: 'r' } };
  const authorization = validRoutePackage({ account, message: postalPayload });
  const fetch = countingFetch();
  const result = await dispatchPostalCanary({
    cfg: postalCfg(), account, reservation: postalReservation, effectPayload: { ...postalPayload, authorization },
    fetchImpl: fetch.fetch, canonicalRuntime: {}, consentVerifier: ALLOW_CONSENT, now: () => MONDAY
  });
  assert.equal(result.classification, 'REFUSED');
  assert.deepEqual(result.reasonCodes, ['provider-not-smtp-relay']);
  assert.equal(fetch.calls, 0);
});

test('native HTTPS Postal route does not echo a supplied authorization in its refusal', async () => {
  const account = { id: 'postal-acct', slot: 'postal-slot', provider: 'postal', connected: true, email: 'mohamed@uberbond.agency' };
  const result = await dispatchPostalCanary({
    cfg: postalCfg(), account, reservation: postalReservation,
    effectPayload: { ...postalPayload, authorization: { campaignId: 'x' } }, fetchImpl: countingFetch().fetch, canonicalRuntime: {}, now: () => MONDAY
  });
  assert.equal(result.classification, 'REFUSED');
  assert.equal(JSON.stringify(result).includes('"campaignId":"x"'), false, 'the refusal must not echo the package');
});

// ---------------------------------------------------------------------------------------------------------------------
// Route 5: frozen prospect effect (API route) -> credential open and dispatch
// ---------------------------------------------------------------------------------------------------------------------

const FROZEN_AT = new Date('2026-10-03T21:30:00.000Z');
const FROZEN_SECRET = 'runtime-freeze-secret-000000000000000000000000';
const FROZEN_APPROVAL = 'runtime-approval-secret-00000000000000000000000';
const FROZEN_ACCOUNT = { id: 'nadia-smtp', slot: 'winnr:nadia.chen@cedarpointdomains.com', email: 'nadia.chen@cedarpointdomains.com' };
const frozenCanonical = x => Array.isArray(x) ? x.map(frozenCanonical) : x && typeof x === 'object'
  ? Object.fromEntries(Object.keys(x).sort().filter(k => x[k] !== undefined).map(k => [k, frozenCanonical(x[k])])) : x;
const frozenDigest = participants => createHash('sha256').update(JSON.stringify(frozenCanonical({ version: 'uberbond.prospect-effect-package.v1', participants }))).digest('hex');

async function frozenFixture({ corruptTokens = false } = {}) {
  const { store, dir } = await tempStore();
  const participants = {
    expiresAt: new Date(+FROZEN_AT + 3600000).toISOString(), maxEffects: 1,
    recipient: 'partnerships@intelo.ai', sender: { slot: FROZEN_ACCOUNT.slot, provider: 'smtp-relay' },
    provider: 'smtp-relay', subject: 'Integration release gate', body: 'A frozen company-level message.',
    footerAndUnsubscribe: { unsubUrl: 'https://control.example/unsubscribe/token', oneClick: 'https://control.example/api/unsubscribe/token' },
    route: { routeClass: 'INVITED_GREEN', providerRouteType: 'INVITED_BUSINESS_CONTACT', policyEvidenceDigest: 'd'.repeat(64) },
    contactHistoryReceiptDigest: 'h'.repeat(64)
  };
  const digest = frozenDigest(participants);
  await store.setSetting(`frozenProspectEffect:${digest}`, {
    version: 'uberbond.frozen-prospect-effect.v1', digest, input: { campaign: { campaignId: 'campaign-1' } },
    result: { globalRoute: { routeDigest: 'c'.repeat(64) }, effectPackage: { participants, expiresAt: participants.expiresAt, maxEffects: 1, finalEffectDigest: digest } }
  });
  await store.add('campaigns', { id: 'campaign-1' });
  const built = buildEncryptedSmtpAccount({
    slot: FROZEN_ACCOUNT.slot, email: FROZEN_ACCOUNT.email, provider: 'smtp-relay', host: 'smtp.winnr.test', port: 465, secure: true,
    username: 'fixture-user', password: 'fixture-pass', sendingDomainId: 'domain-1', sendingMailboxId: 'mailbox-1', sendingWorkspaceId: 'workspace-1',
    routeEvidenceRef: 'winnr:route', routeAuthorized: true, termsCompatible: true, plannedDailyCap: 1, plannedHourlyCap: 1, minGapSeconds: 0
  }, KEY).account;
  const account = { ...built, id: FROZEN_ACCOUNT.id, minGapSeconds: 0 };
  if (corruptTokens) account.tokens = { iv: '00', tag: '00', data: '00' };
  await store.add('accounts', account);
  const validate = async () => {
    const settings = await store.getSettings();
    const authorization = verifyFrozenProspectAuthorization({
      record: settings[`frozenProspectAuthorization:${digest}`], digest, participants, secret: FROZEN_APPROVAL, now: FROZEN_AT
    });
    const authOk = authorization.ok === true;
    return {
      ok: true, state: 'READY_FOR_AUTHORIZATION', validation: { valid: true, frozenEffectDigest: digest },
      contactHistory: { status: 'CLEAN', hit: false },
      globalRoute: {
        green: true, routeDigest: 'c'.repeat(64), governanceGate: { refused: false, routeType: 'INVITED_BUSINESS_CONTACT' },
        sendPrerequisites: Object.fromEntries(['suppressionClean', 'historyClean', 'identityComplete', 'senderEligible', 'providerAllowed'].map(k => [k, { status: 'PASS' }]))
      },
      sender: { ok: true, slot: participants.sender.slot },
      effectPackage: { finalEffectDigest: digest, maxEffects: 1, participants },
      oneButton: { gates: { authorizationValid: { status: authOk ? 'PASS' : 'FAIL' } } }
    };
  };
  return { store, dir, digest, validate, participants };
}

// Test-only approval record. The runtime never mints one. This helper stands in for the approver: it signs the exact effect digest,
// recipient, sender slot and address, provider, route class, route digest and approver with the approval secret.
function frozenApprovalRecord(f) {
  const unsigned = {
    schemaVersion: 'uberbond.frozen-effect-authorization.v1', effectDigest: f.digest, recipient: 'partnerships@intelo.ai',
    senderSlot: FROZEN_ACCOUNT.slot, senderAddress: FROZEN_ACCOUNT.email, provider: 'smtp-relay', routeClass: 'INVITED_GREEN',
    routeDigest: 'c'.repeat(64), effectCap: 1, approvedBy: 'founder', approvedAt: FROZEN_AT.toISOString(), expiresAt: f.participants.expiresAt
  };
  return { ...unsigned, signature: createHmac('sha256', FROZEN_APPROVAL).update(JSON.stringify(frozenCanonical(unsigned))).digest('hex') };
}

function frozenRun(f, { dispatch, outboundAuthorization, consentVerifier, authorization }) {
  return executeFrozenProspectEffect({
    store: f.store, digest: f.digest, secret: FROZEN_SECRET, approvalSecret: FROZEN_APPROVAL, approverId: 'founder', encryptionKey: KEY,
    validate: f.validate, dispatch, now: FROZEN_AT, outboundAuthorization, consentVerifier, authorization
  });
}

test('frozen route: no package refuses before any credential open, claim, reservation or adapter call', async () => {
  // The account's tokens are corrupt. A credential open would surface as bound-smtp-credentials-unavailable, so the explicit package
  // refusal also proves the credential is never opened.
  const f = await frozenFixture({ corruptTokens: true });
  let adapterCalls = 0;
  try {
    const result = await frozenRun(f, { dispatch: async () => { adapterCalls += 1; return {}; } });
    assert.equal(result.ok, false);
    assert.equal(result.reason, OUTBOUND_AUTHORIZATION_PACKAGE_MISSING);
    assert.equal(adapterCalls, 0);
    const settings = await f.store.getSettings();
    assert.equal(settings[`frozenProspectExecution:${f.digest}`], undefined, 'no one-use effect is claimed');
    assert.equal(settings[`frozenProspectAuthorization:${f.digest}`], undefined, 'no authorization record is written');
    assert.equal((await f.store.list('outboundReservations')).length, 0);
  } finally { await fs.rm(f.dir, { recursive: true, force: true }); }
});

test('frozen route: a package for other bytes is refused before the claim, with zero adapter calls', async () => {
  const f = await frozenFixture();
  let adapterCalls = 0;
  try {
    const result = await frozenRun(f, {
      outboundAuthorization: ({ message }) => validRoutePackage({ account: FROZEN_ACCOUNT, message: { ...message, body: 'Other bytes.' } }),
      consentVerifier: ALLOW_CONSENT,
      dispatch: async () => { adapterCalls += 1; return {}; }
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'outbound-authorization-refused');
    assert.ok(result.reasonCodes.includes('message-digest-mismatch'));
    assert.equal(adapterCalls, 0);
    assert.equal((await f.store.getSettings())[`frozenProspectExecution:${f.digest}`], undefined);
  } finally { await fs.rm(f.dir, { recursive: true, force: true }); }
});

test('frozen route: the emergency stop refuses before the claim, with zero adapter calls', withEmergencyStop('1', async () => {
  const f = await frozenFixture();
  let adapterCalls = 0;
  try {
    const result = await frozenRun(f, {
      outboundAuthorization: ({ message }) => validRoutePackage({ account: FROZEN_ACCOUNT, message }),
      consentVerifier: ALLOW_CONSENT,
      dispatch: async () => { adapterCalls += 1; return {}; }
    });
    assert.equal(result.ok, false);
    assert.ok(result.reasonCodes.includes('emergency-stop-active'), JSON.stringify(result));
    assert.equal(adapterCalls, 0);
    assert.equal((await f.store.getSettings())[`frozenProspectExecution:${f.digest}`], undefined);
  } finally { await fs.rm(f.dir, { recursive: true, force: true }); }
}));

test('frozen route: a valid package for the exact message yields exactly one transport call', async () => {
  const f = await frozenFixture();
  const transport = countingTransport();
  try {
    const result = await frozenRun(f, {
      outboundAuthorization: ({ message }) => validRoutePackage({ account: FROZEN_ACCOUNT, message }),
      consentVerifier: ALLOW_CONSENT,
      authorization: frozenApprovalRecord(f),
      dispatch: args => dispatchSmtpFleetAccount({ ...args, transportFactory: transport.factory })
    });
    assert.equal(result.state, 'SENT_EXACTLY_ONCE', JSON.stringify(result));
    assert.equal(transport.built, 1);
    assert.equal(transport.sends.length, 1);
    assert.equal('authorization' in transport.sends[0], false);
  } finally { await fs.rm(f.dir, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------------------------------------------------
// Route 6: Winnr runtime bootstrap (API route) -> Winnr read, store writes, canary sends
// ---------------------------------------------------------------------------------------------------------------------

test('Winnr runtime bootstrap: without a package it refuses before any Winnr call, store write or credential import', async () => {
  const result = await runWinnrRuntimeBootstrap({
    config: { encryptionKey: KEY, providers: { winnr: { apiKey: 'synthetic-winnr-key' } } },
    csvText: 'domain,mailbox,password\nexample.invalid,ops@example.invalid,synthetic',
    canaryTarget: 'owner@example.invalid'
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'WINNR_RUNTIME_BOOTSTRAP_REFUSED');
  assert.deepEqual(result.reasonCodes, [OUTBOUND_AUTHORIZATION_PACKAGE_MISSING]);
  assert.equal(result.providerCalls, 0);
  assert.equal(result.messagesSent, 0);
});

// ---------------------------------------------------------------------------------------------------------------------
// Route 7: Winnr placement canary (API route) and Route 8: Winnr personal inbox canary (API route)
// ---------------------------------------------------------------------------------------------------------------------

async function winnrCanaryStore() {
  const { store, dir } = await tempStore();
  for (let n = 1; n <= 3; n += 1) {
    const email = `box${n}@example.invalid`;
    await store.add('accounts', { ...smtpAccount({ slot: `winnr:${email}`, email }), id: `smtp-box${n}` });
  }
  return { store, dir };
}

test('Winnr placement canary: no package refuses before any dispatch or state write', async () => {
  const { store, dir } = await winnrCanaryStore();
  let dispatches = 0;
  try {
    const result = await runWinnrPlacementPhenotypeCanary({
      config: { encryptionKey: KEY }, storeFactory: () => store, target: 'uberbond.co@gmail.com', now: MONDAY,
      dispatchFn: async () => { dispatches += 1; return { classification: 'ACCEPTED' }; }
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 'WINNR_PLACEMENT_CANARY_REFUSED');
    assert.deepEqual(result.reasonCodes, [OUTBOUND_AUTHORIZATION_PACKAGE_MISSING]);
    assert.equal(dispatches, 0);
    assert.equal((await store.getSettings()).winnrPlacementPhenotypeV1, undefined, 'no canary state is written');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('Winnr placement canary: a package for other bytes refuses before the first send', async () => {
  const { store, dir } = await winnrCanaryStore();
  let dispatches = 0;
  try {
    const result = await runWinnrPlacementPhenotypeCanary({
      config: { encryptionKey: KEY }, storeFactory: () => store, target: 'uberbond.co@gmail.com', now: MONDAY,
      outboundAuthorization: ({ message, account }) => validRoutePackage({ account, message: { ...message, body: 'Other bytes.' } }),
      consentVerifier: ALLOW_CONSENT,
      dispatchFn: async () => { dispatches += 1; return { classification: 'ACCEPTED' }; }
    });
    assert.equal(result.ok, false);
    assert.equal(dispatches, 0);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('Winnr placement canary: a valid package yields exactly one transport call per mailbox', async () => {
  const { store, dir } = await winnrCanaryStore();
  const transport = countingTransport();
  try {
    const result = await runWinnrPlacementPhenotypeCanary({
      config: { encryptionKey: KEY }, storeFactory: () => store, target: 'uberbond.co@gmail.com', now: MONDAY,
      outboundAuthorization: ({ message, account }) => validRoutePackage({ account, message }),
      consentVerifier: ALLOW_CONSENT,
      dispatchFn: args => dispatchSmtpFleetAccount({ ...args, transportFactory: transport.factory })
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(transport.built, 3);
    assert.equal(transport.sends.length, 3);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('Winnr personal inbox canary: no package refuses before the one-time claim and before any dispatch', async () => {
  const { store, dir } = await winnrCanaryStore();
  let dispatches = 0;
  try {
    const result = await runWinnrPersonalInboxCanary({
      config: { encryptionKey: KEY }, storeFactory: () => store, target: 'mohammedwessam306@gmail.com', now: MONDAY, delayFn: async () => {},
      dispatchFn: async () => { dispatches += 1; return { classification: 'ACCEPTED' }; }
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 'WINNR_PERSONAL_CANARY_REFUSED');
    assert.deepEqual(result.reasonCodes, [OUTBOUND_AUTHORIZATION_PACKAGE_MISSING]);
    assert.equal(dispatches, 0);
    assert.equal((await store.getSettings()).winnrPersonalInboxCanary20261002, undefined, 'the one-time claim is not consumed by a refusal');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('Winnr personal inbox canary: a valid package yields exactly one transport call per sender', async () => {
  const { store, dir } = await winnrCanaryStore();
  const transport = countingTransport();
  try {
    const result = await runWinnrPersonalInboxCanary({
      config: { encryptionKey: KEY }, storeFactory: () => store, target: 'mohammedwessam306@gmail.com', now: MONDAY, delayFn: async () => {},
      outboundAuthorization: ({ message, account }) => validRoutePackage({ account, message }),
      consentVerifier: ALLOW_CONSENT,
      dispatchFn: args => dispatchSmtpFleetAccount({ ...args, transportFactory: transport.factory })
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(transport.built, 3);
    assert.equal(transport.sends.length, 3);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------------------------------------------------
// Route 9: outreach 100k batch (background worker) -> governed dispatch -> transport
// The batch needs a certified launch bundle, which this suite does not build. The exact-bytes binding it relies on is tested here.
// ---------------------------------------------------------------------------------------------------------------------

const batchMessage = { to: 'Buyer@Prospect.example.invalid', from: SENDER, subject: 'Evidence pack', body: 'Body.', campaignId: 'campaign-route', replyTo: '', listUnsubscribe: '<https://uberbond.example/u>' };
const batchLaunch = { state: OUTREACH_LAUNCH_STATES.READY, readyForGovernedCanary: true, decisionId: 'decision-route-1' };
const batchAuthorization = { authorized: true, receiptId: 'receipt-route-1', authorizedBy: 'owner', recipientEmail: 'buyer@prospect.example.invalid', campaignId: 'campaign-route', expiresAt: '2035-01-01T00:00:00.000Z' };

test('outreach 100k mirror: governedTransportBytes equals the exact object dispatchGovernedOutreach hands to the transport', async () => {
  let captured = null;
  // The package binds the mirror bytes. The dispatcher re-derives the same object and must pass the outbound gate for it.
  const mirror = governedTransportBytes({ message: batchMessage, idempotencyKey: 'idem-route-1', launchDecision: batchLaunch, authorization: batchAuthorization });
  const account = smtpAccount({ slot: 'outreach-slot', email: SENDER });
  const result = await dispatchGovernedOutreach({
    launchDecision: batchLaunch, authorization: batchAuthorization, message: batchMessage, idempotencyKey: 'idem-route-1', now: MONDAY,
    outboundAccount: account, outboundPackage: validRoutePackage({ account, message: mirror }), consentVerifier: ALLOW_CONSENT,
    transportAdapter: { send: async outbound => { captured = outbound; return { confirmed: true, providerReceiptId: 'receipt-route-1' }; } }
  });
  assert.equal(result.ok, true);
  assert.deepEqual(mirror, captured);
  assert.equal(outboundMessageDigest(mirror), outboundMessageDigest(captured));
});

test('outreach 100k gate: the mirrored bytes are refused without a package and allowed only with one for those exact bytes', () => {
  const account = smtpAccount({ slot: 'outreach-slot', email: SENDER });
  const mirror = governedTransportBytes({ message: batchMessage, idempotencyKey: 'idem-route-1', launchDecision: batchLaunch, authorization: batchAuthorization });
  assert.deepEqual(gateOutboundRoute({ account, message: mirror, consentVerifier: ALLOW_CONSENT }).reasonCodes, [OUTBOUND_AUTHORIZATION_PACKAGE_MISSING]);
  const authorization = validRoutePackage({ account, message: mirror });
  assert.equal(gateOutboundRoute({ account, message: { ...mirror, authorization }, consentVerifier: ALLOW_CONSENT }), null);
  // The same package must not authorize a different idempotency key, which would be a different wire object.
  const otherKey = governedTransportBytes({ message: batchMessage, idempotencyKey: 'idem-route-2', launchDecision: batchLaunch, authorization: batchAuthorization });
  assert.ok(gateOutboundRoute({ account, message: { ...otherKey, authorization }, consentVerifier: ALLOW_CONSENT }).reasonCodes.includes('message-digest-mismatch'));
});

// ---------------------------------------------------------------------------------------------------------------------
// Route 10: revenue report email (background worker, RevenueEngine) -> Gmail-API sendEmail
// ---------------------------------------------------------------------------------------------------------------------

function revenueCfg(dir) {
  return {
    baseUrl: 'https://audit.test', dataDir: dir, encryptionKey: KEY,
    revenue: {
      publicIntake: true, publicRateLimitPerHour: 4, freeFindings: 1, fullAuditPrice: 49, strategyAuditPrice: 299, monitoringPrice: 99,
      implementationFrom: 1000, bookingUrl: '', reportDeliveryInbox: 'B', autoEmailReports: true, paymentProvider: 'links',
      fullAuditCheckoutUrl: 'https://shop.test/buy/full', strategyAuditCheckoutUrl: 'https://shop.test/buy/strategy', monitoringCheckoutUrl: 'https://shop.test/buy/watch',
      lemonWebhookSecret: 'secret', allowTestUnlock: true, monitoringIntervalDays: 30, monitoringBatchSize: 10
    },
    google: {}, sender: { name: 'Mohamed' }
  };
}

async function seededReportLead(store, config) {
  const pipeline = { running: true, paused: false, runBatch: async () => {} };
  const engine = new RevenueEngine(store, config, pipeline);
  const created = await engine.createLead({ company: 'Acme', website: 'https://example.com', email: 'owner@example.com', industry: 'SaaS', consent: true }, '1.2.3.4');
  const lead = await store.get('leads', created.leadId);
  const prospectRow = await store.get('prospects', lead.prospectId);
  await store.patch('prospects', prospectRow.id, {
    status: 'research-complete', score: { total: 72, tier: 'B' },
    issue: { title: 'A', severity: 4, confidence: .9, evidenceUrl: 'https://example.com', evidenceExcerpt: 'x' },
    audit: [], dossier: { screenshots: [], riskFlags: [] }, completedAt: MONDAY.toISOString()
  });
  await store.add('accounts', { id: 'acct-B', slot: 'B', connected: true, email: 'reports@uberbond.example', tokens: 'unused' });
  return { lead: await store.get('leads', lead.id), prospect: await store.get('prospects', prospectRow.id) };
}

test('revenue report email: no package refuses before the provider, and the claim is released rather than left in flight', async () => {
  const { store, dir } = await tempStore();
  try {
    const config = revenueCfg(dir);
    const { lead, prospect } = await seededReportLead(store, config);
    let sends = 0;
    const engine = new RevenueEngine(store, config, { running: true, paused: false, runBatch: async () => {} }, {
      sendEmail: async () => { sends += 1; return { data: { id: 'gmail-route', threadId: 'thread-route' } }; }
    });
    const result = await engine.sendReportEmail(lead, prospect);
    assert.equal(result.sent, false);
    assert.equal(result.reason, 'outbound-authorization-refused');
    assert.deepEqual(result.reasonCodes, [OUTBOUND_AUTHORIZATION_PACKAGE_MISSING]);
    assert.equal(sends, 0);
    const after = await store.get('leads', lead.id);
    assert.ok(!after.reportEmailAttemptStatus, 'the refused claim is released');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('revenue report email: a complete package still refuses on the Gmail-API branch with zero provider calls', async () => {
  const { store, dir } = await tempStore();
  try {
    const config = revenueCfg(dir);
    const { lead, prospect } = await seededReportLead(store, config);
    let sends = 0;
    const engine = new RevenueEngine(store, config, { running: true, paused: false, runBatch: async () => {} }, {
      sendEmail: async () => { sends += 1; return { data: { id: 'gmail-route', threadId: 'thread-route' } }; },
      outboundAuthorization: ({ message, account }) => validRoutePackage({ account, message }),
      consentVerifier: ALLOW_CONSENT
    });
    const result = await engine.sendReportEmail(lead, prospect);
    assert.equal(result.sent, false);
    assert.equal(result.reason, 'outbound-authorization-refused');
    assert.deepEqual(result.reasonCodes, ['provider-not-smtp-relay']);
    assert.equal(sends, 0);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
