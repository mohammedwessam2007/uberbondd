// Truthful readiness doctor for every payment rail that actually exists in source.
//
// This module is deliberately read-only. Environment variables are reduced to
// presence booleans immediately; their values never enter reports, digests,
// errors or durable artifacts. Configuration never proves cleared money.
// LIVE_READY still requires a fresh durable PROVIDER_ORIGIN reconciliation
// receipt plus a fresh owner KYC attestation. PayPal is currently implemented
// as a SANDBOX verification rail only, so it can never reach LIVE_READY here.
import crypto from 'node:crypto';

import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { PAYMENT_TRUTH_POLICY_VERSION } from './payments.mjs';
import { containsSecretValue } from './secret-patterns.mjs';

export const PAYMENT_RAIL_DOCTOR_VERSION = 'uberbond.payment-rail-doctor-1.1.0';

export const PAYMENT_RAIL_STATES = Object.freeze([
  'SANDBOX_CONFIG_MISSING',
  'SANDBOX_VERIFICATION_FAILED',
  'READY_FOR_SANDBOX',
  'LIVE_CREDENTIAL_MISSING',
  'LIVE_KYC_REQUIRED',
  'LIVE_READY'
]);

export const PAYMENT_RAIL_MODES = Object.freeze(['SANDBOX', 'LIVE']);
export const IMPLEMENTED_PAYMENT_RAILS = Object.freeze(['lemon_squeezy', 'paypal']);

// Backward-compatible export consumed by the first-cash packet. The value is a
// status string, not a claim that PayPal is absent.
export const UNIMPLEMENTED_PAYMENT_RAILS = Object.freeze({
  paypal: 'PAYPAL_SANDBOX_IMPLEMENTED__LIVE_RAIL_NOT_PROVEN'
});

export const PAYMENT_RAIL_IMPLEMENTATION_STATUS = Object.freeze({
  lemon_squeezy: Object.freeze({ sandboxImplemented: true, liveCapable: true }),
  paypal: Object.freeze({ sandboxImplemented: true, liveCapable: false })
});

export const PAYMENT_RAIL_ENV_SOURCES = Object.freeze({
  lemon_squeezy: Object.freeze({
    webhookSigningSecret: Object.freeze(['LEMONSQUEEZY_WEBHOOK_SECRET']),
    durableInbox: Object.freeze(['DATABASE_URL']),
    checkoutUrl: Object.freeze(['FULL_AUDIT_CHECKOUT_URL', 'STRATEGY_AUDIT_CHECKOUT_URL', 'MONITORING_CHECKOUT_URL']),
    providerVerificationCredential: Object.freeze(['LEMONSQUEEZY_API_KEY']),
    httpsWebhookDestination: Object.freeze(['APP_BASE_URL'])
  }),
  paypal: Object.freeze({
    sandboxClientId: Object.freeze(['PAYPAL_SANDBOX_CLIENT_ID']),
    sandboxClientSecret: Object.freeze(['PAYPAL_SANDBOX_CLIENT_SECRET']),
    sandboxWebhookId: Object.freeze(['PAYPAL_SANDBOX_WEBHOOK_ID']),
    durableInbox: Object.freeze(['DATABASE_URL'])
  })
});

export const SANDBOX_REQUIRED_CREDENTIALS = Object.freeze({
  lemon_squeezy: Object.freeze(['webhookSigningSecret', 'durableInbox', 'checkoutUrl']),
  paypal: Object.freeze(['sandboxClientId', 'sandboxClientSecret', 'sandboxWebhookId', 'durableInbox'])
});

export const LIVE_ONLY_REQUIRED_CREDENTIALS = Object.freeze({
  lemon_squeezy: Object.freeze(['providerVerificationCredential', 'httpsWebhookDestination']),
  paypal: Object.freeze([])
});

const VERIFICATION_RECEIPT_MAX_AGE_DAYS = 7;
const KYC_ATTESTATION_MAX_AGE_DAYS = 90;
const FUTURE_SKEW_MS = 5 * 60 * 1000;
const DAY_MS = 86_400_000;
const PLACEHOLDER_PROVIDER_EVENT_IDS = Object.freeze([
  'test', 'sandbox', 'synthetic', 'fake', 'example', 'placeholder', 'todo', 'none', 'null', 'undefined', '0'
]);
const SYNTHETIC_ID_PREFIXES = Object.freeze(['synthetic:', 'internal:', 'canary:', 'fixture:', 'stub:', 'sample:']);
const clone = value => structuredClone(value);

function text(value, max = 300) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : '';
}
function strings(values, max = 20) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(value => text(value, 500)).filter(Boolean))].slice(0, max);
}
function strictDate(value) {
  const raw = text(value, 80);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date : null;
}
function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function present(env, names) {
  return names.some(name => Boolean(String(env?.[name] ?? '').trim()));
}

function presenceForProvider(env, provider) {
  const sources = PAYMENT_RAIL_ENV_SOURCES[provider];
  if (!sources) return {};
  const out = {};
  for (const [slot, names] of Object.entries(sources)) {
    if (slot === 'httpsWebhookDestination') {
      const candidate = String(env?.APP_BASE_URL ?? '').trim().toLowerCase();
      out[slot] = candidate.startsWith('https://');
    } else out[slot] = present(env, names);
  }
  return out;
}

/** Presence-only inventory for every implemented rail. */
export function readPaymentRailEnvPresence(env = process.env) {
  const providers = {};
  for (const provider of IMPLEMENTED_PAYMENT_RAILS) {
    const slots = presenceForProvider(env, provider);
    const sandboxRequired = SANDBOX_REQUIRED_CREDENTIALS[provider] || [];
    providers[provider] = {
      ...slots,
      sandboxBundleComplete: sandboxRequired.every(slot => slots[slot] === true),
      anyCredentialFragmentPresent: Object.values(slots).some(Boolean)
    };
  }
  return providers;
}

function normalizePresence(input, provider) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const providerSource = source[provider] && typeof source[provider] === 'object' ? source[provider] : source;
  const slots = [...(SANDBOX_REQUIRED_CREDENTIALS[provider] || []), ...(LIVE_ONLY_REQUIRED_CREDENTIALS[provider] || [])];
  const out = {};
  for (const slot of new Set(slots)) out[slot] = providerSource[slot] === true;
  out.sandboxBundleComplete = (SANDBOX_REQUIRED_CREDENTIALS[provider] || []).every(slot => out[slot] === true);
  out.anyCredentialFragmentPresent = Object.values(out).some(Boolean);
  return out;
}

export function evaluateVerificationReceipt(receipt, at = new Date()) {
  if (receipt == null) return { present: false, acceptable: false, reasonCodes: ['live-verification-receipt-required'] };
  if (typeof receipt !== 'object' || Array.isArray(receipt)) return { present: true, acceptable: false, reasonCodes: ['verification-receipt-object-required'] };
  const reasonCodes = [];
  const provider = text(receipt.provider, 80).toLowerCase();
  const providerEventId = text(receipt.providerEventId, 200);
  const evidenceClass = text(receipt.evidenceClass, 80).toUpperCase();
  const outcome = text(receipt.outcome, 80).toUpperCase();
  const verifiedAt = strictDate(receipt.verifiedAt);
  const reference = at instanceof Date && Number.isFinite(at.getTime()) ? at : new Date();
  if (!IMPLEMENTED_PAYMENT_RAILS.includes(provider)) reasonCodes.push('verification-receipt-provider-not-implemented');
  if (!providerEventId) reasonCodes.push('verification-receipt-provider-event-id-required');
  else if (PLACEHOLDER_PROVIDER_EVENT_IDS.includes(providerEventId.toLowerCase())) reasonCodes.push('verification-receipt-provider-event-id-is-placeholder');
  else if (SYNTHETIC_ID_PREFIXES.some(prefix => providerEventId.toLowerCase().startsWith(prefix))) reasonCodes.push('verification-receipt-provider-event-id-is-synthetic');
  if (evidenceClass !== 'PROVIDER_ORIGIN') reasonCodes.push('verification-receipt-provider-origin-evidence-required');
  if (outcome !== 'RECONCILED') reasonCodes.push('verification-receipt-reconciled-outcome-required');
  if (receipt.durable !== true) reasonCodes.push('verification-receipt-must-be-durably-persisted');
  if (!verifiedAt) reasonCodes.push('verification-receipt-verified-at-required');
  else {
    const ageMs = reference.getTime() - verifiedAt.getTime();
    if (ageMs < -FUTURE_SKEW_MS) reasonCodes.push('verification-receipt-verified-in-future');
    else if (ageMs > VERIFICATION_RECEIPT_MAX_AGE_DAYS * DAY_MS) reasonCodes.push('verification-receipt-stale');
  }
  if ([provider, providerEventId, evidenceClass, outcome].some(value => containsSecretValue(value))) reasonCodes.push('verification-receipt-secret-detected');
  return {
    present: true,
    acceptable: reasonCodes.length === 0,
    provider: provider || null,
    providerEventIdDigest: providerEventId ? digest(providerEventId).slice(0, 32) : null,
    verifiedAt: verifiedAt ? verifiedAt.toISOString() : null,
    ageDays: verifiedAt ? Math.floor((reference.getTime() - verifiedAt.getTime()) / DAY_MS) : null,
    reasonCodes
  };
}

export function evaluateKycAttestation(attestation, at = new Date()) {
  if (attestation == null) return { present: false, acceptable: false, reasonCodes: ['live-owner-kyc-attestation-required'] };
  if (typeof attestation !== 'object' || Array.isArray(attestation)) return { present: true, acceptable: false, reasonCodes: ['kyc-attestation-object-required'] };
  const reasonCodes = [];
  const evidenceRefs = strings(attestation.evidenceRefs, 20);
  const attestedAt = strictDate(attestation.attestedAt);
  const reference = at instanceof Date && Number.isFinite(at.getTime()) ? at : new Date();
  if (attestation.ownerAttested !== true) reasonCodes.push('kyc-owner-attestation-required');
  if (!evidenceRefs.length) reasonCodes.push('kyc-evidence-reference-required');
  if (!attestedAt) reasonCodes.push('kyc-attested-at-required');
  else {
    const ageMs = reference.getTime() - attestedAt.getTime();
    if (ageMs < -FUTURE_SKEW_MS) reasonCodes.push('kyc-attested-in-future');
    else if (ageMs > KYC_ATTESTATION_MAX_AGE_DAYS * DAY_MS) reasonCodes.push('kyc-attestation-stale');
  }
  if (evidenceRefs.some(ref => containsSecretValue(ref))) reasonCodes.push('kyc-attestation-secret-detected');
  return {
    present: true,
    acceptable: reasonCodes.length === 0,
    evidenceRefCount: evidenceRefs.length,
    attestedAt: attestedAt ? attestedAt.toISOString() : null,
    truthClassification: reasonCodes.length === 0 ? 'OWNER_ATTESTED_NOT_INDEPENDENTLY_VERIFIED' : 'UNRESOLVED',
    reasonCodes
  };
}

export function diagnosePaymentRail({
  env = process.env,
  envPresence = null,
  provider = 'lemon_squeezy',
  mode = 'SANDBOX',
  verificationReceipt = null,
  kycAttestation = null,
  at = new Date()
} = {}) {
  const selectedProvider = text(provider, 80).toLowerCase();
  const requestedMode = text(mode, 20).toUpperCase();
  const reference = at instanceof Date && Number.isFinite(at.getTime()) ? at : new Date();
  const providerKnown = IMPLEMENTED_PAYMENT_RAILS.includes(selectedProvider);
  const allPresence = envPresence == null ? readPaymentRailEnvPresence(env) : null;
  const presence = providerKnown
    ? (envPresence == null ? allPresence[selectedProvider] : normalizePresence(envPresence, selectedProvider))
    : {};
  const receipt = evaluateVerificationReceipt(verificationReceipt, reference);
  const kyc = evaluateKycAttestation(kycAttestation, reference);
  const missingSandbox = providerKnown ? (SANDBOX_REQUIRED_CREDENTIALS[selectedProvider] || []).filter(slot => presence[slot] !== true) : [];
  const missingLiveOnly = providerKnown ? (LIVE_ONLY_REQUIRED_CREDENTIALS[selectedProvider] || []).filter(slot => presence[slot] !== true) : [];
  const base = {
    ok: true,
    policyVersion: PAYMENT_RAIL_DOCTOR_VERSION,
    paymentTruthPolicyVersion: PAYMENT_TRUTH_POLICY_VERSION,
    provider: selectedProvider || null,
    requestedMode,
    implementedRails: [...IMPLEMENTED_PAYMENT_RAILS],
    implementationStatus: providerKnown ? { ...PAYMENT_RAIL_IMPLEMENTATION_STATUS[selectedProvider] } : null,
    unimplementedRails: { ...UNIMPLEMENTED_PAYMENT_RAILS },
    paypalRail: UNIMPLEMENTED_PAYMENT_RAILS.paypal,
    envPresence: { ...presence },
    missingSandboxCredentials: missingSandbox,
    missingLiveCredentials: missingLiveOnly,
    verificationReceipt: receipt,
    kycAttestation: kyc,
    reconciliationChain: selectedProvider === 'paypal'
      ? ['paypal-sandbox-api-or-webhook', 'src/paypal-sandbox-adapter.mjs', 'src/payment-provider-verifier-dispatch.mjs', 'src/payment-reconciliation-worker.mjs', 'src/payments.mjs:classifyPaymentEvent', 'RECONCILED']
      : ['signed-provider-webhook', 'src/billing-webhook-boundary.mjs:verifyLemonSqueezyWebhook', 'src/billing-webhook-repository.mjs:durable-inbox', 'src/payment-reconciliation-watchdog.mjs:planPaymentReconciliation', 'src/billing-webhook-repository.mjs:claimBillingEvents', 'injected providerVerifier', 'src/payments.mjs:classifyPaymentEvent', 'RECONCILED'],
    commercialTruth: { realCustomers: 0, clearedRevenueCents: 0, acceptedPaidDeliveries: 0, retainedCustomers: 0 },
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS)
  };
  if (!providerKnown) return { ...base, ok: false, state: 'SANDBOX_CONFIG_MISSING', reasonCodes: ['implemented-payment-provider-required'] };
  if (!PAYMENT_RAIL_MODES.includes(requestedMode)) return { ...base, ok: false, state: 'SANDBOX_CONFIG_MISSING', reasonCodes: ['valid-payment-rail-mode-required'] };
  if (missingSandbox.length) return { ...base, state: 'SANDBOX_CONFIG_MISSING', reasonCodes: missingSandbox.map(slot => `payment-rail-credential-missing:${slot}`) };
  if (receipt.present && receipt.provider && receipt.provider !== selectedProvider) {
    return { ...base, state: 'SANDBOX_VERIFICATION_FAILED', reasonCodes: ['verification-receipt-provider-mismatch'] };
  }
  if (receipt.present && !receipt.acceptable) return { ...base, state: 'SANDBOX_VERIFICATION_FAILED', reasonCodes: [...receipt.reasonCodes] };
  if (requestedMode === 'SANDBOX') return { ...base, state: 'READY_FOR_SANDBOX', reasonCodes: ['payment-rail-sandbox-configuration-complete'] };
  if (PAYMENT_RAIL_IMPLEMENTATION_STATUS[selectedProvider]?.liveCapable !== true) {
    return { ...base, state: 'LIVE_CREDENTIAL_MISSING', reasonCodes: [`${selectedProvider}-live-rail-not-implemented`] };
  }
  if (missingLiveOnly.length) return { ...base, state: 'LIVE_CREDENTIAL_MISSING', reasonCodes: missingLiveOnly.map(slot => `payment-rail-credential-missing:${slot}`) };
  if (!receipt.acceptable) return { ...base, state: 'READY_FOR_SANDBOX', reasonCodes: [...receipt.reasonCodes] };
  if (!kyc.acceptable) return { ...base, state: 'LIVE_KYC_REQUIRED', reasonCodes: [...kyc.reasonCodes] };
  return {
    ...base,
    state: 'LIVE_READY',
    reasonCodes: ['payment-rail-live-evidence-complete'],
    truthBoundary: 'LIVE_READY_MEANS_THE_RAIL_MAY_BE_USED__IT_IS_NOT_A_CUSTOMER_A_PAYMENT_OR_A_DELIVERY'
  };
}

export function isPaymentRailLiveReady(report) {
  return report?.ok === true && report?.state === 'LIVE_READY';
}

export function summarizePaymentRail(report) {
  const state = report?.state || 'SANDBOX_CONFIG_MISSING';
  const provider = report?.provider || 'lemon_squeezy';
  const actions = [];
  if (provider === 'paypal') {
    if ((report?.missingSandboxCredentials || []).some(slot => ['sandboxClientId', 'sandboxClientSecret', 'sandboxWebhookId'].includes(slot))) {
      actions.push({
        action: 'Complete the PayPal Sandbox REST application credential bundle in the protected environment.',
        screen: 'PayPal Developer Dashboard -> Apps & Credentials -> Sandbox',
        minutes: 10,
        costUsd: 0,
        evidenceOfCompletion: 'All three PayPal sandbox credential variables are present; their values are never emitted by this doctor.'
      });
    }
    if (report?.missingSandboxCredentials?.includes('durableInbox')) actions.push({
      action: 'Provision durable PostgreSQL state and set DATABASE_URL.',
      screen: 'the hosting provider database dashboard',
      minutes: 15,
      costUsd: 0,
      evidenceOfCompletion: 'npm run smoke:postgres exits 0 against that DATABASE_URL.'
    });
    if (report?.requestedMode === 'LIVE') actions.push({
      action: 'Do not treat PayPal Sandbox as a live payment rail; live account/KYC/provider evidence is still external.',
      screen: 'PayPal account / provider onboarding surface',
      minutes: 0,
      costUsd: 0,
      evidenceOfCompletion: 'A separately verified live-capable rail and provider-origin reconciliation receipt.'
    });
  } else {
    if (report?.missingSandboxCredentials?.includes('checkoutUrl')) actions.push({ action: 'Configure one Lemon Squeezy checkout URL.', screen: 'Lemon Squeezy -> Store -> Products', minutes: 20, costUsd: 0, evidenceOfCompletion: 'A valid HTTPS checkout URL.' });
    if (report?.missingSandboxCredentials?.includes('webhookSigningSecret')) actions.push({ action: 'Configure the Lemon Squeezy webhook signing secret.', screen: 'Lemon Squeezy -> Settings -> Webhooks', minutes: 10, costUsd: 0, evidenceOfCompletion: 'A provider test delivery is accepted.' });
    if (report?.missingSandboxCredentials?.includes('durableInbox')) actions.push({ action: 'Provision durable PostgreSQL state and set DATABASE_URL.', screen: 'the hosting provider database dashboard', minutes: 15, costUsd: 0, evidenceOfCompletion: 'npm run smoke:postgres exits 0.' });
    if (report?.missingLiveCredentials?.includes('providerVerificationCredential')) actions.push({ action: 'Configure the Lemon Squeezy provider verification API credential.', screen: 'Lemon Squeezy -> Settings -> API', minutes: 5, costUsd: 0, evidenceOfCompletion: 'Credential presence is observed without exposing its value.' });
    if (state === 'LIVE_KYC_REQUIRED') actions.push({ action: 'Complete merchant verification and retain only a non-secret evidence reference.', screen: 'Lemon Squeezy -> Settings -> Payouts / Verification', minutes: 30, costUsd: 0, evidenceOfCompletion: 'Provider-side verification reference.' });
  }
  return {
    ok: report?.ok === true,
    policyVersion: PAYMENT_RAIL_DOCTOR_VERSION,
    provider,
    state,
    liveReady: isPaymentRailLiveReady(report),
    reasonCodes: [...(report?.reasonCodes || [])],
    paypalRail: UNIMPLEMENTED_PAYMENT_RAILS.paypal,
    ownerActionQueue: actions.slice(0, 3),
    commercialTruth: { ...(report?.commercialTruth || {}) },
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS)
  };
}
