import {
  baseReceipt,
  digest,
  hasContactLikeFields,
  iso,
  key,
  list,
  normalizeEvidence,
  publicHttpsUrl,
  text
} from './policy.mjs';

export const PARTNER_FIT_POLICY_VERSION = 'overnight-distribution.partner-fit-1.0.0';

export const PARTNER_TYPES = Object.freeze([
  'AGENCY', 'MSP', 'CONSULTANCY', 'RESELLER', 'PLATFORM', 'COMMUNITY', 'CREATOR', 'REFERRAL_PARTNER'
]);

export const PARTNER_FIT_FIELDS = Object.freeze([
  'capabilities', 'verticals', 'geographies', 'channels', 'economicModels'
]);

const EVIDENCE_WEIGHT = Object.freeze({ VERIFIED_FACT: 1, BUYER_SIGNAL: 0.85 });
const DIMENSION_WEIGHT = Object.freeze({
  capabilities: 0.35,
  verticals: 0.25,
  geographies: 0.15,
  channels: 0.15,
  economicModels: 0.10
});

function reject(reason, extra = {}) {
  return baseReceipt({ status: 'REJECTED', reasonCodes: [reason], extra: { partner: null, ...extra } });
}

function normalizeValues(raw) {
  if (Array.isArray(raw)) return list(raw, 40, 120);
  const value = key(raw, 120);
  return value ? [value] : [];
}

function emptyAttributes() {
  return Object.fromEntries(PARTNER_FIT_FIELDS.map(field => [field, {}]));
}

/**
 * Normalize a partner candidate from explicit, public/licensed evidence.
 * Contact details are intentionally not part of this record: partner fit is
 * a preparation primitive, not a contact-discovery or outreach primitive.
 */
export function normalizePartnerCandidate(input = {}, { now = new Date() } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return reject('partner-object-required');
  if (hasContactLikeFields(input)) return reject('contact-data-not-accepted-in-partner-fit');

  const partnerId = text(input.partnerId || input.id, 180);
  const name = text(input.name || input.companyName, 220);
  const type = text(input.type || input.partnerType, 80).toUpperCase();
  if (!partnerId) return reject('partner-id-required');
  if (!name) return reject('partner-name-required');
  if (!PARTNER_TYPES.includes(type)) return reject(`unsupported-partner-type:${type || 'EMPTY'}`);

  const website = input.website == null ? null : publicHttpsUrl(input.website);
  if (input.website && !website) return reject('partner-website-must-be-public-https');

  const evidence = [];
  const rejectedEvidence = [];
  const attributes = emptyAttributes();
  const suppliedEvidence = Array.isArray(input.evidence) ? input.evidence.slice(0, 100) : [];

  for (const raw of suppliedEvidence) {
    const field = key(raw?.field, 80);
    const values = normalizeValues(raw?.values ?? raw?.value);
    if (!PARTNER_FIT_FIELDS.includes(field)) {
      rejectedEvidence.push({ evidenceId: text(raw?.evidenceId || raw?.id, 180) || null, reason: `unsupported-fit-field:${field || 'EMPTY'}` });
      continue;
    }
    if (!values.length) {
      rejectedEvidence.push({ evidenceId: text(raw?.evidenceId || raw?.id, 180) || null, reason: 'evidence-values-required' });
      continue;
    }
    const normalized = normalizeEvidence(raw, { now });
    if (!normalized.ok) {
      rejectedEvidence.push({ evidenceId: text(raw?.evidenceId || raw?.id, 180) || null, reason: normalized.reason });
      continue;
    }
    const item = { ...normalized.evidence, field, values };
    evidence.push(item);
    const weight = EVIDENCE_WEIGHT[item.evidenceClass] || 0;
    if (weight > 0) {
      for (const value of values) attributes[field][value] = Math.max(attributes[field][value] || 0, weight);
    }
  }

  const digestInput = {
    partnerId,
    name,
    type,
    website,
    evidence: evidence.map(item => ({ evidenceId: item.evidenceId, field: item.field, values: item.values, evidenceClass: item.evidenceClass })).sort((a, b) => a.evidenceId.localeCompare(b.evidenceId))
  };
  const observedAt = iso(input.observedAt, now);
  if (!observedAt) return reject('partner-observed-time-required');
  const normalizedPartner = {
    version: PARTNER_FIT_POLICY_VERSION,
    partnerId,
    name,
    type,
    website,
    observedAt,
    evidence,
    rejectedEvidence,
    attributes,
    evidenceBacked: Object.values(attributes).some(field => Object.keys(field).length > 0),
    identityStatus: 'CANDIDATE_ONLY',
    contactAuthority: 'NONE',
    externalAction: 'DISABLED',
    partnerDigest: digest(digestInput)
  };

  return baseReceipt({
    status: normalizedPartner.evidenceBacked ? 'PREPARE_ONLY' : 'UNPROVEN',
    reasonCodes: normalizedPartner.evidenceBacked ? [] : ['partner-fit-evidence-required'],
    extra: { partner: normalizedPartner }
  });
}

function normalizedPartnerOrReject(partner, now) {
  if (partner?.version === PARTNER_FIT_POLICY_VERSION && partner.partnerId) {
    return { ok: true, partner };
  }
  const normalized = normalizePartnerCandidate(partner, { now });
  return normalized.ok ? { ok: true, partner: normalized.partner } : normalized;
}

function targetValues(targetProfile, field) {
  return normalizeValues(targetProfile?.[field]);
}

/**
 * Rank a partner against an owner-supplied target profile. Only VERIFIED_FACT
 * and BUYER_SIGNAL evidence contributes to the score. Claims and hypotheses
 * remain visible as exclusions, never as hidden confidence.
 */
export function scorePartnerFit({ partner: rawPartner, targetProfile = {}, date = new Date() } = {}) {
  const normalized = normalizedPartnerOrReject(rawPartner, date);
  if (!normalized.ok) return normalized;
  const partner = normalized.partner;
  const dimensions = [];
  let weightTotal = 0;
  let weightedScore = 0;

  for (const field of PARTNER_FIT_FIELDS) {
    const target = targetValues(targetProfile, field);
    if (!target.length) continue;
    const supported = partner.attributes?.[field] || {};
    const matches = target.filter(value => Object.hasOwn(supported, value));
    const coverage = matches.length / target.length;
    const strength = matches.length
      ? matches.reduce((sum, value) => sum + Number(supported[value] || 0), 0) / matches.length
      : 0;
    const score = coverage * strength;
    const weight = DIMENSION_WEIGHT[field];
    weightTotal += weight;
    weightedScore += score * weight;
    dimensions.push({ field, targetValues: target, matchedValues: matches, coverage, evidenceStrength: strength, score });
  }

  const score = weightTotal ? Math.round((weightedScore / weightTotal) * 10000) / 100 : 0;
  const evidenceCount = partner.evidence?.filter(item => EVIDENCE_WEIGHT[item.evidenceClass] > 0).length || 0;
  const status = evidenceCount && weightTotal ? 'PREPARE_ONLY_RANKED' : 'UNPROVEN';
  const reasonCodes = [];
  if (!weightTotal) reasonCodes.push('target-profile-required');
  if (!evidenceCount) reasonCodes.push('no-scoreable-evidence');

  return baseReceipt({
    status,
    reasonCodes,
    date,
    extra: {
      partnerId: partner.partnerId,
      partnerDigest: partner.partnerDigest,
      score,
      confidence: evidenceCount ? Math.min(1, Number((evidenceCount / 5).toFixed(3))) : 0,
      dimensions,
      excludedEvidenceCount: partner.rejectedEvidence?.length || 0,
      recommendation: status === 'PREPARE_ONLY_RANKED' ? 'OWNER_REVIEW_ONLY' : 'DO_NOT_SELECT',
      partnerContact: 'DISABLED',
      externalAction: 'DISABLED',
      fitId: `partnerfit_${digest({ partnerDigest: partner.partnerDigest, targetProfile }).slice(0, 24)}`
    }
  });
}

