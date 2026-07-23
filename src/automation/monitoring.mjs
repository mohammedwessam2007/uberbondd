export class MonitoringError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'MonitoringError';
    this.code = code;
  }
}

const ACTIVE_STATUSES = new Set(['active', 'on_trial', 'trialing']);

/**
 * Consent gate for monitoring enrollment (spec section J). src/revenue.mjs#activateSubscription
 * already creates/updates the subscription record once a monitoring offer is paid; this function
 * is the explicit-consent checkpoint that must pass before that call is ever made from an
 * automated (non-owner-clicked) path -- it never itself touches the store, so it stays trivially
 * testable and cannot be bypassed by forgetting to call a side-effecting function.
 */
export function assertMonitoringConsent(consent = {}) {
  if (consent.explicitOptIn !== true) throw new MonitoringError('monitoring-consent-required');
  if (!consent.consentedAt || Number.isNaN(Date.parse(consent.consentedAt))) throw new MonitoringError('monitoring-consent-timestamp-required');
  if (!consent.priceAcknowledged) throw new MonitoringError('monitoring-price-not-acknowledged');
  return true;
}

/**
 * A cancellation patch for a subscription record. Cancellation always takes effect immediately
 * (no retention dark pattern) and clears nextRunAt so no further monitoring run is scheduled.
 */
export function cancelMonitoringSubscription(subscription = {}, reason = 'owner-cancelled', at = new Date().toISOString()) {
  if (!ACTIVE_STATUSES.has(subscription.status)) throw new MonitoringError('monitoring-subscription-not-active');
  return { ...subscription, status: 'cancelled', cancelledAt: at, cancellationReason: String(reason).slice(0, 160), nextRunAt: null };
}

/**
 * A payment-failure patch. This never triggers a retry charge or a hidden charge of any kind --
 * it only stops scheduling further monitoring runs and flags the subscription for an owner
 * exception, mirroring how src/revenue.mjs already handles refunded/cancelled monitoring offers.
 */
export function handleMonitoringPaymentFailure(subscription = {}, at = new Date().toISOString()) {
  if (!ACTIVE_STATUSES.has(subscription.status)) throw new MonitoringError('monitoring-subscription-not-active');
  return { ...subscription, status: 'payment_failed', paymentFailedAt: at, nextRunAt: null };
}

export function buildMonitoringEnrollmentRecord({ lead, prospect, offer, consent }, at = new Date().toISOString()) {
  assertMonitoringConsent(consent);
  if (offer?.type !== 'monitoring') throw new MonitoringError('monitoring-offer-type-required');
  return {
    leadId: lead?.id || null,
    prospectId: prospect?.id || offer?.prospectId,
    offerId: offer.id,
    consent: {
      explicitOptIn: true,
      consentedAt: consent.consentedAt,
      priceAcknowledged: true,
      channel: String(consent.channel || 'owner-console').slice(0, 60)
    },
    enrolledAt: at
  };
}
