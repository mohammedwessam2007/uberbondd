// Shared provenance vocabulary for everything that learns about a prospect.
//
// Discovery, enrichment, and verification all answer the same question -- how
// much is this claim worth? -- and they must answer it on one scale, or a
// licensed provider's guess quietly overwrites the company's own website.
//
// This module holds that scale and nothing else, so it imports nothing.

export const PROSPECT_EVIDENCE_POLICY_VERSION = 'prospect-evidence-1.0.0';

/**
 * Evidence strength, weakest first. The index is the strength.
 *
 * The ordering is about who is in a position to know, not about how recent
 * the claim is. A company's own team page knows its own staff; a pattern
 * generator knows nothing at all and merely produces something well-formed.
 */
export const EVIDENCE_STRENGTH = Object.freeze([
  'INFERRED_PATTERN',        // constructed, e.g. first.last@domain. Knows nothing.
  'THIRD_PARTY_UNVERIFIED',  // scraped aggregate, no provenance chain
  'LICENSED_PROVIDER',       // a paid enrichment vendor's record
  'PUBLIC_STRUCTURED',       // structured public data: schema.org, filings, registries
  'FIRST_PARTY_PUBLIC',      // the subject's own published page
  'FIRST_PARTY_DECLARED',    // the subject told us directly (form, reply, contract)
  'VERIFIED_TRANSACTION'     // bound to a cleared payment or signed agreement
]);

const STRENGTH_INDEX = new Map(EVIDENCE_STRENGTH.map((name, index) => [name, index]));

export function evidenceStrength(value) {
  const name = String(value ?? '').trim().toUpperCase();
  return STRENGTH_INDEX.has(name) ? STRENGTH_INDEX.get(name) : -1;
}

export function isKnownEvidenceClass(value) {
  return evidenceStrength(value) >= 0;
}

/**
 * An evidence class that can never make a contact route sendable.
 *
 * A constructed address is not a discovery. Sending to one is guessing at a
 * stranger's inbox, and the fact that it bounces less often than chance does
 * not make it consent.
 */
export const NEVER_SENDABLE_EVIDENCE = Object.freeze(['INFERRED_PATTERN']);

export function isSendableEvidenceClass(value) {
  const name = String(value ?? '').trim().toUpperCase();
  return isKnownEvidenceClass(name) && !NEVER_SENDABLE_EVIDENCE.includes(name);
}

/** Confidence ceiling per evidence class. Nothing weak may report near-certainty. */
export const CONFIDENCE_CEILING = Object.freeze({
  INFERRED_PATTERN: 0.2,
  THIRD_PARTY_UNVERIFIED: 0.45,
  LICENSED_PROVIDER: 0.7,
  PUBLIC_STRUCTURED: 0.85,
  FIRST_PARTY_PUBLIC: 0.9,
  FIRST_PARTY_DECLARED: 0.95,
  VERIFIED_TRANSACTION: 1
});

export function cappedConfidence(evidenceClass, requested) {
  const ceiling = CONFIDENCE_CEILING[String(evidenceClass ?? '').trim().toUpperCase()];
  if (ceiling == null) return 0;
  const number = Number(requested);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.min(number, ceiling);
}
