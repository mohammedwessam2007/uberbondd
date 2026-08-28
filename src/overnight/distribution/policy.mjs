import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from '../../effect-ledgers.mjs';

export const OVERNIGHT_DISTRIBUTION_POLICY_VERSION = 'overnight-distribution-1.0.0';

export const DISTRIBUTION_EVIDENCE_CLASSES = Object.freeze([
  'VERIFIED_FACT',
  'BUYER_SIGNAL',
  'COMPANY_CLAIM',
  'CREATOR_CLAIM',
  'OWNER_ATTESTED',
  'HYPOTHESIS',
  'INFERENCE',
  'ESTIMATE',
  'SYNTHETIC_TEST_FIXTURE'
]);

export const ZERO_EFFECTS = ZERO_EXTERNAL_EFFECTS;

export const DISABLED_EXTERNAL_AUTHORITY = Object.freeze({
  externalActions: 'DISABLED',
  partnerContact: 'DISABLED',
  publishing: 'DISABLED',
  providerCalls: 'DISABLED',
  spend: 'DISABLED'
});

const CONTACT_KEYS = new Set([
  'email', 'emailAddress', 'contactEmail', 'personalEmail', 'guessedEmail',
  'inferredEmail', 'phone', 'phoneNumber', 'contactPhone', 'personalPhone',
  'guessedPhone', 'inferredPhone', 'contact', 'contacts'
]);

export function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

export function key(value, max = 240) {
  return text(value, max).toLowerCase().replace(/\s+/g, ' ');
}

export function list(value, maxItems = 100, maxItemLength = 180) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => key(item, maxItemLength)).filter(Boolean))].slice(0, maxItems);
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function iso(value, fallback = new Date()) {
  const parsed = value instanceof Date ? value : new Date(value || fallback);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function publicHttpsUrl(value) {
  const raw = text(value, 1000);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

export function hasContactLikeFields(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).some(([field, candidate]) => CONTACT_KEYS.has(field) && candidate != null && candidate !== '');
}

export function unique(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
}

export function externalEffects() {
  return { ...ZERO_EXTERNAL_EFFECTS };
}

export function baseReceipt({ status, reasonCodes = [], date = new Date(), extra = {} } = {}) {
  return {
    ok: !['DENIED', 'BLOCKED', 'REJECTED'].includes(status),
    policyVersion: OVERNIGHT_DISTRIBUTION_POLICY_VERSION,
    status,
    timestamp: iso(date) || new Date(0).toISOString(),
    reasonCodes: unique(reasonCodes),
    authorization: { ...DISABLED_EXTERNAL_AUTHORITY },
    externalEffectLedger: externalEffects(),
    ...extra
  };
}

export function normalizeEvidence(raw = {}, { allowedClasses = DISTRIBUTION_EVIDENCE_CLASSES, now = new Date() } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'evidence-object-required' };
  const evidenceId = text(raw.evidenceId || raw.id, 180);
  const evidenceClass = text(raw.evidenceClass || raw.class, 80).toUpperCase();
  if (!evidenceId) return { ok: false, reason: 'evidence-id-required' };
  if (!allowedClasses.includes(evidenceClass)) return { ok: false, reason: `unsupported-evidence-class:${evidenceClass || 'EMPTY'}` };
  const sourceUrl = publicHttpsUrl(raw.sourceUrl || raw.url);
  if (evidenceClass === 'SYNTHETIC_TEST_FIXTURE') {
    if (sourceUrl) return { ok: false, reason: 'synthetic-evidence-must-not-carry-source-url' };
  } else if (!sourceUrl && evidenceClass !== 'OWNER_ATTESTED') {
    return { ok: false, reason: 'external-evidence-source-url-required' };
  }
  const observedAt = iso(raw.observedAt || raw.createdAt, now);
  if (!observedAt) return { ok: false, reason: 'evidence-time-required' };
  return {
    ok: true,
    evidence: {
      evidenceId,
      evidenceClass,
      sourceUrl,
      observedAt,
      sourceType: text(raw.sourceType, 100) || null,
      claim: text(raw.claim, 1000) || null,
      evidenceRefs: unique((Array.isArray(raw.evidenceRefs) ? raw.evidenceRefs : []).map(item => text(item, 220)))
    }
  };
}

export function suppressionSet(suppressions = []) {
  const values = Array.isArray(suppressions) ? suppressions : [];
  return new Set(values.map(item => key(typeof item === 'string' ? item : item?.value, 320)).filter(Boolean));
}

export function isSuppressed(values = [], suppressions = []) {
  const blocked = suppressionSet(suppressions);
  return list(values, 30, 320).some(value => blocked.has(value));
}
