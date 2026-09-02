// Which payment rail actually exists, and how far along it this repository is.
//
// The tree has exactly one implemented rail: Lemon Squeezy. `src/payments.mjs`
// verifies its HMAC signature, builds its checkout URL and normalizes its
// events; `api/webhooks/billing.mjs` receives them; `src/billing-webhook-
// repository.mjs` holds the durable inbox and the claim lease; and
// `src/payment-reconciliation-worker.mjs` walks between them -- and refuses to
// claim anything at all without an injected provider verifier, deliberately,
// because an unconfigured worker that claims would burn attempts and push real
// payment evidence to UNCERTAIN having contacted nobody.
//
// There is no PayPal code on `main`. Historical memory documents name PayPal as
// a *candidate* rail; a grep of the whole tree finds it only in prose. So this
// doctor reports PAYPAL_RAIL_NOT_IMPLEMENTED rather than pretending a second
// rail is half-built, and nothing here creates a second revenue ledger.
//
// The one thing this file exists to make impossible: LIVE_READY derived from
// environment presence. A configured environment proves that somebody typed
// some variables. It does not prove a provider ever answered, that the answer
// was reconciled, or that the merchant of record is allowed to take the money.
// LIVE_READY therefore requires a durable verification receipt naming a real
// provider event observed inside the last seven days *and* a fresh owner KYC
// attestation carrying evidence references. Neither can be conjured from env.
import crypto from 'node:crypto';

import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { PAYMENT_TRUTH_POLICY_VERSION } from './payments.mjs';
import { containsSecretValue } from './secret-patterns.mjs';

export const PAYMENT_RAIL_DOCTOR_VERSION = 'uberbond.payment-rail-doctor-1.0.0';

/**
 * The six states, ordered from least to most evidenced. Exactly one is
 * reported. They are mutually exclusive by construction: the ladder in
 * `diagnosePaymentRail` returns on the first condition that holds.
 */
export const PAYMENT_RAIL_STATES = Object.freeze([
  'SANDBOX_CONFIG_MISSING',
  'SANDBOX_VERIFICATION_FAILED',
  'READY_FOR_SANDBOX',
  'LIVE_CREDENTIAL_MISSING',
  'LIVE_KYC_REQUIRED',
  'LIVE_READY'
]);

export const PAYMENT_RAIL_MODES = Object.freeze(['SANDBOX', 'LIVE']);

export const IMPLEMENTED_PAYMENT_RAILS = Object.freeze(['lemon_squeezy']);

/**
 * Rails historical documents mention that do not exist as code. Reported as a
 * gap rather than omitted, so "we were going to add PayPal" cannot quietly
 * become "PayPal is a rail".
 */
export const UNIMPLEMENTED_PAYMENT_RAILS = Object.freeze({
  paypal: 'PAYPAL_RAIL_NOT_IMPLEMENTED'
});

/** Credential slots, and the environment variable names each one reads. */
export const PAYMENT_RAIL_ENV_SOURCES = Object.freeze({
  webhookSigningSecret: Object.freeze(['LEMONSQUEEZY_WEBHOOK_SECRET']),
  durableInbox: Object.freeze(['DATABASE_URL']),
  checkoutUrl: Object.freeze(['FULL_AUDIT_CHECKOUT_URL', 'STRATEGY_AUDIT_CHECKOUT_URL', 'MONITORING_CHECKOUT_URL']),
  providerVerificationCredential: Object.freeze(['LEMONSQUEEZY_API_KEY']),
  httpsWebhookDestination: Object.freeze(['APP_BASE_URL'])
});

/** Sandbox needs a signed webhook, somewhere durable to put it, and a link. */
export const SANDBOX_REQUIRED_CREDENTIALS = Object.freeze(['webhookSigningSecret', 'durableInbox', 'checkoutUrl']);

/**
 * Live needs, on top of that, a credential the reconciliation worker can use as
 * its provider verifier, and a public HTTPS destination for the provider to
 * deliver to. `LEMONSQUEEZY_API_KEY` is not read by `src/config.mjs` today --
 * that is a real wiring gap and is reported as one, not silently satisfied.
 */
export const LIVE_ONLY_REQUIRED_CREDENTIALS = Object.freeze(['providerVerificationCredential', 'httpsWebhookDestination']);

const VERIFICATION_RECEIPT_MAX_AGE_DAYS = 7;
const KYC_ATTESTATION_MAX_AGE_DAYS = 90;
const FUTURE_SKEW_MS = 5 * 60 * 1000;
const DAY_MS = 86_400_000;

/**
 * Provider event ids that name nothing real. A receipt is the only path to
 * LIVE_READY, so a placeholder in that field is the cheapest possible forgery
 * and gets its own refusal.
 */
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
  return names.some(name => text(env?.[name], 4000).length > 0);
}

/**
 * Read presence, and only presence.
 *
 * No value from the environment is returned, logged, hashed into an id, or
 * stored anywhere in the result. `httpsWebhookDestination` inspects the scheme
 * of APP_BASE_URL and emits a boolean; the URL itself never leaves this
 * function.
 */
export function readPaymentRailEnvPresence(env = process.env) {
  const baseUrl = text(env?.APP_BASE_URL, 2000);
  return {
    webhookSigningSecret: present(env, PAYMENT_RAIL_ENV_SOURCES.webhookSigningSecret),
    durableInbox: present(env, PAYMENT_RAIL_ENV_SOURCES.durableInbox),
    checkoutUrl: present(env, PAYMENT_RAIL_ENV_SOURCES.checkoutUrl),
    providerVerificationCredential: present(env, PAYMENT_RAIL_ENV_SOURCES.providerVerificationCredential),
    httpsWebhookDestination: baseUrl.toLowerCase().startsWith('https://')
  };
}

function normalizePresence(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const out = {};
  for (const slot of [...SANDBOX_REQUIRED_CREDENTIALS, ...LIVE_ONLY_REQUIRED_CREDENTIALS]) {
    out[slot] = source[slot] === true;
  }
  return out;
}

/**
 * Is this receipt evidence that a real provider answered about a real event?
 *
 * Every clause here is load-bearing. Together they are the wall between
 * "the environment has variables in it" and LIVE_READY.
 */
export function evaluateVerificationReceipt(receipt, at = new Date()) {
  if (receipt == null) return { present: false, acceptable: false, reasonCodes: ['live-verification-receipt-required'] };
  if (typeof receipt !== 'object' || Array.isArray(receipt)) {
    return { present: true, acceptable: false, reasonCodes: ['verification-receipt-object-required'] };
  }

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
  if ([provider, providerEventId, evidenceClass, outcome].some(value => containsSecretValue(value))) {
    reasonCodes.push('verification-receipt-secret-detected');
  }

  return {
    present: true,
    acceptable: reasonCodes.length === 0,
    provider: provider || null,
    // The id itself is provenance, not a credential, but it is still an
    // external identifier: only its digest leaves this module.
    providerEventIdDigest: providerEventId ? digest(providerEventId).slice(0, 32) : null,
    verifiedAt: verifiedAt ? verifiedAt.toISOString() : null,
    ageDays: verifiedAt ? Math.floor((reference.getTime() - verifiedAt.getTime()) / DAY_MS) : null,
    reasonCodes
  };
}

/**
 * Owner KYC is an attestation boundary, never a legal conclusion. No identity
 * document, name, address or account number is read, copied or emitted.
 */
export function evaluateKycAttestation(attestation, at = new Date()) {
  if (attestation == null) return { present: false, acceptable: false, reasonCodes: ['live-owner-kyc-attestation-required'] };
  if (typeof attestation !== 'object' || Array.isArray(attestation)) {
    return { present: true, acceptable: false, reasonCodes: ['kyc-attestation-object-required'] };
  }

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

/**
 * The single state, and everything that produced it.
 *
 * @param {object}  options
 * @param {object} [options.env]                 raw environment; only presence is read
 * @param {object} [options.envPresence]         pre-computed presence booleans (tests inject this)
 * @param {'SANDBOX'|'LIVE'} [options.mode]      the mode being asked about
 * @param {object|null} [options.verificationReceipt]
 * @param {object|null} [options.kycAttestation]
 * @param {Date}   [options.at]
 */
export function diagnosePaymentRail({
  env = process.env,
  envPresence = null,
  mode = 'SANDBOX',
  verificationReceipt = null,
  kycAttestation = null,
  at = new Date()
} = {}) {
  const requestedMode = text(mode, 20).toUpperCase();
  const reference = at instanceof Date && Number.isFinite(at.getTime()) ? at : new Date();
  const presence = envPresence == null ? readPaymentRailEnvPresence(env) : normalizePresence(envPresence);
  const receipt = evaluateVerificationReceipt(verificationReceipt, reference);
  const kyc = evaluateKycAttestation(kycAttestation, reference);

  const missingSandbox = SANDBOX_REQUIRED_CREDENTIALS.filter(slot => presence[slot] !== true);
  const missingLiveOnly = LIVE_ONLY_REQUIRED_CREDENTIALS.filter(slot => presence[slot] !== true);

  const base = {
    ok: true,
    policyVersion: PAYMENT_RAIL_DOCTOR_VERSION,
    paymentTruthPolicyVersion: PAYMENT_TRUTH_POLICY_VERSION,
    requestedMode,
    implementedRails: [...IMPLEMENTED_PAYMENT_RAILS],
    unimplementedRails: { ...UNIMPLEMENTED_PAYMENT_RAILS },
    paypalRail: UNIMPLEMENTED_PAYMENT_RAILS.paypal,
    envPresence: { ...presence },
    missingSandboxCredentials: missingSandbox,
    missingLiveCredentials: missingLiveOnly,
    verificationReceipt: receipt,
    kycAttestation: kyc,
    reconciliationChain: [
      'signed-provider-webhook',
      'src/billing-webhook-boundary.mjs:verifyLemonSqueezyWebhook',
      'src/billing-webhook-repository.mjs:durable-inbox',
      'src/payment-reconciliation-watchdog.mjs:planPaymentReconciliation',
      'src/billing-webhook-repository.mjs:claimBillingEvents',
      'injected providerVerifier',
      'src/payments.mjs:classifyPaymentEvent',
      'RECONCILED'
    ],
    // A doctor reads. It never opens checkout, calls a provider, or moves money.
    commercialTruth: {
      realCustomers: 0,
      clearedRevenueCents: 0,
      acceptedPaidDeliveries: 0,
      retainedCustomers: 0
    },
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS)
  };

  if (!PAYMENT_RAIL_MODES.includes(requestedMode)) {
    return { ...base, ok: false, state: 'SANDBOX_CONFIG_MISSING', reasonCodes: ['valid-payment-rail-mode-required'] };
  }

  // 1. Nothing works without the sandbox trio, whichever mode was asked for.
  if (missingSandbox.length) {
    return { ...base, state: 'SANDBOX_CONFIG_MISSING', reasonCodes: missingSandbox.map(slot => `payment-rail-credential-missing:${slot}`) };
  }

  // 2. A receipt that exists and does not hold up is a failure, not an absence.
  if (receipt.present && !receipt.acceptable) {
    return { ...base, state: 'SANDBOX_VERIFICATION_FAILED', reasonCodes: [...receipt.reasonCodes] };
  }

  // 3. Sandbox is configured. That is the whole claim.
  if (requestedMode === 'SANDBOX') {
    return { ...base, state: 'READY_FOR_SANDBOX', reasonCodes: ['payment-rail-sandbox-configuration-complete'] };
  }

  // 4. Live asks for two more credentials than sandbox does.
  if (missingLiveOnly.length) {
    return { ...base, state: 'LIVE_CREDENTIAL_MISSING', reasonCodes: missingLiveOnly.map(slot => `payment-rail-credential-missing:${slot}`) };
  }

  // 5. Live with no provider ever having answered is still, at best, sandbox.
  //    This is the clause that makes LIVE_READY unreachable from env presence.
  if (!receipt.acceptable) {
    return { ...base, state: 'READY_FOR_SANDBOX', reasonCodes: [...receipt.reasonCodes] };
  }

  // 6. A verified provider answer that nobody is legally cleared to bank.
  if (!kyc.acceptable) {
    return { ...base, state: 'LIVE_KYC_REQUIRED', reasonCodes: [...kyc.reasonCodes] };
  }

  return {
    ...base,
    state: 'LIVE_READY',
    reasonCodes: ['payment-rail-live-evidence-complete'],
    truthBoundary: 'LIVE_READY_MEANS_THE_RAIL_MAY_BE_USED__IT_IS_NOT_A_CUSTOMER_A_PAYMENT_OR_A_DELIVERY'
  };
}

/** True only for the one state that permits a live charge attempt. */
export function isPaymentRailLiveReady(report) {
  return report?.ok === true && report?.state === 'LIVE_READY';
}

/**
 * Operator view: the state, why, and the smallest human actions that move it.
 *
 * Every action is atomic: one screen, one bounded amount of time, one piece of
 * evidence that proves it happened.
 */
export function summarizePaymentRail(report) {
  const state = report?.state || 'SANDBOX_CONFIG_MISSING';
  const actions = [];

  if (report?.missingSandboxCredentials?.includes('checkoutUrl')) {
    actions.push({
      action: 'Create the Lemon Squeezy store and one USD 450 fixed-price product, then copy its checkout URL into FULL_AUDIT_CHECKOUT_URL.',
      screen: 'app.lemonsqueezy.com -> Store -> Products -> New product -> Share',
      minutes: 20,
      costUsd: 0,
      evidenceOfCompletion: 'A checkout URL that opens a payment page for the named product.'
    });
  }
  if (report?.missingSandboxCredentials?.includes('webhookSigningSecret')) {
    actions.push({
      action: 'Create a Lemon Squeezy webhook pointing at /api/webhooks/billing and store its signing secret as LEMONSQUEEZY_WEBHOOK_SECRET.',
      screen: 'app.lemonsqueezy.com -> Settings -> Webhooks -> New webhook',
      minutes: 10,
      costUsd: 0,
      evidenceOfCompletion: 'A test delivery from the provider that this deployment answers 200.'
    });
  }
  if (report?.missingSandboxCredentials?.includes('durableInbox')) {
    actions.push({
      action: 'Provision a PostgreSQL database and set DATABASE_URL so webhook evidence is durable rather than discarded.',
      screen: 'the hosting provider database dashboard',
      minutes: 15,
      costUsd: 0,
      evidenceOfCompletion: 'npm run smoke:postgres exits 0 against that DATABASE_URL.'
    });
  }
  if (report?.missingLiveCredentials?.includes('providerVerificationCredential')) {
    actions.push({
      action: 'Create a Lemon Squeezy API key and store it as LEMONSQUEEZY_API_KEY so the reconciliation worker has a provider verifier.',
      screen: 'app.lemonsqueezy.com -> Settings -> API',
      minutes: 5,
      costUsd: 0,
      evidenceOfCompletion: 'The key exists in the deployment environment; src/config.mjs still needs a one-line wiring change to read it.'
    });
  }
  if (state === 'LIVE_KYC_REQUIRED') {
    actions.push({
      action: 'Complete Lemon Squeezy merchant verification and record the confirmation reference as the KYC attestation evidence ref.',
      screen: 'app.lemonsqueezy.com -> Settings -> Payouts / Verification',
      minutes: 30,
      costUsd: 0,
      evidenceOfCompletion: 'A provider-side verification confirmation reference.'
    });
  }

  return {
    ok: report?.ok === true,
    policyVersion: PAYMENT_RAIL_DOCTOR_VERSION,
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
