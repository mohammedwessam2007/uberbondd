import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchGovernedOutreach } from '../src/governed-outreach-dispatch.mjs';

const launchDecision = { state: 'READY_FOR_GOVERNED_CANARY', readyForGovernedCanary: true, decisionId: 'ubol_1' };
const authorization = {
  authorized: true,
  receiptId: 'auth:1',
  authorizedBy: 'owner',
  recipientEmail: 'buyer@example.com',
  campaignId: 'camp-1',
  expiresAt: '2026-09-16T00:00:00.000Z'
};
const message = {
  to: 'buyer@example.com',
  from: 'Mohamed <mohamed@uberbond.cloud>',
  subject: 'booking path',
  body: 'Observed a booking-path issue. Worth sending the evidence?',
  listUnsubscribe: 'https://example.com/unsub',
  campaignId: 'camp-1'
};

test('missing explicit authorization never crosses provider boundary', async () => {
  let calls = 0;
  const transportAdapter = { send: async () => { calls += 1; return { confirmed: true, providerReceiptId: 'p1' }; } };
  const result = await dispatchGovernedOutreach({ launchDecision, authorization: { ...authorization, authorized: false }, message, transportAdapter, idempotencyKey: 'k1', now: new Date('2026-09-15T00:00:00.000Z') });
  assert.equal(result.ok, false);
  assert.equal(calls, 0);
  assert.ok(result.reasonCodes.includes('explicit-dispatch-authorization-required'));
});

test('full evidence and exact authorization make exactly one provider call', async () => {
  let calls = 0;
  const transportAdapter = { send: async payload => { calls += 1; assert.equal(payload.to, 'buyer@example.com'); assert.equal(payload.idempotencyKey, 'k1'); return { confirmed: true, providerReceiptId: 'provider:1' }; } };
  const result = await dispatchGovernedOutreach({ launchDecision, authorization, message, transportAdapter, idempotencyKey: 'k1', now: new Date('2026-09-15T00:00:00.000Z') });
  assert.equal(result.ok, true);
  assert.equal(result.state, 'PROVIDER_CONFIRMED_SEND');
  assert.equal(result.messagesSent, 1);
  assert.equal(calls, 1);
  assert.equal(result.automaticRetryAuthorized, false);
});

test('authorization cannot be replayed onto a different recipient', async () => {
  let calls = 0;
  const transportAdapter = { send: async () => { calls += 1; return { confirmed: true, providerReceiptId: 'p1' }; } };
  const result = await dispatchGovernedOutreach({ launchDecision, authorization, message: { ...message, to: 'other@example.com' }, transportAdapter, idempotencyKey: 'k1', now: new Date('2026-09-15T00:00:00.000Z') });
  assert.equal(result.ok, false);
  assert.equal(calls, 0);
  assert.ok(result.reasonCodes.includes('authorization-recipient-mismatch'));
});

test('ambiguous provider outcome is quarantined and never auto-retried', async () => {
  let calls = 0;
  const transportAdapter = { send: async () => { calls += 1; return { confirmed: false }; } };
  const result = await dispatchGovernedOutreach({ launchDecision, authorization, message, transportAdapter, idempotencyKey: 'k1', now: new Date('2026-09-15T00:00:00.000Z') });
  assert.equal(result.ok, false);
  assert.equal(result.state, 'DISPATCH_OUTCOME_UNCERTAIN');
  assert.equal(result.automaticRetryAuthorized, false);
  assert.equal(calls, 1);
});
