// Preflight safety repair (24/7 Continuous Revenue Core, section 2). A default-deny allowlist for
// *why* a contact channel exists (its business purpose), distinct from and complementary to
// importer.mjs's ALLOWED_CHANNELS (which validates the channel *medium* -- form vs. email vs.
// LinkedIn -- not its purpose). Both gates must pass: a published_contact_form pointed at a
// careers inbox is still rejected here even though the medium itself is allowed.
//
// Design is explicit-allowlist-first, not deny-list-first: an unrecognized, malformed, or empty
// label fails closed by construction (falls through every allow-alias check with no matching
// branch), not because it happens to appear on a maintained deny list. The deny list below exists
// only to name the specific categories this mission calls out and to drive the hostile test suite
// that proves each one is actually rejected -- removing an entry from it would not admit that
// category, because nothing is admitted without first matching an allow alias.
import { sha256Hex } from './utils.mjs';

export class ChannelSafetyError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'ChannelSafetyError';
    this.code = code;
  }
}

export const ALLOWED_BUSINESS_PURPOSES = Object.freeze([
  'business_inquiry', 'vendor_inquiry', 'partnership_inquiry', 'procurement_inquiry', 'general_commercial'
]);

// Named explicitly per the mission's own required fail-closed list -- kept as a second, redundant
// check (on top of "not matched by any allow alias") so a future accidental addition of one of
// these strings to PURPOSE_ALIASES is still caught by the hostile test suite even if the allow-list
// change itself passes review.
export const EXPLICITLY_DENIED_PURPOSES = Object.freeze([
  'support', 'customer_service', 'technical_support', 'careers', 'emergency',
  'consumer_service', 'booking', 'estimate', 'personal'
]);

const PURPOSE_ALIASES = Object.freeze({
  business_inquiry: ['business', 'business_inquiry', 'business_inquiries', 'general_inquiry', 'general_inquiries', 'info', 'inquiries', 'contact', 'contact_us'],
  vendor_inquiry: ['vendor', 'vendors', 'vendor_inquiry', 'vendor_inquiries', 'supplier', 'suppliers'],
  partnership_inquiry: ['partnership', 'partnerships', 'partner', 'partners', 'biz_dev', 'business_development'],
  procurement_inquiry: ['procurement', 'purchasing', 'sourcing', 'rfp', 'rfq'],
  general_commercial: ['sales', 'commercial', 'sales_inquiry', 'sales_inquiries']
});

function normalizePurposeLabel(raw) {
  return String(raw ?? '').trim().toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_+|_+$/g, '');
}

const DENIED_NORMALIZED = new Set(EXPLICITLY_DENIED_PURPOSES.map(normalizePurposeLabel));
const ALIAS_LOOKUP = new Map();
for (const [classification, aliases] of Object.entries(PURPOSE_ALIASES)) {
  for (const alias of [classification, ...aliases]) ALIAS_LOOKUP.set(normalizePurposeLabel(alias), classification);
}

/**
 * Classifies a raw, caller-supplied business-purpose label. Returns {ok:true, classification} only
 * for one of ALLOWED_BUSINESS_PURPOSES; every other input -- empty, malformed, an explicitly denied
 * category, or simply unrecognized -- returns {ok:false, reason}. Never throws for bad *input*
 * (fail-closed-by-quarantine, matching every other validator in this package); only malformed
 * *calls* (non-string-coercible input) would be a caller bug, and String(raw) already tolerates
 * that by producing an empty/garbage string that fails closed anyway.
 */
export function classifyChannelPurpose(rawLabel) {
  const normalized = normalizePurposeLabel(rawLabel);
  if (!normalized) return { ok: false, reason: 'malformed-purpose-label' };
  if (DENIED_NORMALIZED.has(normalized)) return { ok: false, reason: `disallowed-purpose:${normalized}` };
  const classification = ALIAS_LOOKUP.get(normalized);
  if (!classification) return { ok: false, reason: 'unrecognized-purpose' };
  return { ok: true, classification };
}

export function assertAllowedBusinessPurpose(rawLabel) {
  const result = classifyChannelPurpose(rawLabel);
  if (!result.ok) throw new ChannelSafetyError('channel-purpose-not-allowed', `"${rawLabel}" -- ${result.reason}`);
  return result.classification;
}

const DEFAULT_CLOCK_SKEW_ALLOWANCE_MS = 5 * 60 * 1000;
const DEFAULT_FRESHNESS_WINDOW_DAYS = 90;

/**
 * Reusable evidence-timestamp freshness check (the same policy importer.mjs#normalizeRecord now
 * enforces, exposed here so the buyer-intent engine and distribution engine can apply the identical
 * rule to signals that never pass through the record importer at all -- e.g. a revalidation pass
 * that only touches a timestamp field, not a full raw record). Returns {ok:true} or
 * {ok:false, reason} -- never throws for bad *evidence*, only for a malformed call (missing input
 * entirely is treated as bad evidence, not a caller bug, since callers routinely pass through
 * untrusted external data here).
 */
export function assertEvidenceFreshness(capturedAt, { clockSkewAllowanceMs = DEFAULT_CLOCK_SKEW_ALLOWANCE_MS, freshnessWindowDays = DEFAULT_FRESHNESS_WINDOW_DAYS, now = Date.now() } = {}) {
  const raw = String(capturedAt ?? '').trim();
  const parsed = Date.parse(raw);
  if (!raw || !Number.isFinite(parsed)) return { ok: false, reason: 'missing-or-invalid-timestamp' };
  const ageMs = now - parsed;
  if (ageMs < -clockSkewAllowanceMs) return { ok: false, reason: 'future-dated-evidence' };
  if (ageMs / 86400000 > freshnessWindowDays) return { ok: false, reason: 'stale-evidence' };
  return { ok: true };
}

/**
 * Combined preflight gate for one buyer-intent/distribution channel candidate: both the business
 * purpose and the evidence timestamp must independently pass, or the whole candidate is rejected
 * with every applicable reason (not just the first) -- same "report everything, not just the first
 * failure" discipline as importer.mjs#normalizeRecord.
 */
export function preflightChannelSafety({ purposeLabel, capturedAt, freshnessOptions = {} } = {}) {
  const reasons = [];
  const purposeResult = classifyChannelPurpose(purposeLabel);
  if (!purposeResult.ok) reasons.push(`purpose:${purposeResult.reason}`);
  const freshnessResult = assertEvidenceFreshness(capturedAt, freshnessOptions);
  if (!freshnessResult.ok) reasons.push(`evidence:${freshnessResult.reason}`);
  if (reasons.length) return { ok: false, reasons };
  return {
    ok: true,
    classification: purposeResult.classification,
    evidenceHash: sha256Hex(`${purposeResult.classification}|${capturedAt}`)
  };
}
