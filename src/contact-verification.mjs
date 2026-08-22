// Contact route verification.
//
// Deliverability vendors answer a binary question -- does this mailbox exist?
// -- and the binary answer is the smaller half of what a sender needs. A
// catch-all domain accepts everything and proves nothing. A temporary failure
// is not an invalid address. A verdict from six months ago is not a verdict
// about today. And none of it says anything about whether this person wants
// to hear from us, which is the only question that can actually get us into
// trouble.
//
// So verification here is a state with an expiry and a provenance, and it sits
// strictly below suppression: no verifier result, however fresh and however
// confident, can put a suppressed address back into a send.

import { evidenceStrength, isSendableEvidenceClass, cappedConfidence } from './prospect-evidence.mjs';

export const CONTACT_VERIFICATION_POLICY_VERSION = 'contact-verification-1.0.0';

export const VERIFICATION_STATES = Object.freeze([
  'VALID',
  'INVALID',
  'CATCH_ALL',
  'RISKY',
  'UNKNOWN',
  'TEMPORARY_FAILURE',
  'SUPPRESSED',
  'STALE'
]);

// Only these two ever permit a consequential send, and only with everything
// else also satisfied. CATCH_ALL is deliberately absent: a domain that accepts
// every address has told us nothing about this one.
const SENDABLE_STATES = new Set(['VALID']);
const CONDITIONAL_STATES = new Set(['CATCH_ALL', 'RISKY']);

export const SUPPRESSION_REASONS = Object.freeze([
  'UNSUBSCRIBED',
  'COMPLAINED',
  'HARD_BOUNCED',
  'MANUAL_SUPPRESSION',
  'ROUTE_INVALID'
]);

const DAY_MS = 24 * 60 * 60 * 1000;

// How long a verdict is worth anything. A definite negative ages slowly -- a
// mailbox that does not exist rarely starts existing -- while an affirmative
// ages fast, because people leave jobs.
const DEFAULT_TTL_MS = Object.freeze({
  VALID: 30 * DAY_MS,
  INVALID: 180 * DAY_MS,
  CATCH_ALL: 14 * DAY_MS,
  RISKY: 14 * DAY_MS,
  UNKNOWN: 7 * DAY_MS,
  TEMPORARY_FAILURE: 1 * DAY_MS,
  SUPPRESSED: Number.MAX_SAFE_INTEGER,
  STALE: 0
});

function text(value, max = 300) {
  return String(value ?? '').trim().slice(0, max);
}

function parseTime(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  const ms = Date.parse(String(value ?? ''));
  return Number.isFinite(ms) ? ms : null;
}

function fail(reasonCodes) {
  return {
    ok: false,
    policyVersion: CONTACT_VERIFICATION_POLICY_VERSION,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))]
  };
}

/**
 * Normalize one verifier's answer into a bounded, dated verification record.
 *
 * `state` is whatever the verifier said; `expiresAt` is computed here rather
 * than accepted from the verifier, so a vendor cannot declare its own verdict
 * permanently authoritative.
 */
export function normalizeContactVerification({
  route = '',
  state = 'UNKNOWN',
  provider = '',
  evidenceClass = 'THIRD_PARTY_UNVERIFIED',
  checkedAt = null,
  confidence = null,
  riskFlags = [],
  ttlMs = null,
  sourceRef = ''
} = {}) {
  const normalizedRoute = text(route, 320).toLowerCase();
  const normalizedState = text(state, 40).toUpperCase();
  const normalizedProvider = text(provider, 120);
  const checkedMs = parseTime(checkedAt);
  const reasons = [];
  if (!normalizedRoute) reasons.push('contact-route-required');
  if (!VERIFICATION_STATES.includes(normalizedState)) reasons.push('known-verification-state-required');
  if (!normalizedProvider) reasons.push('verification-provider-required');
  if (checkedMs === null) reasons.push('verification-checked-at-required');
  if (evidenceStrength(evidenceClass) < 0) reasons.push('known-evidence-class-required');
  if (reasons.length) return fail(reasons);

  const requestedTtl = Number(ttlMs);
  const ttl = Number.isSafeInteger(requestedTtl) && requestedTtl > 0
    ? Math.min(requestedTtl, DEFAULT_TTL_MS[normalizedState])
    : DEFAULT_TTL_MS[normalizedState];
  const expiresMs = ttl === Number.MAX_SAFE_INTEGER ? null : checkedMs + ttl;

  return {
    ok: true,
    policyVersion: CONTACT_VERIFICATION_POLICY_VERSION,
    route: normalizedRoute,
    state: normalizedState,
    provider: normalizedProvider,
    evidenceClass: text(evidenceClass, 60).toUpperCase(),
    checkedAt: new Date(checkedMs).toISOString(),
    expiresAt: expiresMs === null ? null : new Date(expiresMs).toISOString(),
    confidence: cappedConfidence(evidenceClass, confidence ?? 0),
    riskFlags: Array.isArray(riskFlags)
      ? [...new Set(riskFlags.map(flag => text(flag, 60).toUpperCase()).filter(Boolean))].slice(0, 20)
      : [],
    sourceRef: text(sourceRef, 300) || null
  };
}

/**
 * The verification that currently governs a route.
 *
 * Not simply the newest one. A stronger provider's verdict outranks a weaker
 * provider's more recent verdict, because recency is not authority; among
 * equals, the newest wins. Two equally-strong providers that disagree produce
 * an explicit RISKY with both recorded and confidence reduced -- never a
 * silent pick.
 */
export function resolveContactVerification({ verifications = [], now = new Date() } = {}) {
  const nowMs = parseTime(now);
  if (nowMs === null) return fail(['valid-current-time-required']);
  const valid = (Array.isArray(verifications) ? verifications : []).filter(item => item?.ok === true && item.route);
  if (!valid.length) {
    return {
      ok: true,
      policyVersion: CONTACT_VERIFICATION_POLICY_VERSION,
      state: 'UNKNOWN',
      confidence: 0,
      stale: true,
      disagreement: false,
      contributing: [],
      reasonCodes: ['no-verification-on-record']
    };
  }

  const live = valid.filter(item => item.expiresAt === null || parseTime(item.expiresAt) > nowMs);
  if (!live.length) {
    return {
      ok: true,
      policyVersion: CONTACT_VERIFICATION_POLICY_VERSION,
      state: 'STALE',
      confidence: 0,
      stale: true,
      disagreement: false,
      contributing: valid.map(item => ({ provider: item.provider, state: item.state, checkedAt: item.checkedAt })),
      reasonCodes: ['every-verification-expired']
    };
  }

  const ranked = [...live].sort((a, b) => {
    const strength = evidenceStrength(b.evidenceClass) - evidenceStrength(a.evidenceClass);
    if (strength !== 0) return strength;
    return parseTime(b.checkedAt) - parseTime(a.checkedAt);
  });
  const best = ranked[0];
  const peers = ranked.filter(item => evidenceStrength(item.evidenceClass) === evidenceStrength(best.evidenceClass));
  const distinctStates = new Set(peers.map(item => item.state));
  const disagreement = distinctStates.size > 1;

  // A definite negative from any live source outranks a positive from any
  // other: being told the mailbox does not exist is not something a second
  // opinion should be able to talk us out of.
  const definiteNegative = live.find(item => item.state === 'INVALID');
  const state = definiteNegative ? 'INVALID' : disagreement ? 'RISKY' : best.state;

  const baseConfidence = definiteNegative ? definiteNegative.confidence : best.confidence;
  return {
    ok: true,
    policyVersion: CONTACT_VERIFICATION_POLICY_VERSION,
    state,
    confidence: disagreement ? Number((baseConfidence * 0.5).toFixed(4)) : baseConfidence,
    stale: false,
    disagreement,
    contributing: ranked.map(item => ({
      provider: item.provider,
      state: item.state,
      evidenceClass: item.evidenceClass,
      checkedAt: item.checkedAt,
      confidence: item.confidence
    })),
    reasonCodes: [
      ...(disagreement ? ['provider-disagreement-lowers-confidence'] : []),
      ...(definiteNegative && definiteNegative !== best ? ['definite-negative-outranks-positive'] : [])
    ]
  };
}

/**
 * Whether a route may receive a consequential send right now.
 *
 * Ordered so the answer is auditable: suppression is consulted first and
 * decides on its own. Everything after it can only narrow.
 */
export function evaluateSendEligibilityForRoute({
  route = '',
  evidenceClass = '',
  verifications = [],
  suppression = null,
  consequential = true,
  now = new Date(),
  reverifyBeforeConsequentialSend = true
} = {}) {
  const normalizedRoute = text(route, 320).toLowerCase();
  if (!normalizedRoute) return { ok: true, eligible: false, state: 'UNKNOWN', reasonCodes: ['contact-route-required'], policyVersion: CONTACT_VERIFICATION_POLICY_VERSION };

  // Absolute, and first. Enrichment cannot resurrect a suppressed contact, so
  // nothing below this line is even consulted.
  if (suppression && suppression.suppressed === true) {
    return {
      ok: true,
      policyVersion: CONTACT_VERIFICATION_POLICY_VERSION,
      eligible: false,
      state: 'SUPPRESSED',
      suppressionReason: text(suppression.reason, 60).toUpperCase() || 'MANUAL_SUPPRESSION',
      reasonCodes: ['suppression-dominates-all-other-evidence']
    };
  }

  const resolved = resolveContactVerification({ verifications, now });
  if (!resolved.ok) return { ...resolved, eligible: false };

  const reasonCodes = [...resolved.reasonCodes];
  let eligible = SENDABLE_STATES.has(resolved.state);

  if (!isSendableEvidenceClass(evidenceClass)) {
    eligible = false;
    reasonCodes.push('constructed-route-never-sendable');
  }
  if (CONDITIONAL_STATES.has(resolved.state)) reasonCodes.push('non-affirmative-verification-state');
  if (resolved.state === 'INVALID') reasonCodes.push('route-verified-invalid');
  if (resolved.state === 'UNKNOWN') reasonCodes.push('route-unverified');
  if (resolved.stale && consequential && reverifyBeforeConsequentialSend) {
    eligible = false;
    reasonCodes.push('reverification-required-before-consequential-send');
  }

  return {
    ok: true,
    policyVersion: CONTACT_VERIFICATION_POLICY_VERSION,
    eligible,
    state: resolved.state,
    confidence: resolved.confidence,
    disagreement: resolved.disagreement,
    stale: resolved.stale,
    contributing: resolved.contributing,
    reasonCodes: [...new Set(reasonCodes)]
  };
}
