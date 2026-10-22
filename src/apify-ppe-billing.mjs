// Adapter from Apify pay-per-event charging to the sale's charge contract
// (settleFindingsSale in self-verifying-findings.mjs).
//
// Behaviour of the pinned SDK (apify 3.7.2, dist/charging.js), read from source:
// - Actor.charge() computes chargedCount locally. For an event name that is
//   not in the run's pricing it returns chargedCount = count without calling
//   the platform at all, so a charge is believed only for a priced event.
// - When the remaining budget is below one event price, charge() bills one
//   event over the limit on purpose so the platform terminates the run. The
//   budget must therefore be checked before delivering a chargeable finding.
// - If the platform call fails after local accounting, charge() throws: the
//   outcome is unknown, never refused.
// - In a run that is not pay-per-event, charge() bills nothing.
// Platform rule (docs.apify.com pay-per-event, read 2026-10-22): the synthetic
// apify-default-dataset-item event bills the user for every dataset item. This
// Actor also writes findings it does not charge for, so a priced dataset-item
// event would bill them silently. Such a configuration is refused.
//
// CONFIRMED here means the platform accepted the charge event. It is not
// collected or cleared money (see revenue-reality-ledger.mjs).

export const APIFY_PPE_BILLING_VERSION = 'uberbond.apify-ppe-billing-1.0.0';
export const VERIFIED_FINDING_EVENT = 'verified-finding';

/**
 * pricingInfo: ChargingManager.getPricingInfo().
 * charge({ eventName, count }): Actor.charge.
 * maxChargeableWithinLimit(eventName): ChargingManager.calculateMaxEventChargeCountWithinLimit.
 * Returns { mode: 'PAY_PER_EVENT', charge, canCharge, priceCents, ... } or
 * { mode: 'DELIVERY_ONLY' | 'NOT_CHARGEABLE', reason } when nothing may be charged.
 */
export function apifyPayPerEventBilling({ pricingInfo, charge, maxChargeableWithinLimit, eventName = VERIFIED_FINDING_EVENT }) {
  if (pricingInfo?.isPayPerEvent !== true) return { mode: 'DELIVERY_ONLY', reason: 'RUN_IS_NOT_PAY_PER_EVENT' };
  const priceUsd = pricingInfo.perEventPrices?.[eventName];
  if (!(typeof priceUsd === 'number' && Number.isFinite(priceUsd) && priceUsd > 0)) return { mode: 'NOT_CHARGEABLE', reason: `EVENT_NOT_PRICED:${eventName}` };
  const priceCents = Math.round(priceUsd * 100);
  // Receipts count whole cents; a sub-cent or fractional price would be misreported.
  if (Math.abs(priceCents - priceUsd * 100) > 1e-6) return { mode: 'NOT_CHARGEABLE', reason: `EVENT_PRICE_NOT_WHOLE_CENTS:${priceUsd}` };
  const datasetItemPrice = pricingInfo.perEventPrices?.['apify-default-dataset-item'];
  if (typeof datasetItemPrice === 'number' && datasetItemPrice > 0) return { mode: 'NOT_CHARGEABLE', reason: 'DATASET_ITEM_EVENT_WOULD_BILL_UNCHARGED_FINDINGS' };
  if (typeof charge !== 'function' || typeof maxChargeableWithinLimit !== 'function') throw new Error('charge and maxChargeableWithinLimit are required for pay-per-event billing');
  return {
    mode: 'PAY_PER_EVENT',
    eventName,
    priceUsd,
    priceCents,
    maxTotalChargeUsd: pricingInfo.maxTotalChargeUsd ?? null,
    canCharge: () => maxChargeableWithinLimit(eventName) >= 1,
    charge: async () => {
      const result = await charge({ eventName, count: 1 });
      if (!Number.isSafeInteger(result?.chargedCount) || result.chargedCount < 0) return { status: 'UNKNOWN', reason: 'MALFORMED_CHARGE_RESULT' };
      const limitReached = result.eventChargeLimitReached === true;
      if (result.chargedCount >= 1) return { status: 'CONFIRMED', limitReached };
      return { status: 'REFUSED', limitReached, reason: limitReached ? 'BUYER_CHARGE_LIMIT' : 'NOT_BILLED' };
    }
  };
}
