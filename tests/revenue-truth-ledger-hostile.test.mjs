import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveRevenueTruthLedger,
  buildRevenueTruthDashboard,
  renderRevenueTruthText,
  simulatedReceiptsFromDryRun,
  REVENUE_TRUTH_STATES,
  REVENUE_TRUTH_REASON_CODES as REASON
} from '../src/revenue-truth-ledger.mjs';

const T1 = '2026-10-11T00:00:00.000Z';
const T2 = '2026-10-12T00:00:00.000Z';
const T3 = '2026-10-13T00:00:00.000Z';
const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const OFFER = 'offer-digest-fixture-0001';
const TARGET = { commitSha: SHA_A, offerDigest: OFFER };
const SENTINEL = 'SENTINEL-VALUE-DO-NOT-ECHO-7f3a91';

function receipt(type, fields = {}, { kind = 'REAL', observedAt = T1 } = {}) {
  return {
    type,
    provenance: { kind, source: 'fixture.example.invalid', digest: 'digest-fixture-0001', observedAt },
    ...fields
  };
}

function stateOf(ledger, claim) {
  return ledger.claims.find(entry => entry.claim === claim);
}

test('a simulated payment carrying a cleared-funds field is still SIMULATED_ONLY, never cleared', () => {
  const ledger = deriveRevenueTruthLedger({
    receipts: [
      receipt('payment-initiated', {}, { observedAt: T1 }),
      receipt('payment-settled', {
        providerReceiptId: 'pay_sim_0001',
        clearedFunds: true,
        cleared: true,
        amountCents: 45000
      }, { kind: 'SIMULATED', observedAt: T2 })
    ],
    target: TARGET
  });

  assert.equal(stateOf(ledger, 'payment-settled').state, REVENUE_TRUTH_STATES.SIMULATED_ONLY);
  assert.equal(stateOf(ledger, 'cash-cleared').state, REVENUE_TRUTH_STATES.SIMULATED_ONLY);
  assert.notEqual(stateOf(ledger, 'cash-cleared').state, REVENUE_TRUTH_STATES.REAL);
  assert.equal(ledger.summary.real, 1, 'only the REAL payment-initiated may count');
});

test('a simulated payment that sits beside a matching REAL cleared-funds receipt still blocks cash-cleared', () => {
  const ledger = deriveRevenueTruthLedger({
    receipts: [
      receipt('payment-initiated', {}, { observedAt: T1 }),
      receipt('payment-settled', { providerReceiptId: 'pay_rcpt_0001', clearedFunds: true }, { kind: 'SIMULATED', observedAt: T2 }),
      receipt('cleared-funds', { providerReceiptId: 'pay_rcpt_0001', cleared: true }, { observedAt: T3 })
    ],
    target: TARGET
  });

  assert.equal(stateOf(ledger, 'cash-cleared').state, REVENUE_TRUTH_STATES.SIMULATED_ONLY);
  assert.ok(stateOf(ledger, 'cash-cleared').blockingReasonCodes.includes(REASON.SIMULATED_RECEIPT_ATTACHED));
});

test('a REAL payment-settled without a provider receipt id is refused', () => {
  const ledger = deriveRevenueTruthLedger({
    receipts: [
      receipt('payment-initiated', {}, { observedAt: T1 }),
      receipt('payment-settled', {}, { observedAt: T2 }),
      receipt('cleared-funds', { cleared: true }, { observedAt: T3 })
    ],
    target: TARGET
  });

  const settled = stateOf(ledger, 'payment-settled');
  assert.equal(settled.state, REVENUE_TRUTH_STATES.NOT_EVIDENCED);
  assert.ok(settled.blockingReasonCodes.includes(REASON.PROVIDER_RECEIPT_ID_MISSING));
  assert.equal(stateOf(ledger, 'cash-cleared').state, REVENUE_TRUTH_STATES.NOT_EVIDENCED);
  assert.ok(stateOf(ledger, 'cash-cleared').blockingReasonCodes.includes(REASON.PAYMENT_SETTLED_NOT_REAL));
});

test('a blank provider receipt id is treated as absent', () => {
  const ledger = deriveRevenueTruthLedger({
    receipts: [
      receipt('payment-initiated', {}, { observedAt: T1 }),
      receipt('payment-settled', { providerReceiptId: '   ' }, { observedAt: T2 })
    ],
    target: TARGET
  });

  assert.equal(stateOf(ledger, 'payment-settled').state, REVENUE_TRUTH_STATES.NOT_EVIDENCED);
  assert.ok(stateOf(ledger, 'payment-settled').blockingReasonCodes.includes(REASON.PROVIDER_RECEIPT_ID_MISSING));
});

test('a deployment receipt for another SHA does not satisfy ci-verified', () => {
  const ledger = deriveRevenueTruthLedger({
    receipts: [receipt('deployment', { commitSha: SHA_B }, { observedAt: T2 })],
    target: TARGET
  });

  assert.equal(stateOf(ledger, 'ci-verified').state, REVENUE_TRUTH_STATES.NOT_EVIDENCED);
  assert.ok(stateOf(ledger, 'ci-verified').blockingReasonCodes.includes(REASON.RECEIPT_MISSING));
  assert.equal(stateOf(ledger, 'deployed').state, REVENUE_TRUTH_STATES.NOT_EVIDENCED);
  assert.ok(stateOf(ledger, 'deployed').blockingReasonCodes.includes(REASON.COMMIT_SHA_MISMATCH));
});

test('a successful CI receipt for another SHA does not satisfy ci-verified for the target', () => {
  const ledger = deriveRevenueTruthLedger({
    receipts: [receipt('ci-run', { commitSha: SHA_B, conclusion: 'success' }, { observedAt: T2 })],
    target: TARGET
  });

  assert.equal(stateOf(ledger, 'ci-verified').state, REVENUE_TRUTH_STATES.NOT_EVIDENCED);
  assert.ok(stateOf(ledger, 'ci-verified').blockingReasonCodes.includes(REASON.COMMIT_SHA_MISMATCH));
});

test('an old health receipt does not satisfy live-healthy after a newer deployment', () => {
  const ledger = deriveRevenueTruthLedger({
    receipts: [
      receipt('health-check', { commitSha: SHA_A, healthy: true }, { observedAt: T1 }),
      receipt('deployment', { commitSha: SHA_A }, { observedAt: T2 })
    ],
    target: TARGET
  });

  assert.equal(stateOf(ledger, 'deployed').state, REVENUE_TRUTH_STATES.REAL);
  assert.equal(stateOf(ledger, 'live-healthy').state, REVENUE_TRUTH_STATES.NOT_EVIDENCED);
  assert.ok(stateOf(ledger, 'live-healthy').blockingReasonCodes.includes(REASON.HEALTH_NOT_NEWER_THAN_DEPLOYMENT));
});

test('a newer health receipt for another SHA does not satisfy live-healthy for the target', () => {
  const ledger = deriveRevenueTruthLedger({
    receipts: [
      receipt('deployment', { commitSha: SHA_A }, { observedAt: T1 }),
      receipt('health-check', { commitSha: SHA_B, healthy: true }, { observedAt: T3 })
    ],
    target: TARGET
  });

  assert.equal(stateOf(ledger, 'live-healthy').state, REVENUE_TRUTH_STATES.NOT_EVIDENCED);
  assert.ok(stateOf(ledger, 'live-healthy').blockingReasonCodes.includes(REASON.COMMIT_SHA_MISMATCH));
});

test('an unhealthy receipt newer than the deployment does not satisfy live-healthy', () => {
  const ledger = deriveRevenueTruthLedger({
    receipts: [
      receipt('deployment', { commitSha: SHA_A }, { observedAt: T1 }),
      receipt('health-check', { commitSha: SHA_A, healthy: false }, { observedAt: T2 })
    ],
    target: TARGET
  });

  assert.ok(stateOf(ledger, 'live-healthy').blockingReasonCodes.includes(REASON.HEALTH_NOT_HEALTHY));
});

test('a SIMULATED CI success beside a REAL CI success keeps ci-verified from being REAL', () => {
  const ledger = deriveRevenueTruthLedger({
    receipts: [
      receipt('ci-run', { commitSha: SHA_A, conclusion: 'success' }, { observedAt: T1 }),
      receipt('ci-run', { commitSha: SHA_A, conclusion: 'success' }, { kind: 'SIMULATED', observedAt: T2 })
    ],
    target: TARGET
  });

  assert.equal(stateOf(ledger, 'ci-verified').state, REVENUE_TRUTH_STATES.SIMULATED_ONLY);
});

test('rendered text never contains cash cleared: YES or payment settled: YES for simulated-only evidence', () => {
  const ledger = deriveRevenueTruthLedger({
    receipts: [
      receipt('payment-initiated', {}, { kind: 'SIMULATED', observedAt: T1 }),
      receipt('payment-settled', { providerReceiptId: 'pay_sim_0001', clearedFunds: true, cleared: true }, { kind: 'SIMULATED', observedAt: T2 }),
      receipt('cleared-funds', { providerReceiptId: 'pay_sim_0001', cleared: true }, { kind: 'FIXTURE', observedAt: T3 })
    ],
    target: TARGET
  });
  const text = renderRevenueTruthText(ledger);

  assert.doesNotMatch(text, /cash cleared:\s*yes/i);
  assert.doesNotMatch(text, /payment settled:\s*yes/i);
  assert.doesNotMatch(text, /CASH CLEARED:\s*REAL/);
  assert.doesNotMatch(text, /PAYMENT SETTLED:\s*REAL/);
  assert.match(text, /^PAYMENT SETTLED: SIMULATED_ONLY /m);
  assert.match(text, /^CASH CLEARED: SIMULATED_ONLY /m);
});

test('the dashboard built from a full simulated dry run never prints cash cleared as YES', () => {
  const dryRunStages = [
    { stage: 'approved-unsent-campaign', status: 'SIMULATED_PASSED', checks: { approved: true }, facts: { sent: false } },
    { stage: 'simulated-payment', status: 'SIMULATED_PASSED', checks: { cleared: true }, facts: { clearedCents: 45000 } },
    { stage: 'reconciliation', status: 'SIMULATED_PASSED', checks: {}, facts: { clearedCashCents: 45000 } }
  ];
  const fakeResult = { version: 'uberbond.revenue-dry-run.v1', label: 'SIMULATED', stages: dryRunStages };
  const dashboard = buildRevenueTruthDashboard({
    receipts: simulatedReceiptsFromDryRun(fakeResult, { observedAt: T3 }),
    target: TARGET
  });

  assert.doesNotMatch(dashboard.text, /CASH CLEARED:\s*YES/i);
  assert.doesNotMatch(dashboard.text, /PAYMENT SETTLED:\s*YES/i);
  assert.equal(stateOf(dashboard, 'cash-cleared').state, REVENUE_TRUTH_STATES.NOT_EVIDENCED);
  assert.equal(dashboard.summary.real, 0);
});

test('receipts carrying token, password, secret, key or authorization keys are rejected and never echoed', () => {
  const ledger = deriveRevenueTruthLedger({
    receipts: [
      receipt('code-completion', { commitSha: SHA_A, token: SENTINEL }),
      receipt('test-run', { passCount: 4, failCount: 0, baselineComparison: 'NO_REGRESSION', password: SENTINEL }),
      receipt('ci-run', { commitSha: SHA_A, conclusion: 'success', secret: SENTINEL }),
      receipt('deployment', { commitSha: SHA_A, key: SENTINEL }),
      receipt('communication', { providerConfirmed: true, authorization: { value: SENTINEL } }),
      receipt('acceptance', { offerDigest: OFFER, accepted: true, nested: { Authorization: SENTINEL } }),
      receipt('payment-settled', { providerReceiptId: 'pay_rcpt_0001', 'api-key': SENTINEL }),
      receipt('health-check', { commitSha: SHA_A, healthy: true, meta: [{ accessToken: SENTINEL }] })
    ],
    target: TARGET
  });

  assert.equal(ledger.receiptCounts.valid, 0);
  assert.equal(ledger.receiptCounts.rejected, 8);
  for (const claim of ['code-completed', 'tests-passed', 'ci-verified', 'deployed', 'real-communication-sent', 'customer-accepted', 'payment-settled', 'live-healthy']) {
    assert.equal(stateOf(ledger, claim).state, REVENUE_TRUTH_STATES.NOT_EVIDENCED, `${claim} must not accept a keyed receipt`);
  }
  assert.ok(stateOf(ledger, 'code-completed').blockingReasonCodes.includes(REASON.RECEIPT_FORBIDDEN_FIELD));

  const dashboard = buildRevenueTruthDashboard({ receipts: [], target: TARGET });
  assert.equal(JSON.stringify(ledger).includes(SENTINEL), false, 'ledger must not echo a secret value');
  assert.equal(dashboard.text.includes(SENTINEL), false, 'text must not echo a secret value');
  assert.equal(JSON.stringify(ledger).includes('token'), false, 'ledger must not echo a forbidden key name');
});

test('a forbidden key on a receipt that would otherwise satisfy a claim removes the satisfaction', () => {
  const clean = deriveRevenueTruthLedger({
    receipts: [receipt('code-completion', { commitSha: SHA_A })],
    target: TARGET
  });
  const keyed = deriveRevenueTruthLedger({
    receipts: [receipt('code-completion', { commitSha: SHA_A, token: SENTINEL })],
    target: TARGET
  });

  assert.equal(stateOf(clean, 'code-completed').state, REVENUE_TRUTH_STATES.REAL);
  assert.equal(stateOf(keyed, 'code-completed').state, REVENUE_TRUTH_STATES.NOT_EVIDENCED);
});

test('a receipt nested beyond the depth limit is refused as structure, not walked', () => {
  let nested = { leaf: true };
  for (let depth = 0; depth < 20; depth += 1) nested = { next: nested };
  const ledger = deriveRevenueTruthLedger({
    receipts: [receipt('code-completion', { commitSha: SHA_A, meta: nested })],
    target: TARGET
  });

  assert.equal(stateOf(ledger, 'code-completed').state, REVENUE_TRUTH_STATES.NOT_EVIDENCED);
  assert.ok(stateOf(ledger, 'code-completed').blockingReasonCodes.includes(REASON.RECEIPT_STRUCTURE_REFUSED));
});

test('a dry-run stage receipt claiming REAL provenance is refused', () => {
  const ledger = deriveRevenueTruthLedger({
    receipts: [receipt('dry-run-stage', { stage: 'simulated-payment' }, { kind: 'REAL' })],
    target: TARGET
  });

  assert.equal(ledger.receiptCounts.valid, 0);
  assert.equal(ledger.rejectedReceipts[0].reasonCode, REASON.RECEIPT_PROVENANCE_INVALID);
  assert.equal(ledger.summary.real, 0);
});

test('a non-object receipt is refused without touching any claim', () => {
  const ledger = deriveRevenueTruthLedger({
    receipts: ['code-completion', null, ['code-completion'], 42],
    target: TARGET
  });

  assert.equal(ledger.receiptCounts.valid, 0);
  assert.equal(ledger.receiptCounts.rejected, 4);
  assert.ok(ledger.rejectedReceipts.every(item => item.reasonCode === REASON.RECEIPT_NOT_OBJECT));
  assert.equal(ledger.summary.real, 0);
});

test('a dry-run mapping cannot be coaxed into a cash-cleared receipt by stage name', () => {
  const fakeResult = {
    version: 'uberbond.revenue-dry-run.v1',
    label: 'SIMULATED',
    stages: [
      { stage: 'simulated-payment', status: 'SIMULATED_PASSED', checks: {}, facts: { cleared: true } },
      { stage: 'constructor', status: 'SIMULATED_PASSED', checks: {}, facts: {} },
      { stage: '__proto__', status: 'SIMULATED_PASSED', checks: {}, facts: {} }
    ]
  };
  const receipts = simulatedReceiptsFromDryRun(fakeResult, { observedAt: T3 });

  assert.deepEqual(receipts.map(item => item.stage), ['simulated-payment']);
  assert.equal(receipts[0].type, 'payment-initiated');
  assert.equal(receipts.some(item => item.type === 'cleared-funds' || item.type === 'payment-settled'), false);
});

test('a non-array receipts input and a null target yield NOT_EVIDENCED and no thrown error', () => {
  const ledger = deriveRevenueTruthLedger({ receipts: null, target: null });

  assert.equal(ledger.summary.notEvidenced, 11);
  assert.equal(ledger.rejectedReceipts[0].reasonCode, REASON.RECEIPTS_NOT_ARRAY);
  assert.equal(ledger.target.commitSha, null);
});
