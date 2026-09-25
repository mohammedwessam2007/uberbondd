// UberOutbound recipient eligibility compiler.
//
// The final launch gate (src/outreach-launch-gate.mjs) hard-stops every
// recipient whose `legal.status` is not PASSED, and until now nothing in the
// repository produced that decision from facts: the jurisdiction matrix in
// src/uberoutbound-policy-registry.mjs is data, and compileOutboundLegalEvidence
// in src/uberoutbound-genome.mjs only records a decision somebody else made.
// This module is the missing interpreter.
//
// It replaces blanket refusal with precise per-recipient decisions, not with
// permission. Every ALLOW names the rule it relies on and the obligations the
// message must carry; every REJECT names the rule that forbids it; anything
// the encoded rules do not settle is HOLD_FOR_REVIEW for a human. It never
// sends, never creates campaign authority, and never overrides suppression.
//
// UberDoso's permissioned-relationship policy (src/uberdoso-delivery-policy.mjs)
// is untouched: it still governs the UberDoso cell's own traffic classes.

import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const RECIPIENT_ELIGIBILITY_POLICY_VERSION = 'uberbond.recipient-eligibility.v1';

export const ELIGIBILITY_DECISIONS = Object.freeze({
  ALLOW: 'ALLOW',
  ALLOW_WITH_REQUIREMENTS: 'ALLOW_WITH_REQUIREMENTS',
  HOLD_FOR_REVIEW: 'HOLD_FOR_REVIEW',
  REJECT: 'REJECT'
});

export const RECIPIENT_TYPES = Object.freeze(['CORPORATE', 'GOVERNMENT', 'SOLE_TRADER_OR_PARTNERSHIP', 'INDIVIDUAL_CONSUMER', 'UNKNOWN']);
export const CONTACT_SOURCE_KINDS = Object.freeze(['PUBLISHED_BUSINESS_CONTACT', 'OWNER_IMPORTED', 'LICENSED_DATA', 'INBOUND_REQUEST', 'REFERRAL_WITH_INTRODUCTION', 'GUESSED_PATTERN', 'UNKNOWN']);
export const COLLECTION_METHODS = Object.freeze(['MANUAL', 'AUTOMATED_CRAWLER', 'IMPORTED', 'PROVIDER_API', 'UNKNOWN']);
export const RELATIONSHIPS = Object.freeze(['NONE', 'EXPLICIT_OPT_IN', 'USER_INITIATED', 'TRANSACTIONAL', 'EXISTING_CUSTOMER']);
export const TRANSPORT_COLD_RULES = Object.freeze(['ALLOWED', 'CONSENT_REQUIRED', 'PROHIBITED', 'UNKNOWN']);

export const DEFAULT_MAX_PROVENANCE_AGE_DAYS = 180;

const SOURCES = Object.freeze({
  FTC_CAN_SPAM: 'https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business',
  ICO_B2B: 'https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/business-to-business-marketing/',
  ICO_PECR_EMAIL: 'https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-direct-marketing-using-electronic-mail/how-do-we-comply-with-the-pecr-electronic-mail-marketing-rules/',
  CRTC_IMPLIED_CONSENT: 'https://crtc.gc.ca/eng/com500/guide.htm',
  ACMA_AVOID_SPAM: 'https://www.acma.gov.au/avoid-sending-spam',
  DE_UWG_7: 'https://www.gesetze-im-internet.de/uwg_2004/__7.html',
  CH_UWG_3: 'https://www.fedlex.admin.ch/eli/cc/1988/223_223_223/en',
  EG_PDPL_151_2020: 'https://mcit.gov.eg/Upcont/Documents/Reports%20and%20Documents_1232021000_Law_No_151_2020_Personal_Data_Protection.pdf',
  UBEROUTBOUND_LEGAL_MATRIX: 'src/uberoutbound-policy-registry.mjs#UBEROUTBOUND_LEGAL_MATRIX'
});

// Obligations an ALLOW_WITH_REQUIREMENTS decision can attach. Each is checked
// against supplied sender/message facts; an unmet one keeps the decision from
// becoming a PASSED legal status.
export const ELIGIBILITY_REQUIREMENTS = Object.freeze({
  SENDER_POSTAL_IDENTITY: 'SENDER_POSTAL_IDENTITY',
  TRUTHFUL_SENDER_HEADERS: 'TRUTHFUL_SENDER_HEADERS',
  NON_DECEPTIVE_SUBJECT: 'NON_DECEPTIVE_SUBJECT',
  ADVERTISEMENT_IDENTIFICATION: 'ADVERTISEMENT_IDENTIFICATION',
  FUNCTIONAL_UNSUBSCRIBE: 'FUNCTIONAL_UNSUBSCRIBE',
  SENDER_CONTACT_METHOD: 'SENDER_CONTACT_METHOD',
  LEGITIMATE_INTERESTS_ASSESSMENT: 'LEGITIMATE_INTERESTS_ASSESSMENT',
  PRIVACY_NOTICE: 'PRIVACY_NOTICE',
  PUBLICATION_EVIDENCE_RETAINED: 'PUBLICATION_EVIDENCE_RETAINED'
});
const R = ELIGIBILITY_REQUIREMENTS;

// Senders whose own law this module encodes as adding no restriction beyond
// the recipient-side rules for B2B email. Any other sender jurisdiction holds
// cold traffic for review: the sender's home law applies to it too.
const SENDER_RULES = Object.freeze({
  US: { state: 'RECIPIENT_RULES_GOVERN' },
  GB: { state: 'RECIPIENT_RULES_GOVERN' },
  CA: { state: 'RECIPIENT_RULES_GOVERN' },
  AU: { state: 'RECIPIENT_RULES_GOVERN' },
  EG: { state: 'HOLD', reason: 'sender-jurisdiction-eg-pdpl-electronic-marketing-consent-and-licence-review-required', source: SOURCES.EG_PDPL_151_2020 },
  SA: { state: 'HOLD', reason: 'sender-jurisdiction-sa-direct-marketing-review-required', source: SOURCES.UBEROUTBOUND_LEGAL_MATRIX },
  AE: { state: 'HOLD', reason: 'sender-jurisdiction-ae-campaign-specific-legal-review-required', source: SOURCES.UBEROUTBOUND_LEGAL_MATRIX }
});

const EU_EEA = new Set(['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO']);

const PERSONAL_MAILBOX_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'rocketmail.com', 'hotmail.com', 'outlook.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'pm.me', 'gmx.com', 'gmx.net', 'gmx.de', 'web.de',
  'mail.com', 'yandex.com', 'yandex.ru', 'mail.ru', 'qq.com', '163.com', '126.com', 'zoho.com', 'tutanota.com', 'tuta.io', 'hey.com'
]);
const PERSONAL_MAILBOX_PATTERN = /^(yahoo|hotmail|outlook|live)\.[a-z.]{2,6}$/;
const SYSTEM_LOCAL_PARTS = new Set(['noreply', 'no-reply', 'donotreply', 'do-not-reply', 'postmaster', 'abuse', 'hostmaster', 'mailer-daemon', 'bounce', 'bounces', 'unsubscribe']);
const ROLE_LOCAL_PARTS = new Set(['info', 'sales', 'hello', 'contact', 'office', 'admin', 'enquiries', 'enquiry', 'inquiries', 'inquiry', 'support', 'team', 'marketing', 'partnerships', 'partners', 'business', 'press', 'media', 'bizdev', 'growth', 'ops', 'operations', 'finance', 'accounts', 'billing', 'help', 'service', 'studio', 'agency', 'mail', 'general']);

// Largest number of business days a jurisdiction allows between an opt-out and
// it taking effect. Where the law says "promptly" the strictest encoded figure
// is used rather than an invented one.
const OPT_OUT_BUSINESS_DAYS = Object.freeze({ US: 10, CA: 10, AU: 5 });

const clean = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
const upper = (value, max = 80) => clean(value, max).toUpperCase();
const sha256 = value => crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
const zeroLedger = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const enumOf = (value, allowed, fallback) => {
  const v = upper(value);
  return allowed.includes(v) ? v : fallback;
};
const iso2 = value => {
  const v = upper(value, 8);
  if (v === 'UK') return 'GB';
  return /^[A-Z]{2}$/.test(v) ? v : '';
};

export function classifyRecipientAddress(value) {
  const address = clean(value, 320).toLowerCase();
  const match = address.match(/^([a-z0-9!#$%&'*+/=?^_`{|}~.-]+)@([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/);
  if (!match || match[1].startsWith('.') || match[1].endsWith('.') || match[1].includes('..')) {
    return { valid: false, addressClass: 'INVALID', domain: null };
  }
  const [, local, domain] = match;
  const base = local.split('+')[0];
  if (SYSTEM_LOCAL_PARTS.has(base)) return { valid: true, addressClass: 'SYSTEM_ADDRESS', domain };
  if (PERSONAL_MAILBOX_DOMAINS.has(domain) || PERSONAL_MAILBOX_PATTERN.test(domain)) return { valid: true, addressClass: 'PERSONAL_MAILBOX_PROVIDER', domain };
  if (ROLE_LOCAL_PARTS.has(base)) return { valid: true, addressClass: 'ROLE_BUSINESS_ADDRESS', domain };
  return { valid: true, addressClass: 'NAMED_OR_UNCLASSIFIED_BUSINESS_ADDRESS', domain };
}

function hold(reason, source) {
  return { decision: ELIGIBILITY_DECISIONS.HOLD_FOR_REVIEW, reasons: [reason], requirements: [], basis: null, sources: source ? [source] : [] };
}
function reject(reason, source) {
  return { decision: ELIGIBILITY_DECISIONS.REJECT, reasons: [reason], requirements: [], basis: null, sources: source ? [source] : [] };
}
function allowWith(basis, requirements, sources) {
  return { decision: ELIGIBILITY_DECISIONS.ALLOW_WITH_REQUIREMENTS, reasons: [], requirements: [...new Set(requirements)], basis, sources };
}

// Canada and Australia both infer consent from conspicuous publication only
// when the address was published, carried no statement refusing unsolicited
// messages, and the message is relevant to the recipient's business role.
function conspicuousPublicationFacts(ctx) {
  const { source, relevance } = ctx;
  if (source.kind !== 'PUBLISHED_BUSINESS_CONTACT') return { ok: false, reason: 'conspicuous-publication-source-required' };
  if (!/^https?:\/\//i.test(source.ref)) return { ok: false, reason: 'conspicuous-publication-url-required' };
  if (source.noSolicitationNoticePresent === true) return { ok: false, reject: true, reason: 'publication-carries-no-solicitation-statement' };
  if (source.noSolicitationNoticePresent !== false) return { ok: false, reason: 'no-solicitation-statement-absence-must-be-verified' };
  if (relevance.relatedToRecipientRole === false) return { ok: false, reject: true, reason: 'message-not-relevant-to-recipient-business-role' };
  if (relevance.relatedToRecipientRole !== true || !relevance.rationale) return { ok: false, reason: 'role-relevance-rationale-required' };
  return { ok: true };
}

const COLD_RULES = Object.freeze({
  US(ctx) {
    if (ctx.recipientType === 'INDIVIDUAL_CONSUMER') return reject('b2b-scope-excludes-consumer-recipient', SOURCES.FTC_CAN_SPAM);
    if (ctx.recipientType === 'UNKNOWN') return hold('recipient-business-context-required', SOURCES.FTC_CAN_SPAM);
    if (ctx.address.addressClass === 'PERSONAL_MAILBOX_PROVIDER') return hold('personal-mailbox-business-context-unverified', SOURCES.FTC_CAN_SPAM);
    // Collecting addresses by automated means from a site that says it does not
    // share them is an aggravated CAN-SPAM violation (15 U.S.C. 7704(b)(1)).
    if (ctx.source.collectionMethod === 'AUTOMATED_CRAWLER') {
      if (ctx.source.noHarvestNoticePresent === true) return reject('automated-collection-from-site-with-no-share-notice', SOURCES.FTC_CAN_SPAM);
      if (ctx.source.noHarvestNoticePresent !== false) return hold('automated-collection-no-share-notice-unverified', SOURCES.FTC_CAN_SPAM);
    }
    return allowWith('US_CAN_SPAM_OPT_OUT_REGIME', [
      R.SENDER_POSTAL_IDENTITY, R.TRUTHFUL_SENDER_HEADERS, R.NON_DECEPTIVE_SUBJECT, R.ADVERTISEMENT_IDENTIFICATION, R.FUNCTIONAL_UNSUBSCRIBE
    ], [SOURCES.FTC_CAN_SPAM]);
  },
  GB(ctx) {
    const sources = [SOURCES.ICO_B2B, SOURCES.ICO_PECR_EMAIL];
    if (ctx.recipientType === 'SOLE_TRADER_OR_PARTNERSHIP' || ctx.recipientType === 'INDIVIDUAL_CONSUMER') return reject('pecr-individual-subscriber-requires-consent-or-soft-opt-in', SOURCES.ICO_PECR_EMAIL);
    if (ctx.recipientType === 'UNKNOWN') return hold('pecr-subscriber-type-required', SOURCES.ICO_B2B);
    if (ctx.address.addressClass === 'PERSONAL_MAILBOX_PROVIDER') return hold('personal-mailbox-inconsistent-with-corporate-subscriber', SOURCES.ICO_B2B);
    const requirements = [R.SENDER_POSTAL_IDENTITY, R.TRUTHFUL_SENDER_HEADERS, R.FUNCTIONAL_UNSUBSCRIBE];
    // A named employee's work address is personal data under UK GDPR even
    // though PECR does not require consent for the corporate subscriber.
    if (ctx.address.addressClass !== 'ROLE_BUSINESS_ADDRESS') requirements.push(R.LEGITIMATE_INTERESTS_ASSESSMENT, R.PRIVACY_NOTICE);
    return allowWith('UK_PECR_CORPORATE_SUBSCRIBER', requirements, sources);
  },
  CA(ctx) {
    const facts = conspicuousPublicationFacts(ctx);
    if (!facts.ok) return facts.reject ? reject(`casl-${facts.reason}`, SOURCES.CRTC_IMPLIED_CONSENT) : hold(`casl-${facts.reason}`, SOURCES.CRTC_IMPLIED_CONSENT);
    return allowWith('CASL_IMPLIED_CONSENT_CONSPICUOUS_PUBLICATION', [
      R.SENDER_POSTAL_IDENTITY, R.SENDER_CONTACT_METHOD, R.TRUTHFUL_SENDER_HEADERS, R.FUNCTIONAL_UNSUBSCRIBE, R.PUBLICATION_EVIDENCE_RETAINED
    ], [SOURCES.CRTC_IMPLIED_CONSENT]);
  },
  AU(ctx) {
    if (ctx.source.collectionMethod === 'AUTOMATED_CRAWLER') return reject('spam-act-address-harvesting-software-prohibited', SOURCES.ACMA_AVOID_SPAM);
    const facts = conspicuousPublicationFacts(ctx);
    if (!facts.ok) return facts.reject ? reject(`spam-act-${facts.reason}`, SOURCES.ACMA_AVOID_SPAM) : hold(`spam-act-${facts.reason}`, SOURCES.ACMA_AVOID_SPAM);
    if (ctx.source.collectionMethod !== 'MANUAL') return hold('spam-act-manual-collection-evidence-required', SOURCES.ACMA_AVOID_SPAM);
    return allowWith('AU_SPAM_ACT_CONSPICUOUS_PUBLICATION', [
      R.SENDER_POSTAL_IDENTITY, R.SENDER_CONTACT_METHOD, R.TRUTHFUL_SENDER_HEADERS, R.FUNCTIONAL_UNSUBSCRIBE, R.PUBLICATION_EVIDENCE_RETAINED
    ], [SOURCES.ACMA_AVOID_SPAM]);
  },
  DE: () => reject('uwg-7-prior-express-consent-required-for-email-advertising', SOURCES.DE_UWG_7),
  CH: () => reject('uwg-art-3-consent-required-for-mass-electronic-advertising', SOURCES.CH_UWG_3),
  SA: () => reject('sa-default-deny-cold-direct-marketing-without-auditable-consent', SOURCES.UBEROUTBOUND_LEGAL_MATRIX),
  AE: () => hold('ae-campaign-specific-legal-review-required', SOURCES.UBEROUTBOUND_LEGAL_MATRIX),
  EG: () => hold('eg-consent-first-campaign-specific-review-required', SOURCES.EG_PDPL_151_2020)
});

function requirementSatisfaction(requirements, ctx) {
  const c = ctx.senderCompliance;
  const optOutLimit = OPT_OUT_BUSINESS_DAYS[ctx.recipientJurisdiction] ?? Math.min(...Object.values(OPT_OUT_BUSINESS_DAYS));
  const honorDays = Number(c.unsubscribeHonoredWithinBusinessDays);
  const checks = {
    [R.SENDER_POSTAL_IDENTITY]: ctx.postalIdentity?.ok === true && ctx.postalIdentity?.status === 'UBERPOSTAL_IDENTITY_READY' && Boolean(clean(ctx.postalIdentity?.identityDigest, 128)),
    [R.TRUTHFUL_SENDER_HEADERS]: c.truthfulFromAndReplyTo === true,
    [R.NON_DECEPTIVE_SUBJECT]: c.nonDeceptiveSubject === true,
    [R.ADVERTISEMENT_IDENTIFICATION]: c.advertisementDisclosure === true,
    [R.FUNCTIONAL_UNSUBSCRIBE]: c.unsubscribeMechanism === true && Number.isFinite(honorDays) && honorDays >= 0 && honorDays <= optOutLimit,
    [R.SENDER_CONTACT_METHOD]: Boolean(clean(c.contactMethod, 320)),
    [R.LEGITIMATE_INTERESTS_ASSESSMENT]: Boolean(clean(c.legitimateInterestsAssessmentRef, 1000)),
    [R.PRIVACY_NOTICE]: /^https:\/\//i.test(clean(c.privacyNoticeUrl, 1000)),
    [R.PUBLICATION_EVIDENCE_RETAINED]: Boolean(ctx.source.ref) && Boolean(ctx.source.observedAt)
  };
  const unmet = requirements.filter(req => checks[req] !== true);
  return { satisfied: requirements.filter(req => checks[req] === true), unmet };
}

/**
 * Decide whether one recipient may lawfully receive one class of message.
 *
 * Returns a decision plus a `legal` object shaped for evaluateOutreachLaunchGate.
 * `legal.status` is PASSED only for ALLOW / ALLOW_WITH_REQUIREMENTS decisions
 * whose every attached requirement is satisfied by the supplied facts.
 */
export function compileRecipientEligibility({
  recipient = {},
  relationship = 'NONE',
  relationshipEvidenceRef = '',
  source = {},
  offerRelevance = {},
  senderJurisdiction = '',
  senderCompliance = {},
  postalIdentity = null,
  transportColdB2BRule = 'UNKNOWN',
  suppression = {},
  maxProvenanceAgeDays = DEFAULT_MAX_PROVENANCE_AGE_DAYS,
  now = new Date()
} = {}) {
  const at = now instanceof Date ? now : new Date(now);
  const address = classifyRecipientAddress(recipient.email);
  const ctx = {
    address,
    recipientType: enumOf(recipient.type, RECIPIENT_TYPES, 'UNKNOWN'),
    recipientJurisdiction: iso2(recipient.jurisdiction),
    senderJurisdiction: iso2(senderJurisdiction),
    relationship: enumOf(relationship, RELATIONSHIPS, 'NONE'),
    relationshipEvidenceRef: clean(relationshipEvidenceRef, 1000),
    source: {
      kind: enumOf(source.kind, CONTACT_SOURCE_KINDS, 'UNKNOWN'),
      ref: clean(source.ref, 1000),
      observedAt: Number.isFinite(Date.parse(source.observedAt)) ? new Date(source.observedAt).toISOString() : '',
      collectionMethod: enumOf(source.collectionMethod, COLLECTION_METHODS, 'UNKNOWN'),
      noSolicitationNoticePresent: typeof source.noSolicitationNoticePresent === 'boolean' ? source.noSolicitationNoticePresent : null,
      noHarvestNoticePresent: typeof source.noHarvestNoticePresent === 'boolean' ? source.noHarvestNoticePresent : null
    },
    relevance: {
      relatedToRecipientRole: typeof offerRelevance.relatedToRecipientRole === 'boolean' ? offerRelevance.relatedToRecipientRole : null,
      rationale: clean(offerRelevance.rationale, 500)
    },
    senderCompliance: senderCompliance && typeof senderCompliance === 'object' ? senderCompliance : {},
    postalIdentity,
    transportColdB2BRule: enumOf(transportColdB2BRule, TRANSPORT_COLD_RULES, 'UNKNOWN')
  };

  const outcome = decide(ctx, suppression, at, maxProvenanceAgeDays);
  const { satisfied, unmet } = outcome.decision === ELIGIBILITY_DECISIONS.ALLOW_WITH_REQUIREMENTS
    ? requirementSatisfaction(outcome.requirements, ctx)
    : { satisfied: [], unmet: [] };
  const permitted = outcome.decision === ELIGIBILITY_DECISIONS.ALLOW || outcome.decision === ELIGIBILITY_DECISIONS.ALLOW_WITH_REQUIREMENTS;
  const legalStatus = !permitted
    ? (outcome.decision === ELIGIBILITY_DECISIONS.REJECT ? 'FAILED' : 'HOLD')
    : (unmet.length ? 'REQUIREMENTS_UNMET' : 'PASSED');

  const recipientDigest = sha256(clean(recipient.email, 320).toLowerCase());
  const seed = {
    policyVersion: RECIPIENT_ELIGIBILITY_POLICY_VERSION,
    recipientDigest,
    recipientType: ctx.recipientType,
    recipientJurisdiction: ctx.recipientJurisdiction || null,
    senderJurisdiction: ctx.senderJurisdiction || null,
    relationship: ctx.relationship,
    relationshipEvidenceRef: ctx.relationshipEvidenceRef || null,
    source: ctx.source,
    relevance: ctx.relevance,
    transportColdB2BRule: ctx.transportColdB2BRule,
    postalIdentityDigest: clean(postalIdentity?.identityDigest, 128) || null,
    decision: outcome.decision,
    basis: outcome.basis,
    requirements: outcome.requirements,
    unmet
  };
  const evidenceId = `ubelig_${sha256(JSON.stringify(seed))}`;

  return {
    ok: true,
    policyVersion: RECIPIENT_ELIGIBILITY_POLICY_VERSION,
    evidenceId,
    decidedAt: at.toISOString(),
    recipientDigest,
    addressClass: address.addressClass,
    recipientType: ctx.recipientType,
    recipientJurisdiction: ctx.recipientJurisdiction || null,
    senderJurisdiction: ctx.senderJurisdiction || null,
    relationship: ctx.relationship,
    decision: outcome.decision,
    basis: outcome.basis,
    reasonCodes: outcome.reasons,
    requirements: outcome.requirements,
    requirementsSatisfied: satisfied,
    requirementsUnmet: unmet,
    sources: outcome.sources,
    sendable: legalStatus === 'PASSED',
    legal: {
      status: legalStatus,
      eligible: legalStatus === 'PASSED',
      evidenceId,
      policyVersion: RECIPIENT_ELIGIBILITY_POLICY_VERSION,
      jurisdiction: ctx.recipientJurisdiction || null,
      basis: outcome.basis,
      recipientType: ctx.recipientType
    },
    sendAuthority: false,
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroLedger(),
    truthBoundary: 'This decision encodes published regulator guidance for the listed jurisdictions against the facts supplied. It is not legal advice, does not verify those facts, and grants no send, campaign or spend authority. Unencoded or uncertain situations hold for human review instead of being guessed. Suppression, provider terms, sender health and founder authorization remain separate gates.'
  };
}

function decide(ctx, suppression, at, maxProvenanceAgeDays) {
  if (!ctx.address.valid) return reject('recipient-address-invalid');
  if (suppression?.suppressed === true || suppression?.unsubscribed === true || suppression?.complained === true || suppression?.hardBounced === true) return reject('suppression-dominates');
  if (ctx.address.addressClass === 'SYSTEM_ADDRESS') return reject('system-address-not-a-marketing-recipient');
  if (ctx.source.kind === 'GUESSED_PATTERN') return reject('guessed-address-never-promoted-to-fact');
  if (ctx.source.kind === 'UNKNOWN') return hold('contact-provenance-required');
  if (!ctx.source.ref || !ctx.source.observedAt) return hold('contact-provenance-reference-and-observation-time-required');
  const ageDays = (at.getTime() - Date.parse(ctx.source.observedAt)) / 86400000;
  if (!Number.isFinite(ageDays) || ageDays < -1) return hold('contact-provenance-observed-in-future');
  if (ageDays > Math.max(1, Number(maxProvenanceAgeDays) || DEFAULT_MAX_PROVENANCE_AGE_DAYS)) return hold('contact-provenance-stale');
  if (!ctx.recipientJurisdiction) return hold('recipient-jurisdiction-required');

  if (ctx.relationship !== 'NONE') {
    if (!ctx.relationshipEvidenceRef) return hold('relationship-evidence-required');
    const requirements = ctx.relationship === 'TRANSACTIONAL'
      ? [R.TRUTHFUL_SENDER_HEADERS]
      : [R.SENDER_POSTAL_IDENTITY, R.TRUTHFUL_SENDER_HEADERS, R.FUNCTIONAL_UNSUBSCRIBE];
    return allowWith(`PERMISSIONED_${ctx.relationship}`, requirements, []);
  }

  // Everything below is unsolicited (cold) business email.
  if (ctx.transportColdB2BRule === 'PROHIBITED' || ctx.transportColdB2BRule === 'CONSENT_REQUIRED') return reject('transport-provider-terms-forbid-cold-b2b');
  if (ctx.transportColdB2BRule !== 'ALLOWED') return hold('transport-provider-cold-b2b-rule-unknown');
  if (!ctx.senderJurisdiction) return hold('sender-jurisdiction-required');
  const senderRule = SENDER_RULES[ctx.senderJurisdiction];
  if (!senderRule) return hold('sender-jurisdiction-rule-not-encoded');
  if (senderRule.state === 'HOLD') return hold(senderRule.reason, senderRule.source);

  const rule = COLD_RULES[ctx.recipientJurisdiction];
  if (rule) return rule(ctx);
  if (EU_EEA.has(ctx.recipientJurisdiction)) return hold('eu-eea-national-eprivacy-implementation-review-required');
  return hold('recipient-jurisdiction-rule-not-encoded');
}

/** Decide a batch and summarize it without exposing raw addresses. */
export function compileRecipientEligibilityPortfolio({ recipients = [], context = {}, now = new Date() } = {}) {
  const rows = (Array.isArray(recipients) ? recipients : []).map(entry => compileRecipientEligibility({
    ...context,
    ...entry,
    senderCompliance: { ...(context.senderCompliance || {}), ...(entry.senderCompliance || {}) },
    now
  }));
  const count = predicate => rows.filter(predicate).length;
  const reasons = {};
  for (const row of rows) for (const code of [...row.reasonCodes, ...row.requirementsUnmet.map(r => `unmet:${r}`)]) reasons[code] = (reasons[code] || 0) + 1;
  return {
    ok: true,
    policyVersion: RECIPIENT_ELIGIBILITY_POLICY_VERSION,
    total: rows.length,
    passed: count(r => r.legal.status === 'PASSED'),
    requirementsUnmet: count(r => r.legal.status === 'REQUIREMENTS_UNMET'),
    held: count(r => r.legal.status === 'HOLD'),
    rejected: count(r => r.legal.status === 'FAILED'),
    reasonHistogram: Object.fromEntries(Object.entries(reasons).sort((a, b) => b[1] - a[1])),
    decisions: rows,
    sendAuthority: false,
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroLedger()
  };
}

/** What this policy version encodes, so operators can see its edges. */
export function recipientEligibilityCoverage() {
  return {
    policyVersion: RECIPIENT_ELIGIBILITY_POLICY_VERSION,
    coldRecipientJurisdictionsEncoded: Object.keys(COLD_RULES).sort(),
    euEeaDefault: 'HOLD_FOR_REVIEW',
    unencodedRecipientDefault: 'HOLD_FOR_REVIEW',
    senderJurisdictions: Object.fromEntries(Object.entries(SENDER_RULES).map(([code, rule]) => [code, rule.state])),
    unencodedSenderDefault: 'HOLD_FOR_REVIEW',
    permissionedRelationships: RELATIONSHIPS.filter(r => r !== 'NONE'),
    maxProvenanceAgeDaysDefault: DEFAULT_MAX_PROVENANCE_AGE_DAYS,
    sources: { ...SOURCES }
  };
}
