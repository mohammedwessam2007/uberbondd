import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  deriveRevenueTruthLedger,
  buildRevenueTruthDashboard,
  renderRevenueTruthText,
  simulatedReceiptsFromDryRun,
  REVENUE_TRUTH_CLAIMS,
  REVENUE_TRUTH_LABELS,
  REVENUE_TRUTH_STATES,
  REVENUE_TRUTH_REASON_CODES as REASON
} from '../src/revenue-truth-ledger.mjs';
import {
  runRevenueDryRun,
  buildSimulatedRevenueFixtures
} from '../src/revenue-dry-run.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const NOW = '2026-10-13T00:00:00.000Z';
const T0 = '2026-10-10T00:00:00.000Z';
const T1 = '2026-10-11T00:00:00.000Z';
const T2 = '2026-10-12T00:00:00.000Z';
const T3 = '2026-10-13T00:00:00.000Z';
const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const OFFER = 'offer-digest-fixture-0001';
const TARGET = { commitSha: SHA_A, offerDigest: OFFER };

function receipt(type, fields = {}, { kind = 'REAL', observedAt = T1 } = {}) {
  return {
    type,
    provenance: { kind, source: 'fixture.example.invalid', digest: 'digest-fixture-0001', observedAt },
    ...fields
  };
}

function fullRealChain() {
  return [
    receipt('code-completion', { commitSha: SHA_A }, { observedAt: T0 }),
    receipt('test-run', { passCount: 120, failCount: 0, baselineComparison: 'NO_REGRESSION' }, { observedAt: T0 }),
    receipt('ci-run', { commitSha: SHA_A, conclusion: 'success' }, { observedAt: T0 }),
    receipt('deployment', { commitSha: SHA_A }, { observedAt: T1 }),
    receipt('health-check', { commitSha: SHA_A, healthy: true }, { observedAt: T2 }),
    receipt('authorization', { authorized: true }, { observedAt: T1 }),
    receipt('communication', { providerConfirmed: true }, { observedAt: T2 }),
    receipt('acceptance', { offerDigest: OFFER, accepted: true }, { observedAt: T2 }),
    receipt('payment-initiated', {}, { observedAt: T2 }),
    receipt('payment-settled', { providerReceiptId: 'pay_rcpt_0001' }, { observedAt: T3 }),
    receipt('cleared-funds', { providerReceiptId: 'pay_rcpt_0001', cleared: true }, { observedAt: T3 })
  ];
}

function stateOf(ledger, claim) {
  return ledger.claims.find(entry => entry.claim === claim);
}

test('the ledger has exactly eleven claims in the declared order', () => {
  assert.deepEqual([...REVENUE_TRUTH_CLAIMS], [
    'code-completed',
    'tests-passed',
    'ci-verified',
    'deployed',
    'live-healthy',
    'authorized-to-send',
    'real-communication-sent',
    'customer-accepted',
    'payment-initiated',
    'payment-settled',
    'cash-cleared'
  ]);
  const ledger = deriveRevenueTruthLedger({ receipts: [], target: TARGET });
  assert.deepEqual(ledger.claims.map(entry => entry.claim), [...REVENUE_TRUTH_CLAIMS]);
});

test('a complete chain of REAL receipts for the exact target makes all eleven claims REAL', () => {
  const ledger = deriveRevenueTruthLedger({ receipts: fullRealChain(), target: TARGET });

  for (const entry of ledger.claims) {
    assert.equal(entry.state, REVENUE_TRUTH_STATES.REAL, `${entry.claim} should be REAL`);
    assert.deepEqual(entry.blockingReasonCodes, [], `${entry.claim} should carry no blocking code`);
    assert.ok(entry.evidenceCount >= 1, `${entry.claim} should count its receipt`);
  }
  assert.equal(ledger.summary.real, 11);
  assert.equal(ledger.summary.simulatedOnly, 0);
  assert.equal(ledger.summary.notEvidenced, 0);
});

test('with no receipts every claim is NOT_EVIDENCED and never a guess', () => {
  const ledger = deriveRevenueTruthLedger({ receipts: [], target: TARGET });

  for (const entry of ledger.claims) {
    assert.equal(entry.state, REVENUE_TRUTH_STATES.NOT_EVIDENCED, `${entry.claim} must not be guessed`);
    assert.equal(entry.evidenceCount, 0);
    assert.ok(entry.blockingReasonCodes.includes(REASON.RECEIPT_MISSING), `${entry.claim} must name the gap`);
  }
});

test('each dashboard entry carries state, label, evidenceCount and blockingReasonCodes', () => {
  const dashboard = buildRevenueTruthDashboard({ receipts: fullRealChain(), target: TARGET });

  for (const entry of dashboard.claims) {
    assert.deepEqual(Object.keys(entry).sort(), ['blockingReasonCodes', 'claim', 'evidenceCount', 'label', 'state']);
    assert.equal(entry.label, REVENUE_TRUTH_LABELS[entry.claim]);
  }
  assert.equal(stateOf(dashboard, 'cash-cleared').label, 'CASH CLEARED');
});

test('code-completed requires a receipt for the exact declared commit', () => {
  const mismatched = deriveRevenueTruthLedger({
    receipts: [receipt('code-completion', { commitSha: SHA_B })],
    target: TARGET
  });
  assert.equal(stateOf(mismatched, 'code-completed').state, REVENUE_TRUTH_STATES.NOT_EVIDENCED);
  assert.ok(stateOf(mismatched, 'code-completed').blockingReasonCodes.includes(REASON.COMMIT_SHA_MISMATCH));

  const matched = deriveRevenueTruthLedger({
    receipts: [receipt('code-completion', { commitSha: SHA_A })],
    target: TARGET
  });
  assert.equal(stateOf(matched, 'code-completed').state, REVENUE_TRUTH_STATES.REAL);
});

test('tests-passed needs pass counts, zero failures and a baseline comparison that did not regress', () => {
  const cases = [
    [{ passCount: 10, failCount: 2, baselineComparison: 'NO_REGRESSION' }, REASON.TEST_FAILURES_PRESENT],
    [{ passCount: 0, failCount: 0, baselineComparison: 'NO_REGRESSION' }, REASON.TEST_PASS_COUNT_ZERO],
    [{ passCount: '10', failCount: 0, baselineComparison: 'NO_REGRESSION' }, REASON.TEST_COUNTS_INVALID],
    [{ passCount: 10, failCount: 0 }, REASON.BASELINE_COMPARISON_MISSING],
    [{ passCount: 10, failCount: 0, baselineComparison: 'REGRESSED' }, REASON.TEST_REGRESSION_AGAINST_BASELINE],
    [{ passCount: 10, failCount: 0, baselineComparison: 'NOT_COMPARED' }, REASON.BASELINE_NOT_COMPARED]
  ];
  for (const [fields, code] of cases) {
    const ledger = deriveRevenueTruthLedger({ receipts: [receipt('test-run', fields)], target: TARGET });
    assert.equal(stateOf(ledger, 'tests-passed').state, REVENUE_TRUTH_STATES.NOT_EVIDENCED);
    assert.ok(stateOf(ledger, 'tests-passed').blockingReasonCodes.includes(code), `expected ${code}`);
  }

  const improved = deriveRevenueTruthLedger({
    receipts: [receipt('test-run', { passCount: 10, failCount: 0, baselineComparison: 'IMPROVED' })],
    target: TARGET
  });
  assert.equal(stateOf(improved, 'tests-passed').state, REVENUE_TRUTH_STATES.REAL);
});

test('ci-verified requires a successful CI receipt for the exact SHA', () => {
  const failing = deriveRevenueTruthLedger({
    receipts: [receipt('ci-run', { commitSha: SHA_A, conclusion: 'failure' })],
    target: TARGET
  });
  assert.ok(stateOf(failing, 'ci-verified').blockingReasonCodes.includes(REASON.CI_CONCLUSION_NOT_SUCCESS));

  const otherSha = deriveRevenueTruthLedger({
    receipts: [receipt('ci-run', { commitSha: SHA_B, conclusion: 'success' })],
    target: TARGET
  });
  assert.equal(stateOf(otherSha, 'ci-verified').state, REVENUE_TRUTH_STATES.NOT_EVIDENCED);
  assert.ok(stateOf(otherSha, 'ci-verified').blockingReasonCodes.includes(REASON.COMMIT_SHA_MISMATCH));
});

test('deployed requires a deployment receipt for the exact commit SHA', () => {
  const ledger = deriveRevenueTruthLedger({
    receipts: [receipt('deployment', { commitSha: SHA_B })],
    target: TARGET
  });
  assert.equal(stateOf(ledger, 'deployed').state, REVENUE_TRUTH_STATES.NOT_EVIDENCED);
  assert.ok(stateOf(ledger, 'deployed').blockingReasonCodes.includes(REASON.COMMIT_SHA_MISMATCH));
});

test('live-healthy requires a healthy receipt newer than the deployment for the same SHA', () => {
  const stale = deriveRevenueTruthLedger({
    receipts: [
      receipt('deployment', { commitSha: SHA_A }, { observedAt: T2 }),
      receipt('health-check', { commitSha: SHA_A, healthy: true }, { observedAt: T1 })
    ],
    target: TARGET
  });
  assert.equal(stateOf(stale, 'live-healthy').state, REVENUE_TRUTH_STATES.NOT_EVIDENCED);
  assert.ok(stateOf(stale, 'live-healthy').blockingReasonCodes.includes(REASON.HEALTH_NOT_NEWER_THAN_DEPLOYMENT));

  const fresh = deriveRevenueTruthLedger({
    receipts: [
      receipt('deployment', { commitSha: SHA_A }, { observedAt: T1 }),
      receipt('health-check', { commitSha: SHA_A, healthy: true }, { observedAt: T2 })
    ],
    target: TARGET
  });
  assert.equal(stateOf(fresh, 'live-healthy').state, REVENUE_TRUTH_STATES.REAL);
});

test('live-healthy is not evidenced without a REAL deployment for the target', () => {
  const ledger = deriveRevenueTruthLedger({
    receipts: [receipt('health-check', { commitSha: SHA_A, healthy: true }, { observedAt: T2 })],
    target: TARGET
  });
  assert.equal(stateOf(ledger, 'live-healthy').state, REVENUE_TRUTH_STATES.NOT_EVIDENCED);
  assert.ok(stateOf(ledger, 'live-healthy').blockingReasonCodes.includes(REASON.DEPLOYMENT_NOT_EVIDENCED));
});

test('real-communication-sent is not inferred from authorized-to-send', () => {
  const ledger = deriveRevenueTruthLedger({
    receipts: [receipt('authorization', { authorized: true })],
    target: TARGET
  });
  assert.equal(stateOf(ledger, 'authorized-to-send').state, REVENUE_TRUTH_STATES.REAL);
  assert.equal(stateOf(ledger, 'real-communication-sent').state, REVENUE_TRUTH_STATES.NOT_EVIDENCED);
  assert.ok(stateOf(ledger, 'real-communication-sent').blockingReasonCodes.includes(REASON.RECEIPT_MISSING));
});

test('real-communication-sent needs a provider-confirmed receipt', () => {
  const ledger = deriveRevenueTruthLedger({
    receipts: [receipt('communication', { providerConfirmed: false })],
    target: TARGET
  });
  assert.equal(stateOf(ledger, 'real-communication-sent').state, REVENUE_TRUTH_STATES.NOT_EVIDENCED);
  assert.ok(stateOf(ledger, 'real-communication-sent').blockingReasonCodes.includes(REASON.PROVIDER_CONFIRMATION_MISSING));
});

test('customer-accepted needs an accepted REAL receipt bound to the declared offer digest', () => {
  const mismatch = deriveRevenueTruthLedger({
    receipts: [receipt('acceptance', { offerDigest: 'offer-digest-other-0002', accepted: true })],
    target: TARGET
  });
  assert.equal(stateOf(mismatch, 'customer-accepted').state, REVENUE_TRUTH_STATES.NOT_EVIDENCED);
  assert.ok(stateOf(mismatch, 'customer-accepted').blockingReasonCodes.includes(REASON.OFFER_DIGEST_MISMATCH));

  const undeclared = deriveRevenueTruthLedger({
    receipts: [receipt('acceptance', { offerDigest: OFFER, accepted: true })],
    target: { commitSha: SHA_A }
  });
  assert.ok(stateOf(undeclared, 'customer-accepted').blockingReasonCodes.includes(REASON.OFFER_DIGEST_NOT_DECLARED));

  const notAccepted = deriveRevenueTruthLedger({
    receipts: [receipt('acceptance', { offerDigest: OFFER, accepted: false })],
    target: TARGET
  });
  assert.ok(stateOf(notAccepted, 'customer-accepted').blockingReasonCodes.includes(REASON.ACCEPTANCE_NOT_GRANTED));
});

test('payment-settled requires payment-initiated and a provider receipt id', () => {
  const noInitiated = deriveRevenueTruthLedger({
    receipts: [receipt('payment-settled', { providerReceiptId: 'pay_rcpt_0001' }, { observedAt: T3 })],
    target: TARGET
  });
  assert.equal(stateOf(noInitiated, 'payment-settled').state, REVENUE_TRUTH_STATES.NOT_EVIDENCED);
  assert.ok(stateOf(noInitiated, 'payment-settled').blockingReasonCodes.includes(REASON.PAYMENT_INITIATED_NOT_REAL));

  const settledBeforeInitiated = deriveRevenueTruthLedger({
    receipts: [
      receipt('payment-initiated', {}, { observedAt: T3 }),
      receipt('payment-settled', { providerReceiptId: 'pay_rcpt_0001' }, { observedAt: T1 })
    ],
    target: TARGET
  });
  assert.ok(stateOf(settledBeforeInitiated, 'payment-settled').blockingReasonCodes.includes(REASON.PAYMENT_ORDER_INVALID));
});

test('cash-cleared needs a REAL settled payment and a matching cleared-funds receipt', () => {
  const noFunds = deriveRevenueTruthLedger({
    receipts: [
      receipt('payment-initiated', {}, { observedAt: T1 }),
      receipt('payment-settled', { providerReceiptId: 'pay_rcpt_0001' }, { observedAt: T2 })
    ],
    target: TARGET
  });
  assert.equal(stateOf(noFunds, 'payment-settled').state, REVENUE_TRUTH_STATES.REAL);
  assert.equal(stateOf(noFunds, 'cash-cleared').state, REVENUE_TRUTH_STATES.NOT_EVIDENCED);
  assert.ok(stateOf(noFunds, 'cash-cleared').blockingReasonCodes.includes(REASON.CLEARED_FUNDS_RECEIPT_MISSING));

  const otherProvider = deriveRevenueTruthLedger({
    receipts: [
      receipt('payment-initiated', {}, { observedAt: T1 }),
      receipt('payment-settled', { providerReceiptId: 'pay_rcpt_0001' }, { observedAt: T2 }),
      receipt('cleared-funds', { providerReceiptId: 'pay_rcpt_9999', cleared: true }, { observedAt: T2 })
    ],
    target: TARGET
  });
  assert.equal(stateOf(otherProvider, 'cash-cleared').state, REVENUE_TRUTH_STATES.NOT_EVIDENCED);
  assert.ok(stateOf(otherProvider, 'cash-cleared').blockingReasonCodes.includes(REASON.CLEARED_FUNDS_PROVIDER_MISMATCH));

  const unconfirmed = deriveRevenueTruthLedger({
    receipts: [
      receipt('payment-initiated', {}, { observedAt: T1 }),
      receipt('payment-settled', { providerReceiptId: 'pay_rcpt_0001' }, { observedAt: T2 }),
      receipt('cleared-funds', { providerReceiptId: 'pay_rcpt_0001', cleared: false }, { observedAt: T2 })
    ],
    target: TARGET
  });
  assert.ok(stateOf(unconfirmed, 'cash-cleared').blockingReasonCodes.includes(REASON.CLEARED_FUNDS_NOT_CONFIRMED));
});

test('a claim whose dependency is only simulated names the dependency, not a missing receipt', () => {
  const ledger = deriveRevenueTruthLedger({
    receipts: [
      receipt('payment-initiated', {}, { kind: 'SIMULATED' }),
      receipt('payment-settled', { providerReceiptId: 'pay_rcpt_0001' }, { observedAt: T2 })
    ],
    target: TARGET
  });
  assert.equal(stateOf(ledger, 'payment-initiated').state, REVENUE_TRUTH_STATES.SIMULATED_ONLY);
  assert.equal(stateOf(ledger, 'payment-settled').state, REVENUE_TRUTH_STATES.NOT_EVIDENCED);
  assert.ok(stateOf(ledger, 'payment-settled').blockingReasonCodes.includes(REASON.DEPENDENCY_SIMULATED_ONLY));
});

test('a SIMULATED or FIXTURE receipt yields SIMULATED_ONLY and never REAL', () => {
  for (const kind of ['SIMULATED', 'FIXTURE']) {
    const ledger = deriveRevenueTruthLedger({
      receipts: fullRealChain().map(item => (item.type === 'ci-run'
        ? { ...item, provenance: { ...item.provenance, kind } }
        : item)),
      target: TARGET
    });
    assert.equal(stateOf(ledger, 'ci-verified').state, REVENUE_TRUTH_STATES.SIMULATED_ONLY, `${kind} must not be REAL`);
    assert.ok(stateOf(ledger, 'ci-verified').blockingReasonCodes.includes(REASON.SIMULATED_RECEIPT_ATTACHED));
    assert.notEqual(stateOf(ledger, 'ci-verified').state, REVENUE_TRUTH_STATES.REAL);
  }
});

test('a receipt with an unknown or missing provenance kind is refused, not counted', () => {
  const ledger = deriveRevenueTruthLedger({
    receipts: [
      { type: 'code-completion', provenance: { kind: 'real', source: 'x.example.invalid', digest: 'digest-0001', observedAt: T1 }, commitSha: SHA_A },
      { type: 'code-completion', commitSha: SHA_A },
      { type: 'code-completion', provenance: { kind: 'REAL', source: 'x.example.invalid', digest: 'digest-0001', observedAt: 'yesterday' }, commitSha: SHA_A }
    ],
    target: TARGET
  });
  const entry = stateOf(ledger, 'code-completed');
  assert.equal(entry.state, REVENUE_TRUTH_STATES.NOT_EVIDENCED);
  assert.equal(entry.evidenceCount, 0);
  assert.ok(entry.blockingReasonCodes.includes(REASON.RECEIPT_PROVENANCE_INVALID));
  assert.ok(entry.blockingReasonCodes.includes(REASON.RECEIPT_MISSING));
  assert.equal(ledger.receiptCounts.rejected, 3);
});

test('an unknown receipt type is refused and contributes to no claim', () => {
  const ledger = deriveRevenueTruthLedger({
    receipts: [receipt('cash-cleared-by-hand', { providerReceiptId: 'pay_rcpt_0001', cleared: true })],
    target: TARGET
  });
  assert.equal(ledger.receiptCounts.valid, 0);
  assert.equal(ledger.rejectedReceipts[0].reasonCode, REASON.RECEIPT_TYPE_UNKNOWN);
  assert.equal(stateOf(ledger, 'cash-cleared').state, REVENUE_TRUTH_STATES.NOT_EVIDENCED);
});

test('a non-array receipts input is refused and every claim stays NOT_EVIDENCED', () => {
  const ledger = deriveRevenueTruthLedger({ receipts: { type: 'code-completion' }, target: TARGET });
  assert.equal(ledger.rejectedReceipts[0].reasonCode, REASON.RECEIPTS_NOT_ARRAY);
  assert.equal(ledger.summary.real, 0);
  assert.equal(ledger.summary.notEvidenced, 11);
});

test('a missing target keeps commit-bound and offer-bound claims NOT_EVIDENCED', () => {
  const ledger = deriveRevenueTruthLedger({ receipts: fullRealChain(), target: {} });
  for (const claim of ['code-completed', 'ci-verified', 'deployed', 'live-healthy', 'customer-accepted']) {
    assert.notEqual(stateOf(ledger, claim).state, REVENUE_TRUTH_STATES.REAL, `${claim} needs a declared target`);
  }
  assert.ok(stateOf(ledger, 'code-completed').blockingReasonCodes.includes(REASON.TARGET_COMMIT_NOT_DECLARED));
  assert.ok(stateOf(ledger, 'customer-accepted').blockingReasonCodes.includes(REASON.OFFER_DIGEST_NOT_DECLARED));
  assert.equal(stateOf(ledger, 'tests-passed').state, REVENUE_TRUTH_STATES.REAL, 'tests are not commit-bound');
});

test('a malformed target commit is reported as invalid, not as undeclared', () => {
  const ledger = deriveRevenueTruthLedger({ receipts: [], target: { commitSha: 'not-a-sha' } });
  assert.ok(stateOf(ledger, 'deployed').blockingReasonCodes.includes(REASON.TARGET_COMMIT_INVALID));
  assert.equal(ledger.target.commitSha, null);
});

test('the rendered text starts each claim line with its fixed label in declared order', () => {
  const ledger = deriveRevenueTruthLedger({ receipts: fullRealChain(), target: TARGET });
  const lines = renderRevenueTruthText(ledger).split('\n');
  const labels = Object.values(REVENUE_TRUTH_LABELS);

  REVENUE_TRUTH_CLAIMS.forEach((claim, index) => {
    const line = lines[index + 2];
    assert.ok(line.startsWith(`${REVENUE_TRUTH_LABELS[claim]}: `), `line ${index + 2} must start with its label`);
  });
  for (const line of lines.slice(2, 2 + REVENUE_TRUTH_CLAIMS.length)) {
    const prefix = line.slice(0, line.indexOf(':'));
    assert.ok(labels.includes(prefix), `${prefix} must be exactly one fixed label`);
  }
});

test('simulated-only evidence is printed as SIMULATED_ONLY and never as YES', () => {
  const ledger = deriveRevenueTruthLedger({
    receipts: [receipt('authorization', { authorized: true }, { kind: 'SIMULATED' })],
    target: TARGET
  });
  const text = renderRevenueTruthText(ledger);

  assert.match(text, /^AUTHORIZED TO SEND: SIMULATED_ONLY /m);
  assert.doesNotMatch(text, /YES/);
  assert.doesNotMatch(text, /CASH CLEARED: REAL/);
});

test('the dashboard text is deterministic for identical receipts and target', () => {
  const first = buildRevenueTruthDashboard({ receipts: fullRealChain(), target: TARGET });
  const second = buildRevenueTruthDashboard({ receipts: fullRealChain(), target: TARGET });

  assert.deepEqual(second, first);
});

test('the dry-run mapping emits one SIMULATED receipt per stage and no claim-proving receipt', () => {
  const result = runRevenueDryRun({ fixtures: buildSimulatedRevenueFixtures({ now: NOW }), now: NOW });
  const receipts = simulatedReceiptsFromDryRun(result, { observedAt: NOW });

  assert.equal(receipts.length, result.stages.length);
  assert.deepEqual(receipts.map(item => item.stage), result.stages.map(stage => stage.stage));
  for (const item of receipts) {
    assert.equal(item.provenance.kind, 'SIMULATED');
  }
  const types = new Set(receipts.map(item => item.type));
  for (const forbidden of ['payment-settled', 'cleared-funds', 'communication', 'deployment', 'ci-run', 'test-run', 'code-completion', 'health-check']) {
    assert.equal(types.has(forbidden), false, `dry run must never emit ${forbidden}`);
  }
});

test('the dry-run mapping never marks cash-cleared and never produces a REAL claim', () => {
  const result = runRevenueDryRun({ fixtures: buildSimulatedRevenueFixtures({ now: NOW }), now: NOW });
  const ledger = deriveRevenueTruthLedger({
    receipts: simulatedReceiptsFromDryRun(result, { observedAt: NOW }),
    target: TARGET
  });

  assert.equal(ledger.summary.real, 0);
  assert.notEqual(stateOf(ledger, 'cash-cleared').state, REVENUE_TRUTH_STATES.REAL);
  assert.equal(stateOf(ledger, 'authorized-to-send').state, REVENUE_TRUTH_STATES.SIMULATED_ONLY);
  assert.equal(stateOf(ledger, 'customer-accepted').state, REVENUE_TRUTH_STATES.SIMULATED_ONLY);
  assert.equal(stateOf(ledger, 'payment-initiated').state, REVENUE_TRUTH_STATES.SIMULATED_ONLY);
  assert.equal(stateOf(ledger, 'cash-cleared').state, REVENUE_TRUTH_STATES.NOT_EVIDENCED);

  const text = renderRevenueTruthText(ledger);
  assert.match(text, /^AUTHORIZED TO SEND: SIMULATED_ONLY /m);
  assert.match(text, /^CASH CLEARED: NOT_EVIDENCED /m);
});

test('the dry-run mapping still labels a failing dry run as simulated and never as cleared', () => {
  const base = buildSimulatedRevenueFixtures({ now: NOW });
  const live = {
    ...base,
    payment: { ...base.payment, event: { ...base.payment.event, testMode: false, environment: 'production', eventId: '' } }
  };
  const result = runRevenueDryRun({ fixtures: live, now: NOW });
  const receipts = simulatedReceiptsFromDryRun(result, { observedAt: NOW });

  assert.ok(receipts.every(item => item.provenance.kind === 'SIMULATED'));
  assert.equal(receipts.find(item => item.stage === 'simulated-payment').stageStatus, 'SIMULATED_FAILED');
  const ledger = deriveRevenueTruthLedger({ receipts, target: TARGET });
  assert.equal(stateOf(ledger, 'cash-cleared').state, REVENUE_TRUTH_STATES.NOT_EVIDENCED);
});

test('the dry-run mapping refuses an unknown result version and an invalid observation time', () => {
  const result = runRevenueDryRun({ fixtures: buildSimulatedRevenueFixtures({ now: NOW }), now: NOW });

  assert.deepEqual(simulatedReceiptsFromDryRun({ ...result, version: 'other.v9' }, { observedAt: NOW }), []);
  assert.deepEqual(simulatedReceiptsFromDryRun(null, { observedAt: NOW }), []);
  assert.deepEqual(simulatedReceiptsFromDryRun(result, { observedAt: 'not-a-time' }), []);
});

test('the dry-run mapping is deterministic for identical input', () => {
  const result = runRevenueDryRun({ fixtures: buildSimulatedRevenueFixtures({ now: NOW }), now: NOW });

  assert.deepEqual(
    simulatedReceiptsFromDryRun(result, { observedAt: NOW }),
    simulatedReceiptsFromDryRun(result, { observedAt: NOW })
  );
});

test('the ledger module is pure: only node:crypto and the dry run are imported, with no I/O or clock', () => {
  const source = readFileSync(join(here, '..', 'src', 'revenue-truth-ledger.mjs'), 'utf8');
  const specifiers = [...source.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)].map(match => match[1]);

  assert.deepEqual(specifiers, ['node:crypto', './revenue-dry-run.mjs']);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /\bprocess\.env\b/);
  assert.doesNotMatch(source, /\b(readFile|writeFile|appendFile|mkdir|unlink|rename)\w*\s*\(/);
  assert.doesNotMatch(source, /Date\.now\s*\(|new Date\s*\(/);
  assert.doesNotMatch(source, /store\.mjs/);
});
