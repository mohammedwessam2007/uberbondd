import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const FIRST_CASH_PAYMENT_DESTINATION_VERSION = 'uberbond.first-cash-payment-destination-1.0.0';
export const FIRST_CASH_PAYPAL_ME_URL = 'https://paypal.me/Sarawessam';
export const FIRST_CASH_PAYMENT_DESTINATION = Object.freeze({
  provider: 'PAYPAL',
  surface: 'PAYPAL_ME',
  url: FIRST_CASH_PAYPAL_ME_URL,
  purpose: 'CUSTOMER_FACING_PAYMENT_DESTINATION',
  offerSku: 'lead-path-revenue-leak-evidence-sprint-usd-450',
  amountCents: 45000,
  currency: 'USD',
  truthBoundary: 'PAYMENT_DESTINATION_ONLY_NOT_PAYMENT_EVIDENCE',
  proves: Object.freeze(['customer-facing payment destination is owner-supplied']),
  doesNotProve: Object.freeze([
    'merchant-or-KYC-readiness',
    'PayPal API or Sandbox readiness',
    'payment occurrence',
    'payment amount or currency',
    'payment product/SKU',
    'payment cleared status',
    'payment retained status',
    'absence of refund/reversal/dispute',
    'customer acceptance',
    'customer retention'
  ])
});

export function compileFirstCashPaymentDestination() {
  return {
    ok: true,
    policyVersion: FIRST_CASH_PAYMENT_DESTINATION_VERSION,
    status: 'DESTINATION_PRESENT_TRUTH_UNPROVEN',
    destination: FIRST_CASH_PAYMENT_DESTINATION,
    clearedPaymentTruth: false,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS)
  };
}

export function paymentDestinationCanUnlockFulfillment() {
  return false;
}
