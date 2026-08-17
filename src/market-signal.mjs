// Universal Market Signal kernel: a source-neutral shape for "something was
// observed about the world." Deliberately architecture-independent -- it
// does not assume which opportunity-scoring or authorization system (if
// any) ends up consuming it, since that is a real pending decision (see
// docs/PROMETHEUS_CANONICAL_INTEGRATION_PLAN.md) this module has no
// business making on its own. Pure, deterministic, no I/O, no network.
import crypto from 'node:crypto';

export const MARKET_SIGNAL_SCHEMA_VERSION = 'market-signal-1.0.0';

export const SOURCE_KINDS = Object.freeze([
  'WEB_PAGE', 'RSS', 'REPOSITORY', 'PRICING_PAGE', 'JOB_BOARD', 'PROCUREMENT',
  'CHANGELOG', 'REVIEW_SITE', 'AD_LIBRARY', 'SOCIAL_POST', 'INTERNAL'
]);

export const ENTITY_TYPES = Object.freeze([
  'COMPANY', 'PRODUCT', 'PRICING_PLAN', 'JOB_POSTING', 'PERSON', 'MARKET_CATEGORY', 'UNKNOWN'
]);

export const SIGNAL_TYPES = Object.freeze([
  'NEW_LISTING', 'PRICE_CHANGE', 'FEATURE_CHANGE', 'HIRING_CHANGE', 'CONTENT_CHANGE',
  'AVAILABILITY_CHANGE', 'SENTIMENT_OBSERVATION', 'STRUCTURAL_OBSERVATION'
]);

// Mirrors the evidence-classification vocabulary already established in
// src/opportunity-registry.mjs -- same claim strength ordering, so a signal's
// evidenceClass and a genome field's claimType can be compared directly.
export const EVIDENCE_CLASSES = Object.freeze([
  'SYNTHETIC_TEST_FIXTURE', 'UNRESOLVED', 'HYPOTHESIS', 'ESTIMATE', 'INFERENCE',
  'CREATOR_CLAIM', 'OPERATOR_CLAIM', 'BUYER_SIGNAL', 'COMPANY_CLAIM', 'VERIFIED_FACT'
]);

export const VERIFICATION_STATES = Object.freeze([
  'UNVERIFIED', 'SOURCE_REACHABLE', 'CONTENT_MATCHED', 'CONTRADICTED'
]);

const REQUIRED_FIELDS = ['sourceAdapter', 'sourceKind', 'entityType', 'entityIdentity', 'signalType', 'observedAt'];

function isIsoDate(value) {
  if (typeof value !== 'string') return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

// A canonical digest of the fields that define "this is the same observed
// fact," independent of when it was ingested or by which adapter run.
// Deliberately excludes ingestedAt/rawReference/confidence so re-ingesting
// the identical fact twice produces the identical digest.
function canonicalDigestInput(signal) {
  return JSON.stringify({
    sourceKind: signal.sourceKind, entityType: signal.entityType, entityIdentity: signal.entityIdentity,
    signalType: signal.signalType, payloadDigest: signal.payloadDigest, observedAt: signal.observedAt
  });
}

function digestSync(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function computePayloadDigest(payload) {
  const normalized = payload === undefined ? null : payload;
  return digestSync(JSON.stringify(normalized));
}

// Normalizes and validates a raw signal candidate into a canonical
// MarketSignal record. Rejects malformed input cleanly rather than
// half-populating a record. Never promotes a SYNTHETIC_TEST_FIXTURE
// evidenceClass to anything stronger, and never lets a caller claim
// VERIFIED_FACT without an explicit sourceUrl (a verified fact about the
// external world must be traceable to where it was observed).
export function normalizeMarketSignal(input = {}, { date = new Date() } = {}) {
  const referenceDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const ingestedAt = referenceDate.toISOString();

  if (!input || typeof input !== 'object') {
    return { ok: false, reason: 'malformed-input', schemaVersion: MARKET_SIGNAL_SCHEMA_VERSION, ingestedAt };
  }
  const missing = REQUIRED_FIELDS.filter(field => input[field] == null || input[field] === '');
  if (missing.length) {
    return { ok: false, reason: `missing-fields:${missing.join(',')}`, schemaVersion: MARKET_SIGNAL_SCHEMA_VERSION, ingestedAt };
  }
  if (!SOURCE_KINDS.includes(input.sourceKind)) {
    return { ok: false, reason: `unknown-source-kind:${input.sourceKind}`, schemaVersion: MARKET_SIGNAL_SCHEMA_VERSION, ingestedAt };
  }
  if (!ENTITY_TYPES.includes(input.entityType)) {
    return { ok: false, reason: `unknown-entity-type:${input.entityType}`, schemaVersion: MARKET_SIGNAL_SCHEMA_VERSION, ingestedAt };
  }
  if (!SIGNAL_TYPES.includes(input.signalType)) {
    return { ok: false, reason: `unknown-signal-type:${input.signalType}`, schemaVersion: MARKET_SIGNAL_SCHEMA_VERSION, ingestedAt };
  }
  if (!isIsoDate(input.observedAt)) {
    return { ok: false, reason: 'invalid-observedAt', schemaVersion: MARKET_SIGNAL_SCHEMA_VERSION, ingestedAt };
  }
  if (Date.parse(input.observedAt) > referenceDate.getTime() + 5 * 60_000) {
    return { ok: false, reason: 'observedAt-in-the-future', schemaVersion: MARKET_SIGNAL_SCHEMA_VERSION, ingestedAt };
  }

  const evidenceClass = EVIDENCE_CLASSES.includes(input.evidenceClass) ? input.evidenceClass : 'UNRESOLVED';
  const isSynthetic = evidenceClass === 'SYNTHETIC_TEST_FIXTURE';

  if (evidenceClass === 'VERIFIED_FACT' && !isSynthetic && !String(input.sourceUrl || '').trim()) {
    return { ok: false, reason: 'verified-fact-requires-sourceUrl', schemaVersion: MARKET_SIGNAL_SCHEMA_VERSION, ingestedAt };
  }
  if (isSynthetic && String(input.sourceUrl || '').trim()) {
    // A synthetic fixture claiming a real sourceUrl is exactly the
    // synthetic-to-external promotion the mission's truth rule forbids.
    return { ok: false, reason: 'synthetic-fixture-must-not-carry-a-sourceUrl', schemaVersion: MARKET_SIGNAL_SCHEMA_VERSION, ingestedAt };
  }

  const payloadDigest = input.payloadDigest || computePayloadDigest(input.payload);
  const observedAt = new Date(input.observedAt).toISOString();
  const freshnessMs = Math.max(0, referenceDate.getTime() - new Date(observedAt).getTime());

  const record = {
    schemaVersion: MARKET_SIGNAL_SCHEMA_VERSION,
    sourceAdapter: String(input.sourceAdapter),
    sourceKind: input.sourceKind,
    entityType: input.entityType,
    entityIdentity: String(input.entityIdentity),
    signalType: input.signalType,
    observedAt,
    ingestedAt,
    payloadDigest,
    evidenceClass,
    provenance: isSynthetic ? 'SYNTHETIC_TEST_FIXTURE' : String(input.provenance || 'UNSPECIFIED'),
    sourceUrl: isSynthetic ? null : (String(input.sourceUrl || '').trim() || null),
    verificationState: VERIFICATION_STATES.includes(input.verificationState) ? input.verificationState : 'UNVERIFIED',
    confidence: Number.isFinite(Number(input.confidence)) ? Math.max(0, Math.min(1, Number(input.confidence))) : null,
    rawReference: input.rawReference != null ? String(input.rawReference) : null,
    freshnessMs
  };

  const canonicalDigest = digestSync(canonicalDigestInput(record));
  return {
    ok: true,
    ...record,
    signalId: canonicalDigest,
    dedupeKey: canonicalDigest
  };
}

// Two signals dedupe to the same commercial belief iff they agree on every
// field the canonical digest covers. Contradictory signals (same entity,
// different payload) intentionally get DIFFERENT dedupeKeys -- they must
// coexist, per the mission's own ingestion requirements, not silently
// overwrite each other.
export function isDuplicateSignal(a, b) {
  if (!a?.ok || !b?.ok) return false;
  return a.dedupeKey === b.dedupeKey;
}

export function isStaleSignal(signal, { maxAgeMs = 30 * 24 * 60 * 60 * 1000 } = {}) {
  if (!signal?.ok) return null;
  return signal.freshnessMs > maxAgeMs;
}
