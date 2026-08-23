import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const PAYMENT_RENEWAL_TRUTH_VERSION = 'payment-renewal-truth-1.3.0';

// The canonical shape plus one declared extension, rather than a fourth
// independent copy. `paymentMutations` is a real effect this module needs to
// report and the canonical set does not carry -- adding it there would make
// every existing complete ledger incomplete under the relay's own contract.
//
// Spreading rather than retyping is the point: if the canonical set changes,
// this follows it instead of drifting away from it, which is how six copies of
// the credential regex ended up with six different holes.
const PAYMENT_TRUTH_EFFECTS = Object.freeze({
  ...ZERO_EXTERNAL_EFFECTS,
  paymentMutations: 0
});

const CLEARED_CLASSIFICATIONS = new Set([
  'CLEARED_ONE_TIME_PAYMENT',
  'CLEARED_SUBSCRIPTION_PAYMENT'
]);

// Money that came back. src/payments.mjs classifies `order_refunded` as
// REFUND_OR_DISPUTE with revenueSign -1 and writes a negative ledger row -- and
// this module read only rows with `amountCents > 0`, so every one of those rows
// was invisible. A customer who paid $50 and was refunded $50 produced
// `providerClearedRevenue: 50.00`, `PROVIDER_CLEARED_PAYMENT_PROVEN`,
// `ok: true`, `contradictions: []`. The money was gone and the ledger said it
// was there, which is the one thing this module exists to prevent.
const REVERSAL_CLASSIFICATIONS = new Set([
  'REFUND_OR_DISPUTE'
]);

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function cents(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : 0;
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function sorted(values) {
  return [...values].sort((a, b) => String(a?.createdAt || a?.timestamp || '').localeCompare(String(b?.createdAt || b?.timestamp || '')));
}

function normalizeAuditEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  // Store.log(type, detail) persists canonical audit records as
  // { id, type, detail, createdAt }. Older direct fixtures used a flat shape.
  // Normalize both without allowing nested detail to override the envelope's
  // event type. This keeps the reconciler compatible with existing evidence
  // while making the real store path observable.
  const detail = entry.detail && typeof entry.detail === 'object' && !Array.isArray(entry.detail)
    ? entry.detail
    : entry;
  return {
    ...detail,
    type: entry.type || detail.type || null,
    createdAt: entry.createdAt || detail.createdAt || null
  };
}

function paymentAuditEntries(auditLog, leadId) {
  return auditLog
    .map(normalizeAuditEntry)
    .filter(entry =>
      entry?.type === 'payment_classification' &&
      (!leadId || entry?.leadId === leadId)
    );
}

function classificationIndex(auditLog, leadId, classifications) {
  const index = new Map();
  for (const entry of paymentAuditEntries(auditLog, leadId)) {
    if (!classifications.has(entry?.classification)) continue;
    const eventName = text(entry?.eventName, 120);
    const eventId = text(entry?.eventId, 200);
    if (!eventName || !eventId) continue;
    index.set(`${eventName}:${eventId}`, {
      providerEventId: `${eventName}:${eventId}`,
      eventName,
      eventId,
      classification: entry.classification,
      // Carried so the receipt can take part in the content comparison. It was
      // dropped here, so a receipt bound to a different prospect or product
      // reconciled as agreement -- the witness-content check saw only the order
      // and the ledger row, and PR #114's probe happened to mutate the ledger.
      leadId: text(entry?.leadId, 200) || null,
      prospectId: text(entry?.prospectId, 200) || null,
      product: text(entry?.product, 200) || null,
      policyVersion: text(entry?.policyVersion, 120) || null,
      timestamp: text(entry?.timestamp, 80) || null
    });
  }
  return index;
}

const clearedEvidenceIndex = (auditLog, leadId) => classificationIndex(auditLog, leadId, CLEARED_CLASSIFICATIONS);
const reversalEvidenceIndex = (auditLog, leadId) => classificationIndex(auditLog, leadId, REVERSAL_CLASSIFICATIONS);

function orderEvidenceIndex(orders, leadId) {
  const index = new Map();
  for (const order of orders) {
    if (leadId && order?.leadId !== leadId) continue;
    if (order?.provider !== 'lemonsqueezy') continue;
    const eventName = text(order?.eventName, 120);
    const eventId = text(order?.providerEventId, 200);
    if (!eventName || !eventId) continue;
    index.set(`${eventName}:${eventId}`, order);
  }
  return index;
}

// The three witnesses must agree about the payment, not merely about its name.
//
// Identity was bound on `eventName:eventId` and content was never compared, so
// an order the provider signed for $50 and a ledger row claiming $5,000 were
// both "the same payment" and the ledger's number won:
//
//   provider order says : $50.00
//   revenue ledger says : $5000.00
//   reconciled as       : $5000.00   PROVIDER_CLEARED_PAYMENT_PROVEN, no contradiction
//
// Found by a mutation probe in PR #114, which shipped the failing tests without
// a fix. It is the same defect as counting a payment twice, arriving through a
// field nobody thought to check.
//
// Magnitude is compared rather than the signed value: the sign is decided by
// the classification (a refund is a negative ledger row) and providers differ on
// whether a refund event carries a negative amount. A field absent from one
// witness cannot contradict the other -- silence is not disagreement -- which is
// what lets older receipts that never carried `product` keep reconciling.
function witnessContentMismatches({ event, order, clearing }) {
  const mismatches = [];
  const amountA = Math.abs(cents(event?.amountCents));
  const amountB = Math.abs(cents(order?.amountCents));
  if (amountA !== amountB) mismatches.push('provider-payment-witness-amount-mismatch');

  const currencyA = text(event?.currency, 12).toUpperCase();
  const currencyB = text(order?.currency, 12).toUpperCase();
  if (currencyA && currencyB && currencyA !== currencyB) mismatches.push('provider-payment-witness-currency-mismatch');

  for (const [field, code] of [['product', 'provider-payment-witness-product-mismatch'],
    ['prospectId', 'provider-payment-witness-prospect-mismatch'],
    ['leadId', 'provider-payment-witness-lead-mismatch']]) {
    const values = [event?.[field], order?.[field], clearing?.[field]]
      .map(value => text(value, 200))
      .filter(Boolean);
    if (new Set(values).size > 1) mismatches.push(code);
  }
  return [...new Set(mismatches)];
}

function verifiedRevenueRows({ revenueEvents, clearedIndex, reversalIndex, ordersIndex, leadId }) {
  const verified = [];
  const unverified = [];
  const reversals = [];
  const unverifiedReversals = [];
  const duplicateReversals = [];
  const contradicted = [];
  const seenReversals = new Map();
  // One provider event is one payment. The witness indexes are keyed maps and
  // therefore deduped, but the revenue ledger is a list: two rows carrying the
  // same providerEventId each matched the same order and the same clearing
  // receipt, and both were counted. A single $50 payment recorded twice
  // reported $100 cleared, with no contradiction raised.
  //
  // A duplicate row is not silently dropped either. It is a ledger integrity
  // problem in its own right, and the caller is told.
  const seen = new Map();
  const duplicates = [];
  for (const event of revenueEvents.filter(row => !leadId || row?.leadId === leadId)) {
    const key = text(event?.providerEventId, 400);
    const positive = cents(event?.amountCents) > 0;
    const clearing = clearedIndex.get(key);
    const order = ordersIndex.get(key);
    if (positive && clearing && order) {
      if (seen.has(key)) {
        duplicates.push({ providerEventId: key, amountCents: cents(event?.amountCents) });
        continue;
      }
      // Agreeing on the event's name is not agreeing on the payment. A row whose
      // witnesses contradict each other proves nothing and is not counted.
      const mismatches = witnessContentMismatches({ event, order, clearing });
      if (mismatches.length) {
        contradicted.push({ providerEventId: key, mismatches, amountCents: cents(event?.amountCents) });
        continue;
      }
      const row = { event, clearing, order };
      seen.set(key, row);
      verified.push(row);
    } else if (positive) {
      unverified.push(event);
    } else if (cents(event?.amountCents) < 0) {
      // A negative row is a reversal, and it needs the same three witnesses a
      // payment needs -- for the opposite reason. An unwitnessed positive row
      // invents revenue; an unwitnessed negative row erases it. Both are ledger
      // claims nobody can check, so both are reported rather than applied.
      const reversal = reversalIndex.get(key);
      if (reversal && order) {
        if (seenReversals.has(key)) {
          duplicateReversals.push({ providerEventId: key, amountCents: cents(event?.amountCents) });
          continue;
        }
        // The same content check the payment branch gets. Applying it to only
        // one direction left the mirror image open: a refund ledger row claiming
        // $5,000 against a provider refund of $50 recorded $5,000 reversed and a
        // net of minus $4,950. It happened to raise
        // `refunds-exceed-provider-cleared-payments` in that fixture only
        // because the original payment was smaller -- with a $6,000 payment the
        // same forgery would have produced no contradiction at all.
        //
        // Erasing revenue that was never refunded is the same class of defect as
        // inventing revenue that was never paid, and it is the one an operator
        // is less likely to question.
        const reversalMismatches = witnessContentMismatches({ event, order, clearing: reversal });
        if (reversalMismatches.length) {
          contradicted.push({ providerEventId: key, mismatches: reversalMismatches, amountCents: cents(event?.amountCents) });
          continue;
        }
        const row = { event, reversal, order };
        seenReversals.set(key, row);
        reversals.push(row);
      } else {
        unverifiedReversals.push(event);
      }
    }
  }
  return {
    verified: sorted(verified.map(item => ({ ...item, createdAt: item.event?.createdAt }))),
    unverified: sorted(unverified),
    duplicates,
    contradicted,
    reversals: sorted(reversals.map(item => ({ ...item, createdAt: item.event?.createdAt }))),
    unverifiedReversals: sorted(unverifiedReversals),
    duplicateReversals
  };
}

function acceptanceTruth(fulfillment) {
  if (!fulfillment || typeof fulfillment !== 'object') {
    return { proven: false, evidenceRef: null, reason: 'fulfillment-state-absent' };
  }
  const ref = text(fulfillment.acceptanceEvidenceRef, 500);
  const matchingEvent = Array.isArray(fulfillment.eventLog)
    ? fulfillment.eventLog.find(event =>
        event?.type === 'CUSTOMER_ACCEPTED' &&
        event?.evidenceClass === 'EXTERNAL_CUSTOMER' &&
        text(event?.evidenceRef, 500) === ref &&
        /^(customer|receipt):/i.test(ref)
      )
    : null;
  const proven = Boolean(
    fulfillment?.economicTruth?.acceptedDelivery === true &&
    fulfillment?.acceptedAt &&
    ref &&
    matchingEvent
  );
  return {
    proven,
    evidenceRef: proven ? ref : null,
    acceptedAt: proven ? fulfillment.acceptedAt : null,
    reason: proven ? 'external-customer-acceptance-evidence-present' : 'external-customer-acceptance-not-proven'
  };
}

/**
 * Reconciles the persisted economic spine without performing any external action.
 *
 * Critical invariant: `lead.paymentStatus === "paid"`, a manual unlock, or a
 * positive `revenueEvents` row is never sufficient to prove cleared revenue.
 * A payment is proven only when the same provider event is present in all three
 * durable views produced by the signed Lemon Squeezy webhook path:
 *   1. orders (provider callback persisted after signature verification),
 *   2. payment_classification audit receipt (classified as genuinely cleared),
 *   3. revenueEvents (economic ledger row bound to eventName:eventId).
 */
export function reconcilePaymentRenewalTruth({
  lead = null,
  orders = [],
  revenueEvents = [],
  auditLog = [],
  fulfillment = null
} = {}) {
  const leadId = text(lead?.id, 200) || null;
  const safeOrders = Array.isArray(orders) ? orders : [];
  const safeRevenue = Array.isArray(revenueEvents) ? revenueEvents : [];
  const safeAudit = Array.isArray(auditLog) ? auditLog : [];
  const clearedIndex = clearedEvidenceIndex(safeAudit, leadId);
  const reversalIndex = reversalEvidenceIndex(safeAudit, leadId);
  const ordersIndex = orderEvidenceIndex(safeOrders, leadId);
  const {
    verified, unverified, duplicates, contradicted,
    reversals, unverifiedReversals, duplicateReversals
  } = verifiedRevenueRows({
    revenueEvents: safeRevenue,
    clearedIndex,
    reversalIndex,
    ordersIndex,
    leadId
  });

  const firstPayment = verified[0] || null;
  const renewals = verified.filter(item => item.clearing.eventName === 'subscription_payment_success');
  const acceptance = acceptanceTruth(fulfillment);
  const clearedRevenueCents = verified.reduce((sum, item) => sum + cents(item.event.amountCents), 0);
  const reversedRevenueCents = reversals.reduce((sum, item) => sum + Math.abs(cents(item.event.amountCents)), 0);
  // Net is what the business actually kept. Gross is kept alongside it because
  // "money that once cleared" is a real and separate fact -- but net is what a
  // revenue claim has to mean.
  const netClearedRevenueCents = clearedRevenueCents - reversedRevenueCents;
  const unverifiedReversalCents = unverifiedReversals.reduce((sum, item) => sum + Math.abs(cents(item.amountCents)), 0);
  const fullyReversed = clearedRevenueCents > 0 && netClearedRevenueCents <= 0;
  const unverifiedPositiveRevenueCents = unverified.reduce((sum, item) => sum + Math.max(0, cents(item.amountCents)), 0);

  const stages = {
    CLEARED_PAYMENT: {
      status: firstPayment ? 'PROVEN' : 'NOT_PROVEN',
      evidenceRef: firstPayment ? `payment:${firstPayment.event.providerEventId}` : null
    },
    DELIVERY_RECEIPT: {
      status: Array.isArray(fulfillment?.artifactRefs) && fulfillment.artifactRefs.length && fulfillment?.deliveredAt ? 'PROVEN' : 'NOT_PROVEN',
      evidenceRef: Array.isArray(fulfillment?.artifactRefs) && fulfillment.artifactRefs.length ? fulfillment.artifactRefs[0] : null
    },
    CUSTOMER_ACCEPTED: {
      status: acceptance.proven ? 'PROVEN' : 'NOT_PROVEN',
      evidenceRef: acceptance.evidenceRef
    },
    SECOND_PAYMENT_OR_RENEWAL: {
      status: renewals.length ? 'PROVEN' : 'NOT_PROVEN',
      evidenceRef: renewals.length ? `payment:${renewals[0].event.providerEventId}` : null
    },
    // A separate stage rather than a flag on CLEARED_PAYMENT. The payment did
    // clear; that is history and stays true. Whether the business still has the
    // money is a different question, and merging them is how a refunded sale
    // reads as revenue.
    PAYMENT_RETAINED: {
      status: !firstPayment ? 'NOT_PROVEN' : (reversals.length ? (fullyReversed ? 'REVERSED' : 'PARTIALLY_REVERSED') : 'PROVEN'),
      evidenceRef: reversals.length ? `refund:${reversals[0].event.providerEventId}` : null
    }
  };

  const contradictions = [];
  if (lead?.paymentStatus === 'paid' && !firstPayment) contradictions.push('lead-marked-paid-without-provider-cleared-proof');
  if (unverifiedPositiveRevenueCents > 0) contradictions.push('positive-revenue-row-without-provider-cleared-proof');
  if (fulfillment?.economicTruth?.acceptedDelivery === true && !acceptance.proven) contradictions.push('accepted-delivery-flag-without-external-customer-proof');
  if (fulfillment?.renewalPaymentRef && !renewals.length) contradictions.push('renewal-reference-without-provider-cleared-renewal-proof');
  if (duplicates.length) contradictions.push('duplicate-revenue-rows-for-one-provider-event');
  for (const item of contradicted) contradictions.push(...item.mismatches);
  if (duplicateReversals.length) contradictions.push('duplicate-refund-rows-for-one-provider-event');
  if (unverifiedReversalCents > 0) contradictions.push('negative-revenue-row-without-provider-refund-proof');
  // Reversing more than ever cleared is not a small refund, it is a ledger that
  // does not describe any sequence of real events.
  if (reversedRevenueCents > clearedRevenueCents) contradictions.push('refunds-exceed-provider-cleared-payments');
  if (fullyReversed && lead?.paymentStatus === 'paid') contradictions.push('lead-marked-paid-after-full-refund');
  // A refund is the customer's strongest available statement that the delivery
  // was not what they wanted. Acceptance and a returned payment cannot both be
  // true without someone looking at it.
  if (reversals.length && acceptance.proven) contradictions.push('customer-acceptance-claimed-with-reversed-payment');

  const result = {
    ok: contradictions.length === 0,
    policyVersion: PAYMENT_RENEWAL_TRUTH_VERSION,
    leadId,
    status: contradictions.length
      ? 'REVIEW_REQUIRED'
      : (!firstPayment
        ? 'NO_CLEARED_PAYMENT_PROVEN'
        : (fullyReversed ? 'PROVIDER_CLEARED_PAYMENT_REVERSED' : 'PROVIDER_CLEARED_PAYMENT_PROVEN')),
    stages,
    economics: {
      providerClearedRevenueCents: clearedRevenueCents,
      providerClearedRevenue: clearedRevenueCents / 100,
      unverifiedPositiveRevenueCents,
      unverifiedPositiveRevenue: unverifiedPositiveRevenueCents / 100,
      verifiedPaymentCount: verified.length,
      verifiedRenewalCount: renewals.length,
      duplicateRevenueRowCount: duplicates.length,
      duplicateRevenueRowCents: duplicates.reduce((sum, item) => sum + item.amountCents, 0),
      // providerClearedRevenueCents stays gross, because callers and tests read
      // it as "money that cleared the provider" and that remains true of a
      // payment later refunded. Net is the number a revenue claim must use.
      reversedRevenueCents,
      reversedRevenue: reversedRevenueCents / 100,
      netProviderClearedRevenueCents: netClearedRevenueCents,
      netProviderClearedRevenue: netClearedRevenueCents / 100,
      verifiedReversalCount: reversals.length,
      unverifiedReversalCents,
      unverifiedReversal: unverifiedReversalCents / 100,
      duplicateReversalRowCount: duplicateReversals.length,
      contradictedWitnessRowCount: contradicted.length
    },
    verifiedProviderEventRefs: verified.map(item => item.event.providerEventId),
    verifiedReversalEventRefs: reversals.map(item => item.event.providerEventId),
    unverifiedPositiveRevenueEventRefs: unverified.map(item => text(item.providerEventId, 400)).filter(Boolean),
    contradictions,
    claimBoundary: {
      leadPaidBoolean: 'NOT_PAYMENT_PROOF',
      revenueEventRow: 'NOT_PAYMENT_PROOF_ALONE',
      clearedPayment: firstPayment ? 'SIGNED_PROVIDER_CALLBACK_PLUS_CLEARED_CLASSIFICATION_PLUS_LEDGER_MATCH' : 'NOT_PROVEN',
      customerAcceptance: acceptance.proven ? 'EXTERNAL_CUSTOMER_EVIDENCE_PRESENT' : 'NOT_PROVEN',
      renewal: renewals.length ? 'PROVIDER_CLEARED_RENEWAL_PROVEN' : 'NOT_PROVEN',
      retainedRevenue: !firstPayment
        ? 'NOT_PROVEN'
        : (fullyReversed
          ? 'CLEARED_THEN_FULLY_REVERSED'
          : (reversals.length ? 'CLEARED_THEN_PARTIALLY_REVERSED' : 'PROVIDER_CLEARED_AND_NOT_REVERSED'))
    },
    externalEffectLedger: { ...PAYMENT_TRUTH_EFFECTS }
  };

  result.truthDigest = digest({
    policyVersion: result.policyVersion,
    leadId: result.leadId,
    stages: result.stages,
    economics: result.economics,
    verifiedProviderEventRefs: result.verifiedProviderEventRefs,
    contradictions: result.contradictions,
    claimBoundary: result.claimBoundary
  });
  return result;
}

export async function reconcilePaymentRenewalTruthFromStore(store, { leadId, fulfillment = null } = {}) {
  if (!store || typeof store.list !== 'function') throw new Error('store-required');
  const lead = leadId && typeof store.get === 'function' ? await store.get('leads', leadId) : null;
  const [orders, revenueEvents, auditLog] = await Promise.all([
    store.list('orders'),
    store.list('revenueEvents'),
    store.list('auditLog')
  ]);
  return reconcilePaymentRenewalTruth({ lead, orders, revenueEvents, auditLog, fulfillment });
}

export const PAYMENT_RENEWAL_TRUTH_EXTERNAL_EFFECTS = PAYMENT_TRUTH_EFFECTS;
