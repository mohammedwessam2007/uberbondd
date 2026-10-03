// CORPORATE LEGAL-FORM VERIFIER.
//
// Decides, from an official-registry result plus what the entity's own site
// publishes, whether a recipient is a verified corporate body. It exists
// because a policy such as UK PECR treats corporate subscribers differently
// from sole traders and ordinary partnerships, and "Acme Ltd" typed on a
// website proves nothing.
//
//   * A website claim is a CLAIM. It can contradict the registry (rejecting the
//     match) but it can never verify anything.
//   * The registry result must identify the entity exactly (company number
//     equal, or normalized legal name equal), the entity must be ACTIVE, its
//     legal form must be one the policy classifies as corporate, and the
//     contact domain must reconcile to the published site.
//   * Any ambiguity, outage, missing credential or unmapped form is a
//     fail-closed status, never a guess.
//
// Pure and read-only. It does not call the registry; the router/preflight
// resolve the entity first (src/company-registry-adapter.mjs) and pass the
// typed result in.

import { sha256 as canonicalSha256 } from './omnia-v9/canonical.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { REGISTRY_STATUS, normalizeCompanyName, sameDomainFamily } from './company-registry-adapter.mjs';
import { COMPANIES_HOUSE_FORM_CLASSES, COMPANIES_HOUSE_ACTIVE_STATUSES } from './companies-house-adapter.mjs';

export const LEGAL_FORM_VERIFIER_VERSION = 'uberbond.corporate-legal-form-verifier.v1';
export const REGISTRY_EVIDENCE_MAX_AGE_DAYS = 7;

export const LEGAL_FORM_STATUS = Object.freeze({
  CORPORATE_VERIFIED: 'CORPORATE_VERIFIED',
  NOT_CORPORATE: 'NOT_CORPORATE',
  AMBIGUOUS: 'AMBIGUOUS',
  INACTIVE_ENTITY: 'INACTIVE_ENTITY',
  IDENTITY_MISMATCH: 'IDENTITY_MISMATCH',
  UNVERIFIED: 'UNVERIFIED',
  REGISTRY_UNAVAILABLE: 'REGISTRY_UNAVAILABLE',
  NO_REGISTRY_FOR_JURISDICTION: 'NO_REGISTRY_FOR_JURISDICTION',
  NOT_REQUIRED_FOR_JURISDICTION: 'NOT_REQUIRED_FOR_JURISDICTION'
});

// Jurisdictions whose cold-email rule turns on the recipient being a verified
// corporate body. Others do not need legal-form evidence to evaluate their
// (consent or opt-out based) rule, so the verifier reports NOT_REQUIRED.
export const LEGAL_FORM_REQUIRED_JURISDICTIONS = Object.freeze(['GB']);

const clean = (value, max = 300) => String(value ?? '').trim().slice(0, max);
const iso2 = value => {
  const v = clean(value, 8).toUpperCase();
  return v === 'UK' ? 'GB' : v;
};

// Words a website uses for a non-corporate trader. Order matters: LLP and
// "limited partnership" are corporate-ish forms and are decided by the registry.
const NON_CORPORATE_CLAIM = /\b(sole[- ]trader|sole[- ]proprietor(?:ship)?|self[- ]employed|freelanc(?:er|e)|trading as|t\/a|individual consultant|ordinary partnership|general partnership)\b/i;
const CORPORATE_CLAIM = /\b(ltd|limited|plc|llp|inc|incorporated|corporation|gmbh|pty|llc)\b\.?/i;

export function compileLegalFormClaims(input = {}) {
  const formText = clean(input.formText, 200);
  return {
    legalName: clean(input.legalName, 300),
    companyNumber: clean(input.companyNumber, 16).toUpperCase().replace(/\s+/g, ''),
    formText,
    siteHost: clean(input.siteHost, 255).toLowerCase(),
    emailDomain: clean(input.emailDomain, 255).toLowerCase(),
    claimsNonCorporate: NON_CORPORATE_CLAIM.test(`${formText} ${clean(input.legalName, 300)}`),
    claimsCorporate: CORPORATE_CLAIM.test(`${formText} ${clean(input.legalName, 300)}`)
  };
}

/**
 * @param {object} input
 * @param {string} input.jurisdiction  recipient jurisdiction (ISO2)
 * @param {object} input.claims        what the entity's own site publishes (claims only)
 * @param {object} [input.registryResult] typed result from the registry adapter (in-process, trusted)
 * @param {Date}   [input.now]
 */
export function verifyCorporateLegalForm({ jurisdiction = '', claims = {}, registryResult = null, now = new Date() } = {}) {
  const code = iso2(jurisdiction);
  const c = compileLegalFormClaims(claims);
  const reasons = [];
  const finish = (status, extra = {}) => {
    const recipientType = extra.recipientType || (status === LEGAL_FORM_STATUS.CORPORATE_VERIFIED ? 'CORPORATE' : status === LEGAL_FORM_STATUS.NOT_CORPORATE ? 'SOLE_TRADER_OR_PARTNERSHIP' : 'UNKNOWN');
    const seed = { version: LEGAL_FORM_VERIFIER_VERSION, jurisdiction: code, status, recipientType, entity: extra.entity || null, reasons: [...new Set(reasons)] };
    return {
      version: LEGAL_FORM_VERIFIER_VERSION,
      jurisdiction: code || null,
      status,
      verified: status === LEGAL_FORM_STATUS.CORPORATE_VERIFIED,
      recipientType,
      legalFormClass: extra.legalFormClass || null,
      entity: extra.entity || null,
      reconciliation: extra.reconciliation || { nameMatch: null, numberMatch: null, domainMatch: null },
      reasons: [...new Set(reasons)],
      claimsUsed: { legalNameClaimed: Boolean(c.legalName), companyNumberClaimed: Boolean(c.companyNumber), claimsNonCorporate: c.claimsNonCorporate, claimsCorporate: c.claimsCorporate },
      requiredRuleIds: code === 'GB' ? ['legal-form:GB:corporate-subscriber-classes', 'registry:GB:companies-house-terms'] : [],
      evidenceDigest: canonicalSha256(seed),
      claimsNeverVerify: true,
      sendAuthority: false,
      externalEffectAuthority: 'NONE',
      externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS)
    };
  };

  if (!code) { reasons.push('recipient-jurisdiction-unresolved'); return finish(LEGAL_FORM_STATUS.UNVERIFIED); }
  if (!LEGAL_FORM_REQUIRED_JURISDICTIONS.includes(code)) {
    reasons.push('legal-form-not-required-by-the-encoded-rule-for-this-jurisdiction');
    return finish(LEGAL_FORM_STATUS.NOT_REQUIRED_FOR_JURISDICTION, { recipientType: 'UNKNOWN' });
  }

  const status = registryResult?.status;
  if (!registryResult || status === REGISTRY_STATUS.NO_ADAPTER) {
    reasons.push('no-registry-evidence-for-jurisdiction');
    return finish(c.claimsNonCorporate ? LEGAL_FORM_STATUS.NOT_CORPORATE : LEGAL_FORM_STATUS.NO_REGISTRY_FOR_JURISDICTION, c.claimsNonCorporate ? { recipientType: 'SOLE_TRADER_OR_PARTNERSHIP', legalFormClass: 'SOLE_TRADER' } : {});
  }
  if (status === REGISTRY_STATUS.CREDENTIAL_MISSING || status === REGISTRY_STATUS.UNAVAILABLE || status === REGISTRY_STATUS.RATE_LIMITED || status === REGISTRY_STATUS.INVALID_RESPONSE || status === REGISTRY_STATUS.INVALID_REQUEST) {
    reasons.push(`registry-${String(status).toLowerCase().replace(/_/g, '-')}`, ...(registryResult.reasons || []));
    return finish(LEGAL_FORM_STATUS.REGISTRY_UNAVAILABLE);
  }
  if (status === REGISTRY_STATUS.AMBIGUOUS) {
    reasons.push('registry-multiple-entities-share-the-name', ...(registryResult.reasons || []));
    return finish(LEGAL_FORM_STATUS.AMBIGUOUS);
  }
  if (status === REGISTRY_STATUS.NOT_FOUND) {
    if (c.claimsNonCorporate && !c.claimsCorporate) {
      reasons.push('entity-states-it-is-not-a-company-and-is-not-on-the-register');
      return finish(LEGAL_FORM_STATUS.NOT_CORPORATE, { recipientType: 'SOLE_TRADER_OR_PARTNERSHIP', legalFormClass: 'SOLE_TRADER' });
    }
    reasons.push(c.claimsCorporate ? 'claimed-corporate-form-not-found-in-registry' : 'entity-not-found-in-registry', ...(registryResult.reasons || []));
    return finish(LEGAL_FORM_STATUS.UNVERIFIED);
  }
  if (status !== REGISTRY_STATUS.FOUND || !registryResult.record) {
    reasons.push('registry-result-not-usable');
    return finish(LEGAL_FORM_STATUS.UNVERIFIED);
  }

  // FOUND: bind the registry entity to the entity this prospect actually is.
  const record = registryResult.record;
  const evidence = registryResult.evidence || {};
  const retrievedMs = Date.parse(evidence.retrievedAt);
  const nowMs = new Date(now).getTime();
  const entity = {
    registryId: registryResult.registryId, companyNumber: record.companyNumber, name: record.name,
    companyStatus: record.companyStatus, companyType: record.companyType, registeredJurisdiction: record.registeredJurisdiction || null,
    retrievedAt: Number.isFinite(retrievedMs) ? new Date(retrievedMs).toISOString() : null, responseDigest: evidence.responseDigest || null
  };
  if (!Number.isFinite(retrievedMs) || !evidence.responseDigest) { reasons.push('registry-evidence-missing-retrieval-time-or-digest'); return finish(LEGAL_FORM_STATUS.UNVERIFIED, { entity }); }
  if (retrievedMs > nowMs + 5 * 60_000) { reasons.push('registry-evidence-dated-in-the-future'); return finish(LEGAL_FORM_STATUS.UNVERIFIED, { entity }); }
  if (nowMs - retrievedMs > REGISTRY_EVIDENCE_MAX_AGE_DAYS * 86_400_000) { reasons.push('registry-evidence-stale'); return finish(LEGAL_FORM_STATUS.UNVERIFIED, { entity }); }

  const numberClaimed = Boolean(c.companyNumber);
  const numberMatch = numberClaimed ? c.companyNumber === record.companyNumber : null;
  const nameClaimed = Boolean(normalizeCompanyName(c.legalName));
  const nameMatch = nameClaimed ? normalizeCompanyName(c.legalName) === normalizeCompanyName(record.name) : null;
  const domainMatch = sameDomainFamily(c.siteHost, c.emailDomain);
  const reconciliation = { nameMatch, numberMatch, domainMatch };
  if (numberClaimed && numberMatch === false) { reasons.push('published-company-number-differs-from-registry-entity'); return finish(LEGAL_FORM_STATUS.IDENTITY_MISMATCH, { entity, reconciliation }); }
  if (!numberClaimed && !nameClaimed) { reasons.push('site-publishes-neither-a-legal-name-nor-a-company-number'); return finish(LEGAL_FORM_STATUS.UNVERIFIED, { entity, reconciliation }); }
  if (!numberClaimed && nameMatch !== true) { reasons.push('published-legal-name-does-not-equal-registry-name'); return finish(LEGAL_FORM_STATUS.IDENTITY_MISMATCH, { entity, reconciliation }); }
  if (!domainMatch) { reasons.push('contact-domain-does-not-reconcile-to-the-published-site'); return finish(LEGAL_FORM_STATUS.IDENTITY_MISMATCH, { entity, reconciliation }); }
  if (c.claimsNonCorporate) { reasons.push('site-describes-a-non-corporate-trader-but-registry-shows-a-company'); return finish(LEGAL_FORM_STATUS.AMBIGUOUS, { entity, reconciliation }); }
  if (!COMPANIES_HOUSE_ACTIVE_STATUSES.includes(record.companyStatus) || record.hasBeenLiquidated === true) { reasons.push(`registered-entity-not-active:${record.companyStatus}`); return finish(LEGAL_FORM_STATUS.INACTIVE_ENTITY, { entity, reconciliation }); }

  const formClass = COMPANIES_HOUSE_FORM_CLASSES[record.companyType] || null;
  if (formClass === 'CORPORATE') return finish(LEGAL_FORM_STATUS.CORPORATE_VERIFIED, { entity, reconciliation, legalFormClass: 'CORPORATE' });
  reasons.push(formClass ? `legal-form-requires-human-classification:${record.companyType}` : `legal-form-not-mapped-by-policy:${record.companyType}`);
  return finish(LEGAL_FORM_STATUS.AMBIGUOUS, { entity, reconciliation, legalFormClass: formClass });
}
