// Canonical first-cash packet facade.
//
// The mature packet and its historical compatibility API remain byte-preserved
// in first-cash-canary-packet-core.mjs. The canonical launch path no longer
// treats a reusable PayPal.me URL as the first-cash payment path. A buyer gets a
// unique provider approval URL only after an authenticated, lead/prospect/SKU-
// bound PayPal order is created. Capture still is not cleared-payment proof.

export * from './first-cash-canary-packet-core.mjs';

import * as core from './first-cash-canary-packet-core.mjs';

export const FIRST_CASH_CANARY_PACKET_VERSION = 'uberbond.first-cash-canary-packet-1.5.0';
export const CANONICAL_FIRST_CASH_PAYMENT_METHOD = 'PAYPAL_BOUND_PROVIDER_ORDER';
export const LEGACY_FIRST_CASH_PAYMENT_LINK = core.DEFAULT_FIRST_CASH_PAYMENT_LINK;
export const LEGACY_FIRST_CASH_PAYMENT_LINK_CLASSIFICATION = 'HISTORICAL_NONCANONICAL_PAYMENT_DESTINATION';
export const CANONICAL_PAYMENT_TRUTH_BOUNDARY = 'APPROVAL_URL_AND_CAPTURE_RESPONSE_ARE_NOT_CLEARED_PAYMENT_PROOF__SIGNED_PROVIDER_ORIGIN_RECONCILIATION_REQUIRED';

const clone = value => structuredClone(value);

function replaceQuestion(questions, id, replacement) {
  return (Array.isArray(questions) ? questions : []).map(row => row?.question === id ? { ...row, ...replacement } : row);
}

/**
 * Canonical launch packet.
 *
 * Deliberately passes no reusable payment link to the historical core. The
 * PayPal order endpoint creates a unique approval URL for one bound lead only.
 * Existing buildFirstCashCanaryPacket remains exported from the byte-preserved
 * core for compatibility with historical convergence tests; live launch code
 * must use this canonical compiler.
 */
export function compileFirstCashCanaryPacket(args = {}) {
  const paymentRail = args.paymentRail ?? { provider: 'paypal', mode: 'LIVE' };
  const report = core.compileFirstCashCanaryPacket({
    ...args,
    paymentRail,
    paymentLink: ''
  });

  const railReady = report?.paymentRail?.liveReady === true;
  const railReasons = report?.gates?.paymentRailLiveReady?.reasonCodes || [];
  let questions = replaceQuestion(report.questions, 'WHAT_PAYMENT_LINK', {
    answer: railReady
      ? 'No reusable static link is canonical. POST /api/payments/paypal-order creates a unique PayPal approval URL for one authenticated lead/prospect/SKU binding; that runtime URL is the buyer payment destination.'
      : 'No reusable static link is canonical. The bound-order path exists, but a unique PayPal approval URL may only be created after the live PayPal rail is ready.',
    status: railReady ? 'PREPARED' : 'BLOCKED',
    evidenceClass: 'INTERNAL_CODE',
    reasonCodes: railReady ? ['paypal-approval-url-created-per-bound-lead-at-runtime'] : ['paypal-bound-order-live-rail-not-ready', ...railReasons],
    module: 'api/payments/paypal-order.mjs'
  });
  questions = replaceQuestion(questions, 'HOW_RECONCILED', {
    answer: 'Authenticated bound PayPal order -> buyer approval -> capture request -> signed PayPal webhook -> PayPal verify-webhook-signature -> independent PayPal order/capture reads -> exact canonical witness triad -> payment classification -> payment-renewal truth -> fulfilment unlock.',
    status: 'EXTERNAL_PROOF_REQUIRED',
    evidenceClass: 'INTERNAL_CODE',
    reasonCodes: ['real-provider-origin-payment-event-required'],
    module: 'src/paypal-payment-truth.mjs'
  });

  return {
    ...report,
    policyVersion: FIRST_CASH_CANARY_PACKET_VERSION,
    schemaVersion: 'uberbond-first-cash-canary-packet-1.5.0',
    questions,
    paymentMethod: CANONICAL_FIRST_CASH_PAYMENT_METHOD,
    paymentLink: null,
    paymentLinkEvidenceClass: 'PER_LEAD_PROVIDER_APPROVAL_URL_REQUIRED',
    paymentTruthBoundary: CANONICAL_PAYMENT_TRUTH_BOUNDARY,
    paymentPreparation: {
      provider: 'paypal',
      orderEndpoint: 'POST /api/payments/paypal-order',
      approvalUrlSource: 'PAYPAL_PROVIDER_ORDER_RESPONSE__PER_BOUND_LEAD',
      captureEndpoint: 'GET /api/payments/paypal-capture',
      webhookEndpoint: 'POST /api/webhooks/paypal',
      fulfillmentBridge: 'src/first-cash-fulfillment-runtime.mjs',
      reusableStaticLink: false,
      approvalUrlPrecomputed: false,
      requiresAuthenticatedLeadBinding: true,
      requiresExactSku: core.FIRST_CASH_OFFER?.sku || null,
      commercialTruthEligibleBeforeProviderReconciliation: false
    },
    legacyPaymentDestination: {
      link: LEGACY_FIRST_CASH_PAYMENT_LINK,
      classification: LEGACY_FIRST_CASH_PAYMENT_LINK_CLASSIFICATION,
      canonical: false,
      maySatisfyPaymentRailGate: false,
      mayUnlockFulfillment: false
    },
    policyVersions: {
      ...(report.policyVersions || {}),
      firstCashPacket: FIRST_CASH_CANARY_PACKET_VERSION
    },
    commercialTruth: {
      realCustomers: 0,
      clearedRevenueCents: 0,
      acceptedPaidDeliveries: 0,
      retainedCustomers: 0
    },
    businessEffectAuthority: 'NONE'
  };
}

export function compileFirstCashCanaryArtifact(args = {}) {
  const historical = core.compileFirstCashCanaryArtifact(args);
  const canonical = compileFirstCashCanaryPacket(args);
  return {
    ...historical,
    ...canonical,
    canonicalDeliveryRefusal: clone(historical.canonicalDeliveryRefusal),
    commercialDeliveryCount: 0,
    acceptedDeliveryCount: 0,
    businessEffectAuthority: 'NONE'
  };
}
