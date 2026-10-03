// GLOBAL POLICY EVIDENCE: provenance + freshness for every jurisdiction/provider
// rule the Global Green-Lane Router relies on.
//
// The router never hardcodes legal prose as a runtime decision. The *logic* of
// a rule lives in the reviewed eligibility compiler
// (src/uberoutbound-recipient-eligibility.mjs); this module holds the *evidence
// that the rule is currently supported by its source*. A permissive route
// needs fresh evidence for every rule it relies on. Without it the router
// returns POLICY_REFRESH_REQUIRED with the exact rules and source URLs a live
// researcher must refresh, instead of silently continuing on stale law.
//
// Evidence rows can only attest "source S supports rule R as of T". They cannot
// add a permission: a jurisdiction with no encoded rule logic stays
// CONDITIONAL / UNKNOWN_FAIL_CLOSED however many evidence rows exist.
//
// Authority types are never collapsed into one "legal" boolean.
//
// Read-only and pure. No network, no write, no send authority.

import crypto from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalize, sha256 as canonicalSha256 } from './omnia-v9/canonical.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { RECIPIENT_ELIGIBILITY_SOURCES as SRC } from './uberoutbound-recipient-eligibility.mjs';

export const POLICY_EVIDENCE_VERSION = 'uberbond.global-policy-evidence.v1';
export const POLICY_EVIDENCE_BUNDLE_SCHEMA = 'uberbond.global-policy-evidence-bundle.v1';
export const POLICY_REFRESH_REQUIRED = 'POLICY_REFRESH_REQUIRED';

export const POLICY_AUTHORITY_TYPES = Object.freeze(['LAW', 'REGULATOR_GUIDANCE', 'PROVIDER_POLICY', 'UBERBOND_CONSERVATIVE_POLICY', 'OWNER_AUTHORITY']);
export const POLICY_STATUSES = Object.freeze(['ACTIVE', 'SUPERSEDED', 'REVOKED']);
export const POLICY_UNCERTAINTY_LEVELS = Object.freeze(['LOW', 'MEDIUM', 'HIGH']);
export const POLICY_EVIDENCE_STATES = Object.freeze({
  FRESH: 'FRESH',
  STALE: 'STALE',
  MISSING: 'MISSING',
  UNVERIFIED_SEED: 'UNVERIFIED_SEED',
  SUPERSEDED: 'SUPERSEDED',
  REVOKED: 'REVOKED',
  HIGH_UNCERTAINTY: 'HIGH_UNCERTAINTY',
  NOT_YET_EFFECTIVE: 'NOT_YET_EFFECTIVE',
  EXPIRED_AUTHORITY: 'EXPIRED_AUTHORITY',
  FUTURE_DATED: 'FUTURE_DATED'
});

// Default freshness (days since lastVerifiedAt). Provider terms drift fastest.
export const POLICY_FRESHNESS_DAYS = Object.freeze({
  LAW: 365,
  REGULATOR_GUIDANCE: 180,
  PROVIDER_POLICY: 30,
  UBERBOND_CONSERVATIVE_POLICY: 365,
  OWNER_AUTHORITY: 0 // bounded by the attestation's own expiresAt instead
});

const CLOCK_SKEW_MS = 5 * 60_000;
const MAX_BUNDLE_BYTES = 1_000_000;
const SHA256_HEX = /^[a-f0-9]{64}$/;
const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const isoOrNull = value => {
  const ms = Date.parse(value);
  return Number.isFinite(ms) && clean(value, 64) ? new Date(ms).toISOString() : null;
};
const uniq = list => [...new Set(list.filter(Boolean))];
const zeroLedger = () => structuredClone(ZERO_EXTERNAL_EFFECTS);

const host = url => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.username && !u.password ? u.hostname.toLowerCase() : '';
  } catch { return ''; }
};
const hostAllowed = (url, allowed) => {
  const h = host(url);
  return Boolean(h) && allowed.some(a => h === a || h.endsWith(`.${a}`));
};

/**
 * The rule catalog: one entry per rule the router can rely on. `permissive`
 * marks rules whose outcome can make a route green; only those need fresh
 * evidence (a stale *restrictive* rule cannot make anything less safe).
 * `seedSourceUrl` is where a live researcher should verify the rule; it is NOT
 * evidence that anyone has.
 */
const rule = (ruleId, o) => Object.freeze({
  ruleId,
  jurisdiction: o.jurisdiction,
  ruleScope: o.ruleScope,
  permissive: o.permissive === true,
  allowedAuthorityTypes: Object.freeze(o.allowedAuthorityTypes),
  allowedSourceHosts: Object.freeze(o.allowedSourceHosts || []),
  seedSourceUrl: o.seedSourceUrl || null,
  recipientClass: o.recipientClass || 'ANY',
  senderClass: o.senderClass || 'ANY',
  contactType: o.contactType || 'ANY',
  channel: o.channel || 'EMAIL',
  consentRequirement: o.consentRequirement,
  description: o.description
});

export const POLICY_RULE_CATALOG = Object.freeze([
  rule('recipient:US:can-spam-b2b-email', { jurisdiction: 'US', ruleScope: 'RECIPIENT_SIDE_COLD_B2B_EMAIL', permissive: true, allowedAuthorityTypes: ['REGULATOR_GUIDANCE', 'LAW'], allowedSourceHosts: ['ftc.gov', 'govinfo.gov', 'law.cornell.edu', 'uscode.house.gov'], seedSourceUrl: SRC.FTC_CAN_SPAM, consentRequirement: 'OPT_OUT_REGIME', description: 'US CAN-SPAM opt-out regime for commercial email to business recipients' }),
  rule('recipient:GB:pecr-corporate-subscriber-email', { jurisdiction: 'GB', ruleScope: 'RECIPIENT_SIDE_COLD_B2B_EMAIL', permissive: true, recipientClass: 'CORPORATE_SUBSCRIBER', allowedAuthorityTypes: ['REGULATOR_GUIDANCE', 'LAW'], allowedSourceHosts: ['ico.org.uk', 'legislation.gov.uk', 'gov.uk'], seedSourceUrl: SRC.ICO_B2B, consentRequirement: 'NONE_FOR_CORPORATE_SUBSCRIBER', description: 'UK PECR: corporate subscribers may receive B2B email without prior consent; individual subscribers need consent or soft opt-in' }),
  rule('recipient:CA:casl-conspicuous-publication', { jurisdiction: 'CA', ruleScope: 'RECIPIENT_SIDE_COLD_B2B_EMAIL', permissive: true, contactType: 'CONSPICUOUSLY_PUBLISHED_ADDRESS', allowedAuthorityTypes: ['REGULATOR_GUIDANCE', 'LAW'], allowedSourceHosts: ['crtc.gc.ca', 'laws-lois.justice.gc.ca', 'fightspam.gc.ca', 'canada.ca'], seedSourceUrl: SRC.CRTC_IMPLIED_CONSENT, consentRequirement: 'IMPLIED_CONSENT_CONSPICUOUS_PUBLICATION', description: 'Canada CASL implied consent from conspicuous publication, role-relevant message, no refusal statement' }),
  rule('recipient:AU:spam-act-conspicuous-publication', { jurisdiction: 'AU', ruleScope: 'RECIPIENT_SIDE_COLD_B2B_EMAIL', permissive: true, contactType: 'CONSPICUOUSLY_PUBLISHED_ADDRESS', allowedAuthorityTypes: ['REGULATOR_GUIDANCE', 'LAW'], allowedSourceHosts: ['acma.gov.au', 'legislation.gov.au'], seedSourceUrl: SRC.ACMA_AVOID_SPAM, consentRequirement: 'INFERRED_CONSENT_CONSPICUOUS_PUBLICATION', description: 'Australia Spam Act inferred consent from conspicuous publication; no address-harvesting software' }),
  rule('recipient:DE:uwg-7-consent', { jurisdiction: 'DE', ruleScope: 'RECIPIENT_SIDE_COLD_B2B_EMAIL', allowedAuthorityTypes: ['LAW'], allowedSourceHosts: ['gesetze-im-internet.de'], seedSourceUrl: SRC.DE_UWG_7, consentRequirement: 'PRIOR_EXPRESS_CONSENT', description: 'Germany UWG s.7: prior express consent required for email advertising' }),
  rule('recipient:CH:uwg-3-consent', { jurisdiction: 'CH', ruleScope: 'RECIPIENT_SIDE_COLD_B2B_EMAIL', allowedAuthorityTypes: ['LAW'], allowedSourceHosts: ['fedlex.admin.ch'], seedSourceUrl: SRC.CH_UWG_3, consentRequirement: 'CONSENT_REQUIRED', description: 'Switzerland UWG art.3: consent required for mass electronic advertising' }),
  rule('recipient:SA:default-deny', { jurisdiction: 'SA', ruleScope: 'RECIPIENT_SIDE_COLD_B2B_EMAIL', allowedAuthorityTypes: ['UBERBOND_CONSERVATIVE_POLICY'], consentRequirement: 'CONSENT_REQUIRED', description: 'Saudi Arabia: default deny cold direct marketing without auditable consent (conservative policy)' }),
  rule('recipient:AE:campaign-review-hold', { jurisdiction: 'AE', ruleScope: 'RECIPIENT_SIDE_COLD_B2B_EMAIL', allowedAuthorityTypes: ['UBERBOND_CONSERVATIVE_POLICY'], consentRequirement: 'UNKNOWN', description: 'UAE: campaign-specific legal review required (conservative policy hold)' }),
  rule('recipient:EG:consent-first-hold', { jurisdiction: 'EG', ruleScope: 'RECIPIENT_SIDE_COLD_B2B_EMAIL', allowedAuthorityTypes: ['UBERBOND_CONSERVATIVE_POLICY', 'LAW'], allowedSourceHosts: ['mcit.gov.eg'], seedSourceUrl: SRC.EG_PDPL_151_2020, consentRequirement: 'CONSENT_FIRST', description: 'Egypt: consent-first, campaign-specific review required (conservative policy hold)' }),
  rule('recipient:SG:review-hold', { jurisdiction: 'SG', ruleScope: 'RECIPIENT_SIDE_COLD_B2B_EMAIL', allowedAuthorityTypes: ['UBERBOND_CONSERVATIVE_POLICY', 'LAW'], allowedSourceHosts: ['sso.agc.gov.sg'], seedSourceUrl: SRC.SG_SPAM_CONTROL_ACT, consentRequirement: 'UNKNOWN', description: 'Singapore Spam Control Act / PDPA: representable but cold B2B position not encoded (hold)' }),
  rule('recipient:EU_EEA:national-eprivacy-hold', { jurisdiction: 'EU_EEA', ruleScope: 'RECIPIENT_SIDE_COLD_B2B_EMAIL', allowedAuthorityTypes: ['UBERBOND_CONSERVATIVE_POLICY'], consentRequirement: 'UNKNOWN', description: 'EU/EEA: national ePrivacy implementation review required (conservative policy hold)' }),
  rule('recipient:UNKNOWN:fail-closed', { jurisdiction: 'UNKNOWN', ruleScope: 'RECIPIENT_SIDE_COLD_B2B_EMAIL', allowedAuthorityTypes: ['UBERBOND_CONSERVATIVE_POLICY'], consentRequirement: 'UNKNOWN', description: 'Unresolved or unencoded recipient jurisdiction: fail closed' }),
  rule('legal-form:GB:corporate-subscriber-classes', { jurisdiction: 'GB', ruleScope: 'RECIPIENT_LEGAL_FORM_CLASSIFICATION', permissive: true, recipientClass: 'CORPORATE_SUBSCRIBER', allowedAuthorityTypes: ['REGULATOR_GUIDANCE', 'LAW', 'UBERBOND_CONSERVATIVE_POLICY'], allowedSourceHosts: ['ico.org.uk', 'legislation.gov.uk', 'gov.uk'], seedSourceUrl: SRC.ICO_B2B, consentRequirement: 'NONE_FOR_CORPORATE_SUBSCRIBER', description: 'Which UK legal forms are corporate subscribers; ordinary partnerships and sole traders are individual subscribers' }),
  rule('registry:GB:companies-house-terms', { jurisdiction: 'GB', ruleScope: 'PUBLIC_REGISTRY_ACCESS', permissive: true, channel: 'REGISTRY_API', allowedAuthorityTypes: ['PROVIDER_POLICY'], allowedSourceHosts: ['company-information.service.gov.uk', 'gov.uk'], seedSourceUrl: 'https://developer.company-information.service.gov.uk/', consentRequirement: 'NOT_APPLICABLE', description: 'Companies House public API terms: free access and rate limits permit this use' }),
  rule('provider:smtp-relay:winnr:cold-b2b-lawful-use', { jurisdiction: 'PROVIDER', ruleScope: 'PROVIDER_COLD_B2B_TERMS', permissive: true, allowedAuthorityTypes: ['PROVIDER_POLICY'], seedSourceUrl: null, consentRequirement: 'NOT_APPLICABLE', description: 'Winnr written support: lawful B2B outreach permitted on the sender substrate (see winnr/EVIDENCE_LEDGER.md)' }),
  rule('sender:EG:conservative-hold', { jurisdiction: 'EG', ruleScope: 'SENDER_SIDE_HOME_LAW', allowedAuthorityTypes: ['UBERBOND_CONSERVATIVE_POLICY'], allowedSourceHosts: ['mcit.gov.eg'], seedSourceUrl: SRC.EG_PDPL_151_2020, senderClass: 'EG_OPERATOR_OR_CONTROLLER', consentRequirement: 'UNKNOWN', description: 'Sender-side Egypt hold: a conservative policy hold pending authoritative scope interpretation, not a proven prohibition' })
]);

const CATALOG_BY_ID = new Map(POLICY_RULE_CATALOG.map(r => [r.ruleId, r]));
export const policyRuleIds = () => POLICY_RULE_CATALOG.map(r => r.ruleId);
export const getPolicyRule = ruleId => CATALOG_BY_ID.get(clean(ruleId, 200)) || null;

const ROW_FIELDS = new Set([
  'policyId', 'ruleId', 'jurisdiction', 'authorityType', 'sourceAuthority', 'sourceUrl', 'sourceRef',
  'retrievedAt', 'effectiveAt', 'lastVerifiedAt', 'expiresAt', 'ruleScope', 'recipientClass', 'senderClass',
  'contactType', 'channel', 'consentRequirement', 'identityRequirements', 'postalRequirement',
  'unsubscribeRequirement', 'specialConditions', 'exceptions', 'uncertainty', 'evidenceHash',
  'supersedes', 'supersededBy', 'status', 'ownerAttestationRef', 'ruleParameters'
]);

/**
 * Normalize and validate one evidence row against the catalog. Returns
 * { ok, row, errors }. A row that fails validation is never used.
 */
export function compilePolicyEvidenceRow(input = {}, { now = new Date(), evidenceText } = {}) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, row: null, errors: ['policy-evidence-row-not-object'] };
  const unknown = Object.keys(input).find(key => !ROW_FIELDS.has(key));
  if (unknown) errors.push(`policy-evidence-unknown-field:${unknown}`);
  const spec = getPolicyRule(input.ruleId);
  if (!spec) errors.push('policy-evidence-rule-not-in-catalog');
  const authorityType = clean(input.authorityType, 60).toUpperCase();
  if (!POLICY_AUTHORITY_TYPES.includes(authorityType)) errors.push('policy-evidence-authority-type-invalid');
  else if (spec && !spec.allowedAuthorityTypes.includes(authorityType)) errors.push(`policy-evidence-authority-type-not-allowed-for-rule:${authorityType}`);

  const sourceUrl = clean(input.sourceUrl, 1000);
  const sourceRef = clean(input.sourceRef, 500);
  if (sourceUrl) {
    if (!host(sourceUrl)) errors.push('policy-evidence-source-url-invalid');
    else if (spec?.allowedSourceHosts.length && authorityType !== 'UBERBOND_CONSERVATIVE_POLICY' && authorityType !== 'OWNER_AUTHORITY' && !hostAllowed(sourceUrl, spec.allowedSourceHosts)) errors.push('policy-evidence-source-host-not-authoritative-for-rule');
  } else if (!sourceRef) errors.push('policy-evidence-source-url-or-ref-required');

  const retrievedAt = isoOrNull(input.retrievedAt);
  const lastVerifiedAt = isoOrNull(input.lastVerifiedAt) || retrievedAt;
  const effectiveAt = isoOrNull(input.effectiveAt);
  const expiresAt = isoOrNull(input.expiresAt);
  if (!retrievedAt) errors.push('policy-evidence-retrieved-at-required');
  const nowMs = new Date(now).getTime();
  if (retrievedAt && Date.parse(retrievedAt) > nowMs + CLOCK_SKEW_MS) errors.push('policy-evidence-retrieved-in-future');
  if (lastVerifiedAt && Date.parse(lastVerifiedAt) > nowMs + CLOCK_SKEW_MS) errors.push('policy-evidence-last-verified-in-future');
  if (retrievedAt && lastVerifiedAt && Date.parse(lastVerifiedAt) < Date.parse(retrievedAt)) errors.push('policy-evidence-last-verified-before-retrieved');

  let evidenceHash = clean(input.evidenceHash, 64).toLowerCase();
  if (typeof evidenceText === 'string' && evidenceText.length) {
    const computed = crypto.createHash('sha256').update(evidenceText).digest('hex');
    if (evidenceHash && evidenceHash !== computed) errors.push('policy-evidence-hash-mismatch');
    evidenceHash = computed;
  }
  if (!SHA256_HEX.test(evidenceHash)) errors.push('policy-evidence-hash-required');

  const status = clean(input.status || 'ACTIVE', 20).toUpperCase();
  if (!POLICY_STATUSES.includes(status)) errors.push('policy-evidence-status-invalid');
  const uncertainty = input.uncertainty && typeof input.uncertainty === 'object' && !Array.isArray(input.uncertainty)
    ? { level: clean(input.uncertainty.level, 10).toUpperCase(), notes: clean(input.uncertainty.notes, 600) }
    : { level: '', notes: '' };
  if (!POLICY_UNCERTAINTY_LEVELS.includes(uncertainty.level)) errors.push('policy-evidence-uncertainty-level-required');
  if (authorityType === 'OWNER_AUTHORITY') {
    if (!clean(input.ownerAttestationRef, 500)) errors.push('policy-evidence-owner-attestation-ref-required');
    if (!expiresAt) errors.push('policy-evidence-owner-authority-expiry-required');
  }
  if (spec && input.jurisdiction !== undefined && clean(input.jurisdiction, 16).toUpperCase() !== spec.jurisdiction) errors.push('policy-evidence-jurisdiction-mismatch-with-rule');
  if (spec && input.ruleScope !== undefined && clean(input.ruleScope, 80) !== spec.ruleScope) errors.push('policy-evidence-rule-scope-mismatch-with-rule');

  if (errors.length) return { ok: false, row: null, errors: uniq(errors) };
  const row = {
    policyId: clean(input.policyId, 200) || `${spec.ruleId}@${retrievedAt}`,
    ruleId: spec.ruleId,
    jurisdiction: spec.jurisdiction,
    authorityType,
    sourceAuthority: clean(input.sourceAuthority, 200),
    sourceUrl: sourceUrl || null,
    sourceRef: sourceRef || null,
    retrievedAt,
    effectiveAt,
    lastVerifiedAt,
    expiresAt,
    ruleScope: spec.ruleScope,
    recipientClass: clean(input.recipientClass, 60) || spec.recipientClass,
    senderClass: clean(input.senderClass, 60) || spec.senderClass,
    contactType: clean(input.contactType, 60) || spec.contactType,
    channel: clean(input.channel, 40) || spec.channel,
    consentRequirement: clean(input.consentRequirement, 80) || spec.consentRequirement,
    identityRequirements: Array.isArray(input.identityRequirements) ? input.identityRequirements.map(v => clean(v, 120)).slice(0, 20) : [],
    postalRequirement: clean(input.postalRequirement, 200),
    unsubscribeRequirement: clean(input.unsubscribeRequirement, 200),
    specialConditions: Array.isArray(input.specialConditions) ? input.specialConditions.map(v => clean(v, 300)).slice(0, 20) : [],
    exceptions: Array.isArray(input.exceptions) ? input.exceptions.map(v => clean(v, 300)).slice(0, 20) : [],
    uncertainty,
    evidenceHash,
    supersedes: clean(input.supersedes, 200) || null,
    supersededBy: clean(input.supersededBy, 200) || null,
    status,
    ownerAttestationRef: clean(input.ownerAttestationRef, 500) || null,
    ruleParameters: input.ruleParameters && typeof input.ruleParameters === 'object' && !Array.isArray(input.ruleParameters) ? JSON.parse(JSON.stringify(input.ruleParameters)) : {}
  };
  return { ok: true, row, errors: [] };
}

/**
 * Freshness of one compiled row at `now`. Anything other than FRESH cannot
 * support a permissive route.
 */
export function evaluatePolicyEvidenceFreshness(row, { now = new Date() } = {}) {
  const nowMs = new Date(now).getTime();
  const refresh = state => ({ fresh: false, state, ageDays: null });
  if (!row) return refresh(POLICY_EVIDENCE_STATES.MISSING);
  if (row.status === 'REVOKED') return refresh(POLICY_EVIDENCE_STATES.REVOKED);
  if (row.status === 'SUPERSEDED' || row.supersededBy) return refresh(POLICY_EVIDENCE_STATES.SUPERSEDED);
  if (!row.lastVerifiedAt || !SHA256_HEX.test(String(row.evidenceHash || ''))) return refresh(POLICY_EVIDENCE_STATES.UNVERIFIED_SEED);
  const verifiedMs = Date.parse(row.lastVerifiedAt);
  if (!Number.isFinite(verifiedMs) || verifiedMs > nowMs + CLOCK_SKEW_MS) return refresh(POLICY_EVIDENCE_STATES.FUTURE_DATED);
  const ageDays = (nowMs - verifiedMs) / 86_400_000;
  if (row.effectiveAt && Date.parse(row.effectiveAt) > nowMs) return { fresh: false, state: POLICY_EVIDENCE_STATES.NOT_YET_EFFECTIVE, ageDays };
  if (row.expiresAt && Date.parse(row.expiresAt) <= nowMs) return { fresh: false, state: POLICY_EVIDENCE_STATES.EXPIRED_AUTHORITY, ageDays };
  const limit = row.authorityType === 'OWNER_AUTHORITY' ? Infinity : POLICY_FRESHNESS_DAYS[row.authorityType];
  if (ageDays > limit) return { fresh: false, state: POLICY_EVIDENCE_STATES.STALE, ageDays };
  if (row.uncertainty?.level === 'HIGH') return { fresh: false, state: POLICY_EVIDENCE_STATES.HIGH_UNCERTAINTY, ageDays };
  return { fresh: true, state: POLICY_EVIDENCE_STATES.FRESH, ageDays };
}

export function createPolicyEvidenceRegistry({ rows = [], now = new Date(), loadErrors = [] } = {}) {
  const accepted = [];
  const rejected = [];
  for (const input of Array.isArray(rows) ? rows : []) {
    const compiled = compilePolicyEvidenceRow(input, { now });
    if (compiled.ok) accepted.push(compiled.row); else rejected.push({ policyId: clean(input?.policyId, 200) || null, ruleId: clean(input?.ruleId, 200) || null, errors: compiled.errors });
  }
  // A row named by another row's `supersedes` is superseded even if its own
  // status field was never updated.
  const supersededIds = new Set(accepted.map(r => r.supersedes).filter(Boolean));
  const byRule = new Map();
  for (const row of accepted) {
    if (supersededIds.has(row.policyId)) continue;
    const list = byRule.get(row.ruleId) || [];
    list.push(row);
    byRule.set(row.ruleId, list);
  }
  const resolveRule = (ruleId, at = now) => {
    const spec = getPolicyRule(ruleId);
    const refreshTarget = spec ? { ruleId: spec.ruleId, jurisdiction: spec.jurisdiction, sourceUrl: spec.seedSourceUrl, authorityTypes: [...spec.allowedAuthorityTypes], description: spec.description } : { ruleId: clean(ruleId, 200), jurisdiction: null, sourceUrl: null, authorityTypes: [], description: 'rule-not-in-catalog' };
    if (!spec) return { ruleId: refreshTarget.ruleId, fresh: false, state: POLICY_EVIDENCE_STATES.MISSING, reason: 'rule-not-in-catalog', evidence: null, refreshTarget };
    const candidates = byRule.get(spec.ruleId) || [];
    if (!candidates.length) return { ruleId: spec.ruleId, fresh: false, state: POLICY_EVIDENCE_STATES.MISSING, reason: 'no-evidence-row', evidence: null, refreshTarget };
    // The freshest verified row wins; a fresh row is preferred over a stale one.
    const ranked = candidates.map(row => ({ row, verdict: evaluatePolicyEvidenceFreshness(row, { now: at }) }))
      .sort((a, b) => Number(b.verdict.fresh) - Number(a.verdict.fresh) || Date.parse(b.row.lastVerifiedAt || 0) - Date.parse(a.row.lastVerifiedAt || 0));
    const best = ranked[0];
    return { ruleId: spec.ruleId, fresh: best.verdict.fresh, state: best.verdict.state, reason: best.verdict.fresh ? 'fresh' : String(best.verdict.state).toLowerCase(), ageDays: best.verdict.ageDays, evidence: best.row, refreshTarget };
  };
  return Object.freeze({
    version: POLICY_EVIDENCE_VERSION,
    acceptedCount: accepted.length,
    rejected,
    loadErrors: [...loadErrors],
    rows: Object.freeze(accepted.map(r => Object.freeze(r))),
    resolveRule
  });
}

/**
 * Require fresh evidence for a set of rules. Never silently continues:
 * `refreshRequired` names every rule (with its source URL) that must be
 * re-researched before the decision may proceed.
 */
export function requirePolicyEvidence(registry, ruleIds, { now = new Date() } = {}) {
  const resolved = uniq(ruleIds).map(id => (registry?.resolveRule ? registry.resolveRule(id, now) : { ruleId: id, fresh: false, state: POLICY_EVIDENCE_STATES.MISSING, reason: 'no-registry', evidence: null, refreshTarget: { ruleId: id } }));
  const refreshRequired = resolved.filter(r => !r.fresh).map(r => ({ ...r.refreshTarget, state: r.state, reason: r.reason }));
  const used = resolved.filter(r => r.fresh).map(r => ({ policyId: r.evidence.policyId, ruleId: r.ruleId, authorityType: r.evidence.authorityType, evidenceHash: r.evidence.evidenceHash, lastVerifiedAt: r.evidence.lastVerifiedAt }));
  return {
    ok: refreshRequired.length === 0,
    state: refreshRequired.length ? POLICY_REFRESH_REQUIRED : 'POLICY_EVIDENCE_FRESH',
    refreshRequired,
    evidence: used,
    evidenceDigest: canonicalSha256({ version: POLICY_EVIDENCE_VERSION, evidence: used.slice().sort((a, b) => a.ruleId.localeCompare(b.ruleId)) }),
    sendAuthority: false,
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroLedger()
  };
}

/** Parameters a fresh evidence row attests for a rule (e.g. the provider's cold-B2B rule). */
export function policyRuleParameters(registry, ruleId, { now = new Date() } = {}) {
  const r = registry?.resolveRule ? registry.resolveRule(ruleId, now) : null;
  return r?.fresh ? { ...(r.evidence.ruleParameters || {}) } : null;
}

const defaultRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_POLICY_EVIDENCE_BUNDLE_PATH = 'policy/outreach/global-policy-evidence.json';

/**
 * Load the committed evidence bundle. Any failure (missing, oversized,
 * corrupt, wrong schema) yields an EMPTY registry plus the error: stale or
 * poisoned evidence can only ever make the router more conservative.
 */
export function loadPolicyEvidenceBundle({ root = defaultRoot, path = DEFAULT_POLICY_EVIDENCE_BUNDLE_PATH, now = new Date() } = {}) {
  const full = join(root, path);
  const failed = code => createPolicyEvidenceRegistry({ rows: [], now, loadErrors: [code] });
  try {
    if (!existsSync(full)) return failed('policy-evidence-bundle-missing');
    if (statSync(full).size > MAX_BUNDLE_BYTES) return failed('policy-evidence-bundle-too-large');
    const parsed = JSON.parse(readFileSync(full, 'utf8'));
    if (!parsed || parsed.schemaVersion !== POLICY_EVIDENCE_BUNDLE_SCHEMA || !Array.isArray(parsed.rows)) return failed('policy-evidence-bundle-schema-invalid');
    return createPolicyEvidenceRegistry({ rows: parsed.rows, now });
  } catch {
    return failed('policy-evidence-bundle-unreadable');
  }
}

/** Per-rule state table for operators and the doctor. */
export function compilePolicyEvidenceStatus(registry, { now = new Date() } = {}) {
  const rules = POLICY_RULE_CATALOG.map(spec => {
    const r = registry.resolveRule(spec.ruleId, now);
    return { ruleId: spec.ruleId, jurisdiction: spec.jurisdiction, permissive: spec.permissive, state: r.state, fresh: r.fresh, ageDays: r.ageDays == null ? null : Number(r.ageDays.toFixed(1)), authorityType: r.evidence?.authorityType || null, lastVerifiedAt: r.evidence?.lastVerifiedAt || null, seedSourceUrl: spec.seedSourceUrl };
  });
  const permissive = rules.filter(r => r.permissive);
  return {
    version: POLICY_EVIDENCE_VERSION,
    evaluatedAt: new Date(now).toISOString(),
    totalRules: rules.length,
    permissiveRules: permissive.length,
    permissiveRulesFresh: permissive.filter(r => r.fresh).length,
    permissiveRulesNeedingRefresh: permissive.filter(r => !r.fresh).map(r => ({ ruleId: r.ruleId, state: r.state, seedSourceUrl: r.seedSourceUrl })),
    rejectedRows: registry.rejected,
    loadErrors: registry.loadErrors,
    rules,
    sendAuthority: false,
    externalEffectAuthority: 'NONE',
    externalEffects: 0,
    truthBoundary: 'Evidence rows attest that a source supports an encoded rule as of a time; they never add a permission. A restrictive rule needs no freshness to stay restrictive. Every permissive rule needs fresh, hashed, authority-typed evidence before any route can be green, and GREEN is never send authority.'
  };
}

export { canonicalize as canonicalizePolicyValue };
