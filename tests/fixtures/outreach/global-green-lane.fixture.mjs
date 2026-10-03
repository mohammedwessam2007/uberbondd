// Hermetic fixtures for the Global Green-Lane Router suites.
//
// Nothing here is read from artifacts/ or docs/ (the mutation war copies only
// src/, tests/ and scripts/). Policy evidence is built RELATIVE TO `now`, so no
// suite becomes a calendar time bomb: the router's freshness law is exercised
// explicitly, not by the test run date.
import { POLICY_RULE_CATALOG, createPolicyEvidenceRegistry } from '../../../src/global-policy-evidence.mjs';

export const HASH = 'f'.repeat(64);
export const iso = (now, offsetMs = 0) => new Date(new Date(now).getTime() + offsetMs).toISOString();
export const DAY = 86_400_000;

const AUTHORITY_FOR = ruleId => {
  const spec = POLICY_RULE_CATALOG.find(r => r.ruleId === ruleId);
  return spec.allowedAuthorityTypes[0];
};
const URL_FOR = ruleId => {
  const spec = POLICY_RULE_CATALOG.find(r => r.ruleId === ruleId);
  if (spec.seedSourceUrl) return spec.seedSourceUrl;
  return null;
};

/** One fresh evidence row per catalog rule; `override` adjusts individual rules. */
export function freshPolicyRows(now, { override = {}, omit = [] } = {}) {
  return POLICY_RULE_CATALOG.filter(r => !omit.includes(r.ruleId)).map(spec => {
    const row = {
      ruleId: spec.ruleId,
      authorityType: AUTHORITY_FOR(spec.ruleId),
      sourceUrl: URL_FOR(spec.ruleId) || undefined,
      sourceRef: URL_FOR(spec.ruleId) ? undefined : 'winnr/EVIDENCE_LEDGER.md#support-thread-2026-10-02',
      retrievedAt: iso(now, -DAY),
      evidenceHash: HASH,
      uncertainty: { level: 'LOW', notes: 'fixture' },
      ruleParameters: spec.ruleId === 'provider:smtp-relay:winnr:cold-b2b-lawful-use' ? { coldB2BRule: 'ALLOWED' } : {}
    };
    return { ...row, ...(override[spec.ruleId] || {}) };
  });
}
export const freshPolicyRegistry = (now, opts = {}) => createPolicyEvidenceRegistry({ rows: freshPolicyRows(now, opts), now });

/** A typed registry result shaped like the Companies House adapter's output. */
export function registryFound(now, { companyNumber = '12345678', name = 'Acme Widgets Ltd', status = 'active', type = 'ltd', ageMs = 3600_000, jurisdiction = 'GB', hasBeenLiquidated = false } = {}) {
  return {
    version: 'uberbond.company-registry-adapter.v1', registryId: 'UK_COMPANIES_HOUSE', jurisdiction, status: 'FOUND',
    query: { name, companyNumber }, candidates: [],
    record: { companyNumber, name, companyStatus: status, companyType: type, registeredJurisdiction: 'england-wales', dateOfCreation: '2015-01-01', dateOfCessation: null, hasBeenLiquidated, undeliverableRegisteredOfficeAddress: false },
    evidence: { retrievedAt: iso(now, -ageMs), requestPath: `/company/${companyNumber}`, responseDigest: HASH, cache: 'MISS', registryTermsRuleId: 'registry:GB:companies-house-terms' },
    reasons: [], zeroCost: true
  };
}
export const registryStatus = (status, extra = {}) => ({ version: 'uberbond.company-registry-adapter.v1', registryId: 'UK_COMPANIES_HOUSE', jurisdiction: 'GB', status, query: {}, candidates: [], record: null, evidence: null, reasons: [], zeroCost: true, ...extra });

const completeIdentity = { legalBusinessSenderName: 'UberBond Test Sender Ltd', authorizedPublicPostalAddress: '1 Example Street, London EC1A 1AA, United Kingdom', footerUseAuthorized: true };
const compliantSender = { truthfulFromAndReplyTo: true, nonDeceptiveSubject: true, advertisementDisclosure: true, unsubscribeMechanism: true, unsubscribeHonoredWithinBusinessDays: 0, contactMethod: 'reply to this email' };
export const cleanSenderSide = { operatorLocation: 'US', senderEntityJurisdiction: 'US', controllerJurisdiction: 'US' };
export const egyptSenderSide = { operatorLocation: 'EG', senderEntityJurisdiction: 'EG', controllerJurisdiction: 'EG' };

/**
 * A.  Verified active UK Ltd, generic corporate inbox, official website
 *     publication, no named person, no negative solicitation signal, complete
 *     identity, fresh policy evidence.
 */
export function ukLtdInput(now, overrides = {}) {
  const base = {
    now,
    objective: { kind: 'FIRST_TOUCH_COLD_B2B', offerId: 'LEAD_TO_BOOKING_LEAK_AUDIT', offerFamily: 'AGENCY_REVENUE' },
    candidate: { ref: 'uk-acme', company: 'Acme Widgets', legalName: 'Acme Widgets Ltd', companyNumber: '12345678', formText: 'Acme Widgets Ltd, registered in England and Wales, company number 12345678', website: 'https://www.acme-widgets.co.uk/' },
    contact: {
      email: 'info@acme-widgets.co.uk',
      source: { url: 'https://www.acme-widgets.co.uk/contact/', observedAt: iso(now, -3600_000), pageContext: 'CONTACT_PAGE', publicationType: 'OWN_SITE_PAGE', collectionMethod: 'MANUAL', excerpt: 'Acme Widgets Ltd - General enquiries: info@acme-widgets.co.uk. Registered office: 1 High Street, Leeds.' },
      namedPersonEvidence: { present: false }
    },
    recipient: { jurisdictionClaims: [{ jurisdiction: 'GB', source: 'CANDIDATE_RECORD' }] },
    registry: { result: registryFound(now) },
    notices: { noSolicitationChecked: true, noSolicitationFound: false, noHarvestChecked: true, noHarvestFound: false },
    offerRelevance: { relatedToRecipientRole: true, rationale: 'Agency-style business publishing a general enquiries inbox; the offer is a lead-path evidence artifact for its clients.' },
    invitationEvidence: [],
    history: { status: 'CLEAN', receiptDigest: HASH },
    suppression: {},
    provider: { id: 'smtp-relay', vendor: 'winnr' },
    sender: { identity: completeIdentity, compliance: compliantSender, senderSide: cleanSenderSide, allocation: { ok: true, slot: 'tara' } },
    policyRegistry: freshPolicyRegistry(now)
  };
  return mergeDeep(base, overrides);
}
/** E. Explicit business-enquiry invitation on the same UK Ltd. */
export const invitationEvidence = now => [{ sourceUrl: 'https://www.acme-widgets.co.uk/work-with-us/', capturedAt: iso(now, -3600_000), pageContext: 'WORK_WITH_US', excerpt: 'Partnership enquiries and agency proposals are welcome - send us your proposals at info@acme-widgets.co.uk.' }];

export function usCorporateInput(now, overrides = {}) {
  const us = mergeDeep(ukLtdInput(now), {
    candidate: { ref: 'us-corp', company: 'Powerhouse Fixture Group', legalName: 'Powerhouse Fixture Group', companyNumber: '', formText: '', website: 'https://fixture-power.example/' },
    contact: { email: 'hello@fixture-power.example', source: { url: 'https://fixture-power.example/contact/', excerpt: 'Email hello@fixture-power.example for general business enquiries.' } },
    recipient: { jurisdictionClaims: [{ jurisdiction: 'US', source: 'CANDIDATE_RECORD' }], type: 'CORPORATE' }
  });
  us.registry = { result: null };
  return mergeDeep(us, overrides);
}

export function mergeDeep(a, b) {
  if (Array.isArray(b)) return b;
  if (b && typeof b === 'object' && a && typeof a === 'object' && !Array.isArray(a)) {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = k in a && v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k]) && !(v instanceof Date) && !('resolveRule' in v) ? mergeDeep(a[k], v) : v;
    return out;
  }
  return b === undefined ? a : b;
}
