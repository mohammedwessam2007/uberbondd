import { buildOutboundOperatorSummary } from './outbound-operator-summary.mjs';
import { compileOfferPacket, OFFER_PRODUCTS } from './offer-compiler.mjs';

// Bump when the report's shape or derivation logic changes.
export const COMMAND_CENTER_POLICY_VERSION = 'founder-command-center-1.0.0';

const SELF_SERVE_PRODUCTS = ['full', 'strategy', 'monitoring'];

function checkoutReadinessTable(cfg) {
  return SELF_SERVE_PRODUCTS.map(product => {
    const packet = compileOfferPacket({ prospect: { id: 'probe', issue: { title: 't', evidenceUrl: 'https://x', evidenceExcerpt: 'x', confidence: 1 } }, campaign: { approved: true }, cfg, product, date: new Date(0) });
    return { product, configured: packet.paymentRequirement?.checkoutReadiness?.configured || false, priceUsd: packet.price?.amountUsd ?? null };
  }).concat([{
    product: 'implementation',
    configured: Boolean(String(cfg.revenue?.bookingUrl || '').trim()),
    priceUsd: Number.isFinite(Number(cfg.revenue?.implementationFrom)) ? Number(cfg.revenue.implementationFrom) : null
  }]);
}

async function offerReadinessTable({ store, cfg, referenceDate }) {
  const prospects = await store.list('prospects');
  const eligible = prospects.filter(prospect => ['ready', 'research-complete'].includes(prospect.status));
  const readyByProduct = {};
  for (const product of OFFER_PRODUCTS) readyByProduct[product] = 0;
  for (const prospect of eligible) {
    for (const product of OFFER_PRODUCTS) {
      const packet = compileOfferPacket({ prospect, campaign: { approved: true }, cfg, product, date: referenceDate });
      if (packet.ok && packet.readyToOffer) readyByProduct[product] += 1;
    }
  }
  return { candidateProspects: eligible.length, readyOffersByProduct: readyByProduct };
}

async function deliveryReadinessTable({ store }) {
  const leads = await store.list('leads');
  const paid = leads.filter(lead => lead.paymentStatus === 'paid');
  return {
    paidLeads: paid.length,
    awaitingReportDelivery: paid.filter(lead => lead.status !== 'report-ready').length,
    reportDelivered: paid.filter(lead => lead.status === 'report-ready').length
  };
}

function deriveOwnerActions({ checkoutTable, outbound, reviewRequiredPaymentEvents, revenue }) {
  const actions = [];
  const unconfiguredPriced = checkoutTable.filter(row => row.priceUsd != null && !row.configured);
  if (unconfiguredPriced.length) {
    actions.push({
      action: `Configure checkout for: ${unconfiguredPriced.map(r => r.product).join(', ')}`,
      reason: 'A priced offer with no working checkout path cannot convert any buyer, regardless of how good the evidence is.',
      expectedValue: 'Unblocks the entire first-payment path', timeRequired: '15-30 minutes per provider', cost: 'Free to configure (provider fees apply per transaction)',
      evidence: `${unconfiguredPriced.length} product(s) priced but not checkout-ready`, risk: 'None to configure; risk is zero revenue while unconfigured',
      completionTest: 'checkoutReadinessTable reports configured:true for each listed product'
    });
  }
  if (reviewRequiredPaymentEvents > 0) {
    actions.push({
      action: `Review ${reviewRequiredPaymentEvents} REVIEW_REQUIRED payment event(s)`,
      reason: 'These webhook events did not auto-classify (unknown lead, mismatched prospect, malformed data) and need a human decision.',
      expectedValue: 'Prevents a real payment from being silently lost or misattributed', timeRequired: '5-10 minutes',
      cost: 'None', evidence: 'payment_classification audit log entries with classification=REVIEW_REQUIRED', risk: 'A real customer payment could go unfulfilled if ignored',
      completionTest: 'No REVIEW_REQUIRED payment_classification entries remain unresolved'
    });
  }
  if (outbound?.staleRecoveryPreview?.wouldRecover > 0 || outbound?.staleRecoveryPreview?.wouldQuarantine > 0) {
    actions.push({
      action: 'Run the outbound reservation recovery sweep',
      reason: 'Stuck reservations are consuming capacity and delaying visibility into real send state.',
      expectedValue: 'Restores accurate capacity accounting', timeRequired: '<1 minute (automated)', cost: 'None',
      evidence: `${outbound.staleRecoveryPreview.wouldRecover} recoverable, ${outbound.staleRecoveryPreview.wouldQuarantine} to quarantine`,
      risk: 'None: the sweep never sends anything', completionTest: 'staleRecoveryPreview counts return to zero'
    });
  }
  if (!actions.length) {
    actions.push({
      action: 'No binding action required', reason: `Checkout, offers, and payment classification all show a clean state as of this report. Cleared revenue so far: $${revenue?.clearedRevenue ?? 'UNKNOWN'}.`,
      expectedValue: 'N/A', timeRequired: 'N/A', cost: 'N/A', evidence: 'See checkoutReadiness/offerReadiness/paymentTruth tables', risk: 'N/A',
      completionTest: 'N/A'
    });
  }
  return actions.slice(0, 3);
}

// Read-only. Never sends, never mutates. Answers the founder's actual
// questions by composing existing summaries and compilers rather than
// building a new dashboard data model.
export async function buildFounderCommandCenter({ store, cfg = {}, revenueEngine = null, date = new Date(), auditLimit = 500 } = {}) {
  const referenceDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const timestamp = referenceDate.toISOString();

  if (!store || typeof store.list !== 'function') {
    return { ok: false, reason: 'malformed-input-store', policyVersion: COMMAND_CENTER_POLICY_VERSION, timestamp };
  }

  const [outbound, offers, delivery, recentAudit] = await Promise.all([
    buildOutboundOperatorSummary({ store, cfg, date: referenceDate, auditLimit }),
    offerReadinessTable({ store, cfg, referenceDate }),
    deliveryReadinessTable({ store }),
    store.list('auditLog', { orderBy: 'createdAt', direction: 'desc', limit: Math.max(0, Number(auditLimit) || 500) })
  ]);

  const checkoutTable = checkoutReadinessTable(cfg);
  const reviewRequiredPaymentEvents = recentAudit.filter(entry => entry.type === 'payment_classification' && entry.detail?.classification === 'REVIEW_REQUIRED').length;
  const revenue = revenueEngine && typeof revenueEngine.summary === 'function' ? await revenueEngine.summary() : null;

  return {
    ok: true,
    policyVersion: COMMAND_CENTER_POLICY_VERSION,
    timestamp,
    whatCanMakeMoneyFirst: offers.readyOffersByProduct.full > 0
      ? `${offers.readyOffersByProduct.full} prospect(s) have a ready-to-offer full audit ($${checkoutTable.find(r => r.product === 'full')?.priceUsd ?? 'UNKNOWN'})`
      : 'No prospect currently has a ready-to-offer diagnostic; evidence or checkout configuration is the blocker',
    checkoutReadiness: checkoutTable,
    offerReadiness: offers,
    deliveryReadiness: delivery,
    paymentTruth: {
      cleared: revenue?.clearedRevenue ?? 'UNKNOWN',
      refunded: revenue?.refundedRevenue ?? 'UNKNOWN',
      pendingOrders: revenue?.pendingOrders ?? 'UNKNOWN',
      activeMrr: revenue?.mrr ?? 'UNKNOWN',
      reviewRequiredRecently: reviewRequiredPaymentEvents
    },
    outbound: outbound.ok ? {
      killSwitch: outbound.killSwitch, reservations: outbound.reservations,
      staleRecoveryPreview: outbound.staleRecoveryPreview, nextSafeAction: outbound.nextSafeAction
    } : null,
    blocked: [
      ...(checkoutTable.filter(row => row.priceUsd != null && !row.configured).map(row => `checkout not configured: ${row.product}`)),
      ...(reviewRequiredPaymentEvents > 0 ? [`${reviewRequiredPaymentEvents} payment event(s) need review`] : [])
    ],
    ownerActionQueue: deriveOwnerActions({ checkoutTable, outbound: outbound.ok ? outbound : null, reviewRequiredPaymentEvents, revenue })
  };
}
