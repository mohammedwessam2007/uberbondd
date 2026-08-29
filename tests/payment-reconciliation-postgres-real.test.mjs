import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PostgresStore } from '../src/store.mjs';
import { persistVerifiedBillingEvent, claimBillingEvents, finishBillingEvent } from '../src/billing-webhook-repository.mjs';

const REAL_URL = process.env.OMNIA_V9_TEST_DATABASE_URL || '';

if (!REAL_URL) {
  test('SKIPPED: set OMNIA_V9_TEST_DATABASE_URL to a throwaway PostgreSQL database for payment reconciliation lease proof', () => {
    console.log('OMNIA_V9_TEST_DATABASE_URL not set -- real payment reconciliation PostgreSQL proof skipped.');
  });
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

  const event = () => {
    const id = crypto.randomUUID();
    return {
      providerEventKey: `proof:${id}`,
      provider: 'proof-provider',
      eventName: 'payment.updated',
      objectType: 'payment',
      objectId: id,
      payloadHash: crypto.createHash('sha256').update(id).digest('hex'),
      customData: { proof: true }
    };
  };

  test('real PostgreSQL lease recovery lets exactly one worker reclaim one stale billing event', async () => {
    const e = event();
    await persistVerifiedBillingEvent(store.pool, e);
    const first = await claimBillingEvents(store.pool, { workerRef: 'proof:first', limit: 1, staleClaimMs: 60_000, maxAttempts: 3 });
    assert.equal(first.length, 1);
    assert.equal(first[0].provider_event_key, e.providerEventKey);
    assert.equal(Number(first[0].claim_attempts), 1);

    await store.pool.query(
      `UPDATE billing_webhook_inbox SET claimed_at=now()-interval '2 minutes' WHERE provider_event_key=$1`,
      [e.providerEventKey]
    );

    const [a, b] = await Promise.all([
      claimBillingEvents(store.pool, { workerRef: 'proof:a', limit: 1, staleClaimMs: 60_000, maxAttempts: 3 }),
      claimBillingEvents(store.pool, { workerRef: 'proof:b', limit: 1, staleClaimMs: 60_000, maxAttempts: 3 })
    ]);
    const recovered = [...a, ...b].filter(row => row.provider_event_key === e.providerEventKey);
    assert.equal(recovered.length, 1, 'FOR UPDATE SKIP LOCKED must allow exactly one stale-claim winner');
    assert.equal(Number(recovered[0].claim_attempts), 2);
  });

  test('real PostgreSQL attempt cap moves stale claim to UNCERTAIN and does not return it for work', async () => {
    await store.pool.query('DELETE FROM billing_webhook_inbox');
    const e = event();
    await persistVerifiedBillingEvent(store.pool, e);
    await store.pool.query(
      `UPDATE billing_webhook_inbox SET status='CLAIMED',claim_attempts=3,claimed_at=now()-interval '2 minutes',claimed_by='crashed-worker' WHERE provider_event_key=$1`,
      [e.providerEventKey]
    );

    const claimed = await claimBillingEvents(store.pool, { workerRef: 'proof:cap', limit: 1, staleClaimMs: 60_000, maxAttempts: 3 });
    assert.ok(!claimed.some(row => row.provider_event_key === e.providerEventKey));
    const { rows } = await store.pool.query(
      `SELECT status,error_code,claimed_at,claimed_by FROM billing_webhook_inbox WHERE provider_event_key=$1`,
      [e.providerEventKey]
    );
    assert.equal(rows[0].status, 'UNCERTAIN');
    assert.equal(rows[0].error_code, 'claim-attempt-cap-reached');
    assert.equal(rows[0].claimed_at, null);
    assert.equal(rows[0].claimed_by, null);
  });

  test('real PostgreSQL RETRYABLE releases the lease and RECONCILED requires canonical receipt truth', async () => {
    await store.pool.query('DELETE FROM billing_webhook_inbox');
    const e = event();
    await persistVerifiedBillingEvent(store.pool, e);
    await claimBillingEvents(store.pool, { workerRef: 'proof:retry', limit: 1 });

    const retry = await finishBillingEvent(store.pool, {
      providerEventKey: e.providerEventKey,
      status: 'RETRYABLE',
      errorCode: 'provider-temporary',
      retryAfterMs: 1_000,
      workerRef: 'proof:retry'
    });
    assert.equal(retry.status, 'RETRYABLE');
    const retryRow = await store.pool.query(
      `SELECT status,claimed_at,claimed_by,next_attempt_at FROM billing_webhook_inbox WHERE provider_event_key=$1`,
      [e.providerEventKey]
    );
    assert.equal(retryRow.rows[0].claimed_at, null);
    assert.equal(retryRow.rows[0].claimed_by, null);
    assert.ok(retryRow.rows[0].next_attempt_at);

    await assert.rejects(
      () => finishBillingEvent(store.pool, { providerEventKey: e.providerEventKey, status: 'RECONCILED', workerRef: 'proof:retry' }),
      /canonical-receipt-ref-required/
    );

    await finishBillingEvent(store.pool, {
      providerEventKey: e.providerEventKey,
      status: 'RECONCILED',
      canonicalReceiptRef: `receipt:${crypto.randomUUID()}`,
      workerRef: 'proof:retry'
    });
    const finalRow = await store.pool.query(
      `SELECT status,canonical_receipt_ref,completed_at FROM billing_webhook_inbox WHERE provider_event_key=$1`,
      [e.providerEventKey]
    );
    assert.equal(finalRow.rows[0].status, 'RECONCILED');
    assert.ok(finalRow.rows[0].canonical_receipt_ref);
    assert.ok(finalRow.rows[0].completed_at);
  });
}
