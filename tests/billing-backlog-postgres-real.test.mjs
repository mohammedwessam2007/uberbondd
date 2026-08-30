import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PostgresStore } from '../src/store.mjs';
import { persistVerifiedBillingEvent, claimBillingEvents, finishBillingEvent } from '../src/billing-webhook-repository.mjs';
import { readSystemHealthInputs } from '../src/system-health-repository.mjs';
import { compileSystemHealthMatrix } from '../src/system-health-matrix.mjs';

const REAL_URL = process.env.OMNIA_V9_TEST_DATABASE_URL || '';

// The unit tests prove the matrix reasons correctly about a billing block. They
// cannot prove the block is built from the right rows, because that is a SQL
// question: which statuses count as unsettled, whether `everClaimed` really
// distinguishes a worker that has never run, and whether the aggregate drags any
// event key or payload hash out of the table with it.
if (!REAL_URL) {
  // A real skip, not a passing placeholder: a green test named SKIPPED is
  // indistinguishable from a proof, to a reader and to the mutation harness.
  test('the billing backlog visibility proof needs OMNIA_V9_TEST_DATABASE_URL',
    { skip: 'OMNIA_V9_TEST_DATABASE_URL not set -- real billing backlog proof not run' }, () => {});
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
      providerEventKey: `backlog:${id}`,
      provider: 'backlog-proof-provider',
      eventName: 'payment.updated',
      objectType: 'payment',
      objectId: id,
      payloadHash: crypto.createHash('sha256').update(id).digest('hex'),
      customData: { recipient: 'buyer@example.com' }
    };
  };

  const matrixNow = async () => compileSystemHealthMatrix({
    ...(await readSystemHealthInputs(store.pool)),
    now: new Date()
  });

  test('an empty inbox reads as healthy through the real query', async () => {
    const result = await matrixNow();
    assert.equal(result.matrix.billing.state, 'HEALTHY');
    assert.equal(result.matrix.billing.unsettled, 0);
  });

  // The state this system is actually in today: evidence arrives and nothing
  // claims it, because nothing calls claimBillingEvents anywhere in the tree.
  test('verified evidence that nothing has ever claimed reads as NO_WORKER', async () => {
    await persistVerifiedBillingEvent(store.pool, event());
    await persistVerifiedBillingEvent(store.pool, event());
    const result = await matrixNow();
    assert.equal(result.matrix.billing.state, 'NO_WORKER');
    assert.equal(result.matrix.billing.awaitingClaim, 2);
    assert.equal(result.matrix.billing.unsettled, 2);
    assert.equal(result.status, 'DEGRADED', 'unclaimable payment evidence is a degraded system');
  });

  test('once a worker has claimed anything, the same backlog stops reading as NO_WORKER', async () => {
    const claimed = await claimBillingEvents(store.pool, { workerRef: 'backlog-proof-worker', limit: 1 });
    assert.equal(claimed.length, 1);
    const result = await matrixNow();
    assert.notEqual(result.matrix.billing.state, 'NO_WORKER',
      'a row that has been claimed proves a worker exists, so the state must change');
    assert.equal(result.matrix.billing.claimed, 1);
    assert.equal(result.matrix.billing.unsettled, 2, 'a claimed row is still unsettled');
  });

  test('settled evidence leaves the unsettled count', async () => {
    const [row] = await store.pool.query(
      "SELECT provider_event_key FROM billing_webhook_inbox WHERE status='CLAIMED' LIMIT 1").then(r => r.rows);
    await finishBillingEvent(store.pool, {
      providerEventKey: row.provider_event_key,
      status: 'IGNORED',
      workerRef: 'backlog-proof-worker'
    });
    const result = await matrixNow();
    assert.equal(result.matrix.billing.claimed, 0);
    assert.equal(result.matrix.billing.settled, 1);
    assert.equal(result.matrix.billing.unsettled, 1);
  });

  // The rows carry a provider event key, a payload hash and a recipient address
  // in custom_data. The aggregate must bring none of it out.
  test('the real query leaks no event key, payload hash, or recipient address', async () => {
    const result = await matrixNow();
    const dump = JSON.stringify(result);
    assert.equal(dump.includes('backlog:'), false, 'no provider event key');
    assert.equal(/[a-f0-9]{64}/.test(dump), false, 'no payload hash');
    assert.equal(dump.includes('buyer@example.com'), false, 'no recipient address');
    assert.equal(dump.includes('@'), false, 'no address-shaped value at all');
  });
}
