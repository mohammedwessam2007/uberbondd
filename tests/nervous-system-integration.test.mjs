import test from 'node:test';
import assert from 'node:assert/strict';
import {
  boundHeaders, parseInboundMime, classifyInboundEvent
} from '../src/inbound-classify.mjs';
import {
  INBOUND_SCOPES, createGmailInboundReader, createTestGmailInboundReader,
  sealInboundTokens, openInboundTokens
} from '../src/gmail-inbound.mjs';
import {
  compileInboundFeedbackEvent, compileInboundLocalIntents
} from '../src/inbound-feedback-kernel.mjs';
import {
  normalizeCausalAttributionGraph, inboundEventToCausalFragment
} from '../src/causal-attribution-spine.mjs';

const b64 = text => Buffer.from(text).toString('base64url');
const key = '1'.repeat(64);
const T0 = '2026-08-22T00:00:00.000Z';
const T1 = '2026-08-22T00:01:00.000Z';
const T2 = '2026-08-22T00:02:00.000Z';

function inboundMessage(overrides = {}) {
  return {
    id: 'msg-1',
    threadId: 'thread-1',
    payload: {
      mimeType: 'text/plain',
      headers: [
        { name: 'From', value: 'Buyer <buyer@example.com>' },
        { name: 'In-Reply-To', value: '<sent-1@example.com>' }
      ],
      body: { data: b64('Thanks, tell me more.') }
    },
    ...overrides
  };
}

function node(nodeId, type, occurredAt = T0, extra = {}) {
  return { nodeId, type, occurredAt, ...extra };
}
function directEdge(edgeId, fromNodeId, toNodeId, relation = 'LED_TO', extra = {}) {
  return { edgeId, fromNodeId, toNodeId, relation, evidenceClass: 'DIRECT', confidence: 1, evidenceRefs: ['evidence-1'], ...extra };
}
function verifiedPaymentOutcome(overrides = {}) {
  return {
    ok: true,
    outcomeId: 'out-1',
    truthLevel: 'CLEARED_PAYMENT',
    outcomeType: 'PAYMENT_CLEARED',
    occurredAt: T2,
    paymentProof: {
      providerEventId: 'evt-provider-1',
      amountCents: 25000,
      currency: 'USD'
    },
    lineage: { opportunityId: 'opp-1', experimentId: 'exp-1', channelId: 'email' },
    ...overrides
  };
}

test('MIME parser extracts simple plain text deterministically', () => {
  const result = parseInboundMime({ mimeType: 'text/plain', body: { data: b64('hello') } });
  assert.equal(result.body, 'hello');
  assert.equal(result.truncated, false);
});

test('MIME depth is bounded under hostile nesting', () => {
  let payload = { mimeType: 'text/plain', body: { data: b64('deep') } };
  for (let i = 0; i < 50; i += 1) payload = { mimeType: 'multipart/mixed', parts: [payload] };
  const result = parseInboundMime(payload, { maxMimeDepth: 5, maxMimePartCount: 1000, maxDecodedBodyBytes: 100000 });
  assert.equal(result.truncated, true);
  assert.equal(result.body, '');
});

test('MIME part count and decoded bytes are bounded', () => {
  const payload = { mimeType: 'multipart/mixed', parts: Array.from({ length: 500 }, () => ({ mimeType: 'text/plain', body: { data: b64('x'.repeat(1000)) } })) };
  const result = parseInboundMime(payload, { maxMimeDepth: 20, maxMimePartCount: 10, maxDecodedBodyBytes: 5000 });
  assert.equal(result.truncated, true);
  assert.ok(result.partCount <= 11);
  assert.ok(result.bytesUsed <= 5000);
});

test('header count and value size are bounded', () => {
  const raw = Array.from({ length: 200 }, (_, i) => ({ name: `X-${i}`, value: 'x'.repeat(200) }));
  const result = boundHeaders(raw, { maxHeaderCount: 10, maxHeaderValueBytes: 16 });
  assert.equal(Object.keys(result.headers).length, 10);
  assert.equal(result.truncated, true);
  assert.ok(Buffer.byteLength(result.headers['x-0']) <= 16);
});

test('classifier covers bounce complaint unsubscribe OOO reply and unknown', () => {
  assert.equal(classifyInboundEvent({ headers: { from: 'mailer-daemon@example.com', subject: 'Undelivered Mail' } }).category, 'bounce');
  assert.equal(classifyInboundEvent({ headers: { subject: 'Spam complaint received' }, body: 'abuse report' }).category, 'complaint');
  assert.equal(classifyInboundEvent({ headers: { subject: 'Please unsubscribe me' } }).category, 'unsubscribe');
  assert.equal(classifyInboundEvent({ headers: { subject: 'Automatic reply: Out of Office', 'auto-submitted': 'auto-replied' } }).category, 'out-of-office');
  assert.equal(classifyInboundEvent({ headers: { 'in-reply-to': '<x@example.com>' } }).category, 'reply');
  assert.equal(classifyInboundEvent({ headers: { subject: 'Ordinary note' }, body: 'ordinary' }).category, 'unknown');
});

test('classifier is label-only and contains no execution verb', () => {
  const result = classifyInboundEvent({ headers: { 'in-reply-to': '<x@example.com>' } });
  assert.deepEqual(Object.keys(result).sort(), ['category', 'confidence']);
  for (const forbidden of ['send', 'reply', 'draft', 'modify', 'delete', 'forward']) assert.equal(forbidden in result, false);
});

test('Gmail inbound scope is exactly gmail.readonly', () => {
  assert.deepEqual(INBOUND_SCOPES, ['https://www.googleapis.com/auth/gmail.readonly']);
});

test('Gmail inbound reader exposes read methods only', () => {
  const reader = createGmailInboundReader({});
  assert.deepEqual(Object.keys(reader).sort(), ['getMessage', 'getProfile', 'listMessages']);
  for (const forbidden of ['send', 'sendMessage', 'draft', 'reply', 'forward', 'modify', 'trash', 'delete', 'label']) assert.equal(forbidden in reader, false);
});

test('Gmail inbound network fails closed by default before token use', async () => {
  const reader = createGmailInboundReader({ allowNetwork: false });
  await assert.rejects(() => reader.getProfile({ tokens: {} }, key), /gmail-inbound-network-disabled/);
});

test('inbound token envelope round-trips through canonical crypto helper', () => {
  const value = { access_token: 'not-a-real-token', refresh_token: 'also-not-real', expires_at: 123 };
  const sealed = sealInboundTokens(value, key);
  assert.notDeepEqual(sealed, value);
  assert.deepEqual(openInboundTokens(sealed, key), value);
});

test('fixture Gmail reader is finite and has no write surface', async () => {
  const reader = createTestGmailInboundReader({ messagesByPage: [{ messages: [{ id: 'x' }] }], messages: { x: inboundMessage({ id: 'x' }) } });
  const page = await reader.listMessages();
  assert.equal(page.messages[0].id, 'x');
  assert.equal((await reader.getMessage(null, null, 'x')).id, 'x');
  assert.equal('sendMessage' in reader, false);
});

test('feedback kernel rejects a message without provider identity', () => {
  const result = compileInboundFeedbackEvent({ message: { payload: {} }, date: new Date(T0) });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('provider-message-id-required'));
});

test('provider-observed inbound event is privacy-safe and zero-authority', () => {
  const result = compileInboundFeedbackEvent({
    message: inboundMessage(),
    routingRefs: { campaignRef: 'campaign-1', prospectRef: 'prospect-1', sendRef: 'action-send-1' },
    privacyHmacKey: 'privacy-key-longer-than-sixteen',
    evidence: 'PROVIDER_OBSERVED',
    date: new Date(T1)
  });
  assert.equal(result.ok, true);
  assert.equal(result.evidenceClass, 'PROVIDER_OBSERVED');
  assert.equal(result.authority, 'NONE');
  assert.equal(result.executionStatus, 'NOT_RUN');
  assert.equal(result.privacy.rawBodyPersisted, false);
  assert.equal(result.privacy.rawHeadersPersisted, false);
  assert.ok(result.privacy.senderAddressHmac);
  assert.equal('body' in result, false);
  assert.equal('headers' in result, false);
  assert.deepEqual(result.externalEffectLedger, { providerCalls: 0, messages: 0, purchases: 0, deployments: 0, credentialChanges: 0, dnsChanges: 0, productionMutations: 0, spendCents: 0 });
});

test('complaint compiles stop suppress health intents but cannot execute them', () => {
  const event = compileInboundFeedbackEvent({
    message: inboundMessage({ payload: { mimeType: 'text/plain', headers: [{ name: 'Subject', value: 'Spam complaint received' }], body: { data: b64('abuse report') } } }),
    date: new Date(T1)
  });
  const compiled = compileInboundLocalIntents(event);
  assert.deepEqual(compiled.intents.map(item => item.action), ['STOP_FOLLOWUP', 'SUPPRESS_CONTACT', 'FLAG_SENDER_HEALTH']);
  for (const intent of compiled.intents) {
    assert.equal(intent.consequenceClass, 'LOCAL_PREPARATION');
    assert.equal(intent.authority, 'NONE');
    assert.equal(intent.executionStatus, 'NOT_RUN');
    assert.equal(intent.externalEffectLedger.messages, 0);
  }
});

test('unknown inbound event compiles no action', () => {
  const event = compileInboundFeedbackEvent({
    message: inboundMessage({ payload: { mimeType: 'text/plain', headers: [{ name: 'Subject', value: 'Ordinary note' }], body: { data: b64('ordinary') } } }),
    date: new Date(T1)
  });
  const compiled = compileInboundLocalIntents(event);
  assert.equal(compiled.status, 'NO_ACTION_RECOMMENDED');
  assert.equal(compiled.intents.length, 0);
});

test('simple evidence-backed causal graph passes', () => {
  const result = normalizeCausalAttributionGraph({
    nodes: [node('signal-1', 'SIGNAL', T0), node('opp-1', 'OPPORTUNITY', T1)],
    edges: [directEdge('edge-1', 'signal-1', 'opp-1', 'SUPPORTED_OPPORTUNITY')],
    date: new Date(T2)
  });
  assert.equal(result.ok, true);
  assert.equal(result.metrics.directEdgeCount, 1);
  assert.equal(result.status, 'NO_VERIFIED_ECONOMIC_ANCHORS');
});

test('DIRECT causal edge without evidence is rejected', () => {
  const result = normalizeCausalAttributionGraph({
    nodes: [node('a', 'SIGNAL', T0), node('b', 'OPPORTUNITY', T1)],
    edges: [{ edgeId: 'e', fromNodeId: 'a', toNodeId: 'b', relation: 'X', evidenceClass: 'DIRECT', confidence: 1, evidenceRefs: [] }]
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('direct-edge-evidence-required'));
});

test('conflicting duplicate node identity is rejected', () => {
  const result = normalizeCausalAttributionGraph({ nodes: [node('same', 'SIGNAL', T0), node('same', 'OPPORTUNITY', T0)] });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('node-identity-conflict:same'));
});

test('conflicting duplicate edge identity is rejected', () => {
  const result = normalizeCausalAttributionGraph({
    nodes: [node('a', 'SIGNAL', T0), node('b', 'OPPORTUNITY', T1), node('c', 'EXPERIMENT', T2)],
    edges: [directEdge('same-edge', 'a', 'b'), directEdge('same-edge', 'a', 'c')]
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('edge-identity-conflict:same-edge'));
});

test('missing causal endpoint is rejected', () => {
  const result = normalizeCausalAttributionGraph({ nodes: [node('a', 'SIGNAL', T0)], edges: [directEdge('e', 'a', 'missing')] });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('edge-endpoint-missing:e'));
});

test('self-edge is rejected', () => {
  const result = normalizeCausalAttributionGraph({ nodes: [node('a', 'SIGNAL', T0)], edges: [directEdge('e', 'a', 'a')] });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('self-edge-forbidden'));
});

test('temporal reversal is rejected', () => {
  const result = normalizeCausalAttributionGraph({
    nodes: [node('a', 'SIGNAL', T2), node('b', 'OPPORTUNITY', T0)],
    edges: [directEdge('e', 'a', 'b')]
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('temporal-reversal:e'));
});

test('causal cycle is rejected', () => {
  const result = normalizeCausalAttributionGraph({
    nodes: [node('a', 'SIGNAL', T0), node('b', 'OPPORTUNITY', T0)],
    edges: [directEdge('e1', 'a', 'b'), directEdge('e2', 'b', 'a')]
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('causal-cycle-detected'));
});

test('fake financial observation cannot mint an economic anchor', () => {
  const fake = { ok: true, outcomeId: 'fake', truthLevel: 'OBSERVED_OUTCOME', paymentProof: { amountCents: 999999, currency: 'USD', providerEventId: 'fake-provider' } };
  const result = normalizeCausalAttributionGraph({ nodes: [node('opp-1', 'OPPORTUNITY', T0)], commercialOutcomes: [fake] });
  assert.equal(result.ok, true);
  assert.equal(result.economicAnchors.length, 0);
  assert.equal(result.rejectedEconomicOutcomeCount, 1);
});

test('verified normalized cleared-payment shape creates one economic anchor only', () => {
  const result = normalizeCausalAttributionGraph({ nodes: [node('opp-1', 'OPPORTUNITY', T0)], commercialOutcomes: [verifiedPaymentOutcome()] });
  assert.equal(result.ok, true);
  assert.equal(result.economicAnchors.length, 1);
  assert.equal(result.economicAnchors[0].amountCents, 25000);
  assert.equal(result.status, 'VERIFIED_ECONOMIC_ANCHORS_PRESENT');
});

test('attributed and inferred edges remain distinct from direct evidence', () => {
  const result = normalizeCausalAttributionGraph({
    nodes: [node('a', 'SIGNAL', T0), node('b', 'OPPORTUNITY', T1), node('c', 'EXPERIMENT', T2)],
    edges: [
      { edgeId: 'ab', fromNodeId: 'a', toNodeId: 'b', relation: 'ASSOCIATED', evidenceClass: 'ATTRIBUTED', confidence: 0.7, evidenceRefs: [] },
      { edgeId: 'bc', fromNodeId: 'b', toNodeId: 'c', relation: 'HYPOTHESIZED', evidenceClass: 'INFERRED', confidence: 0.3, evidenceRefs: [] }
    ]
  });
  assert.equal(result.ok, true);
  assert.equal(result.metrics.directEdgeCount, 0);
  assert.equal(result.metrics.attributedEdgeCount, 1);
  assert.equal(result.metrics.inferredEdgeCount, 1);
});

test('provider-observed inbound response creates DIRECT send-response fragment only with explicit sendRef', () => {
  const event = compileInboundFeedbackEvent({
    message: inboundMessage(),
    routingRefs: { sendRef: 'action-send-1', campaignRef: 'campaign-1' },
    evidence: 'PROVIDER_OBSERVED',
    date: new Date(T1)
  });
  const fragment = inboundEventToCausalFragment(event);
  assert.equal(fragment.ok, true);
  assert.equal(fragment.edges.length, 1);
  assert.equal(fragment.edges[0].fromNodeId, 'action-send-1');
  assert.equal(fragment.edges[0].evidenceClass, 'DIRECT');
  assert.equal(fragment.edges[0].confidence, 1);
});

test('unverified inbound response remains ATTRIBUTED rather than becoming direct', () => {
  const event = compileInboundFeedbackEvent({ message: inboundMessage(), routingRefs: { sendRef: 'action-send-1' }, evidence: 'UNVERIFIED_INPUT', date: new Date(T1) });
  const fragment = inboundEventToCausalFragment(event);
  assert.equal(fragment.edges[0].evidenceClass, 'ATTRIBUTED');
  assert.ok(fragment.edges[0].confidence < 1);
});

test('causal spine has zero authority to allocate spend or cause business effects', () => {
  const result = normalizeCausalAttributionGraph({ nodes: [node('opp-1', 'OPPORTUNITY', T0)] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.authorization, { allocation: 'DISABLED', spend: 'DISABLED', providerCalls: 'DISABLED', businessEffects: 'DISABLED' });
  assert.deepEqual(result.externalEffectLedger, { providerCalls: 0, messages: 0, purchases: 0, deployments: 0, credentialChanges: 0, dnsChanges: 0, productionMutations: 0, spendCents: 0 });
});
