import test from 'node:test';
import assert from 'node:assert/strict';
import { compileProspectEffectTruth } from '../src/revenue-terminal-effect-truth.mjs';

test('provider call with lost receipt is UNKNOWN, never false', () => {
  const digest = 'a'.repeat(64);
  const truth = compileProspectEffectTruth({
    settings: {
      [`frozenProspectExecution:${digest}`]: {
        effectDigest: digest,
        status: 'DISPATCHING',
        providerCallAttempted: true,
        effectCapRemaining: 0
      }
    },
    outboundEvents: []
  });
  assert.equal(truth.state, 'CUSTOMER_MESSAGE_EFFECT_UNKNOWN_AFTER_PROVIDER_BOUNDARY');
  assert.equal(truth.prospectMessagePerformed, null);
  assert.equal(truth.providerBoundaryCrossed, true);
  assert.equal(truth.frozenProviderCallAttempts, 1);
  assert.equal(truth.frozenUnknownResults, 1);
  assert.equal(truth.automaticRetryAuthorized, false);
});

test('accepted frozen receipt is a confirmed message effect', () => {
  const digest = 'b'.repeat(64);
  const truth = compileProspectEffectTruth({
    settings: {
      [`frozenProspectExecution:${digest}`]: {
        effectDigest: digest,
        status: 'SENT',
        providerCallAttempted: true,
        effectCapRemaining: 0,
        receipt: { providerAccepted: true, automaticRetryAuthorized: false }
      }
    },
    outboundEvents: []
  });
  assert.equal(truth.state, 'CONFIRMED_MESSAGE_EFFECT');
  assert.equal(truth.prospectMessagePerformed, true);
  assert.equal(truth.frozenAcceptedResults, 1);
});

test('durable sent event independently confirms a message effect', () => {
  const truth = compileProspectEffectTruth({ settings: {}, outboundEvents: [{ eventType: 'sent' }] });
  assert.equal(truth.state, 'CONFIRMED_MESSAGE_EFFECT');
  assert.equal(truth.prospectMessagePerformed, true);
  assert.equal(truth.confirmedSentEvents, 1);
});

test('no durable effect evidence remains false', () => {
  const truth = compileProspectEffectTruth({ settings: {}, outboundEvents: [] });
  assert.equal(truth.state, 'NO_DURABLE_MESSAGE_EFFECT_OBSERVED');
  assert.equal(truth.prospectMessagePerformed, false);
  assert.equal(truth.providerBoundaryCrossed, false);
});

test('unread ledgers fail closed instead of minting zero effects', () => {
  const truth = compileProspectEffectTruth({ settingsReadable: false, eventsReadable: true, settings: {}, outboundEvents: [] });
  assert.equal(truth.state, 'CHECK_FAILED');
  assert.equal(truth.prospectMessagePerformed, null);
  assert.equal(truth.providerBoundaryCrossed, null);
});
