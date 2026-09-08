import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const SOVEREIGN_ROOT_RECOVERY_VERSION = 'uberbond.sovereign-root-recovery.v1';

const FACTOR_TYPES = Object.freeze([
  'HARDWARE_KEY',
  'OFFLINE_RECOVERY_CODE',
  'OWNER_HELD_SIGNING_KEY',
  'INDEPENDENT_ACCOUNT_ATTESTATION',
  'TRUSTED_HUMAN_ATTESTATION'
]);

const text = (value, max = 500) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};
const uniq = values => [...new Set((Array.isArray(values) ? values : []).map(v => text(v, 500)).filter(Boolean))];
const stable = value => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
    : value;
const digest = value => `sha256:${crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')}`;
const zero = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const fail = (status, reasonCodes, extra = {}) => ({
  ok: false,
  status,
  reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE',
  externalEffectLedger: zero(),
  ...extra
});

function normalizeFactor(raw = {}) {
  return {
    factorId: text(raw.factorId, 200),
    factorType: FACTOR_TYPES.includes(raw.factorType) ? raw.factorType : null,
    custodyDomain: text(raw.custodyDomain, 240),
    providerDomain: text(raw.providerDomain, 240) || 'OFFLINE',
    evidenceRef: text(raw.evidenceRef, 500),
    secretMaterialIncluded: raw.secretMaterialIncluded === true,
    revoked: raw.revoked === true,
    ownerControlled: raw.ownerControlled === true,
    thirdPartyConsentRef: text(raw.thirdPartyConsentRef, 500)
  };
}

export function compileSovereignRecoveryCharter(input = {}) {
  const reasons = [];
  const sovereignId = text(input.sovereignId, 240);
  const authorityEpoch = text(input.authorityEpoch, 160);
  const charterRef = text(input.charterRef, 500);
  const minFactors = Number(input.minFactors);
  const factors = (Array.isArray(input.factors) ? input.factors : []).map(normalizeFactor);

  if (!sovereignId) reasons.push('sovereign-id-required');
  if (!authorityEpoch) reasons.push('authority-epoch-required');
  if (!charterRef) reasons.push('durable-charter-reference-required');
  if (!Number.isSafeInteger(minFactors) || minFactors < 2) reasons.push('recovery-threshold-must-be-at-least-two');
  if (factors.length < 2) reasons.push('at-least-two-recovery-factors-required');
  const ids = factors.map(row => row.factorId).filter(Boolean);
  if (ids.length !== factors.length || new Set(ids).size !== ids.length) reasons.push('unique-factor-ids-required');

  for (const factor of factors) {
    if (!factor.factorType) reasons.push(`recognized-factor-type-required:${factor.factorId || 'unknown'}`);
    if (!factor.custodyDomain) reasons.push(`factor-custody-domain-required:${factor.factorId || 'unknown'}`);
    if (!factor.evidenceRef) reasons.push(`factor-evidence-reference-required:${factor.factorId || 'unknown'}`);
    if (factor.secretMaterialIncluded) reasons.push(`secret-material-must-not-enter-recovery-charter:${factor.factorId || 'unknown'}`);
    if (factor.revoked) reasons.push(`revoked-factor-cannot-enter-active-charter:${factor.factorId || 'unknown'}`);
    if (!factor.ownerControlled && factor.factorType !== 'TRUSTED_HUMAN_ATTESTATION') reasons.push(`recovery-factor-must-be-owner-controlled:${factor.factorId || 'unknown'}`);
    if (factor.factorType === 'TRUSTED_HUMAN_ATTESTATION' && !factor.thirdPartyConsentRef) reasons.push(`trusted-human-factor-requires-consent-reference:${factor.factorId || 'unknown'}`);
  }

  const custodyDomains = new Set(factors.map(row => row.custodyDomain).filter(Boolean));
  const providerDomains = new Set(factors.map(row => row.providerDomain).filter(Boolean));
  if (Number.isSafeInteger(minFactors) && custodyDomains.size < minFactors) reasons.push('threshold-factors-must-span-independent-custody-domains');
  if (Number.isSafeInteger(minFactors) && providerDomains.size < Math.min(minFactors, 2)) reasons.push('recovery-cannot-depend-on-one-provider-domain');
  if (Number.isSafeInteger(minFactors) && minFactors > factors.length) reasons.push('recovery-threshold-exceeds-factor-count');

  const charter = {
    version: SOVEREIGN_ROOT_RECOVERY_VERSION,
    sovereignId,
    authorityEpoch,
    charterRef,
    purpose: 'RESTORE_ACCESS_TO_THE_SAME_PRESENT_SOVEREIGN_IDENTITY',
    minFactors: Number.isSafeInteger(minFactors) ? minFactors : null,
    factors: factors.map(({ secretMaterialIncluded, ...row }) => row),
    successionPolicy: 'NONE__THIS_MODULE_CANNOT_CREATE_A_SUCCESSOR',
    privateStatePolicy: 'RECOVERED_IDENTITY_DOES_NOT_DECRYPT_PRIVATE_STATE__C23_KEY_RECOVERY_REMAINS_SEPARATE',
    authorityPolicy: 'RECOVERY_ADMISSION_DOES_NOT_ITSELF_ROTATE_CREDENTIALS_OR_CREATE_EXTERNAL_AUTHORITY'
  };

  if (reasons.length) return fail('SOVEREIGN_RECOVERY_CHARTER_REFUSED', reasons);
  return {
    ok: true,
    status: 'SOVEREIGN_RECOVERY_CHARTER_READY',
    charter,
    charterDigest: digest(charter),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zero()
  };
}

function normalizeObservation(raw = {}) {
  return {
    factorId: text(raw.factorId, 200),
    evidenceRef: text(raw.evidenceRef, 500),
    verifierId: text(raw.verifierId, 200),
    observedAt: text(raw.observedAt, 80),
    charterDigest: text(raw.charterDigest, 100)?.toLowerCase() || null,
    passed: raw.passed === true,
    secretMaterialPersisted: raw.secretMaterialPersisted === true
  };
}

export function admitSovereignRecovery({
  charterResult = null,
  recoveringSovereignId = null,
  authorityEpoch = null,
  observations = [],
  now = new Date(),
  maxObservationAgeMinutes = 60
} = {}) {
  if (!charterResult?.ok || charterResult.status !== 'SOVEREIGN_RECOVERY_CHARTER_READY') {
    return fail('SOVEREIGN_RECOVERY_REFUSED', ['valid-recovery-charter-required']);
  }
  const charter = charterResult.charter;
  const reasons = [];
  if (text(recoveringSovereignId, 240) !== charter.sovereignId) reasons.push('recovery-may-only-restore-the-same-sovereign-identity');
  if (text(authorityEpoch, 160) !== charter.authorityEpoch) reasons.push('recovery-authority-epoch-mismatch');

  const nowMs = new Date(now).getTime();
  if (!Number.isFinite(nowMs)) reasons.push('valid-recovery-reference-time-required');
  const limit = Math.max(1, Number(maxObservationAgeMinutes) || 60);
  const factorById = new Map(charter.factors.map(row => [row.factorId, row]));
  const seenFactors = new Set();
  const seenVerifiers = new Set();
  const observedCustody = new Set();
  const valid = [];

  for (const raw of Array.isArray(observations) ? observations : []) {
    const row = normalizeObservation(raw);
    const factor = factorById.get(row.factorId);
    if (!factor) { reasons.push(`unknown-recovery-factor:${row.factorId || 'unknown'}`); continue; }
    if (seenFactors.has(row.factorId)) { reasons.push(`duplicate-recovery-factor-observation:${row.factorId}`); continue; }
    seenFactors.add(row.factorId);
    if (!row.passed) { reasons.push(`recovery-factor-did-not-pass:${row.factorId}`); continue; }
    if (!row.evidenceRef || !row.verifierId) { reasons.push(`recovery-factor-evidence-and-verifier-required:${row.factorId}`); continue; }
    if (row.charterDigest !== charterResult.charterDigest) { reasons.push(`recovery-factor-charter-binding-mismatch:${row.factorId}`); continue; }
    if (row.secretMaterialPersisted) { reasons.push(`recovery-verification-must-not-persist-secret-material:${row.factorId}`); continue; }
    const observedMs = new Date(row.observedAt || '').getTime();
    const ageMinutes = Number.isFinite(observedMs) && Number.isFinite(nowMs) ? (nowMs - observedMs) / 60000 : Number.POSITIVE_INFINITY;
    if (ageMinutes < 0 || ageMinutes > limit) { reasons.push(`recovery-factor-observation-stale:${row.factorId}`); continue; }
    if (seenVerifiers.has(row.verifierId)) { reasons.push('threshold-recovery-requires-independent-verifiers'); continue; }
    seenVerifiers.add(row.verifierId);
    observedCustody.add(factor.custodyDomain);
    valid.push(row);
  }

  if (valid.length < charter.minFactors) reasons.push('recovery-threshold-not-met');
  if (observedCustody.size < charter.minFactors) reasons.push('recovery-threshold-must-span-independent-custody-domains');
  if (reasons.length) return fail('SOVEREIGN_RECOVERY_REFUSED', reasons, { validFactorCount: valid.length });

  const receipt = {
    version: SOVEREIGN_ROOT_RECOVERY_VERSION,
    sovereignId: charter.sovereignId,
    authorityEpoch: charter.authorityEpoch,
    charterDigest: charterResult.charterDigest,
    factorIds: valid.map(row => row.factorId).sort(),
    verifierIds: valid.map(row => row.verifierId).sort(),
    admittedAt: new Date(nowMs).toISOString(),
    nextGate: 'SEPARATE_CREDENTIAL_ROTATION_AND_ACCOUNT_RECOVERY_AUTHORITY',
    privateStateAccess: 'NONE',
    successorAuthority: 'NONE'
  };

  return {
    ok: true,
    status: 'SOVEREIGN_RECOVERY_ADMISSIBLE_FOR_SEPARATE_CREDENTIAL_ROTATION',
    receipt,
    receiptDigest: digest(receipt),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zero(),
    truthBoundary: 'Threshold identity recovery restores eligibility to recover the SAME sovereign identity. It does not rotate credentials, log into providers, decrypt private state, appoint a successor, alter posthumous disposition, spend, deploy or create any other external effect.'
  };
}
