// The CFO question: can somebody type revenue into existence?
//
// normalizeNode checked a payment node's shape -- truth level, a positive
// integer amount, a three-letter currency, a provider event id, an outcome id.
// Every one of those passes on an object typed by hand, so a literal with the
// right field names became a five-thousand-dollar anchor in the causal graph.
// The apparatus built to stop revenue being invented was checking only whether
// the invention was well-formed.
//
// A real outcomeId is a digest of the commercial-outcome policy version and the
// provider event id, so it recomputes. Requiring that means a forger has to
// produce the receipt the compiler would have produced rather than one merely
// shaped like it.
//
// This does not make revenue unforgeable by whoever controls the provider event
// id. It makes it unforgeable from nothing, which is the gap that was open.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { normalizeCausalAttributionGraph } from '../src/causal-attribution-spine.mjs';
import { COMMERCIAL_OUTCOME_POLICY_VERSION } from '../src/commercial-outcome.mjs';

function canonicalOutcomeId(eventId) {
  const digest = crypto.createHash('sha256')
    .update(JSON.stringify({ policyVersion: COMMERCIAL_OUTCOME_POLICY_VERSION, eventId }))
    .digest('hex');
  return `out_${digest.slice(0, 24)}`;
}

function paymentNode(economic) {
  return {
    nodeId: 'payment_1',
    type: 'PAYMENT',
    occurredAt: '2026-08-23T00:00:00Z',
    evidenceRefs: ['receipt:payment'],
    economic
  };
}

test('a hand-typed payment node cannot become an economic anchor', () => {
  const forged = paymentNode({
    outcomeId: 'outcome_whatever',
    truthLevel: 'CLEARED_PAYMENT',
    amountCents: 500_000,
    currency: 'USD',
    providerEventId: 'evt_i_made_this_up'
  });
  const graph = normalizeCausalAttributionGraph({ nodes: [forged], edges: [] });
  assert.ok(!JSON.stringify(graph).includes('500000'), 'a forged amount entered the graph');
});

test('the refusal names the reason rather than failing vaguely', () => {
  const forged = paymentNode({
    outcomeId: 'out_deadbeefdeadbeefdeadbeef',
    truthLevel: 'CLEARED_PAYMENT',
    amountCents: 1,
    currency: 'USD',
    providerEventId: 'evt_real_123'
  });
  const graph = normalizeCausalAttributionGraph({ nodes: [forged], edges: [] });
  const serialized = JSON.stringify(graph);
  assert.ok(serialized.includes('economic-outcome-id-does-not-recompute'), serialized.slice(0, 400));
});

test('an outcome id that recomputes from its own event id is accepted', () => {
  const eventId = 'evt_real_123';
  const genuine = paymentNode({
    outcomeId: canonicalOutcomeId(eventId),
    truthLevel: 'CLEARED_PAYMENT',
    amountCents: 4_200,
    currency: 'USD',
    providerEventId: eventId
  });
  const graph = normalizeCausalAttributionGraph({ nodes: [genuine], edges: [] });
  assert.ok(JSON.stringify(graph).includes('4200'), 'a genuine outcome was refused');
});

test('an outcome id borrowed from a different event does not transfer', () => {
  // Lifting a real id onto another event is the obvious next attempt.
  const borrowed = paymentNode({
    outcomeId: canonicalOutcomeId('evt_real_123'),
    truthLevel: 'CLEARED_PAYMENT',
    amountCents: 999_999,
    currency: 'USD',
    providerEventId: 'evt_a_different_one'
  });
  const graph = normalizeCausalAttributionGraph({ nodes: [borrowed], edges: [] });
  assert.ok(!JSON.stringify(graph).includes('999999'), 'a borrowed outcome id carried an amount across events');
});

test('a missing provider event id cannot be papered over', () => {
  const graph = normalizeCausalAttributionGraph({
    nodes: [paymentNode({
      outcomeId: canonicalOutcomeId(''),
      truthLevel: 'CLEARED_PAYMENT',
      amountCents: 100,
      currency: 'USD',
      providerEventId: ''
    })],
    edges: []
  });
  assert.ok(!JSON.stringify(graph).includes('"amountCents":100'));
});

test('an unverified truth level is still refused before any of this matters', () => {
  const eventId = 'evt_real_123';
  const graph = normalizeCausalAttributionGraph({
    nodes: [paymentNode({
      outcomeId: canonicalOutcomeId(eventId),
      truthLevel: 'PIPELINE_ESTIMATE',
      amountCents: 10_000,
      currency: 'USD',
      providerEventId: eventId
    })],
    edges: []
  });
  assert.ok(!JSON.stringify(graph).includes('10000'));
});
