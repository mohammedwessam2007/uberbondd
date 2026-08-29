import test from 'node:test';
import assert from 'node:assert/strict';
import { compileSystemHealthMatrix } from '../src/system-health-matrix.mjs';

// Verified payment evidence was accumulating where nobody could see it.
//
// `api/webhooks/billing.mjs` writes a row into `billing_webhook_inbox` for every
// verified delivery. Nothing in this tree reads those rows: `claimBillingEvents`,
// `finishBillingEvent`, `billingBacklogSummary` and `planPaymentReconciliation`
// have no callers at all. So evidence about money arrives, is stored, and is
// never claimed, retried, timed out, dead-lettered, or mentioned to anyone.
//
// This cannot be closed by writing a reconciliation worker, because there is no
// payment provider to reconcile against and inventing one would be worse than
// the gap. What can be closed -- with no external activation -- is the silence.
//
// The distinction the operator needs is between a worker running behind and a
// worker that does not exist. Those look identical in a "pending: 3" counter and
// they are not the same fact: one resolves itself, the other never will.

const base = {
  now: '2026-08-29T12:00:00Z',
  senderHealth: [], hourlyOutbound: [], jobs: {}, database: {}, egress: {}
};
const withBilling = billing => compileSystemHealthMatrix({ ...base, billing });

test('evidence waiting that has never been claimed reports NO_WORKER, not a backlog', () => {
  const result = withBilling({
    awaitingClaim: 3, claimed: 0, uncertain: 0, settled: 0, failed: 0,
    everClaimed: 0, oldestUnsettledAt: '2026-08-29T11:59:00Z'
  });
  assert.equal(result.matrix.billing.state, 'NO_WORKER');
  assert.ok(result.matrix.billing.reasonCodes.includes('billing-evidence-waiting-and-never-claimed'));
  // Fresh by any age threshold, and still degraded: age is not the problem here.
  assert.equal(result.status, 'DEGRADED');
});

test('a worker that exists and is merely behind is a different state', () => {
  const fresh = withBilling({
    awaitingClaim: 2, claimed: 1, uncertain: 0, everClaimed: 5,
    oldestUnsettledAt: '2026-08-29T11:59:00Z'
  });
  assert.equal(fresh.matrix.billing.state, 'HEALTHY');
  assert.equal(fresh.status, 'HEALTHY');

  const ageing = withBilling({
    awaitingClaim: 2, claimed: 1, uncertain: 0, everClaimed: 5,
    oldestUnsettledAt: '2026-08-29T09:00:00Z'
  });
  assert.equal(ageing.matrix.billing.state, 'BACKLOG_AGEING');
  assert.equal(ageing.status, 'DEGRADED');
});

// The rule this repository has fought for repeatedly: a dimension that cannot be
// read must not come back as a zero, because zero is a claim.
test('an unobserved billing dimension is NOT_OBSERVED, never an empty backlog', () => {
  const result = compileSystemHealthMatrix(base);
  assert.equal(result.matrix.billing.state, 'NOT_OBSERVED');
  assert.ok(result.matrix.billing.reasonCodes.includes('billing-backlog-not-observed'));
  assert.equal('unsettled' in result.matrix.billing, false,
    'not observing a backlog must not produce a count of it');
  assert.equal(result.matrix.billing.awaitingClaim, undefined);
});

test('an empty inbox is genuinely healthy, and says so with counts', () => {
  const result = withBilling({
    awaitingClaim: 0, claimed: 0, uncertain: 0, settled: 9, failed: 1,
    everClaimed: 9, oldestUnsettledAt: null
  });
  assert.equal(result.matrix.billing.state, 'HEALTHY');
  assert.equal(result.matrix.billing.unsettled, 0);
  assert.equal(result.matrix.billing.oldestUnsettledAgeMinutes, null);
});

test('uncertain evidence counts as unsettled, because the money question is open', () => {
  const result = withBilling({
    awaitingClaim: 0, claimed: 0, uncertain: 4, everClaimed: 10,
    oldestUnsettledAt: '2026-08-29T09:00:00Z'
  });
  assert.equal(result.matrix.billing.unsettled, 4);
  assert.equal(result.matrix.billing.state, 'BACKLOG_AGEING');
});

// This endpoint is bearer-authenticated but it is still an endpoint, and the
// inbox row it summarizes holds a provider event key, a payload hash and
// custom_data. None of those are needed to answer "is evidence piling up".
test('the billing block carries no event key, payload hash, or recipient data', () => {
  const result = withBilling({
    awaitingClaim: 2, claimed: 1, uncertain: 1, settled: 3, failed: 0,
    everClaimed: 0, oldestUnsettledAt: '2026-08-29T10:00:00Z',
    // Fields a careless widening of the query might drag in.
    providerEventKey: 'evt_secret_123',
    payloadHash: 'f'.repeat(64),
    customData: { email: 'buyer@example.com' }
  });
  const dump = JSON.stringify(result.matrix.billing);
  assert.equal(dump.includes('evt_secret_123'), false, 'no provider event key');
  assert.equal(/[a-f0-9]{64}/.test(dump), false, 'no payload hash');
  assert.equal(dump.includes('@'), false, 'no recipient address');
  assert.equal(dump.includes('customData'), false, 'no provider payload');
});

test('the threshold is configurable and defaults to an hour', () => {
  const input = {
    awaitingClaim: 1, claimed: 0, uncertain: 0, everClaimed: 3,
    oldestUnsettledAt: '2026-08-29T11:30:00Z'
  };
  assert.equal(withBilling(input).matrix.billing.state, 'HEALTHY', '30 minutes is under the default hour');
  assert.equal(
    compileSystemHealthMatrix({ ...base, billing: input, billingBacklogMinutes: 15 }).matrix.billing.state,
    'BACKLOG_AGEING', 'a 15 minute threshold makes the same backlog late');
});

// Adding a dimension must not quietly relax the ones already there.
test('the existing degraded conditions still degrade on their own', () => {
  const healthyBilling = {
    awaitingClaim: 0, claimed: 0, uncertain: 0, settled: 1, failed: 0,
    everClaimed: 1, oldestUnsettledAt: null
  };
  assert.equal(compileSystemHealthMatrix({ ...base, billing: healthyBilling, jobs: { deadLetter: 1 } }).status, 'DEGRADED');
  assert.equal(compileSystemHealthMatrix({ ...base, billing: healthyBilling, senderHealth: [{ paused: true }] }).status, 'DEGRADED');
  assert.equal(compileSystemHealthMatrix({
    ...base, billing: healthyBilling, database: { activeConnections: 95, maxConnections: 100 }
  }).status, 'DEGRADED');
});
