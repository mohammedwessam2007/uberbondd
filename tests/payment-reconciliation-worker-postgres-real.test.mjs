import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PostgresStore } from '../src/store.mjs';
import { persistVerifiedBillingEvent } from '../src/billing-webhook-repository.mjs';
import { runPaymentReconciliationTick } from '../src/payment-reconciliation-worker.mjs';

// Verified webhook evidence accumulated in the inbox and nothing ever turned it
// into canonical cleared-payment truth. `planPaymentReconciliation` decided per
// event what should happen; `claimBillingEvents` and `finishBillingEvent` were
// the lease either side of the work; nothing called any of them. A grep for
// claimBillingEvents found two comments observing that nothing calls it.
//
// This is the driver. It runs against a real database on purpose: what is being
// tested is lease behaviour, attempt accounting and terminal-state transitions,
// which are things PostgreSQL does and a fake would only pretend to.

const REAL_URL = process.env.OMNIA_V9_TEST_DATABASE_URL || '';

if (!REAL_URL) {
  test('the payment reconciliation driver proof needs OMNIA_V9_TEST_DATABASE_URL',
    { skip: 'OMNIA_V9_TEST_DATABASE_URL not set -- real reconciliation driver proof not run' }, () => {});
} else {
  let store;

  test.before(async () => {
    store = new PostgresStore({ databaseUrl: REAL_URL, ssl: false });
    await store.init();
    await store.pool.query('DELETE FROM billing_webhook_inbox');
  });

  test.after(async () => {
    await store.pool.query('DELETE FROM billing_webhook_inbox');
    await store.close();
  });

  const seed = async () => {
    const id = crypto.randomUUID();
    const event = {
      providerEventKey: `recon:${id}`,
      provider: 'lemonsqueezy',
      eventName: 'order_created',
      objectType: 'orders',
      objectId: id,
      payloadHash: crypto.createHash('sha256').update(id).digest('hex'),
      customData: { proof: true }
    };
    await persistVerifiedBillingEvent(store.pool, event);
    return event;
  };

  const rowFor = async key => (await store.pool.query(
    'SELECT status, claim_attempts, canonical_receipt_ref, error_code FROM billing_webhook_inbox WHERE provider_event_key=$1', [key]
  )).rows[0];

  // The hazard that makes this worth writing carefully.
  test('an unconfigured worker claims nothing, so it cannot walk real evidence into UNCERTAIN', async () => {
    await store.pool.query('DELETE FROM billing_webhook_inbox');
    const event = await seed();
    const before = await rowFor(event.providerEventKey);

    // Run it repeatedly, which is exactly what a scheduler would do.
    for (let pass = 0; pass < 6; pass += 1) {
      const result = await runPaymentReconciliationTick({ pool: store.pool, providerVerifier: null });
      assert.equal(result.ok, false);
      assert.equal(result.status, 'PAYMENT_PROVIDER_ADAPTER_NOT_CONFIGURED');
      assert.equal(result.claimed, 0);
    }

    const after = await rowFor(event.providerEventKey);
    assert.equal(after.status, before.status, 'no configured provider must mean no state change at all');
    assert.equal(Number(after.claim_attempts), Number(before.claim_attempts),
      'an unconfigured worker that burned attempts would push real payment evidence to UNCERTAIN');
  });

  test('the refusal reports the backlog rather than looking like a worker keeping up', async () => {
    const result = await runPaymentReconciliationTick({ pool: store.pool, providerVerifier: null });
    assert.deepEqual(result.reasonCodes, ['payment-provider-verifier-not-configured']);
    assert.notEqual(result.backlog, undefined,
      'an absent worker must be visible as a backlog with a known cause');
  });

  test('a provider-confirmed payment reconciles, carrying its canonical receipt', async () => {
    await store.pool.query('DELETE FROM billing_webhook_inbox');
    const event = await seed();

    const result = await runPaymentReconciliationTick({
      pool: store.pool,
      providerVerifier: async () => ({ cleared: true, canonicalReceiptRef: 'receipt:proof-1' })
    });

    assert.equal(result.ok, true);
    assert.equal(result.claimed, 1);
    assert.equal(result.processed[0].outcome, 'RECONCILED');
    assert.equal(result.processed[0].provider, 'lemonsqueezy', 'the provider that answered is preserved');
    assert.equal(result.externalEffectLedger.providerCalls, 1);
    assert.equal(result.externalEffectLedger.spendCents, 0, 'verification reads state; it moves no money');

    const row = await rowFor(event.providerEventKey);
    assert.equal(row.status, 'RECONCILED');
    assert.equal(row.canonical_receipt_ref, 'receipt:proof-1');
  });

  // The difference between provider evidence and a claim about it.
  test('a verifier that says cleared without a receipt reference does not clear anything', async () => {
    await store.pool.query('DELETE FROM billing_webhook_inbox');
    const event = await seed();

    const result = await runPaymentReconciliationTick({
      pool: store.pool,
      providerVerifier: async () => ({ cleared: true })
    });

    assert.equal(result.processed[0].outcome, 'UNCERTAIN');
    const row = await rowFor(event.providerEventKey);
    assert.notEqual(row.status, 'RECONCILED', 'a bare assertion of "cleared" must not become cleared truth');
    assert.equal(row.canonical_receipt_ref, null);
    assert.equal(row.error_code, 'canonical-receipt-ref-missing-from-verifier');
  });

  test('a not-yet-cleared payment stays retryable rather than being dropped', async () => {
    await store.pool.query('DELETE FROM billing_webhook_inbox');
    const event = await seed();

    const result = await runPaymentReconciliationTick({
      pool: store.pool,
      providerVerifier: async () => ({ cleared: false, errorCode: 'provider-still-pending' })
    });

    assert.equal(result.processed[0].outcome, 'RETRYABLE');
    const row = await rowFor(event.providerEventKey);
    assert.equal(row.status, 'RETRYABLE');
    assert.equal(row.canonical_receipt_ref, null);
  });

  // The uncertain case, which is the one a naive worker retries into a double
  // charge somewhere else in the system.
  test('a verifier that throws leaves the event uncertain, not retried blindly', async () => {
    await store.pool.query('DELETE FROM billing_webhook_inbox');
    const event = await seed();

    const result = await runPaymentReconciliationTick({
      pool: store.pool,
      providerVerifier: async () => { throw new Error('socket hang up'); }
    });

    assert.equal(result.processed[0].outcome, 'UNCERTAIN');
    const row = await rowFor(event.providerEventKey);
    assert.equal(row.status, 'UNCERTAIN');
    assert.equal(row.error_code, 'provider-verification-threw');
  });

  test('a reconciled event is not claimed again on the next tick', async () => {
    await store.pool.query('DELETE FROM billing_webhook_inbox');
    await seed();
    const verifier = async () => ({ cleared: true, canonicalReceiptRef: `receipt:${crypto.randomUUID()}` });

    const first = await runPaymentReconciliationTick({ pool: store.pool, providerVerifier: verifier });
    assert.equal(first.claimed, 1);

    const second = await runPaymentReconciliationTick({ pool: store.pool, providerVerifier: verifier });
    assert.equal(second.claimed, 0, 'a terminal event must not be picked up again');
    assert.equal(second.externalEffectLedger.providerCalls, 0,
      'and it must not cost another provider call');
  });

  test('two workers on one backlog do not both process the same event', async () => {
    await store.pool.query('DELETE FROM billing_webhook_inbox');
    await seed();
    const verifier = async () => ({ cleared: true, canonicalReceiptRef: `receipt:${crypto.randomUUID()}` });

    const [a, b] = await Promise.all([
      runPaymentReconciliationTick({ pool: store.pool, providerVerifier: verifier, workerRef: 'worker-a' }),
      runPaymentReconciliationTick({ pool: store.pool, providerVerifier: verifier, workerRef: 'worker-b' })
    ]);

    assert.equal(a.claimed + b.claimed, 1, 'exactly one worker may claim one event');
    assert.equal(a.externalEffectLedger.providerCalls + b.externalEffectLedger.providerCalls, 1,
      'and the provider is asked exactly once');
  });

  // The planner governs whether to act at all, and surfaces what a pass will
  // deliberately not touch.
  test('an attempt-capped event is escalated for review, not claimed again', async () => {
    await store.pool.query('DELETE FROM billing_webhook_inbox');
    const event = await seed();
    await store.pool.query(
      `UPDATE billing_webhook_inbox SET status='RETRYABLE', claim_attempts=9 WHERE provider_event_key=$1`,
      [event.providerEventKey]);

    const result = await runPaymentReconciliationTick({
      pool: store.pool,
      providerVerifier: async () => ({ cleared: true, canonicalReceiptRef: 'receipt:should-not-happen' })
    });

    assert.equal(result.claimed, 0, 'an event past its attempt cap must not be claimed again');
    assert.equal(result.externalEffectLedger.providerCalls, 0, 'and must not cost a provider call');
    assert.equal(result.escalations.length, 1, 'it needs a person, and must be visible as such');
    assert.equal(result.escalations[0].providerEventKey, event.providerEventKey);
    assert.ok(result.escalations[0].reasonCodes.includes('billing-reconciliation-attempt-cap-reached'));

    const row = await rowFor(event.providerEventKey);
    assert.equal(row.status, 'RETRYABLE', 'and its state is left exactly as it was');
  });

  test('an empty backlog costs no claim and no provider call', async () => {
    await store.pool.query('DELETE FROM billing_webhook_inbox');
    const result = await runPaymentReconciliationTick({
      pool: store.pool, providerVerifier: async () => ({ cleared: false })
    });
    assert.equal(result.ok, true);
    assert.equal(result.status, 'PAYMENT_RECONCILIATION_TICK_IDLE');
    assert.equal(result.claimed, 0);
    assert.equal(result.externalEffectLedger.providerCalls, 0);
  });

  test('a pool that is not a pool is refused before anything is claimed', async () => {
    const result = await runPaymentReconciliationTick({ pool: null, providerVerifier: async () => ({}) });
    assert.equal(result.ok, false);
    assert.deepEqual(result.reasonCodes, ['postgres-pool-required']);
  });
}
