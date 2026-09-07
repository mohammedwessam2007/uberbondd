// Provider-neutral payment readiness facade.
//
// The mature Lemon Squeezy + PayPal Sandbox doctor remains byte-preserved in
// payment-rail-doctor-core.mjs. This facade adds the provider-origin PayPal LIVE
// implementation that now exists in src/paypal-payment-truth.mjs without
// weakening the existing evidence gates. Configuration is never payment proof.

export * from './payment-rail-doctor-core.mjs';

import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { PAYMENT_TRUTH_POLICY_VERSION } from './payments.mjs';
import * as core from './payment-rail-doctor-core.mjs';

export const PAYMENT_RAIL_DOCTOR_VERSION = 'uberbond.payment-rail-doctor-1.2.0';
export const IMPLEMENTED_PAYMENT_RAILS = Object.freeze(['lemon_squeezy', 'paypal']);
export const PAYMENT_RAIL_STATES = Object.freeze([
  'SANDBOX_CONFIG_MISSING',
  'SANDBOX_VERIFICATION_FAILED',
  'READY_FOR_SANDBOX',
  'LIVE_CREDENTIAL_MISSING',
  'LIVE_VERIFICATION_REQUIRED',
  'LIVE_KYC_REQUIRED',
  'LIVE_READY'
]);

export const UNIMPLEMENTED_PAYMENT_RAILS = Object.freeze({
  paypal: 'PAYPAL_PROVIDER_ORIGIN_LIVE_IMPLEMENTED__CONFIG_AND_EXTERNAL_EVIDENCE_REQUIRED'
});

export const PAYMENT_RAIL_IMPLEMENTATION_STATUS = Object.freeze({
  lemon_squeezy: Object.freeze({ sandboxImplemented: true, liveCapable: true }),
  paypal: Object.freeze({
    sandboxImplemented: true,
    liveCapable: true,
    liveProviderOriginImplemented: true,
    commercialTruthRequiresLiveProviderOriginEvidence: true
  })
});

export const PAYMENT_RAIL_ENV_SOURCES = Object.freeze({
  ...core.PAYMENT_RAIL_ENV_SOURCES,
  paypal: Object.freeze({
    sandboxClientId: Object.freeze(['PAYPAL_SANDBOX_CLIENT_ID']),
    sandboxClientSecret: Object.freeze(['PAYPAL_SANDBOX_CLIENT_SECRET']),
    sandboxWebhookId: Object.freeze(['PAYPAL_SANDBOX_WEBHOOK_ID']),
    liveEnvironment: Object.freeze(['PAYPAL_ENVIRONMENT']),
    liveClientId: Object.freeze(['PAYPAL_LIVE_CLIENT_ID']),
    liveClientSecret: Object.freeze(['PAYPAL_LIVE_CLIENT_SECRET']),
    liveWebhookId: Object.freeze(['PAYPAL_LIVE_WEBHOOK_ID']),
    durableInbox: Object.freeze(['DATABASE_URL']),
    httpsWebhookDestination: Object.freeze(['APP_BASE_URL'])
  })
});

export const SANDBOX_REQUIRED_CREDENTIALS = Object.freeze({
  ...core.SANDBOX_REQUIRED_CREDENTIALS,
  paypal: Object.freeze(['sandboxClientId', 'sandboxClientSecret', 'sandboxWebhookId', 'durableInbox'])
});

export const LIVE_ONLY_REQUIRED_CREDENTIALS = Object.freeze({
  ...core.LIVE_ONLY_REQUIRED_CREDENTIALS,
  paypal: Object.freeze(['liveEnvironment', 'liveClientId', 'liveClientSecret', 'liveWebhookId', 'durableInbox', 'httpsWebhookDestination'])
});

const present = (env, name) => Boolean(String(env?.[name] ?? '').trim());
const httpsPresent = env => {
  try {
    const url = new URL(String(env?.APP_BASE_URL ?? '').trim());
    return url.protocol === 'https:' && Boolean(url.hostname);
  } catch {
    return false;
  }
};

function paypalLivePresenceFromEnv(env = process.env) {
  return {
    liveEnvironment: String(env?.PAYPAL_ENVIRONMENT ?? '').trim().toLowerCase() === 'live',
    liveClientId: present(env, 'PAYPAL_LIVE_CLIENT_ID'),
    liveClientSecret: present(env, 'PAYPAL_LIVE_CLIENT_SECRET'),
    liveWebhookId: present(env, 'PAYPAL_LIVE_WEBHOOK_ID'),
    durableInbox: present(env, 'DATABASE_URL'),
    httpsWebhookDestination: httpsPresent(env)
  };
}

function paypalLivePresence({ env = process.env, envPresence = null } = {}) {
  if (!envPresence) return paypalLivePresenceFromEnv(env);
  const source = envPresence?.paypal && typeof envPresence.paypal === 'object' ? envPresence.paypal : envPresence;
  return Object.fromEntries(LIVE_ONLY_REQUIRED_CREDENTIALS.paypal.map(slot => [slot, source?.[slot] === true]));
}

function patchCommon(report, provider) {
  return {
    ...report,
    policyVersion: PAYMENT_RAIL_DOCTOR_VERSION,
    implementedRails: [...IMPLEMENTED_PAYMENT_RAILS],
    implementationStatus: PAYMENT_RAIL_IMPLEMENTATION_STATUS[provider] ? { ...PAYMENT_RAIL_IMPLEMENTATION_STATUS[provider] } : null,
    unimplementedRails: { ...UNIMPLEMENTED_PAYMENT_RAILS },
    paypalRail: UNIMPLEMENTED_PAYMENT_RAILS.paypal,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS)
  };
}

export function readPaymentRailEnvPresence(env = process.env) {
  const base = core.readPaymentRailEnvPresence(env);
  const live = paypalLivePresenceFromEnv(env);
  const paypal = {
    ...(base.paypal || {}),
    ...live,
    liveBundleComplete: LIVE_ONLY_REQUIRED_CREDENTIALS.paypal.every(slot => live[slot] === true),
    anyCredentialFragmentPresent: Boolean(base.paypal?.anyCredentialFragmentPresent)
      || live.liveClientId || live.liveClientSecret || live.liveWebhookId
  };
  return { ...base, paypal };
}

export function diagnosePaymentRail(args = {}) {
  const provider = String(args.provider ?? 'lemon_squeezy').trim().toLowerCase();
  const mode = String(args.mode ?? 'SANDBOX').trim().toUpperCase();

  if (provider !== 'paypal' || mode !== 'LIVE') {
    return patchCommon(core.diagnosePaymentRail(args), provider);
  }

  const at = args.at instanceof Date && Number.isFinite(args.at.getTime()) ? args.at : new Date();
  const presence = paypalLivePresence(args);
  const missingLiveCredentials = LIVE_ONLY_REQUIRED_CREDENTIALS.paypal.filter(slot => presence[slot] !== true);
  const verificationReceipt = core.evaluateVerificationReceipt(args.verificationReceipt, at);
  const kycAttestation = core.evaluateKycAttestation(args.kycAttestation, at);
  const reconciliationChain = [
    'POST /api/payments/paypal-order',
    'buyer PayPal approval',
    'GET /api/payments/paypal-capture',
    'POST /api/webhooks/paypal',
    'PayPal verify-webhook-signature',
    'independent PayPal order/capture reads',
    'src/paypal-payment-truth.mjs:canonical-witness-triad',
    'src/payments.mjs:classifyPaymentEvent',
    'src/payment-renewal-truth.mjs',
    'RECONCILED'
  ];
  const base = {
    ok: true,
    policyVersion: PAYMENT_RAIL_DOCTOR_VERSION,
    paymentTruthPolicyVersion: PAYMENT_TRUTH_POLICY_VERSION,
    provider,
    requestedMode: mode,
    implementedRails: [...IMPLEMENTED_PAYMENT_RAILS],
    implementationStatus: { ...PAYMENT_RAIL_IMPLEMENTATION_STATUS.paypal },
    unimplementedRails: { ...UNIMPLEMENTED_PAYMENT_RAILS },
    paypalRail: UNIMPLEMENTED_PAYMENT_RAILS.paypal,
    envPresence: { ...presence },
    missingSandboxCredentials: [],
    missingLiveCredentials,
    verificationReceipt,
    kycAttestation,
    reconciliationChain,
    commercialTruth: { realCustomers: 0, clearedRevenueCents: 0, acceptedPaidDeliveries: 0, retainedCustomers: 0 },
    businessEffectAuthority: 'NONE',
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS)
  };

  if (missingLiveCredentials.length) {
    return {
      ...base,
      state: 'LIVE_CREDENTIAL_MISSING',
      reasonCodes: missingLiveCredentials.map(slot => `payment-rail-credential-missing:${slot}`)
    };
  }
  if (verificationReceipt.present && verificationReceipt.provider && verificationReceipt.provider !== 'paypal') {
    return { ...base, state: 'LIVE_VERIFICATION_REQUIRED', reasonCodes: ['verification-receipt-provider-mismatch'] };
  }
  if (!verificationReceipt.acceptable) {
    return { ...base, state: 'LIVE_VERIFICATION_REQUIRED', reasonCodes: [...verificationReceipt.reasonCodes] };
  }
  if (!kycAttestation.acceptable) {
    return { ...base, state: 'LIVE_KYC_REQUIRED', reasonCodes: [...kycAttestation.reasonCodes] };
  }
  return {
    ...base,
    state: 'LIVE_READY',
    reasonCodes: ['paypal-live-provider-origin-evidence-complete'],
    truthBoundary: 'LIVE_READY_MEANS_THE_RAIL_MAY_BE_USED__IT_IS_NOT_A_CUSTOMER_A_PAYMENT_OR_A_DELIVERY'
  };
}

export function isPaymentRailLiveReady(report) {
  return report?.ok === true && report?.state === 'LIVE_READY';
}

export function summarizePaymentRail(report) {
  const provider = String(report?.provider ?? 'lemon_squeezy').trim().toLowerCase();
  if (provider !== 'paypal') {
    return patchCommon(core.summarizePaymentRail(report), provider);
  }
  const actions = [];
  if ((report?.missingLiveCredentials || []).length) {
    actions.push({
      action: 'Complete the protected PayPal LIVE configuration bundle.',
      screen: 'PayPal Developer Dashboard + protected runtime environment',
      minutes: 15,
      costUsd: 0,
      evidenceOfCompletion: 'PAYPAL_ENVIRONMENT=live, live client/webhook credential presence, DATABASE_URL and HTTPS APP_BASE_URL are observed without exposing values.'
    });
  }
  if (report?.state === 'LIVE_VERIFICATION_REQUIRED') actions.push({
    action: 'Obtain a fresh durable PayPal provider-origin reconciliation receipt.',
    screen: 'UberBond PayPal webhook/reconciliation runtime',
    minutes: 0,
    costUsd: 0,
    evidenceOfCompletion: 'Fresh PROVIDER_ORIGIN + RECONCILED receipt with a non-synthetic provider event id.'
  });
  if (report?.state === 'LIVE_KYC_REQUIRED') actions.push({
    action: 'Complete or attest merchant KYC with a non-secret evidence reference.',
    screen: 'PayPal account verification surface',
    minutes: 15,
    costUsd: 0,
    evidenceOfCompletion: 'Fresh owner attestation with provider-side evidence reference.'
  });
  return {
    ok: report?.ok === true,
    policyVersion: PAYMENT_RAIL_DOCTOR_VERSION,
    provider: 'paypal',
    state: report?.state || 'LIVE_CREDENTIAL_MISSING',
    liveReady: isPaymentRailLiveReady(report),
    reasonCodes: [...(report?.reasonCodes || [])],
    paypalRail: UNIMPLEMENTED_PAYMENT_RAILS.paypal,
    ownerActionQueue: actions.slice(0, 3),
    commercialTruth: { ...(report?.commercialTruth || {}) },
    businessEffectAuthority: 'NONE',
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS)
  };
}
