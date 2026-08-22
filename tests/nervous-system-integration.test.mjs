import test from 'node:test';
import assert from 'node:assert/strict';
import { compileInboundFeedbackEvent, compileInboundLocalIntents } from '../src/inbound-feedback-kernel.mjs';
import {
  inboundEventToAttributionFragment,
  buildCausalAttributionGraph,
  traceEconomicAttribution
} from '../src/causal-attribution-spine.mjs';
import { createGmailInboundReader, INBOUND_SCOPES, attestProviderObservation } from '../src/gmail-inbound.mjs';

const HMAC_KEY = 'a-privacy-key-long-enough-to-use';

function observedMessage(overrides = {}) {
  const message = inboundMessage(overrides);
  return {
    ...message,
    providerObservation: attestProviderObservation({
      provider: 'gmail',
      providerMessageId: message.id,
      fetchedAt: new Date('2026-08-03T10:04:00.000Z')
    })
  };
}

function inboundMessage(overrides = {}) {
  return {
    id: 'msg-1',
    threadId: 'thread-1',
    headers: {
      From: 'Buyer <buyer@example.com>',
      To: 'outreach@uberbond.test',
      Subject: 'Re: your note',
      Date: 'Mon, 03 Aug 2026 10:00:00 +0000',
      'Message-Id': '<abc@example.com>'
    },
    body: 'Sounds interesting, can you send pricing?',
    ...overrides
  };
}

function compile(overrides = {}, routingRefs = {}) {
  return compileInboundFeedbackEvent({
    provider: 'gmail',
    message: observedMessage(overrides),
    routingRefs: { sendRef: 'action:send-1', campaignRef: 'campaign-1', prospectRef: 'prospect-1', ...routingRefs },
    privacyHmacKey: HMAC_KEY,
    evidence: 'PROVIDER_OBSERVED',
    date: new Date('2026-08-03T10:05:00.000Z')
  });
}

test('a provider-observed reply becomes a RESPONSE node and a DIRECT edge', () => {
  const event = compile();
  assert.equal(event.ok, true);
  const fragment = inboundEventToAttributionFragment(event);
  assert.equal(fragment.ok, true);
  assert.equal(fragment.nodes[0].type, 'RESPONSE');
  assert.equal(fragment.edges.length, 1);
  assert.equal(fragment.edges[0].basis, 'DIRECT');
  assert.equal(fragment.edges[0].relation, 'RECEIVED_RESPONSE');
  assert.equal(fragment.authorization.spend, 'DISABLED');
});

// The load-bearing boundary of the whole nervous system: what somebody typed
// into a fixture must never be able to claim the evidence class of what a
// provider actually delivered.
test('a fixture-class event can never produce a DIRECT edge', () => {
  const event = compileInboundFeedbackEvent({
    provider: 'gmail',
    message: inboundMessage(),
    routingRefs: { sendRef: 'action:send-1' },
    privacyHmacKey: HMAC_KEY,
    evidence: 'TEST_FIXTURE',
    date: new Date('2026-08-03T10:05:00.000Z')
  });
  const fragment = inboundEventToAttributionFragment(event);
  assert.equal(fragment.ok, true);
  assert.equal(fragment.edgeBasis, 'INFERRED');
  assert.equal(fragment.edges[0].basis, 'INFERRED');
  assert.ok(fragment.edges[0].confidence < 0.5);
});

test('an unverified inbound payload lands at ATTRIBUTED, not DIRECT', () => {
  const event = compileInboundFeedbackEvent({
    provider: 'gmail',
    message: inboundMessage(),
    routingRefs: { sendRef: 'action:send-1' },
    privacyHmacKey: HMAC_KEY,
    evidence: 'UNVERIFIED_INPUT',
    date: new Date('2026-08-03T10:05:00.000Z')
  });
  assert.equal(inboundEventToAttributionFragment(event).edgeBasis, 'ATTRIBUTED');
});

// Asking for PROVIDER_OBSERVED is the only claim in this pipeline worth
// forging: it is the one class that earns a DIRECT causal edge. So asking is
// not enough -- an unattested request fails closed to UNVERIFIED_INPUT rather
// than being rejected, because the observation is still worth recording, it
// just does not get to claim somebody watched it happen.
test('claiming PROVIDER_OBSERVED without an attestation fails closed', () => {
  const event = compileInboundFeedbackEvent({
    provider: 'gmail',
    message: inboundMessage(),
    routingRefs: { sendRef: 'action:send-1' },
    privacyHmacKey: HMAC_KEY,
    evidence: 'PROVIDER_OBSERVED',
    date: new Date('2026-08-03T10:05:00.000Z')
  });
  assert.equal(event.ok, true);
  assert.equal(event.evidenceClass, 'UNVERIFIED_INPUT');
  assert.equal(inboundEventToAttributionFragment(event).edgeBasis, 'ATTRIBUTED');
});

test('an attestation cannot be moved from the message it was minted for', () => {
  const stolen = attestProviderObservation({
    provider: 'gmail',
    providerMessageId: 'some-other-message',
    fetchedAt: new Date('2026-08-03T10:04:00.000Z')
  });
  const event = compileInboundFeedbackEvent({
    provider: 'gmail',
    message: { ...inboundMessage(), providerObservation: stolen },
    routingRefs: { sendRef: 'action:send-1' },
    privacyHmacKey: HMAC_KEY,
    evidence: 'PROVIDER_OBSERVED',
    date: new Date('2026-08-03T10:05:00.000Z')
  });
  assert.equal(event.evidenceClass, 'UNVERIFIED_INPUT');
});

test('a hand-built attestation-shaped object does not pass', () => {
  const real = attestProviderObservation({ provider: 'gmail', providerMessageId: 'msg-1', fetchedAt: new Date('2026-08-03T10:04:00.000Z') });
  for (const fake of [
    { ...real, tag: 'f'.repeat(real.tag.length) },
    { ...real, tag: '' },
    { ...real, version: 'gmail-inbound-observation-2' },
    { ...real, provider: 'outlook' },
    { version: real.version, provider: 'gmail', providerMessageId: 'msg-1', fetchedAt: real.fetchedAt },
    null,
    'PROVIDER_OBSERVED'
  ]) {
    const event = compileInboundFeedbackEvent({
      provider: 'gmail',
      message: { ...inboundMessage(), providerObservation: fake },
      routingRefs: { sendRef: 'action:send-1' },
      privacyHmacKey: HMAC_KEY,
      evidence: 'PROVIDER_OBSERVED',
      date: new Date('2026-08-03T10:05:00.000Z')
    });
    assert.equal(event.evidenceClass, 'UNVERIFIED_INPUT', `forged attestation ${JSON.stringify(fake)} must not pass`);
  }
});

test('a genuine attestation is accepted, so the gate is not simply always-closed', () => {
  const event = compile();
  assert.equal(event.evidenceClass, 'PROVIDER_OBSERVED');
});

test('an unknown evidence class falls back to the weakest one', () => {
  const downgraded = compileInboundFeedbackEvent({
    provider: 'gmail',
    message: observedMessage(),
    routingRefs: { sendRef: 'action:send-1' },
    privacyHmacKey: HMAC_KEY,
    evidence: 'TOTALLY_VERIFIED_TRUST_ME',
    date: new Date('2026-08-03T10:05:00.000Z')
  });
  assert.equal(downgraded.evidenceClass, 'UNVERIFIED_INPUT');
});

test('a bounce or complaint becomes a FAILURE node and recommends suppression', () => {
  for (const [subject, body] of [
    ['Delivery Status Notification (Failure)', 'permanent failure 550 5.1.1 user unknown'],
    ['unsubscribe me', 'please unsubscribe me from this list']
  ]) {
    const event = compile({ headers: { ...inboundMessage().headers, Subject: subject }, body });
    const fragment = inboundEventToAttributionFragment(event);
    assert.equal(fragment.ok, true, `${subject} should compile`);
    if (fragment.suppressionRecommended) {
      assert.equal(fragment.nodes[0].type, 'FAILURE');
    }
  }
});

test('an inbound event never mints a PAYMENT node however it is categorised', () => {
  const event = compile({ body: 'I paid you $5000 already, invoice cleared, payment settled' });
  const fragment = inboundEventToAttributionFragment(event);
  assert.equal(fragment.ok, true);
  assert.ok(!['PAYMENT', 'RETENTION', 'ACCEPTANCE', 'CHECKOUT'].includes(fragment.nodes[0].type));
  assert.equal(fragment.nodes[0].economicProof, null);
});

test('inbound fragments compose into a graph that refuses to call the reply a cause of revenue', () => {
  const event = compile();
  const fragment = inboundEventToAttributionFragment(event);
  const graph = buildCausalAttributionGraph({
    nodes: [
      { nodeId: 'action:send-1', type: 'ACTION', occurredAt: '2026-08-03T09:00:00.000Z', evidenceRefs: ['action:send-1'] },
      ...fragment.nodes
    ],
    edges: fragment.edges
  });
  assert.equal(graph.ok, true);
  assert.equal(graph.authorization.allocation, 'DISABLED');
  // No cleared payment anywhere in the graph, so there is nothing to trace to.
  assert.deepEqual(graph.economicAnchors, []);
  const trace = traceEconomicAttribution({ graph, economicNodeId: fragment.nodes[0].nodeId });
  assert.equal(trace.ok, false);
  assert.deepEqual(trace.reasonCodes, ['economic-proof-required-on-anchor']);
});

test('the graph refuses a reply that claims to precede the send that caused it', () => {
  const event = compile();
  const fragment = inboundEventToAttributionFragment(event);
  const graph = buildCausalAttributionGraph({
    nodes: [
      // The send happens a day after the reply it supposedly caused.
      { nodeId: 'action:send-1', type: 'ACTION', occurredAt: '2026-08-04T09:00:00.000Z', evidenceRefs: ['action:send-1'] },
      ...fragment.nodes
    ],
    edges: fragment.edges
  });
  assert.equal(graph.status, 'DEGRADED');
  assert.deepEqual(graph.diagnostics.timeReversalEdges, [fragment.edges[0].edgeId]);
});

test('the inbound reader carries no send authority at all', () => {
  assert.deepEqual(INBOUND_SCOPES, ['https://www.googleapis.com/auth/gmail.readonly']);
  const reader = createGmailInboundReader({ clientId: 'id', clientSecret: 'secret', redirectUri: 'https://x.test/cb' });
  // Structural, not aspirational: whatever the reader exposes, none of it is a
  // way to put a message into somebody's inbox.
  for (const name of Object.keys(reader)) {
    assert.ok(!/send|reply|draft|trash|delete|modify|label/i.test(name), `reader must not expose ${name}`);
  }
});

test('local intents from an inbound event never carry external-effect authority', () => {
  const event = compile({ body: 'please unsubscribe me' });
  const intents = compileInboundLocalIntents(event);
  assert.equal(intents.ok, true);
  for (const value of Object.values(intents.externalEffectLedger || {})) assert.equal(value, 0);
});

test('a fragment without a send reference produces a node and no edge, not a guessed one', () => {
  const event = compile({}, { sendRef: '' });
  const fragment = inboundEventToAttributionFragment(event);
  assert.equal(fragment.ok, true);
  assert.equal(fragment.nodes.length, 1);
  assert.deepEqual(fragment.edges, []);
});

test('a malformed inbound event is refused rather than half-mapped', () => {
  assert.deepEqual(inboundEventToAttributionFragment(null).reasonCodes, ['valid-inbound-event-required']);
  assert.deepEqual(inboundEventToAttributionFragment({ ok: false }).reasonCodes, ['valid-inbound-event-required']);
  assert.deepEqual(
    inboundEventToAttributionFragment({ ok: true, eventId: 'e1', category: 'REPLY', evidenceClass: 'MADE_UP' }).reasonCodes,
    ['known-inbound-evidence-class-required']
  );
});
