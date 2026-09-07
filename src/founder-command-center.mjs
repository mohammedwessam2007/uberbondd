import { buildOutboundOperatorSummary } from './outbound-operator-summary.mjs';
import { compileOfferPacket, OFFER_PRODUCTS } from './offer-compiler.mjs';
import { summarizePaymentOperatorAttention } from './payment-operator-attention.mjs';
import { CANONICAL_FIRST_CASH_PAYMENT_METHOD } from './first-cash-canary-packet.mjs';
import { LEAD_PATH_SPRINT_PRICE, LEAD_PATH_SPRINT_SKU } from './lead-path-sprint-fulfillment.mjs';
import { deriveFounderMinuteActions } from './founder-minute-priority.mjs';

// Bump when the report's shape or derivation logic changes.
export const COMMAND_CENTER_POLICY_VERSION = 'founder-command-center-1.2.0';

const SELF_SERVE_PRODUCTS = ['full', 'strategy', 'monitoring'];

function checkoutReadinessTable(cfg) {
  return SELF_SERVE_PRODUCTS.map(product => {
    const packet = compileOfferPacket({ prospect: { id: 'probe', issue: { title: 't', evidenceUrl: 'https://x', evidenceExcerpt: 'x', confidence: 1 } }, campaign: { approved: true }, cfg, product, date: new Date(0) });
    return {
      product,
      configured: packet.paymentRequirement?.checkoutReadiness?.configured || false,
      priceUsd: packet.price?.amountUsd ?? null,
      canonicalFirstCash: false,
      blocksCanonicalFirstCash: false
    };
  }).concat([{
    product: 'implementation',
    configured: Boolean(String(cfg.revenue?.bookingUrl || '').trim()),
    priceUsd: Number.isFinite(Number(cfg.revenue?.implementationFrom)) ? Number(cfg.revenue.implementationFrom) : null,
    canonicalFirstCash: false,
    blocksCanonicalFirstCash: false
  }]);
}

function canonicalFirstCashPath() {
  return {
    sku: LEAD_PATH_SPRINT_SKU,
    priceUsd: LEAD_PATH_SPRINT_PRICE.amountCents / 100,
    currency: LEAD_PATH_SPRINT_PRICE.currency,
    paymentMethod: CANONICAL_FIRST_CASH_PAYMENT_METHOD,
    orderEndpoint: 'POST /api/payments/paypal-order',
    staticCheckoutRequired: false,
    approvalUrlPrecomputed: false,
    requiresProviderOriginPaymentTruth: true,
    status: 'CANONICAL_PATH_DECLARED__EXTERNAL_GATES_NOT_INFERRED',
    businessEffectAuthority: 'NONE'
  };
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
  const firstCashPath = canonicalFirstCashPath();
  const legacyCheckoutGaps = checkoutTable
    .filter(row => row.priceUsd != null && !row.configured)
    .map(row => ({ product: row.product, priceUsd: row.priceUsd, blocksCanonicalFirstCash: false }));
  const paymentAttention = summarizePaymentOperatorAttention(recentAudit);
  const revenue = revenueEngine && typeof revenueEngine.summary === 'function' ? await revenueEngine.summary() : null;
  const safeOutbound = outbound.ok ? outbound : null;

  return {
    ok: true,
    policyVersion: COMMAND_CENTER_POLICY_VERSION,
    timestamp,
    whatCanMakeMoneyFirst: `${LEAD_PATH_SPRINT_SKU} ($${firstCashPath.priceUsd}) via ${CANONICAL_FIRST_CASH_PAYMENT_METHOD}; real contact/payment still requires external gates and provider-origin reconciliation`,
    canonicalFirstCashPath: firstCashPath,
    checkoutReadiness: checkoutTable,
    nonBlockingLegacyCheckoutGaps: legacyCheckoutGaps,
    offerReadiness: offers,
    deliveryReadiness: delivery,
    paymentTruth: {
      cleared: revenue?.clearedRevenue ?? 'UNKNOWN',
      refunded: revenue?.refundedRevenue ?? 'UNKNOWN',
      pendingOrders: revenue?.pendingOrders ?? 'UNKNOWN',
      activeMrr: revenue?.mrr ?? 'UNKNOWN',
      reviewRequiredRecently: paymentAttention.reviewRequired,
      expectedPendingRecently: paymentAttention.expectedPending,
      anomalousPendingRecently: paymentAttention.anomalousPending,
      operatorAttentionRecently: paymentAttention.attentionRequired
    },
    outbound: safeOutbound ? {
      killSwitch: safeOutbound.killSwitch, reservations: safeOutbound.reservations,
      staleRecoveryPreview: safeOutbound.staleRecoveryPreview, nextSafeAction: safeOutbound.nextSafeAction
    } : null,
    blocked: [
      ...(paymentAttention.attentionRequired > 0 ? [`${paymentAttention.attentionRequired} payment event(s) need operator review`] : [])
    ],
    ownerActionQueue: deriveFounderMinuteActions({ outbound: safeOutbound, paymentAttention, revenue }),
    businessEffectAuthority: 'NONE'
  };
}
