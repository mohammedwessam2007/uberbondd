import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const PAYMENT_RAIL_DOCTOR_VERSION = 'uberbond.payment-rail-doctor-1.0.0';
export const PAYMENT_RAIL_STATES = Object.freeze([
  'READY_FOR_SANDBOX',
  'SANDBOX_CONFIG_MISSING',
  'SANDBOX_VERIFICATION_FAILED',
  'LIVE_KYC_REQUIRED',
  'LIVE_CREDENTIAL_MISSING',
  'LIVE_READY'
]);

function iso(value) {
  const date = new Date(value || '');
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function fresh(value, now, maxAgeMs) {
  const when = iso(value);
  if (!when) return false;
  const age = new Date(now).getTime() - new Date(when).getTime();
  return age >= 0 && age <= maxAgeMs;
}
function envPresent(env, key) { return Boolean(String(env?.[key] || '').trim()); }

export function evaluatePaymentRailReadiness({
  env = {},
  verificationReceipt = null,
  ownerKycAttestation = null,
  now = new Date().toISOString(),
  mode = 'LIVE'
} = {}) {
  const normalizedMode = String(mode || '').toUpperCase();
  const secretPresent = envPresent(env, 'LEMONSQUEEZY_WEBHOOK_SECRET') || envPresent(env, 'BILLING_WEBHOOK_SECRET');
  const databasePresent = envPresent(env, 'DATABASE_URL');
  const checkoutPresent = envPresent(env, 'LEMONSQUEEZY_CHECKOUT_URL') || envPresent(env, 'LEMONSQUEEZY_STORE_URL');
  const base = {
    ok: true,
    policyVersion: PAYMENT_RAIL_DOCTOR_VERSION,
    provider: 'LEMON_SQUEEZY',
    paypalRail: 'PAYPAL_RAIL_NOT_IMPLEMENTED',
    configuration: {
      webhookSecretPresent: secretPresent,
      databaseUrlPresent: databasePresent,
      checkoutUrlPresent: checkoutPresent
    },
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };

  if (normalizedMode === 'SANDBOX') {
    if (!secretPresent || !databasePresent) return { ...base, state: 'SANDBOX_CONFIG_MISSING', reasonCodes: ['sandbox-config-missing'] };
    if (verificationReceipt?.verified === false) return { ...base, state: 'SANDBOX_VERIFICATION_FAILED', reasonCodes: ['sandbox-verification-failed'] };
    return { ...base, state: 'READY_FOR_SANDBOX', reasonCodes: [] };
  }

  if (!secretPresent || !databasePresent || !checkoutPresent) {
    return { ...base, state: 'LIVE_CREDENTIAL_MISSING', reasonCodes: ['live-payment-runtime-configuration-missing'] };
  }

  const verifiedReceipt = verificationReceipt
    && verificationReceipt.provider === 'LEMON_SQUEEZY'
    && String(verificationReceipt.providerEventId || '').trim()
    && verificationReceipt.verified === true
    && Array.isArray(verificationReceipt.evidenceRefs)
    && verificationReceipt.evidenceRefs.length > 0
    && fresh(verificationReceipt.observedAt, now, 7 * 86400000);

  const kycFresh = ownerKycAttestation
    && ownerKycAttestation.status === 'VERIFIED'
    && Array.isArray(ownerKycAttestation.evidenceRefs)
    && ownerKycAttestation.evidenceRefs.length > 0
    && fresh(ownerKycAttestation.observedAt, now, 30 * 86400000);

  if (!kycFresh) return { ...base, state: 'LIVE_KYC_REQUIRED', reasonCodes: ['fresh-owner-kyc-attestation-required'] };
  if (!verifiedReceipt) return { ...base, state: 'SANDBOX_VERIFICATION_FAILED', reasonCodes: ['fresh-provider-verification-receipt-required'] };
  return {
    ...base,
    state: 'LIVE_READY',
    reasonCodes: [],
    verification: {
      providerEventId: verificationReceipt.providerEventId,
      observedAt: iso(verificationReceipt.observedAt),
      kycObservedAt: iso(ownerKycAttestation.observedAt)
    }
  };
}
