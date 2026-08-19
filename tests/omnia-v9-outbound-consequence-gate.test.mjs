import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOutboundConsequenceContext,
  enforceOutboundConsequence
} from '../src/omnia-v9/integrations/outbound-consequence-gate.mjs';
import { allowOutboundConsequenceForTest } from './helpers/outbound-consequence-gate.mjs';

function context() {
  return buildOutboundConsequenceContext({
    reservation: { id: 'reservation-1', idempotencyKey: 'initial:prospect-1' },
    prospect: { id: 'prospect-1', inbox: 'A' },
    campaign: { id: 'campaign-1' },
    account: { email: 'sender@example.test' },
    effectPayload: {
      from: 'Sender <sender@example.test>', to: 'Recipient@Example.Test',
      subject: 'Exact subject', body: 'Exact body', listUnsubscribe: 'https://example.test/unsubscribe'
    },
    idempotencyKey: 'initial:prospect-1',
    checkedAt: '2026-08-09T00:00:00.000Z'
  });
}

test('consequence gate: missing hook fails closed before any provider call can be authorized', async () => {
  const result = await enforceOutboundConsequence({ hook: null, context: context() });
  assert.equal(result.allowed, false);
  assert.equal(result.decision, 'DENY');
  assert.equal(result.reason, 'authoritative-consequence-gate-not-configured');
});

test('consequence gate: hook failure fails closed', async () => {
  const result = await enforceOutboundConsequence({
    hook: async () => { throw new Error('authority backend unavailable'); },
    context: context()
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'authoritative-consequence-gate-error');
});

test('consequence gate: ALLOW with a stale payload binding is converted to DENY', async () => {
  const result = await enforceOutboundConsequence({
    hook: async value => ({ ...allowOutboundConsequenceForTest(value), effectPayloadDigest: '0'.repeat(64) }),
    context: context()
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'effectPayloadDigest-mismatch');
});

test('consequence gate: exact authoritative and enforced bindings admit the effect', async () => {
  const result = await enforceOutboundConsequence({ hook: allowOutboundConsequenceForTest, context: context() });
  assert.equal(result.allowed, true);
  assert.equal(result.decision, 'ALLOW');
  assert.match(result.authorizationDigest, /^[a-f0-9]{64}$/);
});

test('consequence context changes when any externally visible email field changes', () => {
  const original = context();
  const changed = buildOutboundConsequenceContext({
    reservation: { id: 'reservation-1', idempotencyKey: 'initial:prospect-1' },
    prospect: { id: 'prospect-1', inbox: 'A' }, campaign: { id: 'campaign-1' },
    account: { email: 'sender@example.test' },
    effectPayload: { from: 'Sender <sender@example.test>', to: 'recipient@example.test', subject: 'Changed subject', body: 'Exact body', listUnsubscribe: 'https://example.test/unsubscribe' },
    idempotencyKey: 'initial:prospect-1', checkedAt: '2026-08-09T00:00:00.000Z'
  });
  assert.notEqual(changed.effectPayloadDigest, original.effectPayloadDigest);
  assert.notEqual(changed.actionIntentDigest, original.actionIntentDigest);
});
