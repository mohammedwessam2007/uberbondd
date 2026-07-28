// Canonical policy reason-code registry (PR #6 adversarial-audit repair, item 4). Transcribed
// verbatim from 05_POLICY_REASON_CODES.json. revenue-os.mjs's evaluateOpportunityPolicy previously
// emitted `contact-${contactResult.reason}` directly, which produced codes never present in this
// registry (e.g. 'contact-contact-domain-mismatch', double-prefixed, when send-safety.mjs's own
// contactEligibility already returns the canonical-shaped 'contact-domain-mismatch'). This module
// is the single source of truth every emitted reason code must pass through.

export const POLICY_REASON_CODES_VERSION = 'uberbond-policy-reasons-v2';

export const REASON_CODES = Object.freeze([
  'missing-current-official-evidence',
  'evidence-expired',
  'evidence-low-confidence',
  'generic-contact-page',
  'contact-not-officially-published',
  'prohibited-mailbox',
  'contact-domain-mismatch',
  'recipient-suppressed',
  'domain-suppressed',
  'duplicate-organization-lane-signal',
  'duplicate-recipient',
  'prospect-terminal-status',
  'country-restricted',
  'unsupported-service-lane',
  'capability-proof-gap',
  'expected-value-below-threshold',
  'owner-minutes-above-threshold',
  'delivery-capacity-risk',
  'prohibitive-upfront-spend',
  'authenticated-platform-required',
  'terms-acceptance-required',
  'account-creation-required',
  'opportunity-expired',
  'competition-unacceptable',
  'ability-to-pay-insufficient',
  'source-not-provider-facing',
  'privacy-or-data-risk',
  'security-testing-requested',
  'fabricated-proof-required',
  'outside-current-priority'
]);

const REASON_CODE_SET = new Set(REASON_CODES);

export function isCanonicalReasonCode(code) {
  return REASON_CODE_SET.has(code);
}

export class UnknownReasonCodeError extends Error {
  constructor(code) {
    super(`Unknown policy reason code (not in ${POLICY_REASON_CODES_VERSION}): ${code}`);
    this.name = 'UnknownReasonCodeError';
    this.code = code;
  }
}

/** Throws UnknownReasonCodeError for any code not in the canonical registry -- called on every
 * reason code this codebase emits so a typo or an un-mapped lower-level reason fails loudly at
 * the point of emission, not silently reaching a report, a database row, or a dashboard. */
export function assertCanonicalReasonCode(code) {
  if (!isCanonicalReasonCode(code)) throw new UnknownReasonCodeError(code);
  return code;
}

// send-safety.mjs#contactEligibility returns its own lower-level reason vocabulary (it is a
// general send-eligibility check shared with the outbound-safety subsystem, not written against
// this registry). This is the one, explicit, exhaustive mapping from that vocabulary to the
// canonical registry -- every value contactEligibility can return must have an entry here, or
// canonicalizeContactReason throws rather than let an unmapped reason through.
const CONTACT_REASON_MAP = Object.freeze({
  'missing-contact': 'contact-not-officially-published',
  'free-mail-contact': 'prohibited-mailbox',
  'risky-mailbox': 'prohibited-mailbox',
  'contact-domain-mismatch': 'contact-domain-mismatch',
  'contact-not-published-or-verified': 'contact-not-officially-published'
});

export function canonicalizeContactReason(rawReason) {
  const mapped = CONTACT_REASON_MAP[rawReason];
  if (!mapped) throw new UnknownReasonCodeError(`contact:${rawReason}`);
  return assertCanonicalReasonCode(mapped);
}
