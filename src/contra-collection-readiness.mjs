import { containsSecretValue } from './secret-patterns.mjs';

const DAY_MS = 86_400_000;
const FUTURE_SKEW_MS = 5 * 60 * 1000;
const MAX_OBSERVATION_AGE_DAYS = 7;

export const CONTRA_COLLECTION_READINESS_VERSION = 'uberbond.contra-collection-readiness.v1';
export const CONTRA_COLLECTION_STATES = Object.freeze([
  'ACCOUNT_OBSERVATION_REQUIRED',
  'ACCOUNT_AUTH_REQUIRED',
  'WALLET_SETUP_REQUIRED',
  'KYC_REQUIRED',
  'TAX_PROFILE_REQUIRED',
  'PAYOUT_METHOD_REQUIRED',
  'PAYMENT_PATH_REQUIRED',
  'ACCOUNT_REVIEW_PENDING',
  'COLLECTION_READY'
]);

const ZERO_EXTERNAL_EFFECTS = Object.freeze({
  customerMessages: 0,
  providerCalls: 0,
  spendCents: 0,
  deployments: 0,
  dnsChanges: 0,
  credentialChanges: 0,
  paymentMutations: 0,
  productionMutations: 0
});

const safeText = (value, max = 300) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : '';
};
const strictDate = value => {
  const raw = safeText(value, 80);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
};
const cleanRefs = values => Array.isArray(values)
  ? [...new Set(values.map(v => safeText(v, 500)).filter(Boolean))].slice(0, 20)
  : [];
const normalize = value => safeText(value, 80).toUpperCase();

function base({ state, reasonCodes, observation = null, reference }) {
  const evidenceRefs = cleanRefs(observation?.evidenceRefs);
  return {
    ok: true,
    version: CONTRA_COLLECTION_READINESS_VERSION,
    provider: 'contra',
    state,
    liveReady: state === 'COLLECTION_READY',
    lifecycle: 'SELECTED_CURRENT_ROUTE',
    criticalPath: true,
    reasonCodes: [...new Set(reasonCodes)],
    observationClass: observation ? 'OWNER_ATTESTED_PROVIDER_UI_OBSERVATION' : 'NO_ACCOUNT_OBSERVATION',
    observedAt: strictDate(observation?.observedAt)?.toISOString() || null,
    evaluatedAt: reference.toISOString(),
    evidenceRefs,
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    paymentRequestAuthority: 'NONE',
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
    truthBoundary: state === 'COLLECTION_READY'
      ? 'COLLECTION_READY_MEANS_THE_EXISTING_ACCOUNT_APPEARS_ABLE_TO_CONTRACT_AND_COLLECT__IT_IS_NOT_A_CLIENT_A_SENT_PAYMENT_REQUEST_CLEARED_CASH_OR_PAYOUT'
      : 'GENERAL_PROVIDER_CAPABILITY_OR_CONFIGURATION_NEVER_MINTS_COLLECTION_READY_WITHOUT_CURRENT_ACCOUNT_OBSERVATION'
  };
}

export function compileContraCollectionReadiness(observation = null, { at = new Date() } = {}) {
  const reference = at instanceof Date && Number.isFinite(at.getTime()) ? at : new Date();
  if (!observation || typeof observation !== 'object' || Array.isArray(observation)) {
    return base({ state: 'ACCOUNT_OBSERVATION_REQUIRED', reasonCodes: ['current-authenticated-account-observation-required'], reference });
  }

  const reasons = [];
  const observedAt = strictDate(observation.observedAt);
  if (!observedAt) reasons.push('account-observation-timestamp-required');
  else {
    const age = reference.getTime() - observedAt.getTime();
    if (age < -FUTURE_SKEW_MS) reasons.push('account-observation-in-future');
    else if (age > MAX_OBSERVATION_AGE_DAYS * DAY_MS) reasons.push('account-observation-stale');
  }
  if (safeText(observation.provider, 40).toLowerCase() !== 'contra') reasons.push('contra-provider-observation-required');
  if (observation.ownerAttested !== true) reasons.push('owner-attestation-required');
  const evidenceRefs = cleanRefs(observation.evidenceRefs);
  if (!evidenceRefs.length) reasons.push('non-secret-evidence-reference-required');
  if (evidenceRefs.some(ref => containsSecretValue(ref))) reasons.push('evidence-reference-secret-detected');
  if (observation.existingAccountConfirmed !== true) reasons.push('existing-account-confirmation-required');
  if (observation.duplicateAccountCreated === true) reasons.push('duplicate-account-must-not-be-created');
  if (reasons.length) return base({ state: 'ACCOUNT_OBSERVATION_REQUIRED', reasonCodes: reasons, observation, reference });

  if (observation.authenticated !== true) {
    return base({ state: 'ACCOUNT_AUTH_REQUIRED', reasonCodes: ['existing-contra-account-authentication-required'], observation, reference });
  }

  const wallet = observation.wallet && typeof observation.wallet === 'object' ? observation.wallet : {};
  const walletStatus = normalize(wallet.status);
  if (!['READY', 'ACTIVE'].includes(walletStatus)) {
    return base({ state: 'WALLET_SETUP_REQUIRED', reasonCodes: [`contra-wallet-not-ready:${walletStatus || 'UNKNOWN'}`], observation, reference });
  }

  const identityStatus = normalize(wallet.identityVerificationStatus || observation.identityVerificationStatus);
  if (identityStatus !== 'VERIFIED') {
    return base({ state: 'KYC_REQUIRED', reasonCodes: [`contra-identity-not-verified:${identityStatus || 'UNKNOWN'}`], observation, reference });
  }

  const taxStatus = normalize(observation.taxProfileStatus);
  if (!['COMPLETE', 'NOT_REQUIRED_BY_PROVIDER'].includes(taxStatus)) {
    return base({ state: 'TAX_PROFILE_REQUIRED', reasonCodes: [`contra-tax-profile-unresolved:${taxStatus || 'UNKNOWN'}`], observation, reference });
  }

  const payout = observation.payout && typeof observation.payout === 'object' ? observation.payout : {};
  const payoutStatus = normalize(payout.status);
  const payoutMethod = normalize(payout.method);
  const payoutCountry = normalize(payout.country);
  if (!['READY', 'ACTIVE', 'VERIFIED'].includes(payoutStatus)
      || !['SWIFT', 'LOCAL_BANK'].includes(payoutMethod)
      || payoutCountry !== 'EG'
      || payout.accountOwnerMatch !== true) {
    return base({
      state: 'PAYOUT_METHOD_REQUIRED',
      reasonCodes: [
        !['READY', 'ACTIVE', 'VERIFIED'].includes(payoutStatus) ? `contra-payout-not-ready:${payoutStatus || 'UNKNOWN'}` : null,
        !['SWIFT', 'LOCAL_BANK'].includes(payoutMethod) ? `contra-egypt-payout-method-required:${payoutMethod || 'UNKNOWN'}` : null,
        payoutCountry !== 'EG' ? `contra-payout-country-must-be-eg:${payoutCountry || 'UNKNOWN'}` : null,
        payout.accountOwnerMatch !== true ? 'contra-payout-account-owner-match-required' : null
      ].filter(Boolean),
      observation,
      reference
    });
  }

  const blocking = Array.isArray(observation.blockingRequirements)
    ? observation.blockingRequirements.map(v => safeText(v, 160)).filter(Boolean)
    : null;
  if (blocking === null) {
    return base({ state: 'ACCOUNT_REVIEW_PENDING', reasonCodes: ['contra-blocking-requirements-observation-required'], observation, reference });
  }
  if (blocking.length) {
    return base({ state: 'ACCOUNT_REVIEW_PENDING', reasonCodes: blocking.map(v => `contra-account-blocker:${v}`), observation, reference });
  }

  const capabilities = observation.capabilities && typeof observation.capabilities === 'object' ? observation.capabilities : {};
  if (capabilities.oneTimeFixedProject !== true) {
    return base({ state: 'PAYMENT_PATH_REQUIRED', reasonCodes: ['contra-one-time-fixed-project-capability-required'], observation, reference });
  }

  return base({ state: 'COLLECTION_READY', reasonCodes: ['contra-account-contract-and-collection-prerequisites-observed'], observation, reference });
}

export function summarizeContraCollectionReadiness(report = {}) {
  const actions = [];
  if (report.state === 'ACCOUNT_OBSERVATION_REQUIRED' || report.state === 'ACCOUNT_AUTH_REQUIRED') {
    actions.push({
      action: 'Sign in to the existing Contra account; do not create a duplicate account.',
      screen: 'Contra -> existing account',
      minutes: 3,
      costUsd: 0,
      evidenceOfCompletion: 'Current authenticated account view is observable.'
    });
  }
  if (['WALLET_SETUP_REQUIRED', 'KYC_REQUIRED', 'TAX_PROFILE_REQUIRED', 'PAYOUT_METHOD_REQUIRED', 'ACCOUNT_REVIEW_PENDING'].includes(report.state)) {
    actions.push({
      action: 'Complete only the Wallet, identity, tax and Egyptian payout requirements Contra actually shows.',
      screen: 'Contra -> Wallet -> Add account / verification / payout method',
      minutes: 15,
      costUsd: 0,
      evidenceOfCompletion: 'Wallet is ready, identity is verified, tax profile is complete or explicitly not required, and an owner-matched Egyptian bank payout is ready with no blocking banner.'
    });
  }
  if (report.state === 'PAYMENT_PATH_REQUIRED') {
    actions.push({
      action: 'Open a One-Time Fixed project draft without sending it.',
      screen: 'Contra -> New project/proposal -> One-Time Fixed (Escrow)',
      minutes: 3,
      costUsd: 0,
      evidenceOfCompletion: 'The existing account can reach the One-Time Fixed project editor; no client invite or payment request is sent.'
    });
  }
  return {
    ok: report.ok === true,
    version: CONTRA_COLLECTION_READINESS_VERSION,
    provider: 'contra',
    state: report.state || 'ACCOUNT_OBSERVATION_REQUIRED',
    liveReady: report.liveReady === true,
    reasonCodes: [...(report.reasonCodes || [])],
    ownerActionQueue: actions.slice(0, 3),
    paymentRequestAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS)
  };
}

export function defaultContraFirstCashProjectPlan({ priceUsd = null, currency = 'USD' } = {}) {
  const numeric = Number(priceUsd);
  return {
    provider: 'contra',
    projectType: 'ONE_TIME_FIXED_ESCROW',
    contractMode: 'CONTRA_TEMPLATE_WITH_UBERBOND_SCOPE_SCHEDULE',
    currency: safeText(currency, 8).toUpperCase() || 'USD',
    priceUsd: Number.isFinite(numeric) && numeric > 0 ? numeric : null,
    clientFunding: 'TOTAL_PROJECT_FEE_UPFRONT_IN_ESCROW',
    releaseCondition: 'CLIENT_APPROVAL_OF_DEFINED_DELIVERABLES',
    fallbackPaymentPath: 'ONE_TIME_PAYMENT_LINK_ONLY_AFTER_SCOPE_AND_AGREEMENT_ARE_ALREADY_BOUND',
    paymentRequestAuthority: 'NONE',
    truthBoundary: 'PROJECT_PLAN_IS_AN_INTERNAL_DEFAULT__NO_PROPOSAL_CONTRACT_PAYMENT_REQUEST_OR_PRICE_IS_CLIENT_ACCEPTED_UNTIL_THE_REAL_COUNTERPARTY_ACCEPTS_IT'
  };
}
