import test from 'node:test';
import assert from 'node:assert/strict';
import { compileProspectEffectTruth } from '../src/revenue-terminal-effect-truth.mjs';

test('unresolved pre-dispatch claim is UNKNOWN and does not prove provider boundary crossing', () => {
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
  assert.equal(truth.state, 'CUSTOMER_MESSAGE_EFFECT_UNKNOWN');
  assert.equal(truth.prospectMessagePerformed, null);
  assert.equal(truth.providerBoundaryCrossed, null);
  assert.equal(truth.frozenProviderCallAttemptClaims, 1);
  assert.equal(truth.frozenUnknownResults, 1);
  assert.equal(truth.unresolvedDispatchClaims, 1);
  assert.equal(truth.automaticRetryAuthorized, false);
});

test('durable uncertain receipt proves provider boundary but keeps customer message UNKNOWN', () => {
  const digest = 'c'.repeat(64);
  const truth = compileProspectEffectTruth({
    settings: {
      [`frozenProspectExecution:${digest}`]: {
        effectDigest: digest,
        status: 'UNCERTAIN',
        providerCallAttempted: true,
        effectCapRemaining: 0,
        receipt: {
          providerAccepted: false,
          effectLedger: { providerCalls: 1, customerMessages: 'UNKNOWN' },
          providerError: { classification: 'UNCERTAIN' },
          automaticRetryAuthorized: false
        }
      }
    },
    outboundEvents: []
  });
  assert.equal(truth.state, 'CUSTOMER_MESSAGE_EFFECT_UNKNOWN');
  assert.equal(truth.prospectMessagePerformed, null);
  assert.equal(truth.providerBoundaryCrossed, true);
  assert.equal(truth.frozenProviderCallAttemptClaims, 1);
  assert.equal(truth.frozenUnknownResults, 1);
  assert.equal(truth.unresolvedDispatchClaims, 0);
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
        receipt: { providerAccepted: true, providerReferenceId: 'provider-accepted-1', automaticRetryAuthorized: false }
      }
    },
    outboundEvents: []
  });
  assert.equal(truth.state, 'CONFIRMED_MESSAGE_EFFECT');
  assert.equal(truth.prospectMessagePerformed, true);
  assert.equal(truth.providerBoundaryCrossed, true);
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

test('interrupted modern dispatch with unknown provider-call fact remains unknown', () => {
  const truth = compileProspectEffectTruth({ settings: {
    'frozenProspectExecution:modern': { status: 'DISPATCHING', providerCallAttempted: null, effectCapRemaining: 0 }
  }});
  assert.equal(truth.prospectMessagePerformed, null);
  assert.equal(truth.providerBoundaryCrossed, null);
  assert.equal(truth.unresolvedDispatchClaims, 1);
  assert.equal(truth.frozenProviderCallAttemptClaims, 0);
});

test('unclassified adapter receipt remains unknown even without confirmed provider invocation', () => {
  const truth = compileProspectEffectTruth({ settings: {
    'frozenProspectExecution:malformed': { status: 'PROVIDER_UNCERTAIN_CHECKPOINTED', providerCallAttempted: null,
      receipt: { providerAccepted: false, providerError: { classification: 'UNCERTAIN' }, effectLedger: { providerCalls: null } } }
  }});
  assert.equal(truth.prospectMessagePerformed, null);
  assert.equal(truth.providerBoundaryCrossed, null);
  assert.equal(truth.frozenUnknownResults, 1);
});

test('explicit pre-effect rejection with no provider call remains no message', () => {
  const truth = compileProspectEffectTruth({ settings: {
    'frozenProspectExecution:rejected': { status: 'PROVIDER_REJECTED', providerCallAttempted: false,
      receipt: { classification: 'REJECTED', providerAccepted: false, providerCallAttempted: false, effectBoundaryCrossed: false, effectLedger: { providerCalls: 0, customerMessages: 0 } } }
  }});
  assert.equal(truth.prospectMessagePerformed, false);
  assert.equal(truth.providerBoundaryCrossed, false);
  assert.equal(truth.frozenRejectedResults, 1);
});

test('contradictory boundary and classification fields never resolve the effect', () => {
  for (const patch of [{providerCallAttempted:false},{classification:'UNCERTAIN'},{classification:'REJECTED'}]) {
    const truth=compileProspectEffectTruth({settings:{'frozenProspectExecution:conflict':{
      status:'SENT',providerCallAttempted:true,receipt:{providerAccepted:true,providerReferenceId:'ref',...patch}
    }}});
    assert.equal(truth.prospectMessagePerformed,null);
  }
  const truth=compileProspectEffectTruth({settings:{'frozenProspectExecution:rejection-conflict':{
    status:'PROVIDER_REJECTED',providerCallAttempted:false,receipt:{classification:'REJECTED',providerAccepted:false,
      providerCallAttempted:false,effectBoundaryCrossed:false,effectLedger:{providerCalls:1,customerMessages:1}}
  }}});
  assert.equal(truth.prospectMessagePerformed,null);
});

test('status-only acceptance or rejection cannot resolve a malformed receipt', () => {
  for (const status of ['SENT', 'PROVIDER_ACCEPTED_CHECKPOINTED', 'PROVIDER_REJECTED', 'PROVIDER_REJECTED_CHECKPOINTED']) {
    const truth = compileProspectEffectTruth({ settings: {
      'frozenProspectExecution:status-only': { status, providerCallAttempted: true }
    }});
    assert.equal(truth.prospectMessagePerformed, null);
    assert.equal(truth.providerBoundaryCrossed, null);
  }
});

test('contradictory accepted receipt cannot confirm a message', () => {
  const truth = compileProspectEffectTruth({ settings: {
    'frozenProspectExecution:contradiction': { status: 'SENT', providerCallAttempted: false,
      receipt: { providerAccepted: true, providerReferenceId: 'ref', effectBoundaryCrossed: false } }
  }});
  assert.equal(truth.prospectMessagePerformed, null);
});
