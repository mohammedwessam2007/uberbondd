import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BROWSER_ACTION_PROVIDER_CAPABILITIES,
  compileBrowserActionPlan,
  createUnconfiguredBrowserActionAdapter,
  planBrowserRetry,
  recordBrowserActionOutcome,
  validateBrowserActionAdapter
} from '../src/browser-action-contract.mjs';

const BASE = {
  goalRef: 'goal_home_service_quote_recovery',
  occurrenceKey: 'occ_2026-08-28_001',
  targetUrl: 'https://app.example.com/leads/123',
  permittedHosts: ['app.example.com'],
  termsPolicyRef: 'terms_review_2026_08_28'
};

test('read-only browser inspection needs no consequence authority and grants none', () => {
  const result = compileBrowserActionPlan({
    ...BASE,
    steps: [
      { type: 'NAVIGATE', url: 'https://app.example.com/leads/123' },
      { type: 'READ_TEXT', selector: '[data-status]' },
      { type: 'SCREENSHOT' }
    ]
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'READ_ONLY_PLAN_PREPARED');
  assert.equal(result.plan.effectClass, 'READ_ONLY');
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.equal(result.externalEffectLedger.providerCalls, 0);
  assert.equal(result.externalEffectLedger.productionMutations, 0);
});

test('state-changing browser work requires authority and idempotency identity', () => {
  const result = compileBrowserActionPlan({
    ...BASE,
    steps: [{ type: 'CLICK', selector: '[data-action=send-estimate-reminder]', purpose: 'CUSTOMER_FOLLOWUP' }]
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('authority-receipt-ref-required-for-browser-mutation'));
  assert.ok(result.reasonCodes.includes('idempotency-key-required-for-browser-mutation'));
});

test('browser automation cannot become a bypass for purchases payments KYC DNS credentials or legal acceptance', () => {
  for (const purpose of ['PURCHASE', 'PAYMENT', 'KYC', 'DNS_CHANGE', 'CREDENTIAL_CHANGE', 'LEGAL_ACCEPTANCE', 'ACCOUNT_CREATION']) {
    const result = compileBrowserActionPlan({
      ...BASE,
      authorityReceiptRef: 'authority_receipt_1',
      idempotencyKey: `idem_${purpose}`,
      steps: [{ type: 'SUBMIT', selector: 'form', purpose }]
    });
    assert.equal(result.ok, false, purpose);
    assert.ok(result.reasonCodes.includes('step-0-purpose-requires-specialized-gate'), purpose);
  }
});

test('raw credentials and values cannot enter durable browser plans', () => {
  const password = compileBrowserActionPlan({
    ...BASE,
    authorityReceiptRef: 'authority_receipt_1',
    idempotencyKey: 'idem_1',
    steps: [{ type: 'TYPE_REFERENCE', selector: '#password', purpose: 'CUSTOMER_FOLLOWUP', valueRef: 'secret_ref_1', password: 'hunter2' }]
  });
  assert.equal(password.ok, false);
  assert.ok(password.reasonCodes.some(code => code.includes('raw-sensitive-field-prohibited')));

  const rawValue = compileBrowserActionPlan({
    ...BASE,
    authorityReceiptRef: 'authority_receipt_1',
    idempotencyKey: 'idem_2',
    steps: [{ type: 'TYPE_REFERENCE', selector: '#message', purpose: 'CUSTOMER_FOLLOWUP', valueRef: 'content_ref_1', rawValue: 'send this' }]
  });
  assert.equal(rawValue.ok, false);
});

test('typed data is reference-only, never embedded directly', () => {
  const result = compileBrowserActionPlan({
    ...BASE,
    authorityReceiptRef: 'authority_receipt_1',
    idempotencyKey: 'idem_3',
    steps: [{ type: 'TYPE_REFERENCE', selector: '#message', purpose: 'CUSTOMER_FOLLOWUP', valueRef: 'content_ref_abc' }]
  });
  assert.equal(result.ok, true);
  assert.equal(result.plan.steps[0].valueRef, 'content_ref_abc');
  assert.equal(Object.hasOwn(result.plan.steps[0], 'value'), false);
});

test('navigation cannot escape the explicitly permitted host set', () => {
  const result = compileBrowserActionPlan({
    ...BASE,
    steps: [{ type: 'NAVIGATE', url: 'https://evil.example.net/login' }]
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('step-0-host-not-permitted'));
});

test('non-HTTPS and credential-bearing URLs fail closed', () => {
  const http = compileBrowserActionPlan({ ...BASE, targetUrl: 'http://app.example.com', steps: [{ type: 'SCREENSHOT' }] });
  assert.equal(http.ok, false);
  assert.ok(http.reasonCodes.includes('valid-https-target-url-required'));

  const embedded = compileBrowserActionPlan({ ...BASE, targetUrl: 'https://user:pass@app.example.com', steps: [{ type: 'SCREENSHOT' }] });
  assert.equal(embedded.ok, false);
});

test('overlong occurrence and idempotency identities fail closed rather than truncate and collide', () => {
  const occurrence = compileBrowserActionPlan({ ...BASE, occurrenceKey: 'x'.repeat(301), steps: [{ type: 'SCREENSHOT' }] });
  assert.equal(occurrence.ok, false);
  assert.ok(occurrence.reasonCodes.includes('occurrence-key-required-or-too-long'));

  const idempotency = compileBrowserActionPlan({
    ...BASE,
    authorityReceiptRef: 'authority_receipt_1',
    idempotencyKey: 'y'.repeat(301),
    steps: [{ type: 'CLICK', selector: '#save', purpose: 'CRM_UPDATE' }]
  });
  assert.equal(idempotency.ok, false);
  assert.ok(idempotency.reasonCodes.includes('idempotency-key-required-for-browser-mutation'));
});

test('same plan compiles to the same stable plan identity and changed step order does not', () => {
  const input = {
    ...BASE,
    steps: [
      { type: 'NAVIGATE', url: 'https://app.example.com/leads/123' },
      { type: 'READ_TEXT', selector: '.status' }
    ]
  };
  const first = compileBrowserActionPlan(input);
  const second = compileBrowserActionPlan(structuredClone(input));
  const reordered = compileBrowserActionPlan({ ...input, steps: [...input.steps].reverse() });
  assert.equal(first.ok, true);
  assert.equal(first.plan.planId, second.plan.planId);
  assert.notEqual(first.plan.planId, reordered.plan.planId);
});

test('mutation truth requires a browser receipt and confirmed mutation requires an outcome reference', () => {
  const compiled = compileBrowserActionPlan({
    ...BASE,
    authorityReceiptRef: 'authority_receipt_1',
    idempotencyKey: 'idem_confirm_1',
    steps: [{ type: 'CLICK', selector: '#save', purpose: 'CRM_UPDATE' }]
  });
  assert.equal(compiled.ok, true);

  const noReceipt = recordBrowserActionOutcome({
    plan: compiled.plan,
    status: 'MUTATION_CONFIRMED',
    outcomeRef: 'crm_object_123',
    observedAt: '2026-08-28T15:30:00.000Z',
    receivedAt: '2026-08-28T15:30:05.000Z'
  });
  assert.equal(noReceipt.ok, false);
  assert.ok(noReceipt.reasonCodes.includes('browser-receipt-ref-required-for-mutation-truth'));

  const noOutcome = recordBrowserActionOutcome({
    plan: compiled.plan,
    status: 'MUTATION_CONFIRMED',
    browserReceiptRef: 'browser_trace_1',
    observedAt: '2026-08-28T15:30:00.000Z',
    receivedAt: '2026-08-28T15:30:05.000Z'
  });
  assert.equal(noOutcome.ok, false);
  assert.ok(noOutcome.reasonCodes.includes('outcome-ref-required-for-confirmed-mutation'));
});

test('uncertain mutation outcome blocks replay until reconciliation', () => {
  const compiled = compileBrowserActionPlan({
    ...BASE,
    authorityReceiptRef: 'authority_receipt_1',
    idempotencyKey: 'idem_uncertain_1',
    steps: [{ type: 'SUBMIT', selector: 'form', purpose: 'CRM_UPDATE' }]
  });
  const outcome = recordBrowserActionOutcome({
    plan: compiled.plan,
    status: 'UNCERTAIN_EXTERNAL_STATE',
    observedAt: '2026-08-28T15:31:00.000Z',
    receivedAt: '2026-08-28T15:31:05.000Z'
  });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.retryDisposition, 'BLOCK_RETRY_UNTIL_RECONCILED');
  const retry = planBrowserRetry({ plan: compiled.plan, priorOutcome: outcome });
  assert.equal(retry.ok, true);
  assert.equal(retry.status, 'RETRY_BLOCKED_UNCERTAIN_EXTERNAL_STATE');
  assert.equal(retry.executable, false);
});

test('confirmed mutation is idempotently terminal on retry planning', () => {
  const compiled = compileBrowserActionPlan({
    ...BASE,
    authorityReceiptRef: 'authority_receipt_1',
    idempotencyKey: 'idem_done_1',
    steps: [{ type: 'CLICK', selector: '#save', purpose: 'CRM_UPDATE' }]
  });
  const outcome = recordBrowserActionOutcome({
    plan: compiled.plan,
    status: 'MUTATION_CONFIRMED',
    browserReceiptRef: 'browser_trace_2',
    outcomeRef: 'crm_object_123',
    observedAt: '2026-08-28T15:32:00.000Z',
    receivedAt: '2026-08-28T15:32:05.000Z'
  });
  assert.equal(outcome.ok, true);
  const retry = planBrowserRetry({ plan: compiled.plan, priorOutcome: outcome });
  assert.equal(retry.status, 'ALREADY_COMPLETED');
  assert.equal(retry.executable, false);
});

test('future-dated browser outcomes are rejected rather than treated as confirmed truth', () => {
  const compiled = compileBrowserActionPlan({
    ...BASE,
    authorityReceiptRef: 'authority_receipt_1',
    idempotencyKey: 'idem_future_1',
    steps: [{ type: 'CLICK', selector: '#save', purpose: 'CRM_UPDATE' }]
  });
  const outcome = recordBrowserActionOutcome({
    plan: compiled.plan,
    status: 'MUTATION_CONFIRMED',
    browserReceiptRef: 'browser_trace_future',
    outcomeRef: 'crm_object_future',
    observedAt: '2026-08-28T16:00:00.000Z',
    receivedAt: '2026-08-28T15:30:00.000Z'
  });
  assert.equal(outcome.ok, false);
  assert.ok(outcome.reasonCodes.includes('future-dated-browser-outcome'));
});

test('unconfigured adapter is structurally complete but cannot perform I/O', async () => {
  const adapter = createUnconfiguredBrowserActionAdapter('browser-use');
  const validation = validateBrowserActionAdapter(adapter);
  assert.equal(validation.ok, true);
  assert.deepEqual(validation.missing, []);
  for (const capability of BROWSER_ACTION_PROVIDER_CAPABILITIES) {
    assert.equal(typeof adapter[capability], 'function');
  }
  const live = await adapter.liveSupported();
  assert.equal(live.ok, false);
  assert.equal(live.status, 'BROWSER_ADAPTER_NOT_CONFIGURED');
  assert.equal(live.externalEffectLedger.providerCalls, 0);
  const dry = await adapter.dryRunSupported();
  assert.equal(dry.ok, true);
  assert.equal(dry.status, 'DRY_RUN_ONLY');
});
