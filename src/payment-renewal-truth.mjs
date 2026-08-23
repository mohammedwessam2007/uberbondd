import crypto from 'node:crypto';

export const PAYMENT_RENEWAL_TRUTH_VERSION = 'payment-renewal-truth-1.0.0';

const ZERO_EXTERNAL_EFFECTS = Object.freeze({
  providerCalls: 0,
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  paymentMutations: 0,
  spendCents: 0
});

const CLEARED_CLASSIFICATIONS = new Set([
  'CLEARED_ONE_TIME_PAYMENT',
  'CLEARED_SUBSCRIPTION_PAYMENT'
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

function paymentAuditEntries(auditLog, leadId) {
  return auditLog.filter(entry =>
    entry?.type === 'payment_classification' &&
    (!leadId || entry?.leadId === leadId)
  );
}

function clearedEvidenceIndex(auditLog, leadId) {
  const index = new Map();
  for (const entry of paymentAuditEntries(auditLog, leadId)) {
    if (!CLEARED_CLASSIFICATIONS.has(entry?.classification)) continue;
    const eventName = text(entry?.eventName, 120);
    const eventId = text(entry?.eventId, 200);
    if (!eventName || !eventId) continue;
    index.set(`${eventName}:${eventId}`, {
      providerEventId: `${eventName}:${eventId}`,
      eventName,
      eventId,
      classification: entry.classification,
      policyVersion: text(entry?.policyVersion, 120) || null,
      timestamp: text(entry?.timestamp, 80) || null
    });
  }
  return index;
}

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

function verifiedRevenueRows({ revenueEvents, clearedIndex, ordersIndex, leadId }) {
  const verified = [];
  const unverified = [];
  for (const event of revenueEvents.filter(row => !leadId || row?.leadId === leadId)) {
    const key = text(event?.providerEventId, 400);
    const positive = cents(event?.amountCents) > 0;
    const clearing = clearedIndex.get(key);
    const order = ordersIndex.get(key);
    if (positive && clearing && order) {
      verified.push({ event, clearing, order });
    } else if (positive) {
      unverified.push(event);
    }
  }
  return { verified: sorted(verified.map(item => ({ ...item, createdAt: item.event?.createdAt }))), unverified: sorted(unverified) };
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
  const ordersIndex = orderEvidenceIndex(safeOrders, leadId);
  const { verified, unverified } = verifiedRevenueRows({
    revenueEvents: safeRevenue,
    clearedIndex,
    ordersIndex,
    leadId
  });

  const firstPayment = verified[0] || null;
  const renewals = verified.filter(item => item.clearing.eventName === 'subscription_payment_success');
  const acceptance = acceptanceTruth(fulfillment);
  const clearedRevenueCents = verified.reduce((sum, item) => sum + cents(item.event.amountCents), 0);
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
    }
  };

  const contradictions = [];
  if (lead?.paymentStatus === 'paid' && !firstPayment) contradictions.push('lead-marked-paid-without-provider-cleared-proof');
  if (unverifiedPositiveRevenueCents > 0) contradictions.push('positive-revenue-row-without-provider-cleared-proof');
  if (fulfillment?.economicTruth?.acceptedDelivery === true && !acceptance.proven) contradictions.push('accepted-delivery-flag-without-external-customer-proof');
  if (fulfillment?.renewalPaymentRef && !renewals.length) contradictions.push('renewal-reference-without-provider-cleared-renewal-proof');

  const result = {
    ok: contradictions.length === 0,
    policyVersion: PAYMENT_RENEWAL_TRUTH_VERSION,
    leadId,
    status: contradictions.length ? 'REVIEW_REQUIRED' : (firstPayment ? 'PROVIDER_CLEARED_PAYMENT_PROVEN' : 'NO_CLEARED_PAYMENT_PROVEN'),
    stages,
    economics: {
      providerClearedRevenueCents: clearedRevenueCents,
      providerClearedRevenue: clearedRevenueCents / 100,
      unverifiedPositiveRevenueCents,
      unverifiedPositiveRevenue: unverifiedPositiveRevenueCents / 100,
      verifiedPaymentCount: verified.length,
      verifiedRenewalCount: renewals.length
    },
    verifiedProviderEventRefs: verified.map(item => item.event.providerEventId),
    unverifiedPositiveRevenueEventRefs: unverified.map(item => text(item.providerEventId, 400)).filter(Boolean),
    contradictions,
    claimBoundary: {
      leadPaidBoolean: 'NOT_PAYMENT_PROOF',
      revenueEventRow: 'NOT_PAYMENT_PROOF_ALONE',
      clearedPayment: firstPayment ? 'SIGNED_PROVIDER_CALLBACK_PLUS_CLEARED_CLASSIFICATION_PLUS_LEDGER_MATCH' : 'NOT_PROVEN',
      customerAcceptance: acceptance.proven ? 'EXTERNAL_CUSTOMER_EVIDENCE_PRESENT' : 'NOT_PROVEN',
      renewal: renewals.length ? 'PROVIDER_CLEARED_RENEWAL_PROVEN' : 'NOT_PROVEN'
    },
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
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

export const PAYMENT_RENEWAL_TRUTH_EXTERNAL_EFFECTS = ZERO_EXTERNAL_EFFECTS;
