import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const PAYMENT_RENEWAL_TRUTH_VERSION = 'payment-renewal-truth-1.6.0';

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
      leadId: text(entry?.leadId, 200) || null,
      prospectId: text(entry?.prospectId, 200) || null,
      product: text(entry?.product, 200) || null,
      amountCents: Number.isSafeInteger(Number(entry?.amountCents)) ? Number(entry.amountCents) : null,
      currency: text(entry?.currency, 12).toUpperCase() || null,
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

function witnessContentMismatches({ event, order, clearing }) {
  const mismatches = [];
  const amounts = [event?.amountCents, order?.amountCents, clearing?.amountCents]
    .filter(value => value !== null && value !== undefined && value !== '')
    .map(value => Math.abs(cents(value)));
  if (new Set(amounts).size > 1) mismatches.push('provider-payment-witness-amount-mismatch');

  const currencies = [event?.currency, order?.currency, clearing?.currency]
    .map(value => text(value, 12).toUpperCase())
    .filter(Boolean);
  if (new Set(currencies).size > 1) mismatches.push('provider-payment-witness-currency-mismatch');

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

function verifiedProductBinding(row) {
  if (!row) return null;
  const values = [row?.event?.product, row?.order?.product, row?.clearing?.product]
    .map(value => text(value, 200))
    .filter(Boolean);
  return values.length === 3 && new Set(values).size === 1 ? values[0] : null;
}

function verifiedRevenueRows({ revenueEvents, clearedIndex, reversalIndex, ordersIndex, leadId }) {
  const verified = [];
  const unverified = [];
  const reversals = [];
  const unverifiedReversals = [];
  const duplicateReversals = [];
  const contradicted = [];
  const seenReversals = new Map();
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
      const reversal = reversalIndex.get(key);
      if (reversal && order) {
        if (seenReversals.has(key)) {
          duplicateReversals.push({ providerEventId: key, amountCents: cents(event?.amountCents) });
          continue;
        }
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

export function reconcilePaymentRenewalTruth({
  lead = null,
  leadId: requestedLeadId = null,
  leadResolved = null,
  orders = [],
  revenueEvents = [],
  auditLog = [],
  fulfillment = null
} = {}) {
  const leadId = text(requestedLeadId, 200) || text(lead?.id, 200) || null;
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
  const verifiedFirstPaymentProduct = verifiedProductBinding(firstPayment);
  const renewals = verified.filter(item => item.clearing.eventName === 'subscription_payment_success');
  const acceptance = acceptanceTruth(fulfillment);
  const clearedRevenueCents = verified.reduce((sum, item) => sum + cents(item.event.amountCents), 0);
  const reversedRevenueCents = reversals.reduce((sum, item) => sum + Math.abs(cents(item.event.amountCents)), 0);
  const netClearedRevenueCents = clearedRevenueCents - reversedRevenueCents;

  const currencyCounts = new Map();
  for (const item of [...verified, ...reversals]) {
    const code = text(item?.event?.currency, 12).toUpperCase()
      || text(item?.order?.currency, 12).toUpperCase();
    if (!code) continue;
    currencyCounts.set(code, (currencyCounts.get(code) || 0) + 1);
  }
  const currencies = [...currencyCounts.keys()].sort();
  const singleCurrency = currencies.length === 1 ? currencies[0] : null;
  const byCurrency = {};
  for (const code of currencies) {
    byCurrency[code] = { clearedCents: 0, reversedCents: 0, netCents: 0, paymentCount: 0, reversalCount: 0 };
  }
  const bucketFor = item => {
    const code = text(item?.event?.currency, 12).toUpperCase()
      || text(item?.order?.currency, 12).toUpperCase();
    return code ? byCurrency[code] : null;
  };
  for (const item of verified) {
    const bucket = bucketFor(item);
    if (!bucket) continue;
    bucket.clearedCents += cents(item.event.amountCents);
    bucket.paymentCount += 1;
  }
  for (const item of reversals) {
    const bucket = bucketFor(item);
    if (!bucket) continue;
    bucket.reversedCents += Math.abs(cents(item.event.amountCents));
    bucket.reversalCount += 1;
  }
  for (const bucket of Object.values(byCurrency)) {
    bucket.netCents = bucket.clearedCents - bucket.reversedCents;
  }
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
  if (reversedRevenueCents > clearedRevenueCents) contradictions.push('refunds-exceed-provider-cleared-payments');
  if (currencies.length > 1) contradictions.push('multi-currency-revenue-cannot-be-summed');
  if (leadResolved === false) contradictions.push('payment-truth-requested-for-unknown-lead');
  if (fullyReversed && lead?.paymentStatus === 'paid') contradictions.push('lead-marked-paid-after-full-refund');
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
      currency: singleCurrency,
      currenciesPresent: currencies,
      byCurrency,
      providerClearedRevenueCents: clearedRevenueCents,
      providerClearedRevenue: clearedRevenueCents / 100,
      unverifiedPositiveRevenueCents,
      unverifiedPositiveRevenue: unverifiedPositiveRevenueCents / 100,
      verifiedPaymentCount: verified.length,
      verifiedRenewalCount: renewals.length,
      duplicateRevenueRowCount: duplicates.length,
      duplicateRevenueRowCents: duplicates.reduce((sum, item) => sum + item.amountCents, 0),
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
    verifiedFirstPaymentProduct,
    verifiedProviderEventRefs: verified.map(item => item.event.providerEventId),
    verifiedReversalEventRefs: reversals.map(item => item.event.providerEventId),
    unverifiedPositiveRevenueEventRefs: unverified.map(item => text(item.providerEventId, 400)).filter(Boolean),
    contradictions,
    claimBoundary: {
      leadPaidBoolean: 'NOT_PAYMENT_PROOF',
      revenueEventRow: 'NOT_PAYMENT_PROOF_ALONE',
      clearedPayment: firstPayment ? 'SIGNED_PROVIDER_CALLBACK_PLUS_CLEARED_CLASSIFICATION_PLUS_LEDGER_MATCH' : 'NOT_PROVEN',
      paymentProduct: verifiedFirstPaymentProduct ? 'THREE_WITNESS_PRODUCT_MATCH' : 'NOT_PROVEN',
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
    verifiedFirstPaymentProduct: result.verifiedFirstPaymentProduct,
    verifiedProviderEventRefs: result.verifiedProviderEventRefs,
    contradictions: result.contradictions,
    claimBoundary: result.claimBoundary
  });
  return result;
}

export async function reconcilePaymentRenewalTruthFromStore(store, { leadId, fulfillment = null } = {}) {
  if (!store || typeof store.list !== 'function') throw new Error('store-required');
  const requested = text(leadId, 200) || null;
  const lead = requested && typeof store.get === 'function' ? await store.get('leads', requested) : null;
  const [orders, revenueEvents, auditLog] = await Promise.all([
    store.list('orders'),
    store.list('revenueEvents'),
    store.list('auditLog')
  ]);
  return reconcilePaymentRenewalTruth({
    lead,
    leadId: requested,
    leadResolved: requested ? Boolean(lead) : null,
    orders,
    revenueEvents,
    auditLog,
    fulfillment
  });
}

export const PAYMENT_RENEWAL_TRUTH_EXTERNAL_EFFECTS = PAYMENT_TRUTH_EFFECTS;
