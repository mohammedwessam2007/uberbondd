// INVITED-CONTACT CLASSIFIER.
//
// A genuine public invitation ("business enquiries welcome", "send us
// proposals", a supplier-registration or procurement page, an RFP notice) makes
// a first contact far more welcome than a cold one. This classifier decides,
// from specific evidence, whether such an invitation exists, what it covers,
// and whether the message we would send fits inside that scope.
//
//   * A generic "Contact Us" page alone is NOT an invitation.
//   * An invitation to ask about THEIR products or events ("email us for more
//     information about the webinar") is not an invitation to be pitched.
//   * An explicit no-solicitation / no-vendor / no-agency statement beats any
//     invitation text on the same evidence.
//   * Evidence needs an exact https source, a capture time, the verbatim text,
//     and must not be stale. Text that tries to instruct an AI reader is
//     treated as an attack, not as evidence (prompt-injection guard).
//
// An invitation can only raise a route's priority; it is not legal consent and
// cannot lift a jurisdiction's rule (the router still evaluates the law).
// Pure and read-only; grants no send authority.

import { sha256 as canonicalSha256 } from './omnia-v9/canonical.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const INVITED_CONTACT_CLASSIFIER_VERSION = 'uberbond.invited-contact-classifier.v1';
export const INVITATION_MAX_AGE_DAYS = 90;

export const INVITATION_CLASSES = Object.freeze({
  INVITED_STRONG: 'INVITED_STRONG',
  INVITED_MODERATE: 'INVITED_MODERATE',
  NOT_INVITED: 'NOT_INVITED',
  NEGATIVE_SIGNAL: 'NEGATIVE_SIGNAL',
  EVIDENCE_REJECTED: 'EVIDENCE_REJECTED'
});

export const INVITATION_SCOPES = Object.freeze(['VENDOR_SUPPLIER', 'PARTNERSHIP', 'PROPOSALS', 'PROCUREMENT', 'AGENCY', 'COMMERCIAL', 'GENERAL_BUSINESS', 'BUSINESS_DEVELOPMENT', 'SUBJECT_SPECIFIC', 'INFORMATION_ABOUT_OWN_OFFERING']);

// Scopes whose invitation covers an unsolicited vendor/partner proposal. An
// invitation for information about THEIR offering is deliberately absent.
const PITCH_COVERING_SCOPES = new Set(['VENDOR_SUPPLIER', 'PARTNERSHIP', 'PROPOSALS', 'PROCUREMENT', 'AGENCY', 'COMMERCIAL', 'GENERAL_BUSINESS', 'BUSINESS_DEVELOPMENT']);

// [scope, strength, pattern]. STRONG = explicitly solicits what we would send.
const INVITATION_ATOMS = Object.freeze([
  ['PROPOSALS', 'STRONG', /\bsend (?:us )?(?:your |any |all )?(?:proposals?|pitches|offers)\b|\bsubmit (?:a |your )?proposals?\b|\bwe (?:welcome|accept|invite) (?:unsolicited )?(?:proposals?|pitches)\b/i],
  ['PROCUREMENT', 'STRONG', /\b(?:rfp|rfq|rfi)s?\b|\brequests? for (?:proposals?|quotes?|quotations?|information)\b|\bprocurement (?:portal|team|enquir|inquir)/i],
  ['VENDOR_SUPPLIER', 'STRONG', /\b(?:vendor|supplier)s? (?:enquir(?:y|ies)|inquir(?:y|ies)|registration|onboarding|portal|applications?)\b|\bbecome (?:a|our) (?:vendor|supplier)\b|\bregister as (?:a )?(?:vendor|supplier)\b|\bsupplier registration\b/i],
  ['PARTNERSHIP', 'STRONG', /\bpartnerships?\s+(?:enquir(?:y|ies)|inquir(?:y|ies)|opportunit(?:y|ies)|contact)\b|\bpartner with us\b|\binterested in partnering\b|\bbecome a partner\b/i],
  ['AGENCY', 'STRONG', /\bagency (?:enquir(?:y|ies)|inquir(?:y|ies)|partners?|partnerships?)\b|\bagencies?,? (?:get in touch|contact us|reach out)\b/i],
  ['COMMERCIAL', 'MODERATE', /\bcommercial (?:enquir(?:y|ies)|inquir(?:y|ies))\b|\bbusiness development\b|\bbizdev\b/i],
  ['GENERAL_BUSINESS', 'MODERATE', /\bbusiness (?:enquir(?:y|ies)|inquir(?:y|ies))(?: (?:are|is))? (?:welcome|encouraged|invited)\b|\b(?:welcome|encourage|invite)s? business (?:enquir(?:y|ies)|inquir(?:y|ies))\b|\bfor business (?:enquir(?:y|ies)|inquir(?:y|ies))\b/i],
  ['GENERAL_BUSINESS', 'MODERATE', /\bwork with us\b|\bwant to work with (?:us|[a-z]+)\b|\bget in touch (?:about|regarding) (?:a )?(?:collaborat|opportunit)/i],
  ['SUBJECT_SPECIFIC', 'MODERATE', /\b(?:email|e-mail|contact) (?:us|[a-z]+) (?:regarding|about|re:?) ([^.\n]{3,80})/i],
  ['INFORMATION_ABOUT_OWN_OFFERING', 'WEAK', /\b(?:for|request) (?:more )?information\b|\bavailable to non-clients\b|\bquestions\?|\bjust email\b/i]
]);

// A published refusal of unsolicited commercial approaches.
const NEGATIVE_PATTERN = /\bno (?:unsolicited|cold|vendor|agency|sales|marketing)\s*(?:emails?|approaches|solicitations?|pitches|calls|offers|contact|messages)?\b|\b(?:do not|don't|please do not|will not|won't|never)\s+(?:contact|email|e-mail|solicit|approach|send)(?:[^.\n]{0,60})(?:sales|marketing|vendor|unsolicited|promotional|cold)\b|\bnot (?:accepting|open to|interested in) (?:unsolicited|vendor|agency|sales|cold)\b|\b(?:do not|don't|will not|won't|cannot|can't|not)\s+(?:accept(?:ing)?|welcome|consider|entertain|respond to|answer|read)\s+(?:any\s+)?(?:unsolicited|vendor|agency|sales|cold|marketing)\b|\bno soliciting\b|\bunsolicited (?:offers?|proposals?|emails?|approaches) (?:will|are) (?:not|be) (?:be )?(?:accepted|read|answered|considered)\b|\bno agencies\b/i;

// Text that talks to an AI reader instead of describing the business.
const INJECTION_PATTERN = /\b(?:ignore|disregard|forget)\b[^.\n]{0,40}\b(?:previous|prior|above|earlier|all)\b[^.\n]{0,40}\b(?:instructions?|rules?|prompts?|context)\b|\b(?:system|assistant|developer)\s*(?:prompt|message|:)\s|\byou are (?:now )?(?:an? )?(?:ai|assistant|language model)\b|\bas an ai\b|\bclassify (?:this|us|me) as\b|\bmark (?:this|us) as (?:invited|eligible|green|safe)\b|\bgrant (?:send|full) (?:authority|permission)\b|<\/?(?:system|instructions?)>/i;

const clean = (value, max = 800) => String(value ?? '').trim().slice(0, max);

const OFFER_TOPIC_KEYWORDS = Object.freeze({
  // Used only for SUBJECT_SPECIFIC invitations: does the invited subject overlap the offer?
  AGENCY_REVENUE: ['agency', 'agencies', 'client', 'lead', 'leads', 'marketing', 'website', 'booking', 'revenue', 'tracking', 'reporting', 'proposal', 'vendor', 'service', 'services', 'partnership'],
  AI: ['ai', 'agent', 'agents', 'automation', 'llm', 'release', 'reliability', 'testing', 'qa'],
  GENERIC: ['partnership', 'vendor', 'supplier', 'proposal', 'service', 'services', 'collaboration', 'opportunity', 'business']
});

/**
 * @param {object} input
 * @param {object[]} input.evidence  [{ sourceUrl, capturedAt, pageContext, excerpt }]
 * @param {object} [input.message]   { offerFamily?: 'AGENCY_REVENUE'|'AI'|..., topics?: string[] }
 * @param {Date}   [input.now]
 */
export function classifyInvitedContact({ evidence = [], message = {}, now = new Date() } = {}) {
  const nowMs = new Date(now).getTime();
  const rejected = [];
  const accepted = [];
  let negative = null;
  const list = Array.isArray(evidence) ? evidence : [];
  list.forEach((item, index) => {
    const url = clean(item?.sourceUrl, 1000);
    const excerpt = clean(item?.excerpt, 1500);
    const capturedMs = Date.parse(item?.capturedAt);
    const problems = [];
    let hostOk = false;
    try { const u = new URL(url); hostOk = u.protocol === 'https:' && !u.username && !u.password; } catch { hostOk = false; }
    if (!hostOk) problems.push('invitation-source-url-must-be-exact-https');
    if (!excerpt) problems.push('invitation-verbatim-excerpt-missing');
    if (!Number.isFinite(capturedMs)) problems.push('invitation-capture-time-missing');
    else if (capturedMs > nowMs + 5 * 60_000) problems.push('invitation-capture-time-in-future');
    else if (nowMs - capturedMs > INVITATION_MAX_AGE_DAYS * 86_400_000) problems.push('invitation-evidence-stale');
    if (excerpt && INJECTION_PATTERN.test(excerpt)) problems.push('invitation-text-attempts-to-instruct-the-reader');
    if (excerpt && NEGATIVE_PATTERN.test(excerpt)) negative = negative || { index, reason: 'explicit-no-solicitation-statement-on-invitation-evidence' };
    if (problems.length) { rejected.push({ index, reasons: problems }); return; }
    const atoms = INVITATION_ATOMS.filter(([, , pattern]) => pattern.test(excerpt)).map(([scope, strength]) => ({ scope, strength }));
    accepted.push({ index, sourceUrl: url, capturedAt: new Date(capturedMs).toISOString(), pageContext: clean(item?.pageContext, 60) || null, excerptDigest: canonicalSha256(excerpt), excerpt, atoms });
  });

  const atoms = accepted.flatMap(item => item.atoms.map(atom => ({ ...atom, evidenceIndex: item.index })));
  const reasons = [];
  let classification;
  let strength = 0;
  const scopes = [...new Set(atoms.map(a => a.scope))];
  const topics = (Array.isArray(message.topics) ? message.topics : []).map(t => clean(t, 40).toLowerCase()).filter(Boolean);
  const keywords = new Set([...(OFFER_TOPIC_KEYWORDS[message.offerFamily] || []), ...OFFER_TOPIC_KEYWORDS.GENERIC, ...topics]);

  // Does the invited scope cover the message we would send?
  const fitting = atoms.filter(atom => {
    if (PITCH_COVERING_SCOPES.has(atom.scope)) return true;
    if (atom.scope === 'SUBJECT_SPECIFIC') {
      const text = accepted.find(a => a.index === atom.evidenceIndex)?.excerpt.toLowerCase() || '';
      const match = text.match(/(?:regarding|about|re:?) ([^.\n]{3,80})/);
      return Boolean(match) && [...keywords].some(k => match[1].includes(k));
    }
    return false;
  });
  const fitsScope = fitting.length > 0;

  if (negative) {
    classification = INVITATION_CLASSES.NEGATIVE_SIGNAL;
    reasons.push(negative.reason);
  } else if (!accepted.length) {
    classification = list.length ? INVITATION_CLASSES.EVIDENCE_REJECTED : INVITATION_CLASSES.NOT_INVITED;
    reasons.push(list.length ? 'all-invitation-evidence-rejected' : 'no-invitation-evidence');
  } else if (!atoms.length) {
    classification = INVITATION_CLASSES.NOT_INVITED;
    reasons.push('no-invitation-language-generic-contact-text-is-not-an-invitation');
  } else if (!fitsScope) {
    classification = INVITATION_CLASSES.NOT_INVITED;
    reasons.push('invited-scope-does-not-cover-the-proposed-message');
  } else if (fitting.some(a => a.strength === 'STRONG')) {
    classification = INVITATION_CLASSES.INVITED_STRONG;
    strength = 1;
    reasons.push('explicit-invitation-covering-the-message-scope');
  } else {
    classification = INVITATION_CLASSES.INVITED_MODERATE;
    strength = 0.6;
    reasons.push('invitation-language-covering-the-message-scope');
  }

  const seed = { version: INVITED_CONTACT_CLASSIFIER_VERSION, classification, scopes, evidence: accepted.map(a => ({ url: a.sourceUrl, capturedAt: a.capturedAt, digest: a.excerptDigest })) };
  return {
    version: INVITED_CONTACT_CLASSIFIER_VERSION,
    classification,
    invited: classification === INVITATION_CLASSES.INVITED_STRONG || classification === INVITATION_CLASSES.INVITED_MODERATE,
    invitationStrength: strength,
    scopes,
    fitsScope,
    matchedAtoms: atoms.map(({ scope, strength: s }) => ({ scope, strength: s })),
    evidence: accepted.map(({ index, sourceUrl, capturedAt, pageContext, excerptDigest }) => ({ index, sourceUrl, capturedAt, pageContext, excerptDigest })),
    rejectedEvidence: rejected,
    negativeSignal: Boolean(negative),
    reasons,
    evidenceDigest: canonicalSha256(seed),
    invitationIsLegalConsent: false,
    sendAuthority: false,
    externalEffectAuthority: 'NONE',
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS)
  };
}
