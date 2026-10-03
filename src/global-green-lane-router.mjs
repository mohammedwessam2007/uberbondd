// GLOBAL_GREEN_LANE_ROUTER: the one canonical organ for global commercial route
// selection.
//
//   OBJECTIVE -> CANDIDATE -> CONTACT OPTIONS -> JURISDICTIONS -> LEGAL FORM
//   -> RECIPIENT TYPE -> SOURCE PROVENANCE -> INVITATION / CONSENT STATE
//   -> PROVIDER POLICY -> IDENTITY REQUIREMENTS -> CHANNEL OPTIONS -> COST
//   -> RISK -> EXPECTED VALUE -> ROUTE CLASSIFICATION -> BEST PERMITTED ROUTE
//   -> EFFECT PREFLIGHT
//
// This is CONSTRAINT ARBITRAGE, not rule evasion. It finds the lowest-friction
// LAWFUL route that the evidence supports, and abstains otherwise. It
// implements none of: fake jurisdiction, fake consent, fake company identity,
// fake postal address, domain rotation, provider-rule or suppression bypass,
// identity concealment or misleading message classification.
//
//   * GREEN is NOT send authority. GREEN means "this route currently has the
//     policy/evidence prerequisites to proceed to normal effect authorization".
//     A real send additionally needs: suppression clean, history clean, identity
//     complete, sender eligible, provider allowed, effect complete, and a valid
//     authorization. The router never says SEND_APPROVED and its
//     `sendReady` is constant false.
//   * The LAW lives in the reviewed eligibility compiler
//     (src/uberoutbound-recipient-eligibility.mjs). The router evaluates the
//     recipient side (evaluationScope RECIPIENT_SIDE_ONLY) and reports the
//     sender side as its own gate; it adds no permission of its own.
//   * Policy evidence must be FRESH for every rule a permissive route relies on;
//     otherwise state POLICY_REFRESH_REQUIRED names the rules and source URLs a
//     live researcher must refresh. It never silently continues on stale law.
//   * Unknown stays unknown: ambiguous jurisdiction, ambiguous legal form, an
//     unreachable registry, a guessed address or missing provenance all fail
//     closed with exact blockers.
//   * Zero new recurring cost: official public registries and local
//     classification only; a missing free credential is a fail-closed blocker.
//
// Pure and synchronous. The caller resolves registry evidence first (async,
// src/company-registry-adapter.mjs) and passes the typed result in.

import crypto from 'node:crypto';
import { sha256 as canonicalSha256 } from './omnia-v9/canonical.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import {
  compileRecipientEligibility, recipientEligibilityCoverage, ELIGIBILITY_REQUIREMENTS, EU_EEA_JURISDICTIONS, RELATIONSHIPS
} from './uberoutbound-recipient-eligibility.mjs';
import { createPolicyEvidenceRegistry, requirePolicyEvidence, policyRuleParameters, POLICY_REFRESH_REQUIRED, POLICY_RULE_CATALOG } from './global-policy-evidence.mjs';
import { verifyCorporateLegalForm, LEGAL_FORM_REQUIRED_JURISDICTIONS, LEGAL_FORM_STATUS } from './corporate-legal-form-verifier.mjs';
import { classifyRecipientInbox, INBOX_CLASSES } from './recipient-address-classifier.mjs';
import { classifyInvitedContact, INVITATION_CLASSES } from './invited-contact-classifier.mjs';
import { compileContactSourceBinding, CONTACT_SOURCE_STATUS } from './contact-source-verifier.mjs';
import { rankRoutes } from './global-route-tournament.mjs';
import { providerRoutePolicy } from './outreach-governance.mjs';
import { SENDER_SIDE_HOLD_CLASSIFICATION, SENDER_SIDE_GATING_FIELDS } from './outreach-cold-route-policy.mjs';
import { evaluateReachEndpoint } from './uberreach-universal-transport.mjs';
import { routeProspect as routeLawfulChannels } from './lawful-channel-router.mjs';
import { isPlaceholder } from './prospect-effect-package.mjs';
import { httpsHostOf } from './host-family.mjs';

export const GLOBAL_GREEN_LANE_ROUTER_VERSION = 'uberbond.global-green-lane-router.v1';

// Route classes. The five GREEN classes preserve the semantics of the founder's
// minimum set (INVITED_GREEN, CORPORATE_GREEN, US_CANSPAM_GREEN) and add the two
// the encoded eligibility rules already distinguish (conspicuous-publication
// jurisdictions and existing permissioned relationships).
export const ROUTE_CLASSES = Object.freeze({
  INVITED_GREEN: 'INVITED_GREEN',
  CORPORATE_GREEN: 'CORPORATE_GREEN',
  US_CANSPAM_GREEN: 'US_CANSPAM_GREEN',
  CONSPICUOUS_PUBLICATION_GREEN: 'CONSPICUOUS_PUBLICATION_GREEN',
  PERMISSIONED_GREEN: 'PERMISSIONED_GREEN',
  CONDITIONAL: 'CONDITIONAL',
  CONSENT_REQUIRED: 'CONSENT_REQUIRED',
  DO_NOT_SEND: 'DO_NOT_SEND',
  UNKNOWN_FAIL_CLOSED: 'UNKNOWN_FAIL_CLOSED'
});
export const GREEN_ROUTE_CLASSES = Object.freeze(new Set([
  ROUTE_CLASSES.INVITED_GREEN, ROUTE_CLASSES.CORPORATE_GREEN, ROUTE_CLASSES.US_CANSPAM_GREEN,
  ROUTE_CLASSES.CONSPICUOUS_PUBLICATION_GREEN, ROUTE_CLASSES.PERMISSIONED_GREEN
]));
export const ROUTE_STATES = Object.freeze({
  ROUTE_GREEN: 'ROUTE_GREEN',
  ROUTE_CONDITIONAL: 'ROUTE_CONDITIONAL',
  CONSENT_REQUIRED: 'CONSENT_REQUIRED',
  DO_NOT_SEND: 'DO_NOT_SEND',
  UNKNOWN_FAIL_CLOSED: 'UNKNOWN_FAIL_CLOSED',
  POLICY_REFRESH_REQUIRED
});
export const SEND_PREREQUISITES = Object.freeze(['suppressionClean', 'historyClean', 'identityComplete', 'senderEligible', 'providerAllowed', 'effectComplete', 'authorizationValid']);

// Obligations that bind the message/sender at effect time; they never decide
// whether a route is green. Route-time obligations do.
const EFFECT_TIME_REQUIREMENTS = new Set([
  ELIGIBILITY_REQUIREMENTS.SENDER_POSTAL_IDENTITY, ELIGIBILITY_REQUIREMENTS.TRUTHFUL_SENDER_HEADERS,
  ELIGIBILITY_REQUIREMENTS.NON_DECEPTIVE_SUBJECT, ELIGIBILITY_REQUIREMENTS.ADVERTISEMENT_IDENTIFICATION,
  ELIGIBILITY_REQUIREMENTS.FUNCTIONAL_UNSUBSCRIBE, ELIGIBILITY_REQUIREMENTS.SENDER_CONTACT_METHOD
]);

const RECIPIENT_RULE_BY_JURISDICTION = Object.freeze({
  US: 'recipient:US:can-spam-b2b-email', GB: 'recipient:GB:pecr-corporate-subscriber-email',
  CA: 'recipient:CA:casl-conspicuous-publication', AU: 'recipient:AU:spam-act-conspicuous-publication',
  DE: 'recipient:DE:uwg-7-consent', CH: 'recipient:CH:uwg-3-consent', SA: 'recipient:SA:default-deny',
  AE: 'recipient:AE:campaign-review-hold', EG: 'recipient:EG:consent-first-hold', SG: 'recipient:SG:review-hold'
});
export const recipientRuleIdFor = code => RECIPIENT_RULE_BY_JURISDICTION[code]
  || (EU_EEA_JURISDICTIONS.has(code) ? 'recipient:EU_EEA:national-eprivacy-hold' : 'recipient:UNKNOWN:fail-closed');
const PROVIDER_RULE_ID = 'provider:smtp-relay:winnr:cold-b2b-lawful-use';
const COLD_PROVIDER_VALUES = new Set(['ALLOWED', 'CONSENT_REQUIRED', 'PROHIBITED']);

// Encoded-but-review jurisdictions hold as CONDITIONAL (a human legal
// determination is needed); unencoded ones fail closed.
const REVIEW_HOLD_REASONS = /^(ae-campaign-specific|eg-consent-first|sg-spam-control|eu-eea-national)/;
const CONSENT_REJECT_REASONS = /(consent|individual-subscriber|default-deny|uwg)/;
const ROUTE_TIME_REQUIREMENTS = new Set([ELIGIBILITY_REQUIREMENTS.LEGITIMATE_INTERESTS_ASSESSMENT, ELIGIBILITY_REQUIREMENTS.PRIVACY_NOTICE, ELIGIBILITY_REQUIREMENTS.PUBLICATION_EVIDENCE_RETAINED]);

const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const lower = value => clean(value, 1000).toLowerCase();
const upper = value => clean(value, 80).toUpperCase();
const uniq = list => [...new Set(list.filter(Boolean))];
const sha = value => crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
const iso2 = value => {
  const v = upper(value);
  return v === 'UK' ? 'GB' : /^[A-Z]{2}$/.test(v) ? v : '';
};
const zeroLedger = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const domainOf = email => (lower(email).split('@')[1] || '');

/* -------------------------------------------------------------------------- */
/* Jurisdiction resolution                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Resolve the recipient jurisdiction from independent claims plus registry
 * evidence. Conflicting claims never resolve (the router never picks the more
 * convenient one).
 */
export function resolveRecipientJurisdiction({ claims = [], registryResult = null } = {}) {
  const list = (Array.isArray(claims) ? claims : [claims]).map(item => (typeof item === 'string' ? { jurisdiction: item, source: 'CLAIM' } : item)).filter(Boolean);
  const found = [];
  for (const item of list) {
    const code = iso2(item.jurisdiction);
    if (code) found.push({ jurisdiction: code, source: clean(item.source, 60) || 'CLAIM' });
  }
  if (registryResult?.status === 'FOUND' && registryResult.jurisdiction) found.push({ jurisdiction: iso2(registryResult.jurisdiction), source: 'REGISTRY' });
  const distinct = uniq(found.map(f => f.jurisdiction));
  if (!distinct.length) return { jurisdiction: 'UNKNOWN', status: 'UNRESOLVED', sources: [], reasons: ['recipient-jurisdiction-unresolved'] };
  if (distinct.length > 1) return { jurisdiction: 'UNKNOWN', status: 'CONFLICT', sources: found, reasons: [`recipient-jurisdiction-claims-conflict:${distinct.join('|')}`] };
  return { jurisdiction: distinct[0], status: 'RESOLVED', sources: found, reasons: [], registryBacked: found.some(f => f.source === 'REGISTRY') };
}

/* -------------------------------------------------------------------------- */
/* Sender side (reported, never self-resolved)                                 */
/* -------------------------------------------------------------------------- */

export function compileSenderSideState(senderSide = {}) {
  const coverage = recipientEligibilityCoverage().senderJurisdictions;
  const fields = Object.fromEntries(SENDER_SIDE_GATING_FIELDS.map(f => [f, iso2(senderSide?.[f])]));
  const missing = SENDER_SIDE_GATING_FIELDS.filter(f => !fields[f]);
  const holding = SENDER_SIDE_GATING_FIELDS.filter(f => fields[f] && coverage[fields[f]] !== 'RECIPIENT_RULES_GOVERN');
  let state = 'CLEAR_RECIPIENT_RULES_GOVERN';
  if (missing.length) state = 'UNRESOLVED_FACTS';
  else if (holding.length) state = 'HOLD_CONSERVATIVE_POLICY';
  return {
    state,
    clear: state === 'CLEAR_RECIPIENT_RULES_GOVERN',
    fields,
    missingFields: missing,
    holdingFields: holding.map(f => `${f}=${fields[f]}`),
    classification: state === 'HOLD_CONSERVATIVE_POLICY' ? SENDER_SIDE_HOLD_CLASSIFICATION : null,
    ownerResolutionRecorded: senderSide?.resolved === true && Boolean(clean(senderSide?.resolutionRef, 500)),
    note: 'Sender-side legal authority is a separate gate: this state is reported, never self-resolved, and never lifts a hold.'
  };
}

/* -------------------------------------------------------------------------- */
/* The router                                                                  */
/* -------------------------------------------------------------------------- */

function identityState(identity) {
  if (!identity || typeof identity !== 'object') return { status: 'UNKNOWN', codes: ['sender-identity-not-supplied'], postal: null };
  const codes = [];
  const name = clean(identity.legalBusinessSenderName, 200);
  const address = clean(identity.authorizedPublicPostalAddress, 500);
  if (isPlaceholder(name)) codes.push('legal-business-sender-name-placeholder-or-missing');
  if (isPlaceholder(address) || address.length < 12) codes.push('authorized-public-postal-address-placeholder-or-missing');
  if (identity.footerUseAuthorized !== true) codes.push('owner-authorization-to-publish-footer-missing');
  return {
    status: codes.length ? 'FAIL' : 'PASS', codes,
    postal: codes.length ? null : { ok: true, status: 'UBERPOSTAL_IDENTITY_READY', identityDigest: sha(address.toLowerCase().replace(/\s+/g, ' ')) }
  };
}

function relationshipKind(rel) {
  const kind = upper(rel?.kind);
  return RELATIONSHIPS.includes(kind) && kind !== 'NONE' ? kind : 'NONE';
}

/**
 * @param {object} input see README in docs/receipts/GLOBAL_GREEN_LANE_ROUTER_20261003.md
 */
export function routeGlobalGreenLane(input = {}) {
  const now = new Date(input.now ?? Date.now());
  const registry = input.policyRegistry || createPolicyEvidenceRegistry({ rows: [], now });
  const candidate = input.candidate && typeof input.candidate === 'object' ? input.candidate : {};
  const contact = input.contact && typeof input.contact === 'object' ? input.contact : {};
  const notices = input.notices && typeof input.notices === 'object' ? input.notices : {};
  const email = lower(contact.email);
  const siteHost = httpsHostOf(candidate.website);
  const objective = { kind: upper(input.objective?.kind) || 'FIRST_TOUCH_COLD_B2B', offerId: clean(input.objective?.offerId, 120) || null, offerFamily: upper(input.objective?.offerFamily) || null };

  const hard = [];       // -> DO_NOT_SEND
  const failClosed = []; // -> UNKNOWN_FAIL_CLOSED

  // 1. Jurisdiction
  const jurisdictionClaims = Array.isArray(input.recipient?.jurisdictionClaims) ? input.recipient.jurisdictionClaims : (input.recipient?.jurisdiction ? [{ jurisdiction: input.recipient.jurisdiction, source: 'CANDIDATE_RECORD' }] : []);
  const registryResult = input.registry?.result || null;
  const jurisdiction = resolveRecipientJurisdiction({ claims: jurisdictionClaims, registryResult });
  if (jurisdiction.status !== 'RESOLVED') failClosed.push(...jurisdiction.reasons);
  const J = jurisdiction.jurisdiction;

  // 2. Legal form / recipient type
  const legalForm = verifyCorporateLegalForm({
    jurisdiction: J,
    claims: { legalName: candidate.legalName, companyNumber: candidate.companyNumber, formText: candidate.formText, siteHost, emailDomain: domainOf(email) },
    registryResult, now
  });
  const legalFormRequired = LEGAL_FORM_REQUIRED_JURISDICTIONS.includes(J);
  let recipientType = legalFormRequired ? legalForm.recipientType : (['CORPORATE', 'GOVERNMENT', 'SOLE_TRADER_OR_PARTNERSHIP', 'INDIVIDUAL_CONSUMER'].includes(upper(input.recipient?.type)) ? upper(input.recipient.type) : 'UNKNOWN');
  if (legalFormRequired && legalForm.status !== LEGAL_FORM_STATUS.CORPORATE_VERIFIED && legalForm.status !== LEGAL_FORM_STATUS.NOT_CORPORATE) failClosed.push(...legalForm.reasons.map(r => `legal-form:${r}`), `legal-form-status:${legalForm.status.toLowerCase()}`);

  // 3. Contact typing, invitation and source binding
  const inbox = classifyRecipientInbox({ email, company: { legalName: candidate.legalName, siteHost }, source: contact.source || {}, namedPersonEvidence: contact.namedPersonEvidence || {} });
  const invitation = classifyInvitedContact({ evidence: input.invitationEvidence || [], message: { offerFamily: objective.offerFamily, topics: input.objective?.topics || [] }, now });
  const sourceBinding = compileContactSourceBinding({ contact: { route: 'EMAIL', address: email }, source: contact.source || {}, notices, invitation, siteHost, now });

  if (sourceBinding.status === CONTACT_SOURCE_STATUS.REJECTED) hard.push(...sourceBinding.hardRejects.map(r => `contact-source:${r}`));
  else if (sourceBinding.status === CONTACT_SOURCE_STATUS.INCOMPLETE) failClosed.push(...sourceBinding.missing.map(m => `contact-source-missing:${m}`));
  if (inbox.addressClass === INBOX_CLASSES.SYSTEM_ADDRESS) hard.push('inbox:system-address-not-a-marketing-recipient');
  if (inbox.addressClass === INBOX_CLASSES.PERSONAL_OR_CONSUMER_ADDRESS) hard.push('inbox:personal-or-consumer-address-not-a-business-recipient');
  if (inbox.addressClass === INBOX_CLASSES.GUESS_OR_UNVERIFIED) failClosed.push(...inbox.reasons.map(r => `inbox:${r}`));
  if (inbox.addressClass === INBOX_CLASSES.AMBIGUOUS) failClosed.push(...inbox.reasons.map(r => `inbox-ambiguous:${r}`));

  // 4. History / suppression
  const history = input.history && typeof input.history === 'object' ? input.history : null;
  const suppression = input.suppression && typeof input.suppression === 'object' ? input.suppression : {};
  if (history) {
    if (upper(history.status) === 'HIT') hard.push('history:prior-contact-or-suppression-ledger-hit');
    else if (upper(history.status) !== 'CLEAN') failClosed.push('history:contact-history-not-clean-or-unknown');
  }
  if (suppression.suppressed === true || suppression.unsubscribed === true || suppression.complained === true || suppression.hardBounced === true) hard.push('suppression:dominates');

  // 5. Provider rule (parameters can only come from fresh, hashed evidence)
  const providerId = lower(input.provider?.id) || 'smtp-relay';
  const vendor = lower(input.provider?.vendor) || 'winnr';
  const providerRuleId = providerId === 'smtp-relay' && vendor === 'winnr' ? PROVIDER_RULE_ID : null;
  const providerParams = providerRuleId ? policyRuleParameters(registry, providerRuleId, { now }) : null;
  const evidencedProviderRule = COLD_PROVIDER_VALUES.has(upper(providerParams?.coldB2BRule)) ? upper(providerParams.coldB2BRule) : null;
  // No fresh provider evidence: evaluate hypothetically ALLOWED so the
  // provisional class is visible, but the route cannot go green (refresh required).
  const transportColdB2BRule = providerRuleId ? (evidencedProviderRule || 'ALLOWED') : 'UNKNOWN';

  // 6. Recipient-side eligibility (the reviewed law, evaluated recipient-side only)
  const relKind = relationshipKind(input.relationship);
  const ident = identityState(input.sender?.identity);
  const pubOfficial = ['OWN_SITE_PAGE', 'OFFICIAL_REGISTER'].includes(upper(contact.source?.publicationType));
  const eligibility = compileRecipientEligibility({
    recipient: { email, type: recipientType, jurisdiction: J === 'UNKNOWN' ? '' : J, namedPerson: inbox.addressClass === INBOX_CLASSES.NAMED_BUSINESS_PERSON },
    relationship: relKind,
    relationshipEvidenceRef: input.relationship?.evidenceRef || '',
    source: {
      kind: contact.source?.guessed === true ? 'GUESSED_PATTERN' : upper(contact.source?.kind) || (pubOfficial ? 'PUBLISHED_BUSINESS_CONTACT' : 'UNKNOWN'),
      ref: contact.source?.url || '', observedAt: contact.source?.observedAt || '',
      collectionMethod: upper(contact.source?.collectionMethod) || 'UNKNOWN',
      noSolicitationNoticePresent: notices.noSolicitationChecked === true ? notices.noSolicitationFound === true : null,
      noHarvestNoticePresent: notices.noHarvestChecked === true ? notices.noHarvestFound === true : null
    },
    offerRelevance: { relatedToRecipientRole: typeof input.offerRelevance?.relatedToRecipientRole === 'boolean' ? input.offerRelevance.relatedToRecipientRole : null, rationale: input.offerRelevance?.rationale || '' },
    senderCompliance: input.sender?.compliance || {},
    postalIdentity: ident.postal,
    transportColdB2BRule,
    suppression,
    evaluationScope: 'RECIPIENT_SIDE_ONLY',
    now
  });

  const routeTimeUnmet = eligibility.requirementsUnmet.filter(r => ROUTE_TIME_REQUIREMENTS.has(r));
  const effectTimeUnmet = eligibility.requirementsUnmet.filter(r => EFFECT_TIME_REQUIREMENTS.has(r));

  // 7. Classify
  let routeClass;
  let underlyingBasis = eligibility.basis || null;
  const reasons = [];
  const decisionCode = eligibility.decision;
  if (hard.length) { routeClass = ROUTE_CLASSES.DO_NOT_SEND; reasons.push(...hard); }
  else if (decisionCode === 'REJECT') {
    const consent = eligibility.reasonCodes.some(c => CONSENT_REJECT_REASONS.test(c));
    routeClass = consent ? ROUTE_CLASSES.CONSENT_REQUIRED : ROUTE_CLASSES.DO_NOT_SEND;
    reasons.push(...eligibility.reasonCodes);
  } else if (decisionCode === 'HOLD_FOR_REVIEW') {
    const review = eligibility.reasonCodes.length > 0 && eligibility.reasonCodes.every(c => REVIEW_HOLD_REASONS.test(c));
    if (failClosed.length) { routeClass = ROUTE_CLASSES.UNKNOWN_FAIL_CLOSED; reasons.push(...failClosed, ...eligibility.reasonCodes); }
    else { routeClass = review ? ROUTE_CLASSES.CONDITIONAL : ROUTE_CLASSES.UNKNOWN_FAIL_CLOSED; reasons.push(...eligibility.reasonCodes); }
  } else if (failClosed.length) {
    routeClass = ROUTE_CLASSES.UNKNOWN_FAIL_CLOSED; reasons.push(...failClosed);
  } else if (routeTimeUnmet.length) {
    routeClass = ROUTE_CLASSES.CONDITIONAL; reasons.push(...routeTimeUnmet.map(r => `route-requirement-unmet:${r}`));
  } else {
    // ALLOW / ALLOW_WITH_REQUIREMENTS with every route-time obligation met.
    const basis = String(eligibility.basis || '');
    if (basis.startsWith('PERMISSIONED_')) routeClass = ROUTE_CLASSES.PERMISSIONED_GREEN;
    else if (basis === 'UK_PECR_CORPORATE_SUBSCRIBER') routeClass = ROUTE_CLASSES.CORPORATE_GREEN;
    else if (basis === 'US_CAN_SPAM_OPT_OUT_REGIME') routeClass = ROUTE_CLASSES.US_CANSPAM_GREEN;
    else if (basis === 'CASL_IMPLIED_CONSENT_CONSPICUOUS_PUBLICATION' || basis === 'AU_SPAM_ACT_CONSPICUOUS_PUBLICATION') routeClass = ROUTE_CLASSES.CONSPICUOUS_PUBLICATION_GREEN;
    else { routeClass = ROUTE_CLASSES.UNKNOWN_FAIL_CLOSED; reasons.push(`eligibility-basis-not-mapped:${basis || 'none'}`); }
    // A genuine, scope-fitting invitation upgrades a cold lane's priority class.
    if (GREEN_ROUTE_CLASSES.has(routeClass) && routeClass !== ROUTE_CLASSES.PERMISSIONED_GREEN && invitation.invited === true) routeClass = ROUTE_CLASSES.INVITED_GREEN;
  }

  // 8. Policy evidence: a permissive class needs fresh evidence for every rule it relies on.
  const requiredRules = [];
  const permissive = GREEN_ROUTE_CLASSES.has(routeClass);
  if (permissive) {
    if (routeClass !== ROUTE_CLASSES.PERMISSIONED_GREEN) requiredRules.push(recipientRuleIdFor(J));
    if (providerRuleId) requiredRules.push(providerRuleId); else failClosed.push('provider-policy-not-encoded');
    if (legalFormRequired) requiredRules.push(...legalForm.requiredRuleIds);
  }
  const policy = requirePolicyEvidence(registry, requiredRules, { now });
  let state;
  let provisionalRouteClass = null;
  let finalClass = routeClass;
  if (permissive && !providerRuleId) { finalClass = ROUTE_CLASSES.UNKNOWN_FAIL_CLOSED; provisionalRouteClass = routeClass; reasons.push('provider-policy-not-encoded'); state = ROUTE_STATES.UNKNOWN_FAIL_CLOSED; }
  else if (permissive && !policy.ok) { finalClass = ROUTE_CLASSES.UNKNOWN_FAIL_CLOSED; provisionalRouteClass = routeClass; state = ROUTE_STATES.POLICY_REFRESH_REQUIRED; reasons.push(...policy.refreshRequired.map(r => `policy-refresh-required:${r.ruleId}:${String(r.state).toLowerCase()}`)); }
  else if (permissive && providerRuleId && !evidencedProviderRule) { finalClass = ROUTE_CLASSES.UNKNOWN_FAIL_CLOSED; provisionalRouteClass = routeClass; state = ROUTE_STATES.POLICY_REFRESH_REQUIRED; reasons.push('provider-evidence-carries-no-cold-b2b-rule-parameter'); }
  else if (permissive && evidencedProviderRule !== 'ALLOWED') { finalClass = evidencedProviderRule === 'CONSENT_REQUIRED' ? ROUTE_CLASSES.CONSENT_REQUIRED : ROUTE_CLASSES.DO_NOT_SEND; reasons.push(`provider-terms-forbid-cold-b2b:${evidencedProviderRule}`); state = finalClass === ROUTE_CLASSES.CONSENT_REQUIRED ? ROUTE_STATES.CONSENT_REQUIRED : ROUTE_STATES.DO_NOT_SEND; }
  else if (permissive) state = ROUTE_STATES.ROUTE_GREEN;
  else state = { [ROUTE_CLASSES.CONDITIONAL]: ROUTE_STATES.ROUTE_CONDITIONAL, [ROUTE_CLASSES.CONSENT_REQUIRED]: ROUTE_STATES.CONSENT_REQUIRED, [ROUTE_CLASSES.DO_NOT_SEND]: ROUTE_STATES.DO_NOT_SEND, [ROUTE_CLASSES.UNKNOWN_FAIL_CLOSED]: ROUTE_STATES.UNKNOWN_FAIL_CLOSED }[routeClass];
  const green = state === ROUTE_STATES.ROUTE_GREEN && GREEN_ROUTE_CLASSES.has(finalClass);

  // 9. Sender side + governance gate + send prerequisites (reported, never granted)
  const senderSide = compileSenderSideState(input.sender?.senderSide || {});
  const governance = providerRoutePolicy(providerId, 'PUBLIC_BUSINESS_CONTACT');
  const allocation = input.sender?.allocation;
  const prereq = {
    suppressionClean: suppression.suppressed === true || suppression.unsubscribed === true || suppression.complained === true || suppression.hardBounced === true ? { status: 'FAIL', codes: ['suppression-hit'] } : { status: 'PASS', codes: [] },
    historyClean: !history ? { status: 'NOT_EVALUATED', codes: ['history-not-supplied-to-router'] } : upper(history.status) === 'CLEAN' ? { status: 'PASS', codes: [] } : { status: upper(history.status) === 'HIT' ? 'FAIL' : 'UNKNOWN', codes: [`history-${lower(history.status) || 'unknown'}`] },
    identityComplete: { status: ident.status, codes: ident.codes },
    senderEligible: !allocation ? { status: 'UNKNOWN', codes: ['sender-allocation-not-supplied'] } : (allocation.ok === true && senderSide.clear ? { status: 'PASS', codes: [] } : { status: 'FAIL', codes: [...(allocation.ok === true ? [] : ['sender-allocation-failed', ...(allocation.reasonCodes || [])]), ...(senderSide.clear ? [] : [`sender-side-${lower(senderSide.state).replace(/_/g, '-')}`])] }),
    providerAllowed: evidencedProviderRule === 'ALLOWED' && governance.ok ? { status: 'PASS', codes: [] } : { status: evidencedProviderRule === null ? 'UNKNOWN' : 'FAIL', codes: [...(evidencedProviderRule === 'ALLOWED' ? [] : [evidencedProviderRule === null ? 'provider-terms-evidence-missing-or-stale' : `provider-terms:${evidencedProviderRule.toLowerCase()}`]), ...(governance.ok ? [] : [`governance-refuses-public-business-contact:${governance.reason}`])] },
    effectComplete: { status: 'NOT_EVALUATED', codes: ['effect-package-compiled-by-preflight'] },
    authorizationValid: { status: 'NOT_EVALUATED', codes: ['founder-signed-authorization-is-a-separate-gate'] }
  };

  // 10. Route tournament over every candidate route
  const routes = [];
  const emailChannel = !green ? 'COLD_EMAIL'
    : finalClass === ROUTE_CLASSES.INVITED_GREEN ? 'INVITED_EMAIL'
      : finalClass === ROUTE_CLASSES.CORPORATE_GREEN ? 'CORPORATE_ROLE_EMAIL'
        : finalClass === ROUTE_CLASSES.US_CANSPAM_GREEN ? 'US_BUSINESS_EMAIL'
          : finalClass === ROUTE_CLASSES.PERMISSIONED_GREEN ? 'PERMISSIONED_EMAIL' : 'PUBLISHED_BUSINESS_EMAIL';
  const routeCosts = input.routeCosts && typeof input.routeCosts === 'object' ? input.routeCosts : {};
  const costOf = channel => (Number.isFinite(Number(routeCosts[channel])) && routeCosts[channel] !== null && routeCosts[channel] !== '' ? Number(routeCosts[channel]) : null);
  const privacy = inbox.privacyClass;
  routes.push({
    routeId: `email:${emailChannel}`, channel: emailChannel, routeClass: finalClass, permitted: green,
    executable: green && ident.status === 'PASS' && prereq.senderEligible.status === 'PASS',
    blockers: green ? [] : uniq(reasons), costCents: costOf('EMAIL'), founderMinutes: Number(input.routeFounderMinutes?.EMAIL ?? 1),
    contactPrivacyClass: privacy, uncertainty: green ? 0 : 1,
    evidenceRefs: { legalFormDigest: legalForm.evidenceDigest, contactSourceDigest: sourceBinding.bindingDigest, invitationDigest: invitation.evidenceDigest, policyEvidenceDigest: policy.evidenceDigest }
  });

  // Intake channels that the recipient itself publishes (vendor / partnership forms, procurement portals).
  const historyClean = !history || upper(history.status) === 'CLEAN';
  const noHardForCandidate = !suppressionDominates(suppression) && historyClean;
  for (const channel of Array.isArray(input.intakeChannels) ? input.intakeChannels.slice(0, 10) : []) {
    const kind = upper(channel?.kind);
    if (!['PUBLIC_VENDOR_FORM', 'PARTNERSHIP_FORM', 'PROCUREMENT_PORTAL'].includes(kind)) continue;
    const inv = classifyInvitedContact({ evidence: channel.invitationEvidence || [], message: { offerFamily: objective.offerFamily, topics: input.objective?.topics || [] }, now });
    const binding = compileContactSourceBinding({ contact: { route: 'FORM', formUrl: channel.url }, source: channel.source || {}, notices, invitation: inv, siteHost, now });
    const endpoint = evaluateReachEndpoint({ ...(channel.reachEndpoint || {}), channel: 'WEB_CONTACT' }, { now });
    const blockers = [];
    if (inv.classification !== INVITATION_CLASSES.INVITED_STRONG) blockers.push(`intake-channel:invitation-${lower(inv.classification)}`);
    if (!binding.bound) blockers.push(...(binding.hardRejects.length ? binding.hardRejects : binding.missing).map(c => `intake-channel:${c}`));
    if (!noHardForCandidate) blockers.push('intake-channel:suppression-or-history-block');
    const permittedForm = blockers.length === 0;
    routes.push({
      routeId: `form:${kind}:${sha(channel.url).slice(0, 12)}`, channel: kind, routeClass: permittedForm ? ROUTE_CLASSES.INVITED_GREEN : ROUTE_CLASSES.UNKNOWN_FAIL_CLOSED, permitted: permittedForm,
      executable: permittedForm && endpoint.ready, blockers: uniq([...blockers, ...(permittedForm && !endpoint.ready ? endpoint.reasonCodes.map(c => `execution-adapter:${c}`) : [])]),
      costCents: costOf(kind), founderMinutes: Number(input.routeFounderMinutes?.[kind] ?? 3), contactPrivacyClass: 'COMPANY_LEVEL', uncertainty: permittedForm ? 0 : 1,
      evidenceRefs: { contactSourceDigest: binding.bindingDigest, invitationDigest: inv.evidenceDigest }
    });
  }

  // Other existing UberReach endpoints: only with a genuine invitation and a ready endpoint.
  for (const endpoint of Array.isArray(input.reachEndpoints) ? input.reachEndpoints.slice(0, 10) : []) {
    const ch = upper(endpoint?.channel);
    if (['EMAIL', 'WEB_CONTACT', ''].includes(ch)) continue;
    const checked = evaluateReachEndpoint(endpoint, { now });
    const blockers = [];
    if (!invitation.invited) blockers.push('uberreach-endpoint:no-genuine-invitation');
    if (!checked.ready) blockers.push(...checked.reasonCodes.map(c => `uberreach-endpoint:${c}`));
    if (!noHardForCandidate) blockers.push('uberreach-endpoint:suppression-or-history-block');
    const ok = blockers.length === 0;
    routes.push({ routeId: `uberreach:${checked.endpointId || sha(JSON.stringify(endpoint)).slice(0, 10)}`, channel: 'OTHER_EXISTING_UBERREACH_CHANNEL', routeClass: ok ? ROUTE_CLASSES.INVITED_GREEN : ROUTE_CLASSES.UNKNOWN_FAIL_CLOSED, permitted: ok, executable: ok, blockers: uniq(blockers), costCents: costOf('OTHER_EXISTING_UBERREACH_CHANNEL'), founderMinutes: Number(input.routeFounderMinutes?.OTHER_EXISTING_UBERREACH_CHANNEL ?? 2), contactPrivacyClass: 'COMPANY_LEVEL', uncertainty: ok ? 0 : 1, evidenceRefs: { invitationDigest: invitation.evidenceDigest } });
  }

  // Non-email lawful channels already owned by the lawful-channel router.
  // A partner/founder-network introduction is a permitted route (the introducer
  // sends under its own relationship). Postal and untargeted content CREATE
  // consent; they are reported as a fallback, never ranked as a first-touch sales route.
  const fallbacks = [];
  if (input.lawfulChannels && typeof input.lawfulChannels === 'object' && !hard.length) {
    const lawful = routeLawfulChannels({
      prospect: { ref: candidate.ref || sha(email).slice(0, 16), jurisdiction: J, recipientType, ...input.lawfulChannels.prospect },
      eligibility: null,
      context: { ...(input.lawfulChannels.context || {}), now }
    });
    for (const r of lawful.routes || []) {
      if (['PARTNER_INTRODUCTION', 'FOUNDER_NETWORK', 'IN_PERSON'].includes(r.channel)) {
        const ok = r.state === 'ALLOW';
        routes.push({ routeId: `lawful:${r.channel}`, channel: 'REFERRAL', routeClass: ok ? ROUTE_CLASSES.PERMISSIONED_GREEN : ROUTE_CLASSES.UNKNOWN_FAIL_CLOSED, permitted: ok, executable: false, blockers: ok ? [] : uniq([...(r.reasons || []), ...(r.unmet || [])]), costCents: Number.isFinite(Number(r.costCents)) ? Number(r.costCents) : null, founderMinutes: Number(r.founderMinutes || 0), contactPrivacyClass: 'COMPANY_LEVEL', createsConsent: r.createsConsent === true, uncertainty: ok ? 0.2 : 1, evidenceRefs: {} });
      } else if (['POSTAL_LETTER', 'INBOUND_CONTENT'].includes(r.channel) && r.state === 'ALLOW') {
        fallbacks.push({ channel: 'CONSENT_ACQUISITION', via: r.channel, costCents: Number.isFinite(Number(r.costCents)) ? Number(r.costCents) : null, createsConsent: r.createsConsent === true, note: 'creates permission; not a first-touch sales route' });
      }
    }
  }
  if (!green) routes.push({ routeId: 'fallback:CONSENT_ACQUISITION', channel: 'CONSENT_ACQUISITION', routeClass: ROUTE_CLASSES.CONSENT_REQUIRED, permitted: false, executable: false, blockers: ['consent-acquisition-creates-permission-and-is-not-a-first-touch-sales-route'], costCents: null, founderMinutes: 0, contactPrivacyClass: 'COMPANY_LEVEL', uncertainty: 1, evidenceRefs: {} });

  const tournament = rankRoutes(routes, input.economics || {});

  // 11. Effect binding + digest
  const recipientDigest = sha(email);
  const effectBinding = green ? {
    version: GLOBAL_GREEN_LANE_ROUTER_VERSION,
    routeClass: finalClass,
    channel: tournament.selected?.channel || emailChannel,
    recipientJurisdiction: J,
    recipientType,
    recipientDigest,
    legalFormDigest: legalForm.evidenceDigest,
    invitationEvidenceDigest: invitation.invited ? invitation.evidenceDigest : null,
    contactSourceBindingDigest: sourceBinding.bindingDigest,
    policyEvidenceDigest: policy.evidenceDigest,
    policyEvidence: policy.evidence,
    eligibilityEvidenceId: eligibility.evidenceId,
    historyReceiptDigest: history?.receiptDigest || null,
    routePolicyVersion: GLOBAL_GREEN_LANE_ROUTER_VERSION
  } : null;
  const routeDigest = canonicalSha256({ version: GLOBAL_GREEN_LANE_ROUTER_VERSION, state, routeClass: finalClass, provisionalRouteClass, jurisdiction: J, recipientDigest, effectBinding, blockers: uniq(reasons).sort() });

  return {
    version: GLOBAL_GREEN_LANE_ROUTER_VERSION,
    evaluatedAt: now.toISOString(),
    objective,
    state,
    routeClass: finalClass,
    provisionalRouteClass,
    green,
    sendReady: false,
    selected: tournament.selected,
    selectedExecutable: tournament.selectedExecutable,
    fallbacks,
    routes: [...tournament.ranked, ...tournament.unranked],
    blockers: uniq(reasons),
    policyRefreshRequired: state === ROUTE_STATES.POLICY_REFRESH_REQUIRED ? policy.refreshRequired : [],
    policyEvidence: { state: policy.state, requiredRules, evidence: policy.evidence, evidenceDigest: policy.evidenceDigest },
    jurisdiction,
    legalForm,
    inbox,
    invitation,
    contactSource: sourceBinding,
    eligibility: { decision: eligibility.decision, basis: eligibility.basis, reasonCodes: eligibility.reasonCodes, requirements: eligibility.requirements, routeTimeUnmet, effectTimeUnmet, evidenceId: eligibility.evidenceId, evaluationScope: eligibility.evaluationScope, senderSideEvaluated: eligibility.senderSideEvaluated },
    senderSide,
    governanceGate: { provider: providerId, routeType: 'PUBLIC_BUSINESS_CONTACT', refused: governance.ok !== true, reason: governance.reason },
    sendPrerequisites: prereq,
    effectBinding,
    routeDigest,
    greenIsNotSendAuthority: true,
    sendAuthority: false,
    externalEffectAuthority: 'NONE',
    externalEffects: 0,
    externalEffectLedger: zeroLedger(),
    truthBoundary: 'GREEN means the route has the policy/evidence prerequisites to proceed to normal effect authorization. It is never send authority: suppression, history, identity, sender, provider terms, governance, a complete effect package and a valid founder-signed authorization all remain separate and required. The router evaluates the reviewed recipient-side rules, reports the sender side without resolving it, and fails closed on anything unknown.'
  };
}

function suppressionDominates(s) {
  return s?.suppressed === true || s?.unsubscribed === true || s?.complained === true || s?.hardBounced === true;
}

/* -------------------------------------------------------------------------- */
/* Effect binding verification (for the future governed dispatch path)         */
/* -------------------------------------------------------------------------- */

/**
 * Any mutation after approval invalidates approval: re-derive the binding from
 * a fresh decision and require exact equality with the one bound into the
 * effect package. Intended for the governed dispatch step; wiring it into
 * dispatch is a separate, human-authorized change (cold dispatch stays closed).
 */
export function verifyRouteEffectBinding({ bound, current } = {}) {
  if (!bound || typeof bound !== 'object') return { ok: false, reason: 'route-binding-missing' };
  if (!current || current.green !== true || !current.effectBinding) return { ok: false, reason: 'route-no-longer-green' };
  const a = canonicalSha256(bound);
  const b = canonicalSha256(current.effectBinding);
  return a === b ? { ok: true, bindingDigest: a } : { ok: false, reason: 'route-binding-changed-since-approval', bound: a, current: b };
}

/* -------------------------------------------------------------------------- */
/* Multi-jurisdiction matrix                                                   */
/* -------------------------------------------------------------------------- */

export const MATRIX_JURISDICTIONS = Object.freeze(['GB', 'US', 'CA', 'AU', 'SG', 'AE', 'EG', 'UNKNOWN']);

/**
 * What the router can represent per jurisdiction right now, and whether its
 * permissive rule evidence is fresh. A jurisdiction with no encoded cold rule can
 * never go green however much evidence exists.
 */
export function compileJurisdictionMatrix({ policyRegistry, now = new Date() } = {}) {
  const registry = policyRegistry || createPolicyEvidenceRegistry({ rows: [], now });
  const coverage = recipientEligibilityCoverage();
  const encoded = new Set(coverage.coldRecipientJurisdictionsEncoded);
  const rows = MATRIX_JURISDICTIONS.map(code => {
    const ruleId = recipientRuleIdFor(code);
    const spec = POLICY_RULE_CATALOG.find(r => r.ruleId === ruleId);
    const ev = registry.resolveRule(ruleId, now);
    const ruleLogic = code === 'UNKNOWN' ? 'FAIL_CLOSED' : ['GB', 'US'].includes(code) ? 'OPT_OUT_OR_CORPORATE_SUBSCRIBER_RULE' : ['CA', 'AU'].includes(code) ? 'CONSPICUOUS_PUBLICATION_RULE' : encoded.has(code) ? 'HOLD_OR_REJECT_RULE' : 'NOT_ENCODED';
    const canBeGreen = ['GB', 'US', 'CA', 'AU'].includes(code);
    return {
      jurisdiction: code, recipientRuleId: ruleId, ruleLogic, canBeGreen,
      permissiveRuleEvidenceState: canBeGreen ? ev.state : 'NOT_APPLICABLE',
      permissiveRuleFresh: canBeGreen ? ev.fresh : null,
      highestReachableClassToday: !canBeGreen ? (code === 'SA' ? ROUTE_CLASSES.CONSENT_REQUIRED : code === 'UNKNOWN' ? ROUTE_CLASSES.UNKNOWN_FAIL_CLOSED : ROUTE_CLASSES.CONDITIONAL) : (ev.fresh ? 'GREEN_WHEN_ALL_FACTS_HOLD' : POLICY_REFRESH_REQUIRED),
      requiresLegalFormEvidence: LEGAL_FORM_REQUIRED_JURISDICTIONS.includes(code),
      seedSourceUrl: spec?.seedSourceUrl || null
    };
  });
  return { version: GLOBAL_GREEN_LANE_ROUTER_VERSION, evaluatedAt: new Date(now).toISOString(), rows, sendAuthority: false, externalEffectAuthority: 'NONE', externalEffectLedger: zeroLedger(), truthBoundary: 'No jurisdiction is claimed solved. Only jurisdictions whose rule logic is encoded in the reviewed eligibility compiler can ever be green, and only with fresh evidence.' };
}
