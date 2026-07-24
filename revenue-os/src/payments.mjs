// Provider-neutral, evidence-based payment reconciliation (workstream 9). No project ever enters
// PAID without either verified evidence or an explicit, visibly-warned owner exception -- enforced
// by verifyPayment/applyOwnerException below, the only two functions that can move a payment to
// VERIFIED. Never stores a credential: every provider here (fake/replay, manual bank/PayPal/
// Payoneer) accepts operator-supplied *evidence* (a reference number, an amount, a screenshot
// hash) and never a password, API secret, or session token.
import { id, now } from './store.mjs';
import { sha256Hex } from './utils.mjs';

export const PAYMENT_STATES = Object.freeze([
  'NOT_REQUESTED', 'REQUEST_READY', 'REQUESTED_EXTERNALLY', 'CUSTOMER_REPORTED', 'PENDING_VERIFICATION',
  'VERIFIED', 'SETTLED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'DISPUTED', 'FAILED', 'MISMATCH', 'BLOCKED'
]);

const TRANSITIONS = Object.freeze({
  NOT_REQUESTED: ['REQUEST_READY'],
  REQUEST_READY: ['REQUESTED_EXTERNALLY'],
  REQUESTED_EXTERNALLY: ['CUSTOMER_REPORTED', 'PENDING_VERIFICATION', 'FAILED'],
  CUSTOMER_REPORTED: ['PENDING_VERIFICATION'],
  PENDING_VERIFICATION: ['VERIFIED', 'MISMATCH', 'BLOCKED', 'FAILED'],
  VERIFIED: ['SETTLED', 'DISPUTED', 'REFUNDED', 'PARTIALLY_REFUNDED'],
  SETTLED: ['DISPUTED', 'REFUNDED', 'PARTIALLY_REFUNDED'],
  MISMATCH: ['PENDING_VERIFICATION', 'BLOCKED'],
  BLOCKED: ['PENDING_VERIFICATION'],
  PARTIALLY_REFUNDED: ['REFUNDED', 'DISPUTED'],
  DISPUTED: ['REFUNDED', 'SETTLED'],
  FAILED: ['REQUEST_READY'],
  REFUNDED: []
});

export class PaymentError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'PaymentError';
    this.code = code;
  }
}

export function assertValidPaymentTransition(from, to) {
  const allowed = TRANSITIONS[from];
  if (!allowed) throw new PaymentError('unknown-payment-state', from);
  if (!allowed.includes(to)) throw new PaymentError('invalid-payment-transition', `cannot go from ${from} to ${to}; allowed: ${allowed.join(', ') || '(terminal)'}`);
  return true;
}

// ---- evidence providers (never a credential, always operator-supplied reference material) ----

export const PROVIDER_CONTRACT = Object.freeze(['name', 'submitEvidence']);
export function assertProviderContract(provider) {
  for (const method of PROVIDER_CONTRACT) if (typeof provider?.[method] === 'undefined') throw new PaymentError('provider-contract-violation', method);
  return true;
}

function makeManualEvidenceProvider(name) {
  return {
    name,
    async submitEvidence({ reference, amountCents, currency, payer, timestamp }) {
      if (!reference) throw new PaymentError('evidence-reference-required');
      return { ok: true, provider: name, reference, amountCents, currency, payer, timestamp, submittedAt: now() };
    }
  };
}
export const createManualBankEvidenceProvider = () => makeManualEvidenceProvider('manual-bank');
export const createManualPaypalEvidenceProvider = () => makeManualEvidenceProvider('manual-paypal');
export const createManualPayoneerEvidenceProvider = () => makeManualEvidenceProvider('manual-payoneer');

export function createFakeReplayPaymentProvider(scriptedOutcomes = []) {
  let cursor = 0;
  return {
    name: 'fake-replay',
    async submitEvidence(evidence) {
      const scripted = scriptedOutcomes[cursor] || { ok: true, ...evidence, submittedAt: now() };
      cursor += 1;
      return { provider: 'fake-replay', ...scripted };
    }
  };
}

// ---- lifecycle ----

export async function requestPayment(store, invoiceHandoff, { provider = 'fake-replay' } = {}) {
  const payment = await store.add('payments', {
    id: id('payment'), invoiceHandoffId: invoiceHandoff.id, status: 'REQUEST_READY', provider,
    amountCents: invoiceHandoff.amountCents, currency: 'USD',
    data: { organizationDomain: invoiceHandoff.data?.organizationDomain || null }
  });
  await store.log('payment_request_ready', { paymentId: payment.id });
  return payment;
}

export async function markRequestedExternally(store, paymentId) {
  const payment = await store.get('payments', paymentId);
  if (!payment) throw new PaymentError('payment-not-found', paymentId);
  assertValidPaymentTransition(payment.status, 'REQUESTED_EXTERNALLY');
  return store.patch('payments', paymentId, { status: 'REQUESTED_EXTERNALLY' });
}

export async function recordCustomerReported(store, paymentId, { note = '' } = {}) {
  const payment = await store.get('payments', paymentId);
  if (!payment) throw new PaymentError('payment-not-found', paymentId);
  assertValidPaymentTransition(payment.status, 'CUSTOMER_REPORTED');
  const updated = await store.patch('payments', paymentId, { status: 'CUSTOMER_REPORTED', data: { ...payment.data, customerReportNote: note } });
  await store.log('payment_customer_reported', { paymentId });
  return updated;
}

/**
 * Validates payer/currency/amount/fee/net/reference/timestamp against the expected invoice, and
 * refuses reused evidence (the store's own evidenceHash uniqueness constraint is the backstop;
 * this is the named, itemized pre-check). Every distinct problem is returned, not just the first.
 */
export function validatePaymentEvidence(evidence, expected) {
  const problems = [];
  if (!evidence.payer) problems.push('payer-missing');
  if (evidence.currency !== expected.currency) problems.push('currency-mismatch');
  if (!Number.isInteger(evidence.amountCents) || evidence.amountCents <= 0) problems.push('amount-invalid');
  else if (evidence.amountCents !== expected.amountCents) problems.push('amount-mismatch');
  if (evidence.feeCents !== undefined && evidence.netCents !== undefined && evidence.feeCents + evidence.netCents !== evidence.amountCents) problems.push('fee-net-do-not-sum-to-amount');
  if (!evidence.reference) problems.push('reference-missing');
  if (!evidence.timestamp || !Number.isFinite(Date.parse(evidence.timestamp))) problems.push('timestamp-missing-or-invalid');
  return { valid: problems.length === 0, problems };
}

/**
 * The only path (besides applyOwnerException) that can move a payment to VERIFIED. Submits
 * evidence through the given provider, validates it against the payment's own expected
 * amount/currency, and refuses reused evidence via a content hash the store enforces as unique.
 * Anything that fails validation goes to MISMATCH, never silently to VERIFIED.
 */
export async function verifyPayment(store, paymentId, provider, rawEvidence) {
  assertProviderContract(provider);
  const payment = await store.get('payments', paymentId);
  if (!payment) throw new PaymentError('payment-not-found', paymentId);
  assertValidPaymentTransition(payment.status, 'PENDING_VERIFICATION');
  await store.patch('payments', paymentId, { status: 'PENDING_VERIFICATION' });

  const submitted = await provider.submitEvidence(rawEvidence);
  const validation = validatePaymentEvidence(submitted, { currency: payment.currency, amountCents: payment.amountCents });
  const evidenceHash = sha256Hex(`${submitted.provider}|${submitted.reference}|${submitted.amountCents}|${submitted.timestamp}`);

  if (!validation.valid) {
    const mismatched = await store.patch('payments', paymentId, { status: 'MISMATCH', data: { ...payment.data, lastEvidence: submitted, mismatchProblems: validation.problems } });
    await store.log('payment_mismatch', { paymentId, problems: validation.problems });
    return mismatched;
  }

  // The uniqueness check lives in the store's own _checkUnique, run inside the same serialized
  // transaction as this write -- catching its ConflictError here (rather than pre-checking with a
  // separate findOne call first) is what makes this race-proof: two concurrent verifyPayment calls
  // reusing the same evidence cannot both observe "no duplicate yet" and both proceed, because the
  // store never interleaves two mutations against the same JSON file.
  try {
    const verified = await store.patch('payments', paymentId, {
      status: 'VERIFIED', evidenceHash, verifiedAt: now(),
      data: { ...payment.data, evidence: submitted }
    });
    await store.log('payment_verified', { paymentId, provider: submitted.provider });
    return verified;
  } catch (error) {
    if (error?.name !== 'ConflictError') throw error;
    const blocked = await store.patch('payments', paymentId, { status: 'BLOCKED', data: { ...payment.data, lastEvidence: submitted, blockReason: 'evidence already used by another payment' } });
    await store.log('payment_evidence_reused', { paymentId });
    return blocked;
  }
}

/**
 * The owner-exception path -- the *only* other way a payment can be treated as PAID-eligible
 * without passing verifyPayment. Requires an explicit reason and always stamps a visible warning
 * onto the record (mission: "an explicit owner exception with a visible warning") -- there is no
 * way to call this function and get a payment that looks the same as a normally-verified one.
 */
export async function applyOwnerException(store, paymentId, { approvedBy, reason }) {
  if (!approvedBy) throw new PaymentError('approved-by-required');
  if (!reason) throw new PaymentError('reason-required');
  const payment = await store.get('payments', paymentId);
  if (!payment) throw new PaymentError('payment-not-found', paymentId);
  const updated = await store.patch('payments', paymentId, {
    status: 'VERIFIED', verifiedAt: now(),
    data: { ...payment.data, ownerException: { approvedBy, reason, appliedAt: now() }, warning: 'OWNER EXCEPTION -- verified without evidence-based reconciliation' }
  });
  await store.log('payment_owner_exception_applied', { paymentId, approvedBy, reason });
  return updated;
}

export async function settlePayment(store, paymentId) {
  const payment = await store.get('payments', paymentId);
  if (!payment) throw new PaymentError('payment-not-found', paymentId);
  assertValidPaymentTransition(payment.status, 'SETTLED');
  return store.patch('payments', paymentId, { status: 'SETTLED' });
}

export async function refundPayment(store, paymentId, { amountCents, reason }) {
  const payment = await store.get('payments', paymentId);
  if (!payment) throw new PaymentError('payment-not-found', paymentId);
  const status = amountCents < payment.amountCents ? 'PARTIALLY_REFUNDED' : 'REFUNDED';
  assertValidPaymentTransition(payment.status, status);
  const updated = await store.patch('payments', paymentId, { status, data: { ...payment.data, refund: { amountCents, reason, refundedAt: now() } } });
  await store.log('payment_refunded', { paymentId, amountCents, status });
  return updated;
}

export async function disputePayment(store, paymentId, { reason }) {
  const payment = await store.get('payments', paymentId);
  if (!payment) throw new PaymentError('payment-not-found', paymentId);
  assertValidPaymentTransition(payment.status, 'DISPUTED');
  const updated = await store.patch('payments', paymentId, { status: 'DISPUTED', data: { ...payment.data, dispute: { reason, openedAt: now() } } });
  await store.log('payment_disputed', { paymentId, reason });
  return updated;
}
