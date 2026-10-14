import test from 'node:test';
import assert from 'node:assert/strict';
import { createUberMailAgentApi, createMemoryUberMailRepository, UberMailError } from '../src/ubermail-agent-api.mjs';
import { createUberMailAgentHttp } from '../src/ubermail-agent-http.mjs';
import { createUberMailUberDosoTransport, ubermailOutboundGateMessage } from '../src/ubermail-uberdoso-bridge.mjs';
import { dispatchGovernedOutreach } from '../src/governed-outreach-dispatch.mjs';
import { governedTransportBytes } from '../src/outreach-100k-runtime-control.mjs';
import { OUTREACH_LAUNCH_STATES } from '../src/outreach-launch-gate.mjs';
import { GmailEffectAdapter, generateMessageId } from '../src/omnia-v9/integrations/providers/gmail-effect-adapter.mjs';
import { ADAPTER_OUTCOMES } from '../src/omnia-v9/integrations/external-effect-adapter.mjs';
import { createAgentMailAdapter } from '../src/agentmail-adapter.mjs';
import { OUTBOUND_AUTHORIZATION_PACKAGE_MISSING, OUTBOUND_EMERGENCY_STOP_ENV } from '../src/outbound-send-authorization.mjs';
import { validRoutePackage, ALLOW_CONSENT } from './helpers/outbound-route-package.mjs';

// Residual live send surfaces: UberMail API send/reply/forward/draft-send, the UberDoso bridge transport, the governed outreach
// dispatcher, the Gmail effect adapter and the AgentMail adapter. Each one must decide before any transport or credential use.
// Every identity, address and domain below is synthetic (.invalid or .example). No secret, provider or network is touched:
// fake transports count calls, fake fetch counts requests, and the API key is a synthetic placeholder.

const SMTP_ROUTE = { provider: 'smtp-relay', authorized: true, termsCompatible: true };
const BUYER = 'buyer@prospect.example.invalid';
const OTHER = 'colleague@prospect.example.invalid';
const OWNER_APPROVAL = { granted: true, grantedBy: 'owner:residual-test', scope: ['ubermail:send'], expiresAt: '2035-01-01T00:00:00.000Z' };
const UBM_CAMPAIGN = 'campaign-residual-ubm';

async function withEmergencyStop(fn) {
  const prior = process.env[OUTBOUND_EMERGENCY_STOP_ENV];
  process.env[OUTBOUND_EMERGENCY_STOP_ENV] = '1';
  try { return await fn(); } finally {
    if (prior === undefined) delete process.env[OUTBOUND_EMERGENCY_STOP_ENV];
    else process.env[OUTBOUND_EMERGENCY_STOP_ENV] = prior;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// UberMail API: sendMessage, replyToMessage, forwardMessage and sendDraft all reach one transport through dispatchSend.
// The API holds no provider credential, so the transport is the only effect boundary and is counted as both.
// ---------------------------------------------------------------------------------------------------------------------

async function ubermailFixture({ supplier = null, route = SMTP_ROUTE, consent = ALLOW_CONSENT } = {}) {
  const transportCalls = [];
  const supplierContexts = [];
  let credentialOpens = 0;
  const api = createUberMailAgentApi({
    repository: createMemoryUberMailRepository(),
    now: () => new Date('2026-10-14T00:00:00.000Z'),
    sendTransport: async payload => { credentialOpens += 1; transportCalls.push(payload); return { ok: true, providerReferenceId: 'ubm-ref-' + transportCalls.length }; },
    domainVerifier: async ({ domain }) => ({ verified: true, records: [{ type: 'TXT', name: '_verify.' + domain, value: 'owned' }] }),
    webhookMasterSecret: 'residual-test-webhook-secret',
    outboundRoute: route,
    outboundAuthorizationFn: supplier ? async ctx => { supplierContexts.push(ctx); return supplier(ctx); } : null,
    outboundConsentVerifier: consent
  });
  const root = await api.bootstrapRootKey();
  const auth = { apiKey: root.api_key };
  const pod = await api.createPod({ auth, name: 'Primary', idempotencyKey: 'pod:1' });
  const domain = await api.createDomain({ auth, domain: 'uberbond.agency', podId: pod.pod_id, idempotencyKey: 'domain:1' });
  await api.verifyDomain({ auth, domainId: domain.domain_id, idempotencyKey: 'domain:verify:1' });
  const inbox = await api.createInbox({ auth, username: 'mohamed', domain: 'uberbond.agency', displayName: 'Mohamed', podId: pod.pod_id, idempotencyKey: 'inbox:1' });
  const received = await api.ingestReceivedMessage({ auth: { system: true }, inboxId: inbox.inbox_id, from: BUYER, subject: 'Question', text: 'Hello' });
  const draft = await api.createDraft({ auth, inboxId: inbox.inbox_id, to: [BUYER], subject: 'Draft', text: 'Draft body.', idempotencyKey: 'draft:1' });
  return { api, auth, inbox, received, draft, transportCalls, supplierContexts, credentialOpens: () => credentialOpens };
}

const validUbmPackage = ctx => validRoutePackage({ account: ctx.account, message: ctx.message, campaignId: UBM_CAMPAIGN });
const alteredUbmPackage = ctx => validRoutePackage({ account: ctx.account, message: { ...ctx.message, text: 'Altered body.', body: 'Altered body.' }, campaignId: UBM_CAMPAIGN });
const emergencyStopUbmPackage = ctx => validRoutePackage({ account: ctx.account, message: ctx.message, campaignId: UBM_CAMPAIGN, over: { emergencyStop: true } });

const UBM_METHODS = {
  sendMessage: f => f.api.sendMessage({ auth: f.auth, inboxId: f.inbox.inbox_id, to: BUYER, subject: 'Evidence pack', text: 'Body.', approval: OWNER_APPROVAL, idempotencyKey: 'send:1' }),
  replyToMessage: f => f.api.replyToMessage({ auth: f.auth, inboxId: f.inbox.inbox_id, messageId: f.received.message_id, text: 'Reply body.', approval: OWNER_APPROVAL, idempotencyKey: 'reply:1' }),
  forwardMessage: f => f.api.forwardMessage({ auth: f.auth, inboxId: f.inbox.inbox_id, messageId: f.received.message_id, to: OTHER, text: 'FYI.', approval: OWNER_APPROVAL, idempotencyKey: 'fwd:1' }),
  sendDraft: f => f.api.sendDraft({ auth: f.auth, inboxId: f.inbox.inbox_id, draftId: f.draft.draft_id, approval: OWNER_APPROVAL, idempotencyKey: 'senddraft:1' })
};

for (const [method, call] of Object.entries(UBM_METHODS)) {
  test(`UberMail ${method}: no package, digest mismatch and emergency stop refuse with zero transport and zero credential calls`, async () => {
    const none = await ubermailFixture({ supplier: async () => null });
    await assert.rejects(() => call(none), e => e instanceof UberMailError && e.status === 403 && e.code === 'outbound-authorization-refused' && e.detail.includes(OUTBOUND_AUTHORIZATION_PACKAGE_MISSING));
    assert.equal(none.transportCalls.length, 0);
    assert.equal(none.credentialOpens(), 0);
    assert.equal((await none.api.metrics({ auth: none.auth })).sent, 0);

    const mismatch = await ubermailFixture({ supplier: alteredUbmPackage });
    await assert.rejects(() => call(mismatch), e => e instanceof UberMailError && e.code === 'outbound-authorization-refused' && e.detail.includes('message-digest-mismatch'));
    assert.equal(mismatch.transportCalls.length, 0);
    assert.equal(mismatch.credentialOpens(), 0);

    const packageStop = await ubermailFixture({ supplier: emergencyStopUbmPackage });
    await assert.rejects(() => call(packageStop), e => e instanceof UberMailError && e.detail.includes('emergency-stop-active'));
    assert.equal(packageStop.transportCalls.length, 0);

    const envStop = await ubermailFixture({ supplier: validUbmPackage });
    await withEmergencyStop(() => assert.rejects(() => call(envStop), e => e instanceof UberMailError && e.detail.includes('emergency-stop-active')));
    assert.equal(envStop.transportCalls.length, 0);
    assert.equal(envStop.credentialOpens(), 0);
  });

  test(`UberMail ${method}: a valid package for the exact bytes yields exactly one transport call`, async () => {
    const f = await ubermailFixture({ supplier: validUbmPackage });
    const result = await call(f);
    assert.ok(result.message_id, 'a sent message row is returned');
    assert.equal(f.transportCalls.length, 1);
    assert.equal(f.credentialOpens(), 1);
    assert.equal(Object.hasOwn(f.transportCalls[0], 'authorization'), false, 'the package is never placed in the transport payload');
    assert.equal((await f.api.metrics({ auth: f.auth })).sent, 1);
  });
}

test('UberMail sendMessage: an undeclared route refuses a complete package with zero transport calls', async () => {
  const f = await ubermailFixture({ supplier: validUbmPackage, route: null });
  await assert.rejects(() => UBM_METHODS.sendMessage(f), e => e instanceof UberMailError && e.detail.includes('provider-not-smtp-relay'));
  assert.equal(f.transportCalls.length, 0);
  assert.equal(f.credentialOpens(), 0);
});

test('UberMail sendMessage: a multi-recipient send is refused before any approval is requested and before any transport call', async () => {
  const f = await ubermailFixture({ supplier: validUbmPackage });
  await assert.rejects(() => f.api.sendMessage({ auth: f.auth, inboxId: f.inbox.inbox_id, to: [BUYER, OTHER], subject: 'Evidence pack', text: 'Body.', approval: OWNER_APPROVAL, idempotencyKey: 'send:multi' }),
    e => e instanceof UberMailError && e.detail.includes('single-recipient-required'));
  assert.equal(f.supplierContexts.length, 0);
  assert.equal(f.transportCalls.length, 0);
});

test('UberMail HTTP send: the package is never accepted from the request, and an unpackaged request makes zero transport calls', async () => {
  const f = await ubermailFixture({ supplier: async () => null });
  const handle = createUberMailAgentHttp({ api: f.api });
  const response = await handle({
    method: 'POST',
    path: `/v0/inboxes/${f.inbox.inbox_id}/messages/send`,
    headers: { authorization: 'Bearer ' + f.auth.apiKey },
    body: { to: BUYER, subject: 'Evidence pack', text: 'Body.', authorization: { campaignId: 'client-supplied', provider: { name: 'smtp-relay' } } },
    effectApproval: OWNER_APPROVAL
  });
  assert.equal(response.status, 403);
  assert.equal(response.body.error, 'outbound-authorization-refused');
  assert.equal(f.transportCalls.length, 0);
  assert.equal(f.credentialOpens(), 0);
});

test('UberMail HTTP send: a valid package supplied by the trusted supplier yields exactly one transport call', async () => {
  const f = await ubermailFixture({ supplier: validUbmPackage });
  const handle = createUberMailAgentHttp({ api: f.api });
  const response = await handle({
    method: 'POST',
    path: `/v0/inboxes/${f.inbox.inbox_id}/messages/send`,
    headers: { authorization: 'Bearer ' + f.auth.apiKey },
    body: { to: BUYER, subject: 'Evidence pack', text: 'Body.' },
    effectApproval: OWNER_APPROVAL
  });
  assert.equal(response.status, 201);
  assert.equal(f.transportCalls.length, 1);
});

// ---------------------------------------------------------------------------------------------------------------------
// UberDoso bridge: the transport itself reaches governedDispatch. The package arrives out of band in options.
// ---------------------------------------------------------------------------------------------------------------------

const BRIDGE_ACCOUNT = { id: 'inbox-bridge-1', slot: 'inbox-bridge-1', email: 'mohamed@uberbond.agency' };

function bridgePayload(over = {}) {
  return { idempotencyKey: 'bridge-residual-1', inboxId: 'inbox-bridge-1', from: 'mohamed@uberbond.agency', to: [BUYER], cc: [], bcc: [], replyTo: [], subject: 'Evidence pack', text: 'Body.', html: null, attachments: [], headers: {}, ...over };
}
function bridgePackage(payload, over = {}) {
  return validRoutePackage({ account: BRIDGE_ACCOUNT, message: ubermailOutboundGateMessage(payload), campaignId: 'campaign-residual-bridge', over });
}
function bridgeFixture({ route = SMTP_ROUTE } = {}) {
  const dispatches = [];
  let credentialOpens = 0;
  const transport = createUberMailUberDosoTransport({
    governedDispatch: async envelope => { credentialOpens += 1; dispatches.push(envelope); return { authorized: true, executed: true, accepted: true, providerReferenceId: 'uberdoso-ref-' + dispatches.length }; },
    outboundRoute: route,
    outboundConsentVerifier: ALLOW_CONSENT
  });
  return { transport, dispatches, credentialOpens: () => credentialOpens };
}

test('UberDoso bridge: no package, digest mismatch and emergency stop refuse with zero governed dispatch and zero credential calls', async () => {
  const payload = bridgePayload();
  const none = bridgeFixture();
  const refusedNone = await none.transport(payload, {});
  assert.equal(refusedNone.ok, false);
  assert.equal(refusedNone.reason, 'outbound-authorization-refused');
  assert.ok(refusedNone.reasonCodes.includes(OUTBOUND_AUTHORIZATION_PACKAGE_MISSING));
  assert.equal(none.dispatches.length, 0);
  assert.equal(none.credentialOpens(), 0);

  const mismatch = bridgeFixture();
  const refusedMismatch = await mismatch.transport(payload, { authorization: bridgePackage({ ...payload, text: 'Altered body.' }) });
  assert.equal(refusedMismatch.reason, 'outbound-authorization-refused');
  assert.ok(refusedMismatch.reasonCodes.includes('message-digest-mismatch'));
  assert.equal(mismatch.dispatches.length, 0);
  assert.equal(mismatch.credentialOpens(), 0);

  const stop = bridgeFixture();
  const refusedStop = await withEmergencyStop(() => stop.transport(payload, { authorization: bridgePackage(payload) }));
  assert.ok(refusedStop.reasonCodes.includes('emergency-stop-active'));
  assert.equal(stop.dispatches.length, 0);
  assert.equal(stop.credentialOpens(), 0);
});

test('UberDoso bridge: a package embedded in the payload is ignored, so it cannot authorize a send', async () => {
  const payload = bridgePayload();
  const f = bridgeFixture();
  const refused = await f.transport({ ...payload, authorization: bridgePackage(payload) }, {});
  assert.equal(refused.reason, 'outbound-authorization-refused');
  assert.equal(f.dispatches.length, 0);
});

test('UberDoso bridge: an undeclared route refuses a complete package with zero governed dispatch calls', async () => {
  const payload = bridgePayload();
  const f = bridgeFixture({ route: null });
  const refused = await f.transport(payload, { authorization: bridgePackage(payload) });
  assert.ok(refused.reasonCodes.includes('provider-not-smtp-relay'));
  assert.equal(f.dispatches.length, 0);
  assert.equal(f.credentialOpens(), 0);
});

test('UberDoso bridge: a valid package for the exact bytes yields exactly one governed dispatch call', async () => {
  const payload = bridgePayload();
  const f = bridgeFixture();
  const result = await f.transport(payload, { authorization: bridgePackage(payload) });
  assert.equal(result.ok, true);
  assert.equal(result.providerReferenceId, 'uberdoso-ref-1');
  assert.equal(f.dispatches.length, 1);
  assert.equal(f.credentialOpens(), 1);
  assert.equal(Object.hasOwn(f.dispatches[0], 'authorization'), false);
});

// ---------------------------------------------------------------------------------------------------------------------
// Governed outreach dispatch: the object handed to transportAdapter.send is decided first.
// ---------------------------------------------------------------------------------------------------------------------

const GOV_SENDER = 'mohamed@uberbond.example.invalid';
const GOV_KEY = 'idem-residual-1';
const GOV_LAUNCH = { state: OUTREACH_LAUNCH_STATES.READY, readyForGovernedCanary: true, decisionId: 'decision-residual-1' };
const GOV_AUTH = { authorized: true, receiptId: 'receipt-residual-1', authorizedBy: 'owner', recipientEmail: BUYER, campaignId: 'campaign-residual-gov', expiresAt: '2035-01-01T00:00:00.000Z' };
const GOV_MESSAGE = { to: BUYER, from: GOV_SENDER, subject: 'Evidence pack', body: 'Body.', campaignId: 'campaign-residual-gov', replyTo: '', listUnsubscribe: '<https://uberbond.example/u>' };
const GOV_ACCOUNT = { id: 'acct-residual-gov', slot: 'residual-gov-slot', email: GOV_SENDER, provider: 'smtp-relay', smtpRoute: { authorized: true, termsCompatible: true } };

function govBytes(over = {}) {
  return governedTransportBytes({ message: { ...GOV_MESSAGE, ...over }, idempotencyKey: GOV_KEY, launchDecision: GOV_LAUNCH, authorization: GOV_AUTH });
}
function govFixture() {
  const sends = [];
  let credentialOpens = 0;
  const transportAdapter = { send: async outbound => { credentialOpens += 1; sends.push(outbound); return { confirmed: true, providerReceiptId: 'smtp-receipt-' + sends.length }; } };
  return { transportAdapter, sends, credentialOpens: () => credentialOpens };
}
function govCall(f, extra = {}) {
  return dispatchGovernedOutreach({ launchDecision: GOV_LAUNCH, authorization: GOV_AUTH, message: GOV_MESSAGE, transportAdapter: f.transportAdapter, idempotencyKey: GOV_KEY, outboundAccount: GOV_ACCOUNT, consentVerifier: ALLOW_CONSENT, ...extra });
}

test('governed outreach dispatch: no package and digest mismatch refuse with zero transport and zero credential calls', async () => {
  const none = govFixture();
  const refusedNone = await govCall(none);
  assert.equal(refusedNone.ok, false);
  assert.equal(refusedNone.state, 'DISPATCH_REFUSED');
  assert.ok(refusedNone.reasonCodes.includes(OUTBOUND_AUTHORIZATION_PACKAGE_MISSING));
  assert.equal(refusedNone.providerCalls, 0);
  assert.equal(none.sends.length, 0);
  assert.equal(none.credentialOpens(), 0);

  const mismatch = govFixture();
  const refusedMismatch = await govCall(mismatch, { outboundPackage: validRoutePackage({ account: GOV_ACCOUNT, message: govBytes({ body: 'Altered body.' }) }) });
  assert.ok(refusedMismatch.reasonCodes.includes('message-digest-mismatch'));
  assert.equal(mismatch.sends.length, 0);
  assert.equal(mismatch.credentialOpens(), 0);
});

test('governed outreach dispatch: the emergency stop refuses a complete package with zero transport calls', async () => {
  const f = govFixture();
  const refused = await withEmergencyStop(() => govCall(f, { outboundPackage: validRoutePackage({ account: GOV_ACCOUNT, message: govBytes() }) }));
  assert.ok(refused.reasonCodes.includes('emergency-stop-active'));
  assert.equal(f.sends.length, 0);
  assert.equal(f.credentialOpens(), 0);
});

test('governed outreach dispatch: a complete smtp package is still refused on a Gmail-API branch with zero transport calls', async () => {
  const f = govFixture();
  const refused = await govCall(f, { outboundPackage: validRoutePackage({ account: GOV_ACCOUNT, message: govBytes() }), routeProvider: 'gmail-api' });
  assert.ok(refused.reasonCodes.includes('provider-not-smtp-relay'));
  assert.equal(f.sends.length, 0);
});

test('governed outreach dispatch: a valid package for the exact bytes yields exactly one transport call', async () => {
  const f = govFixture();
  const result = await govCall(f, { outboundPackage: validRoutePackage({ account: GOV_ACCOUNT, message: govBytes() }) });
  assert.equal(result.ok, true);
  assert.equal(result.state, 'PROVIDER_CONFIRMED_SEND');
  assert.equal(result.providerCalls, 1);
  assert.equal(f.sends.length, 1);
  assert.equal(f.credentialOpens(), 1);
  assert.deepEqual(f.sends[0], govBytes(), 'the approved bytes are exactly the bytes handed to the transport');
});

// ---------------------------------------------------------------------------------------------------------------------
// Gmail effect adapter: dispatch is the only method that reaches sendEmailFn. Gmail-API is not an admitted route, so every
// dispatch is refused before the counter, the credential and sendEmailFn, and classified REJECTED with zero sends.
// ---------------------------------------------------------------------------------------------------------------------

const GMAIL_DOMAIN = 'uberbond.example.invalid';
const GMAIL_FROM = 'mohamed@uberbond.example.invalid';

async function gmailFixture(supplier) {
  const sends = [];
  let credentialOpens = 0;
  const adapter = new GmailEffectAdapter({
    cfg: {}, account: { tokens: 'synthetic-token-not-real' }, encryptionKey: 'synthetic-key-not-real', messageIdDomain: GMAIL_DOMAIN, fromAddress: GMAIL_FROM,
    sendEmailFn: async (...args) => { credentialOpens += 1; sends.push(args); return { data: { id: 'gmail-msg-' + sends.length, threadId: 'gmail-thread-1' } }; },
    outboundAuthorizationFn: supplier, outboundConsentVerifier: ALLOW_CONSENT
  });
  const prepared = await adapter.prepare({ businessKey: 'biz-residual-1', providerEffectIdentity: generateMessageId('exec-residual-1', GMAIL_DOMAIN), executionId: 'exec-residual-1', effectPayload: { to: BUYER, subject: 'Evidence pack', body: 'Body.' } });
  return { adapter, prepared, sends, credentialOpens: () => credentialOpens };
}

test('Gmail effect adapter dispatch: no package refuses with zero sendEmailFn and zero credential calls', async () => {
  const f = await gmailFixture(async () => null);
  const result = await f.adapter.dispatch(f.prepared);
  assert.equal(result.classification, ADAPTER_OUTCOMES.REJECTED);
  assert.equal(result.dispatchError, 'outbound-authorization-refused');
  assert.ok(result.outboundRefusal.reasonCodes.includes(OUTBOUND_AUTHORIZATION_PACKAGE_MISSING));
  assert.equal(f.adapter.dispatchCallCount, 0);
  assert.equal(f.sends.length, 0);
  assert.equal(f.credentialOpens(), 0);
});

test('Gmail effect adapter dispatch: digest mismatch and emergency stop refuse with zero sendEmailFn calls', async () => {
  const mismatch = await gmailFixture(async ctx => validRoutePackage({ account: ctx.account, message: { ...ctx.message, body: 'Altered body.' } }));
  const mismatchResult = await mismatch.adapter.dispatch(mismatch.prepared);
  assert.equal(mismatchResult.classification, ADAPTER_OUTCOMES.REJECTED);
  assert.equal(mismatch.sends.length, 0);
  assert.equal(mismatch.credentialOpens(), 0);

  const stop = await gmailFixture(async ctx => validRoutePackage({ account: ctx.account, message: ctx.message, over: { emergencyStop: true } }));
  const stopResult = await withEmergencyStop(() => stop.adapter.dispatch(stop.prepared));
  assert.equal(stopResult.classification, ADAPTER_OUTCOMES.REJECTED);
  assert.equal(stop.sends.length, 0);
  assert.equal(stop.credentialOpens(), 0);
});

test('Gmail effect adapter dispatch: a valid package for the exact bytes is still refused because Gmail-API is not an admitted route', async () => {
  const f = await gmailFixture(async ctx => validRoutePackage({ account: ctx.account, message: ctx.message }));
  const result = await f.adapter.dispatch(f.prepared);
  assert.equal(result.classification, ADAPTER_OUTCOMES.REJECTED);
  assert.deepEqual(result.outboundRefusal.reasonCodes, ['provider-not-smtp-relay']);
  assert.equal(f.sends.length, 0, 'policy refusal: this surface cannot send until the policy admits a route, so no positive single-call assertion exists here');
  assert.equal(f.credentialOpens(), 0);
});

// ---------------------------------------------------------------------------------------------------------------------
// AgentMail adapter: sendMessage and replyToMessage refuse before requestJson, so no fetch and no API-key header is built.
// AgentMail is not an admitted route, so a complete package is still refused by policy.
// ---------------------------------------------------------------------------------------------------------------------

function agentmailFixture(supplier) {
  const fetches = [];
  const fetchImpl = async (url, init) => {
    fetches.push({ url, init });
    return new Response(JSON.stringify({ message_id: 'am-msg-' + fetches.length, thread_id: 'am-thread-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const adapter = createAgentMailAdapter({ apiKey: 'synthetic-agentmail-key-not-real', targetPlan: 'startup' }, { fetchImpl, sleep: async () => {}, outboundAuthorizationFn: supplier, outboundConsentVerifier: ALLOW_CONSENT });
  return { adapter, fetches };
}
const AGENTMAIL_OWNER = { granted: true, grantedBy: 'owner:residual-test', scope: ['sendMessage'], expiresAt: '2035-01-01T00:00:00.000Z' };
const AGENTMAIL_CALLS = {
  sendMessage: adapter => adapter.sendMessage({ inboxId: 'inbox-residual-am', to: BUYER, subject: 'S', text: 'B', ownerApproval: AGENTMAIL_OWNER, idempotencyKey: 'am-residual-1' }),
  replyToMessage: adapter => adapter.replyToMessage({ inboxId: 'inbox-residual-am', messageId: 'msg-residual-1', text: 'B', ownerApproval: AGENTMAIL_OWNER, idempotencyKey: 'am-residual-2' })
};

for (const [method, call] of Object.entries(AGENTMAIL_CALLS)) {
  test(`AgentMail ${method}: no package refuses with zero fetch and zero API-key requests`, async () => {
    const f = agentmailFixture(async () => null);
    const result = await call(f.adapter);
    assert.equal(result.ok, false);
    assert.equal(result.status, 'OUTBOUND_AUTHORIZATION_REFUSED');
    assert.ok(result.reasonCodes.includes(OUTBOUND_AUTHORIZATION_PACKAGE_MISSING));
    assert.equal(f.fetches.length, 0);
  });

  test(`AgentMail ${method}: digest mismatch, emergency stop and a valid package are all refused with zero fetch requests`, async () => {
    const mismatch = agentmailFixture(async ctx => validRoutePackage({ account: ctx.account, message: { ...ctx.message, text: 'Altered body.' } }));
    const mismatchResult = await call(mismatch.adapter);
    assert.equal(mismatchResult.status, 'OUTBOUND_AUTHORIZATION_REFUSED');
    assert.equal(mismatch.fetches.length, 0);

    const stop = agentmailFixture(async ctx => validRoutePackage({ account: ctx.account, message: ctx.message, over: { emergencyStop: true } }));
    const stopResult = await withEmergencyStop(() => call(stop.adapter));
    assert.equal(stopResult.status, 'OUTBOUND_AUTHORIZATION_REFUSED');
    assert.equal(stop.fetches.length, 0);

    const valid = agentmailFixture(async ctx => validRoutePackage({ account: ctx.account, message: ctx.message }));
    const validResult = await call(valid.adapter);
    assert.equal(validResult.status, 'OUTBOUND_AUTHORIZATION_REFUSED');
    assert.deepEqual(validResult.reasonCodes, ['provider-not-smtp-relay']);
    assert.equal(valid.fetches.length, 0, 'policy refusal: AgentMail is not an admitted route, so no positive single-call assertion exists here');
  });
}
