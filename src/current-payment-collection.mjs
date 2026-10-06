// Current first-cash collection route truth.
//
// This does not replace provider adapters or canonical cleared-payment truth.
// It only prevents the launch surface from turning technically implemented,
// superseded or unavailable rails into owner work. Provider/account readiness
// remains fail-closed until exact external evidence exists.

import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const CURRENT_PAYMENT_COLLECTION_POLICY_VERSION = 'uberbond.current-payment-collection.v1';

const freezeRoute = route => Object.freeze({
  ...route,
  reasonCodes: Object.freeze([...(route.reasonCodes || [])]),
  evidenceRefs: Object.freeze([...(route.evidenceRefs || [])]),
  capabilities: Object.freeze([...(route.capabilities || [])]),
  ownerActionQueue: Object.freeze((route.ownerActionQueue || []).map(action => Object.freeze({ ...action })))
});

export const CURRENT_PAYMENT_COLLECTION_ROUTES = Object.freeze([
  freezeRoute({
    provider: 'contra',
    priority: 'PRIMARY',
    selectedForCurrentLaunch: true,
    state: 'ACCOUNT_SETUP_PENDING',
    liveReady: false,
    recurringCostUsd: 0,
    providerEvidenceState: 'EGYPT_ROUTE_PROVIDER_CONFIRMED',
    capabilities: ['INVOICE', 'PROJECT', 'PAYMENT_LINK', 'EGYPT_BANK_SWIFT_PAYOUT'],
    reasonCodes: [
      'exact-account-authentication-unverified',
      'exact-account-kyc-tax-wallet-state-unverified',
      'exact-payout-destination-unverified'
    ],
    evidenceRefs: [
      'docs/handoffs/WORK_CURRENT.md',
      'docs/handoffs/WORK_CONTRA_CURRENT_2026-10-06.md'
    ],
    ownerActionQueue: [{
      action: 'Finish the existing Contra account setup and verify the payout route.',
      screen: 'Contra -> Account / Wallet / payout settings',
      minutes: 10,
      costUsd: 0,
      evidenceOfCompletion: 'Existing account is authenticated and the account-specific KYC/tax/wallet/payout state plus an Egyptian-bank SWIFT payout destination are verified without exposing credentials.'
    }],
    truthBoundary: 'Provider support for Egyptian payment receipt and SWIFT payout is confirmed; this does not prove the exact account is authenticated, KYC-complete, payout-ready, funded or cleared.'
  }),
  freezeRoute({
    provider: 'xpay',
    priority: 'BACKUP',
    selectedForCurrentLaunch: false,
    state: 'PROVIDER_REVIEW_TEST_ONLY',
    liveReady: false,
    recurringCostUsd: 0,
    providerEvidenceState: 'ONBOARDING_COMPLETE_LIVE_APPROVAL_PENDING',
    capabilities: ['SIGNED_WEBHOOK_INTAKE_IMPLEMENTED'],
    reasonCodes: ['provider-live-approval-pending', 'canonical-live-reconciliation-not-proven'],
    evidenceRefs: ['docs/receipts/XPAY_SIGNED_INTAKE_20261005.md'],
    ownerActionQueue: [],
    truthBoundary: 'XPay remains a backup while provider live approval and end-to-end provider-origin reconciliation are unproven.'
  }),
  freezeRoute({
    provider: 'payoneer',
    priority: 'RECOVERY_BACKUP',
    selectedForCurrentLaunch: false,
    state: 'EXISTING_ACCOUNT_RECOVERY_REQUIRED',
    liveReady: false,
    recurringCostUsd: 0,
    providerEvidenceState: 'EXISTING_ACCOUNT_KNOWN',
    capabilities: [],
    reasonCodes: ['existing-account-recovery-required'],
    evidenceRefs: ['docs/handoffs/WORK_CURRENT.md'],
    ownerActionQueue: [],
    truthBoundary: 'Do not create a duplicate account. Recovery-only backup is not current launch readiness.'
  }),
  freezeRoute({
    provider: 'paypal',
    priority: 'DEACTIVATED',
    selectedForCurrentLaunch: false,
    state: 'PERMANENTLY_DEACTIVATED',
    liveReady: false,
    recurringCostUsd: 0,
    providerEvidenceState: 'UNAVAILABLE',
    capabilities: [],
    reasonCodes: ['provider-account-permanently-deactivated'],
    evidenceRefs: ['docs/handoffs/WORK_CURRENT.md', 'docs/handoffs/WORK_LAUNCH_TODAY_CURRENT_2026-10-06.md'],
    ownerActionQueue: [],
    truthBoundary: 'PayPal is unavailable for this owner and must not appear as a launch task or be bypassed with replacement accounts.'
  })
]);

export function currentPaymentCollectionRoutes() {
  return CURRENT_PAYMENT_COLLECTION_ROUTES.map(route => ({
    ...route,
    capabilities: [...route.capabilities],
    reasonCodes: [...route.reasonCodes],
    evidenceRefs: [...route.evidenceRefs],
    ownerActionQueue: route.ownerActionQueue.map(action => ({ ...action })),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS)
  }));
}
