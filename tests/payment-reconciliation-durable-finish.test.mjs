import test from 'node:test';
import assert from 'node:assert/strict';
import { runPaymentReconciliationTick } from '../src/payment-reconciliation-worker.mjs';

function fakePoolWithOneClaimableEvent() {
  return {
    async query(sql) {
      if (/SELECT provider_event_key, provider, status/.test(sql)) {
        return {
          rows: [{
            provider_event_key: 'paypal:test-order',
            provider: 'paypal',
            status: 'RECEIVED',
            claim_attempts: 0,
            claimed_at: null,
            updated_at: new Date('2026-09-04T00:00:00Z')
          }]
        };
      }
      throw new Error(`unexpected query: ${String(sql).slice(0, 80)}`);
    }
  };
}

test('provider-cleared verdict is not reported RECONCILED when durable finish write fails', async () => {
  const verifier = async () => ({
    cleared: true,
    canonicalReceiptRef: 'paypal:sandbox:order:test-order'
  });
  Object.defineProperty(verifier, 'supportedProviders', {
    value: Object.freeze(['paypal']), enumerable: true
  });

  let observedClaimScope = null;
  const result = await runPaymentReconciliationTick({
    pool: fakePoolWithOneClaimableEvent(),
    providerVerifier: verifier,
    now: () => new Date('2026-09-04T00:01:00Z'),
    claimEvents: async (_pool, options) => {
      observedClaimScope = options.providers;
      return [{
        provider_event_key: 'paypal:test-order',
        provider: 'paypal',
        event_name: 'CHECKOUT.ORDER.APPROVED',
        object_type: 'order',
        object_id: 'test-order'
      }];
    },
    finishEvent: async () => {
      throw new Error('simulated durable database write failure');
    }
  });

  assert.deepEqual(observedClaimScope, ['paypal']);
  assert.equal(result.ok, false);
  assert.equal(result.status, 'PAYMENT_RECONCILIATION_TICK_DEGRADED');
  assert.deepEqual(result.reasonCodes, ['billing-finish-not-durable']);
  assert.equal(result.durableFinishFailures, 1);
  assert.equal(result.processed[0].outcome, 'DURABLE_FINISH_FAILED');
  assert.equal(result.processed[0].intendedOutcome, 'RECONCILED');
  assert.equal(result.processed[0].finished, false);
  assert.equal(result.externalEffectLedger.providerCalls, 1);
});

test('provider verification exception also degrades if UNCERTAIN cannot be durably recorded', async () => {
  const verifier = async () => { throw new Error('provider transport failed'); };
  Object.defineProperty(verifier, 'supportedProviders', {
    value: Object.freeze(['paypal']), enumerable: true
  });

  const result = await runPaymentReconciliationTick({
    pool: fakePoolWithOneClaimableEvent(),
    providerVerifier: verifier,
    now: () => new Date('2026-09-04T00:01:00Z'),
    claimEvents: async () => [{
      provider_event_key: 'paypal:test-order',
      provider: 'paypal',
      event_name: 'CHECKOUT.ORDER.APPROVED',
      object_type: 'order',
      object_id: 'test-order'
    }],
    finishEvent: async () => {
      throw new Error('database unavailable');
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'PAYMENT_RECONCILIATION_TICK_DEGRADED');
  assert.equal(result.processed[0].outcome, 'UNCERTAIN');
  assert.equal(result.processed[0].durableFinish, false);
  assert.ok(result.processed[0].reasonCodes.includes('billing-finish-not-durable'));
  assert.equal(result.durableFinishFailures, 1);
});
