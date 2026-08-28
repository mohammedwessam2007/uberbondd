import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RECEIVABLE_PROVIDER_CAPABILITIES,
  compileReceivableCommand,
  createUnconfiguredReceivableProviderAdapter,
  foldReceivableEvents,
  normalizeReceivableProviderEvent,
  planReceivableRetry,
  validateReceivableProviderAdapter
} from '../src/receivables-contract.mjs';

const BASE = {
  operation: 'CREATE_INVOICE', occurrenceKey: 'delivery_123_invoice_1', customerRef: 'customer_123',
  commercialTermsRef: 'accepted_offer_v3', amountCents: 150000, currency: 'USD', lineItemRefs: ['delivery_package_1'],
  dueAt: '2026-09-05T00:00:00.000Z', authorityReceiptRef: 'authority_receipt_1', idempotencyKey: 'invoice_delivery_123_v1'
};
function event(commandId, overrides = {}) {
  return { provider: 'invoice-provider', providerEventId: 'evt_1', commandId, eventType: 'INVOICE_CREATED', receivableRef: 'invoice_1', providerReceiptRef: 'provider_receipt_1', observedAt: '2026-08-28T15:45:00.000Z', receivedAt: '2026-08-28T15:45:02.000Z', ...overrides };
}

test('local quote preparation is effect-free while external receivable mutations require authority and idempotency', () => {
  const local = compileReceivableCommand({ ...BASE, operation: 'PREPARE_QUOTE', authorityReceiptRef: null, idempotencyKey: null, dueAt: null });
  assert.equal(local.ok, true); assert.equal(local.status, 'LOCAL_QUOTE_PREPARED'); assert.equal(local.command.effectClass, 'LOCAL_PREPARATION');
  const missing = compileReceivableCommand({ ...BASE, authorityReceiptRef: null, idempotencyKey: null });
  assert.equal(missing.ok, false); assert.ok(missing.reasonCodes.includes('authority-receipt-ref-required-for-receivable-effect')); assert.ok(missing.reasonCodes.includes('idempotency-key-required-for-receivable-effect'));
});

test('commercial terms, amount, currency, and line-item references are mandatory', () => {
  const result = compileReceivableCommand({ ...BASE, commercialTermsRef: null, amountCents: -1, currency: 'US', lineItemRefs: [] });
  assert.equal(result.ok, false); for (const code of ['commercial-terms-ref-required','valid-nonnegative-amount-cents-required','iso-currency-required','line-item-ref-required']) assert.ok(result.reasonCodes.includes(code));
});

test('invoice issue and reminder operations require an existing receivable and reminders require communication controls', () => {
  const issue = compileReceivableCommand({ ...BASE, operation: 'ISSUE_INVOICE', priorReceivableRef: null });
  assert.equal(issue.ok, false); assert.ok(issue.reasonCodes.includes('prior-receivable-ref-required'));
  const reminder = compileReceivableCommand({ ...BASE, operation: 'SEND_REMINDER', priorReceivableRef: 'invoice_1', communicationPolicyRef: null, suppressionCheckRef: null });
  assert.equal(reminder.ok, false); assert.ok(reminder.reasonCodes.includes('communication-policy-ref-required-for-reminder')); assert.ok(reminder.reasonCodes.includes('suppression-check-ref-required-for-reminder'));
});

test('raw customer PII, messages, payment credentials, and secrets are prohibited', () => {
  const result = compileReceivableCommand({ ...BASE, email: 'buyer@example.com', cardNumber: '4111111111111111' });
  assert.equal(result.ok, false); assert.ok(result.reasonCodes.includes('raw-receivable-pii-or-secret-prohibited'));
});

test('receivable command identity is restart-stable and overlong identities fail closed', () => {
  const a = compileReceivableCommand(BASE); const b = compileReceivableCommand(structuredClone(BASE));
  assert.equal(a.ok, true); assert.equal(a.command.commandId, b.command.commandId);
  const long = compileReceivableCommand({ ...BASE, occurrenceKey: 'x'.repeat(301) }); assert.equal(long.ok, false); assert.ok(long.reasonCodes.includes('occurrence-key-required-or-too-long'));
});

test('provider receivable truth requires provider receipts', () => {
  const compiled = compileReceivableCommand(BASE); const result = normalizeReceivableProviderEvent(event(compiled.command.commandId, { providerReceiptRef: null }));
  assert.equal(result.ok, false); assert.ok(result.reasonCodes.includes('provider-receipt-ref-required-for-receivable-truth'));
});

test('invoice provider paid flags cannot manufacture payment truth without canonical payment receipt reference', () => {
  const compiled = compileReceivableCommand(BASE);
  const noCanonical = normalizeReceivableProviderEvent(event(compiled.command.commandId, { eventType: 'PAYMENT_LINKED', canonicalPaymentReceiptRef: null }));
  assert.equal(noCanonical.ok, false); assert.ok(noCanonical.reasonCodes.includes('canonical-payment-receipt-ref-required-for-paid-truth'));
  const linked = normalizeReceivableProviderEvent(event(compiled.command.commandId, { eventType: 'PAYMENT_LINKED', canonicalPaymentReceiptRef: 'canonical_payment_receipt_1' }));
  assert.equal(linked.ok, true); assert.equal(linked.paymentTruthAuthority, 'CANONICAL_PAYMENT_RECEIPT_REFERENCE_ONLY');
});

test('reminder sent truth requires both provider and communication receipts', () => {
  const compiled = compileReceivableCommand({ ...BASE, operation: 'SEND_REMINDER', priorReceivableRef: 'invoice_1', communicationPolicyRef: 'transactional_policy_1', suppressionCheckRef: 'suppression_1' });
  const result = normalizeReceivableProviderEvent(event(compiled.command.commandId, { eventType: 'REMINDER_SENT', communicationReceiptRef: null }));
  assert.equal(result.ok, false); assert.ok(result.reasonCodes.includes('communication-receipt-ref-required-for-reminder-sent-truth'));
});

test('exact provider event retries dedupe and conflicting same-event identity fails uncertain', () => {
  const compiled = compileReceivableCommand(BASE); const one = event(compiled.command.commandId);
  const exact = foldReceivableEvents([one, structuredClone(one)]); assert.equal(exact.ok, true); assert.equal(exact.duplicateCount, 1);
  const conflict = foldReceivableEvents([one, { ...one, receivableRef: 'invoice_2' }]); assert.equal(conflict.ok, false); assert.equal(conflict.status, 'UNCERTAIN_EXTERNAL_STATE');
});

test('voided and canonically-paid states cannot silently coexist', () => {
  const compiled = compileReceivableCommand(BASE);
  const voided = event(compiled.command.commandId, { eventType: 'INVOICE_VOIDED', providerEventId: 'evt_void' });
  const paid = event(compiled.command.commandId, { eventType: 'PAYMENT_LINKED', providerEventId: 'evt_paid', canonicalPaymentReceiptRef: 'canonical_payment_receipt_1' });
  const result = foldReceivableEvents([voided, paid]); assert.equal(result.ok, false); assert.equal(result.status, 'UNCERTAIN_EXTERNAL_STATE'); assert.ok(result.reasonCodes.includes('contradictory-voided-and-paid-truth'));
});

test('future-dated provider events fail closed', () => {
  const compiled = compileReceivableCommand(BASE); const result = normalizeReceivableProviderEvent(event(compiled.command.commandId, { observedAt: '2026-08-28T16:30:00.000Z', receivedAt: '2026-08-28T15:45:00.000Z' }));
  assert.equal(result.ok, false); assert.ok(result.reasonCodes.includes('future-dated-receivable-event'));
});

test('nonterminal provider state blocks blind replay; terminal state remains idempotent', () => {
  const compiled = compileReceivableCommand(BASE); const created = foldReceivableEvents([event(compiled.command.commandId)]);
  const blocked = planReceivableRetry({ command: compiled.command, lifecycle: created }); assert.equal(blocked.status, 'RETRY_BLOCKED_UNCERTAIN_EXTERNAL_STATE'); assert.equal(blocked.executable, false);
  const paid = foldReceivableEvents([event(compiled.command.commandId, { eventType: 'PAYMENT_LINKED', canonicalPaymentReceiptRef: 'canonical_payment_receipt_1' })]);
  const terminal = planReceivableRetry({ command: compiled.command, lifecycle: paid }); assert.equal(terminal.status, 'ALREADY_TERMINAL'); assert.equal(terminal.executable, false);
});

test('unconfigured receivable adapter is complete but performs no I/O', async () => {
  const adapter = createUnconfiguredReceivableProviderAdapter('invoice-provider'); const validation = validateReceivableProviderAdapter(adapter); assert.equal(validation.ok, true);
  for (const capability of RECEIVABLE_PROVIDER_CAPABILITIES) assert.equal(typeof adapter[capability], 'function');
  const live = await adapter.liveSupported(); assert.equal(live.ok, false); assert.equal(live.externalEffectLedger.providerCalls, 0);
});
