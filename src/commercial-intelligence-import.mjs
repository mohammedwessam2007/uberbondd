// Commercial Intelligence Importer (Revenue OS V2). Validates JSONL/CSV batches from ChatGPT Work
// against 04_COMMERCIAL_INTELLIGENCE_SCHEMA.json's exact contract, normalizes domains/contacts,
// computes idempotency keys, and imports opportunities/message variants/owner gates/partner
// routes/offers/rejections. This module has no send capability of any kind -- there is no code
// path here that could contact anyone, so "never send mail" is true structurally, not by a flag
// someone could flip.
//
// Repaired per the PR #6 adversarial audit (00_PR6_ADVERSARIAL_AUDIT.md) and its second-pass
// hardening audit. Every fix is called out inline where it matters rather than only in the repair
// reports:
//   1. Source-evidence conflict resolution uses store.mjs#findOrCreate (a single atomic
//      INSERT...ON CONFLICT...RETURNING), not a catch-then-query pattern -- the latter is unsafe on
//      Postgres, since a failed statement aborts the rest of the transaction. See buildSourceEvidence.
//   2. Owner gates and message variants may only link to an opportunity whose stage is
//      'ready_for_message' -- existence alone is insufficient (a policy-rejected opportunity must
//      never receive a gate or a message). See requireOpportunityReadyForMessage.
//   3. tenOfTenReadiness (revenue-os.mjs) is not this file's concern directly, but this file's
//      `previewAuditable`/`importAtomicity`/`concurrencySafety`/`auditCompleteness` evidence feeds it.
//   4. content_hash is computed from real evidence content (url/excerpt/capturedAt/official/
//      confidence/type), never from signalKey or the record id -- signalKey is stored as its own
//      column. See computeEvidenceContentHash.
//   5. Every opportunity/message-variant/owner-gate/partner-route/offer/rejection import is one real
//      store.transaction() -- validate-and-compute happens first, writes happen together, any
//      failure rolls back the whole record atomically.
//   6. `mode: 'preview'` (the default) performs every validation/scoring/policy step and persists
//      NOTHING at all -- not even a batch-level audit-log row. Audit evidence for a preview run
//      lives entirely in the returned report object; nothing is written to the store in preview
//      mode. `mode: 'commit'` is required for any durable write, including the audit trail.
//   7. Every emitted policy reason code is validated against src/policy-reason-codes.mjs's
//      canonical registry.
//   8. organization_domain/service_lane/source.url must agree exactly with the corresponding
//      idempotency_inputs fields (after normalization).
//   9. Opportunities are stored with stage:'ready_for_message' (policy pass) or
//      stage:'policy_rejected' (policy reject) -- never the ambiguous 'discovered' stage.
//      listQueueableOpportunities() is the only supported way to find opportunities ready for
//      outreach.
//  10. message_variant records require real subject/body/opportunity_id and are hashed from
//      normalized subject+body.
//  11. owner_gate records require explicit gate_type/opportunity_id/action fields; buildOwnerGate
//      (revenue-os.mjs) enforces the value floor/minutes ceiling/future-expiry/USD-only bounds
//      itself.
//  12. Every commit-mode outcome logs exactly one of the ten canonical audit event types.
//  13. partner_route/offer/rejection records get full, real persistence (migrations/006) and now
//      go through the same common evidence/policy validation opportunities do (freshness, official
//      source, supported lane, suppression, contact provenance/prohibited-mailbox). rejection
//      records require their own explicit, canonical-registry-validated reason_codes field --
//      `risks` is never used as a reason code.
import crypto from 'node:crypto';
import { parseCsv } from './csv.mjs';
import { id, now, normalizeDomain } from './utils.mjs';
import { ConflictError } from './store.mjs';
import { contactEligibility } from './send-safety.mjs';
import { isCanonicalReasonCode, canonicalizeContactReason, assertCanonicalReasonCode } from './policy-reason-codes.mjs';
import {
  opportunityIdempotencyKey, evaluateOpportunityPolicy, scoreOpportunity, buildOwnerGate,
  SUPPORTED_SERVICE_LANES, OWNER_GATE_TYPES, REVENUE_OS_POLICY_VERSION
} from './revenue-os.mjs';

export class CommercialIntelligenceImportError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'CommercialIntelligenceImportError';
    this.code = code;
  }
}

// Verbatim from 04_COMMERCIAL_INTELLIGENCE_SCHEMA.json.
export const RECORD_TYPES = Object.freeze(['opportunity', 'partner_route', 'offer', 'message_variant', 'rejection', 'owner_gate']);
const REQUIRED_RECORD_FIELDS = Object.freeze([
  'id', 'record_type', 'organization', 'organization_domain', 'geography', 'source', 'service_lane',
  'buyer_signal', 'expected_value_cents', 'currency', 'owner_minutes', 'delivery_hours', 'expires_at',
  'risks', 'kill_condition', 'idempotency_inputs'
]);
const REQUIRED_SOURCE_FIELDS = Object.freeze(['url', 'type', 'captured_at', 'official', 'confidence']);
const REQUIRED_IDEMPOTENCY_INPUTS = Object.freeze(['organization_domain', 'service_lane', 'source_url', 'signal_key']);
const SOURCE_EVIDENCE_UNIQUE_COLUMNS = Object.freeze(['organizationDomain', 'sourceUrl', 'contentHash']);

// IMPORT_PREVIEW is part of the canonical ten-event taxonomy but, per item 6/7 above, is never
// actually written by importCommercialIntelligenceBatch itself -- preview mode writes nothing at
// all. The name is kept here as the reserved, canonical label for a caller who chooses to persist
// a preview report on their own (this module has no opinion on whether they should).
const CANONICAL_AUDIT_EVENTS = Object.freeze({
  IMPORT_PREVIEW: 'commercial_intelligence_import_preview',
  IMPORT_COMMITTED: 'commercial_intelligence_import_committed',
  ACCEPTED: 'commercial_intelligence_accepted',
  POLICY_REJECTED: 'commercial_intelligence_policy_rejected',
  DUPLICATE_REJECTED: 'commercial_intelligence_duplicate_rejected',
  STALE_REJECTED: 'commercial_intelligence_stale_rejected',
  INVALID_REJECTED: 'commercial_intelligence_invalid_rejected',
  TRANSACTION_ROLLED_BACK: 'commercial_intelligence_transaction_rolled_back',
  OWNER_GATE_CREATED: 'commercial_intelligence_owner_gate_created',
  MESSAGE_VARIANT_IMPORTED: 'commercial_intelligence_message_variant_imported'
});
export { CANONICAL_AUDIT_EVENTS };

function isIsoDateTime(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

/** Validates one raw commercial-intelligence record against the schema's exact contract, plus this
 * module's own identity-agreement and record-type-specific requirements. Throws
 * CommercialIntelligenceImportError with a `row` on the error object when rowContext is supplied. */
export function validateCommercialIntelligenceRecord(raw, rowContext) {
  const fail = (code, message) => {
    const error = new CommercialIntelligenceImportError(code, message);
    if (rowContext !== undefined) error.row = rowContext;
    throw error;
  };
  if (!raw || typeof raw !== 'object') fail('record-invalid', 'record must be an object');
  const missing = REQUIRED_RECORD_FIELDS.filter(field => raw[field] === undefined);
  if (missing.length) fail('record-field-missing', `missing required field(s): ${missing.join(', ')}`);

  const recordId = String(raw.id || '').trim();
  if (recordId.length < 3) fail('record-id-invalid', 'id must be at least 3 characters');
  if (!RECORD_TYPES.includes(raw.record_type)) fail('record-type-invalid', `record_type must be one of ${RECORD_TYPES.join(', ')}`);

  if (!raw.source || typeof raw.source !== 'object') fail('source-invalid', 'source must be an object');
  const sourceMissing = REQUIRED_SOURCE_FIELDS.filter(field => raw.source[field] === undefined);
  if (sourceMissing.length) fail('source-field-missing', `source missing required field(s): ${sourceMissing.join(', ')}`);
  if (!/^https:\/\//.test(String(raw.source.url || ''))) fail('source-url-invalid', 'source.url must start with https://');
  if (!isIsoDateTime(raw.source.captured_at)) fail('source-captured-at-invalid', 'source.captured_at must be a valid ISO timestamp');
  if (typeof raw.source.official !== 'boolean') fail('source-official-invalid', 'source.official must be a boolean');
  const confidence = Number(raw.source.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) fail('source-confidence-invalid', 'source.confidence must be in [0,1]');

  if (raw.contact !== undefined && raw.contact !== null) {
    if (typeof raw.contact !== 'object') fail('contact-invalid', 'contact must be an object or null');
  }

  const expectedValueCents = Number(raw.expected_value_cents);
  if (!Number.isInteger(expectedValueCents) || expectedValueCents < 0) fail('expected-value-invalid', 'expected_value_cents must be a non-negative integer');
  const ownerMinutes = Number(raw.owner_minutes);
  if (!Number.isInteger(ownerMinutes) || ownerMinutes < 0) fail('owner-minutes-invalid', 'owner_minutes must be a non-negative integer');
  const deliveryHours = Number(raw.delivery_hours);
  if (!Number.isFinite(deliveryHours) || deliveryHours < 0) fail('delivery-hours-invalid', 'delivery_hours must be a non-negative number');
  if (!isIsoDateTime(raw.expires_at)) fail('expires-at-invalid', 'expires_at must be a valid ISO timestamp');
  if (!Array.isArray(raw.risks)) fail('risks-invalid', 'risks must be an array');
  if (!String(raw.kill_condition || '').trim()) fail('kill-condition-invalid', 'kill_condition is required and must be non-empty');

  if (!raw.idempotency_inputs || typeof raw.idempotency_inputs !== 'object') fail('idempotency-inputs-invalid', 'idempotency_inputs must be an object');
  const idempotencyMissing = REQUIRED_IDEMPOTENCY_INPUTS.filter(field => raw.idempotency_inputs[field] === undefined);
  if (idempotencyMissing.length) fail('idempotency-inputs-field-missing', `idempotency_inputs missing required field(s): ${idempotencyMissing.join(', ')}`);

  if (raw.recurring_potential !== undefined) {
    const recurring = Number(raw.recurring_potential);
    if (!Number.isFinite(recurring) || recurring < 0 || recurring > 10) fail('recurring-potential-invalid', 'recurring_potential must be in [0,10]');
  }

  // PR #6 audit item 5 ("identity integrity is not enforced"): organization_domain/service_lane/
  // source.url can disagree with idempotency_inputs' own copies of the same three concepts.
  // Require exact equality (after the same normalization each side would otherwise get
  // independently) before returning anything.
  const organizationDomain = normalizeDomain(raw.organization_domain || '');
  const serviceLane = String(raw.service_lane || '').trim().toLowerCase();
  const sourceUrl = String(raw.source.url || '').trim();
  const idempotencyDomain = normalizeDomain(raw.idempotency_inputs.organization_domain || '');
  const idempotencyLane = String(raw.idempotency_inputs.service_lane || '').trim().toLowerCase();
  const idempotencySourceUrl = String(raw.idempotency_inputs.source_url || '').trim();
  if (organizationDomain !== idempotencyDomain) {
    fail('identity-domain-mismatch', `organization_domain (${organizationDomain}) disagrees with idempotency_inputs.organization_domain (${idempotencyDomain})`);
  }
  if (serviceLane !== idempotencyLane) {
    fail('identity-service-lane-mismatch', `service_lane (${serviceLane}) disagrees with idempotency_inputs.service_lane (${idempotencyLane})`);
  }
  if (sourceUrl !== idempotencySourceUrl) {
    fail('identity-source-url-mismatch', `source.url (${sourceUrl}) disagrees with idempotency_inputs.source_url (${idempotencySourceUrl})`);
  }

  // owner_gate records need an explicit gate_type/opportunity_id/action, not a reused service_lane
  // and no linkage. Schema-permitted extra top-level fields (no additionalProperties:false).
  let gate = null;
  if (raw.record_type === 'owner_gate') {
    const gateType = String(raw.gate_type || '').trim();
    if (!OWNER_GATE_TYPES.includes(gateType)) fail('gate-type-invalid', `gate_type must be one of ${OWNER_GATE_TYPES.join(', ')}`);
    const opportunityId = String(raw.opportunity_id || '').trim();
    if (!opportunityId) fail('gate-opportunity-id-required', 'owner_gate records require opportunity_id');
    const action = String(raw.action || '').trim();
    if (!action) fail('gate-action-required', 'owner_gate records require action');
    gate = { gateType, opportunityId, action, evidenceRequired: Array.isArray(raw.evidence_required) ? raw.evidence_required.map(String) : [] };
  }

  // message_variant records need real content, not a subject surrogate with signalKey standing in
  // for a body hash.
  let messageContent = null;
  if (raw.record_type === 'message_variant') {
    const subject = String(raw.subject || '').trim();
    if (!subject) fail('message-subject-required', 'message_variant records require subject');
    const body = String(raw.body || '').trim();
    if (!body) fail('message-body-required', 'message_variant records require body');
    const opportunityId = String(raw.opportunity_id || '').trim();
    if (!opportunityId) fail('message-opportunity-id-required', 'message_variant records require opportunity_id');
    messageContent = {
      subject, body, opportunityId,
      experimentId: raw.experiment_id ? String(raw.experiment_id).trim() : null,
      prohibitedClaims: Array.isArray(raw.prohibited_claims) ? raw.prohibited_claims.map(String) : []
    };
  }

  // Second-pass audit item 5: rejection records must carry their own explicit, canonical
  // reason_codes -- `risks` is a free-text list of concerns, not a reason-code vocabulary, and must
  // never be used as one.
  let rejectionReasonCodes = null;
  if (raw.record_type === 'rejection') {
    if (!Array.isArray(raw.reason_codes) || raw.reason_codes.length === 0) {
      fail('rejection-reason-codes-required', 'rejection records require a non-empty reason_codes array');
    }
    const nonCanonical = raw.reason_codes.filter(code => !isCanonicalReasonCode(code));
    if (nonCanonical.length) {
      fail('rejection-reason-codes-invalid', `reason_codes contains non-canonical code(s): ${nonCanonical.join(', ')}`);
    }
    rejectionReasonCodes = [...new Set(raw.reason_codes.map(String))];
  }

  return {
    id: recordId,
    recordType: raw.record_type,
    organization: String(raw.organization || '').trim(),
    organizationDomain,
    geography: String(raw.geography || '').trim(),
    source: {
      url: sourceUrl, type: String(raw.source.type || '').trim(),
      capturedAt: new Date(Date.parse(raw.source.captured_at)).toISOString(),
      expiresAt: raw.source.expires_at ? new Date(Date.parse(raw.source.expires_at)).toISOString() : null,
      official: raw.source.official, confidence,
      excerpt: raw.source.excerpt ? String(raw.source.excerpt).slice(0, 300) : ''
    },
    contact: raw.contact ? {
      email: String(raw.contact.email || '').trim().toLowerCase(),
      sourceUrl: String(raw.contact.source_url || ''),
      publishedOfficially: raw.contact.published_officially === true
    } : null,
    serviceLane, buyerSignal: String(raw.buyer_signal || '').trim(),
    expectedValueCents, currency: String(raw.currency || 'USD').trim().toUpperCase(),
    ownerMinutes, deliveryHours,
    expiresAt: new Date(Date.parse(raw.expires_at)).toISOString(),
    competition: raw.competition ? String(raw.competition).trim() : '',
    recurringPotential: raw.recurring_potential !== undefined ? Number(raw.recurring_potential) : null,
    risks: raw.risks.map(String),
    killCondition: String(raw.kill_condition).trim(),
    // Derived internally from the canonical top-level fields (now proven equal to the raw
    // idempotency_inputs copies above), not re-read from the raw copies.
    idempotencyInputs: {
      organizationDomain, serviceLane, sourceUrl,
      signalKey: String(raw.idempotency_inputs.signal_key || '')
    },
    gate, messageContent, rejectionReasonCodes
  };
}

/** Parses a JSONL batch (one JSON object per non-empty line). Every line is attempted -- a
 * malformed or schema-invalid line is collected as an error with its 1-indexed line number. */
export function parseCommercialIntelligenceJsonl(text) {
  const lines = String(text || '').split('\n').map(line => line.trim()).filter(Boolean);
  const records = [];
  const errors = [];
  lines.forEach((line, index) => {
    const row = index + 1;
    let parsed;
    try { parsed = JSON.parse(line); }
    catch { errors.push({ row, code: 'jsonl-parse-error', message: `line ${row} is not valid JSON` }); return; }
    try { records.push(validateCommercialIntelligenceRecord(parsed, row)); }
    catch (error) { errors.push({ row, code: error.code || 'record-invalid', message: error.message }); }
  });
  return { records, errors };
}

/** Parses a CSV batch via this repo's existing parseCsv (./csv.mjs). Object/array-valued fields
 * must be supplied as JSON-encoded cell values. */
export function parseCommercialIntelligenceCsv(text) {
  const rows = parseCsv(text);
  const records = [];
  const errors = [];
  for (const row of rows) {
    const rowNumber = row.__row;
    let candidate;
    try {
      candidate = {
        ...row,
        source: row.source ? JSON.parse(row.source) : undefined,
        contact: row.contact ? JSON.parse(row.contact) : undefined,
        idempotency_inputs: row.idempotency_inputs ? JSON.parse(row.idempotency_inputs) : undefined,
        risks: row.risks ? JSON.parse(row.risks) : undefined,
        evidence_required: row.evidence_required ? JSON.parse(row.evidence_required) : undefined,
        prohibited_claims: row.prohibited_claims ? JSON.parse(row.prohibited_claims) : undefined,
        reason_codes: row.reason_codes ? JSON.parse(row.reason_codes) : undefined,
        expected_value_cents: row.expected_value_cents !== undefined ? Number(row.expected_value_cents) : undefined,
        owner_minutes: row.owner_minutes !== undefined ? Number(row.owner_minutes) : undefined,
        delivery_hours: row.delivery_hours !== undefined ? Number(row.delivery_hours) : undefined,
        recurring_potential: row.recurring_potential !== '' && row.recurring_potential !== undefined ? Number(row.recurring_potential) : undefined
      };
    } catch {
      errors.push({ row: rowNumber, code: 'csv-json-cell-invalid', message: `row ${rowNumber}: source/contact/idempotency_inputs/risks/evidence_required/prohibited_claims/reason_codes must be valid JSON in their CSV cell` });
      continue;
    }
    try { records.push(validateCommercialIntelligenceRecord(candidate, rowNumber)); }
    catch (error) { errors.push({ row: rowNumber, code: error.code || 'record-invalid', message: error.message }); }
  }
  return { records, errors };
}

/** Evidence freshness per the shared handoff contract's own target. */
export function isEvidenceFresh(record, { maxAgeDays = 30, at = new Date() } = {}) {
  const capturedAt = new Date(record.source.capturedAt);
  const ageMs = at.getTime() - capturedAt.getTime();
  const freshByAge = !Number.isNaN(capturedAt.getTime()) && ageMs >= 0 && ageMs <= maxAgeDays * 86400000;
  const freshByExpiry = !record.source.expiresAt || new Date(record.source.expiresAt) > at;
  return freshByAge && freshByExpiry;
}

/** The only supported way to find opportunities actually ready for outreach:
 * policy-rejected opportunities have stage:'policy_rejected' and are never returned here. */
export async function listQueueableOpportunities(store) {
  return store.list('opportunities', { filters: { stage: 'ready_for_message' } });
}

function normalizedContentHash(subject, body) {
  return crypto.createHash('sha256').update(`${subject.trim().toLowerCase()}\n${body.trim().toLowerCase()}`).digest('hex');
}

// Second-pass audit item 4: content_hash previously stood in for signalKey or the record id --
// neither reflects the evidence's actual content, so two genuinely different observations (or two
// genuinely identical ones) could never be told apart by identity alone. Hashing the real content
// fields means: (a) two records that legitimately observed the exact same snapshot (same url,
// excerpt, capture time, official flag, confidence, source type) correctly resolve to one evidence
// row -- the "distinct opportunities share the same evidence identity" case; (b) a genuinely fresher
// re-crawl (different excerpt and/or capturedAt) always gets its OWN new row rather than silently
// reusing an older, staler snapshot's identity, so evidence history is preserved rather than
// overwritten.
function computeEvidenceContentHash(record) {
  const normalized = JSON.stringify({
    url: record.source.url.trim().toLowerCase(),
    sourceType: record.source.type.trim().toLowerCase(),
    excerpt: record.source.excerpt.trim().toLowerCase(),
    capturedAt: record.source.capturedAt,
    official: record.source.official,
    confidence: record.source.confidence
  });
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function buildSourceEvidence(record) {
  return {
    id: id('ev'), organizationDomain: record.organizationDomain, sourceUrl: record.source.url,
    sourceType: record.source.type, status: 'active', contactEmail: record.contact?.email || null,
    contentHash: computeEvidenceContentHash(record),
    signalKey: record.idempotencyInputs.signalKey || null,
    capturedAt: record.source.capturedAt, expiresAt: record.source.expiresAt,
    data: { excerpt: record.source.excerpt, official: record.source.official, confidence: record.source.confidence }
  };
}

/** Atomically resolves the source-evidence row for `record` inside transaction `tx`: a single
 * INSERT...ON CONFLICT...RETURNING (store.mjs#findOrCreate), never a catch-then-query -- see the
 * module doc comment's item 1. */
async function resolveSourceEvidence(tx, record) {
  const { record: evidence } = await tx.findOrCreate('sourceEvidence', buildSourceEvidence(record), SOURCE_EVIDENCE_UNIQUE_COLUMNS);
  return evidence;
}

function computeScoreAndPolicy(record, cfg, at, suppressions) {
  const dimensions = {
    activeDemand: record.source.confidence * 10, abilityToPay: record.competition ? 5 : 6,
    capabilityFit: SUPPORTED_SERVICE_LANES.includes(record.serviceLane) ? 8 : 0,
    evidenceConfidence: record.source.confidence * 10, timeToCash: 6, grossProfit: 6,
    ownerEfficiency: record.ownerMinutes > 0 ? Math.max(0, 10 - record.ownerMinutes / 5) : 10,
    deliveryEase: record.deliveryHours > 0 ? Math.max(0, 10 - record.deliveryHours / 4) : 8,
    recurringPotential: record.recurringPotential ?? 0, strategicLeverage: 5
  };
  const score = scoreOpportunity(dimensions);
  const policyResult = evaluateOpportunityPolicy({
    opportunity: { serviceLane: record.serviceLane, expectedValueCents: record.expectedValueCents, ownerMinutes: record.ownerMinutes, expiresAt: record.expiresAt },
    prospect: {
      website: record.organizationDomain, domain: record.organizationDomain, status: 'new',
      contact: record.contact ? { email: record.contact.email, source: record.contact.publishedOfficially ? 'website' : 'other', verified: 'unverified' } : {}
    },
    evidence: [{ sourceUrl: record.source.url, sourceType: record.source.type, official: record.source.official, status: 'active', capturedAt: record.source.capturedAt, expiresAt: record.source.expiresAt }],
    // Canon/V3 integration bug fix (found while building the seven-day simulation harness):
    // evaluateOpportunityPolicy's parameter is named `date`, not `at` -- passing `at` here left it
    // silently defaulting to `new Date()` (real wall-clock time) regardless of the `at` a caller
    // supplied, so a deterministic/simulated `at` never actually reached the freshness check.
    // Invisible in production (real callers always pass an `at` approximately equal to the real
    // "now" anyway) but it broke deterministic testing/simulation with a non-current `at`.
    suppressions, cfg, date: at
  });
  return { score, policyResult };
}

// Second-pass audit item 5: partner_route/offer/rejection previously bypassed every acceptance
// check opportunities get (freshness is checked separately by the caller; this covers the rest:
// official source, supported lane, suppression, contact provenance/prohibited-mailbox). Every code
// this returns is asserted against the canonical registry.
function commonEvidenceReasonCodes(record, suppressions) {
  const reasonCodes = [];
  if (!SUPPORTED_SERVICE_LANES.includes(record.serviceLane)) reasonCodes.push('unsupported-service-lane');
  if (record.source.official !== true) reasonCodes.push('missing-current-official-evidence');
  const contactResult = contactEligibility(
    record.contact ? { email: record.contact.email, source: record.contact.publishedOfficially ? 'website' : 'other', verified: 'unverified' } : {},
    { website: record.organizationDomain, domain: record.organizationDomain }
  );
  if (!contactResult.ok) reasonCodes.push(canonicalizeContactReason(contactResult.reason));
  const domain = record.organizationDomain;
  const recipientEmail = String(record.contact?.email || '').trim().toLowerCase();
  const suppressionSet = new Set((suppressions || []).map(item => String(item?.value ?? item ?? '').trim().toLowerCase()).filter(Boolean));
  if (recipientEmail && suppressionSet.has(recipientEmail)) reasonCodes.push('recipient-suppressed');
  if (domain && suppressionSet.has(domain)) reasonCodes.push('domain-suppressed');
  return [...new Set(reasonCodes)].map(assertCanonicalReasonCode);
}

function buildOpportunityRow(record, { idempotencyKey, evidenceId, stage, score }) {
  return {
    id: record.id, idempotencyKey, sourceEvidenceId: evidenceId, stage,
    serviceLane: record.serviceLane, geography: record.geography,
    expectedValueCents: record.expectedValueCents, currency: record.currency,
    // probabilityBps has no import-time signal yet -- 0 is the column's own DEFAULT, set
    // explicitly here because Postgres inserts always specify every mapped column
    // (store.mjs#postgresValues), and an explicit NULL is not "use the DEFAULT".
    probabilityBps: 0,
    ownerMinutes: record.ownerMinutes, deliveryHours: record.deliveryHours,
    scoreTotal: score.total, scoreVersion: score.version, expiresAt: record.expiresAt,
    data: { organization: record.organization, buyerSignal: record.buyerSignal, risks: record.risks, killCondition: record.killCondition, score }
  };
}

function buildPolicyDecisionRow(record, opportunityId, policyResult) {
  return {
    id: id('policy'), opportunityId, policyVersion: REVENUE_OS_POLICY_VERSION,
    decision: policyResult.decision, reasonCodes: policyResult.reasonCodes, evaluatedAt: policyResult.evaluatedAt,
    data: { evidenceIds: policyResult.evidenceIds }
  };
}

function recordIdempotencyKey(record) {
  return opportunityIdempotencyKey({
    organizationDomain: record.organizationDomain, serviceLane: record.serviceLane,
    sourceUrl: record.source.url, signalKey: record.idempotencyInputs.signalKey
  });
}

/** Handles one 'opportunity' record. Preview: read-only duplicate check + score + policy, zero
 * writes. Commit: one store.transaction() -- compute-then-write, insert evidence/opportunity/
 * policy-decision/audit-event together, roll back the whole record on any failure. */
async function processOpportunity(store, record, { commit, cfg, at, previewAcceptedIds, previewRejectedIds }) {
  if (!SUPPORTED_SERVICE_LANES.includes(record.serviceLane)) {
    throw new CommercialIntelligenceImportError('unsupported-service-lane', 'unsupported-service-lane');
  }
  if (!isEvidenceFresh(record, { maxAgeDays: cfg.revenueOs?.maxEvidenceAgeDays, at })) {
    if (commit) await store.log(CANONICAL_AUDIT_EVENTS.STALE_REJECTED, { id: record.id, organizationDomain: record.organizationDomain });
    return { status: 'stale', data: { id: record.id, organizationDomain: record.organizationDomain } };
  }
  const idempotencyKey = recordIdempotencyKey(record);

  if (!commit) {
    const existing = await store.list('opportunities', { filters: { idempotencyKey } });
    if (existing.length > 0) return { status: 'duplicate', data: { id: record.id, idempotencyKey } };
    const suppressions = await store.list('suppressions');
    const { score, policyResult } = computeScoreAndPolicy(record, cfg, at, suppressions);
    const stage = policyResult.decision === 'pass' ? 'ready_for_message' : 'policy_rejected';
    // PR #6 second-pass audit item 2: accepted and policy-rejected ids are tracked SEPARATELY, so a
    // same-batch owner_gate/message_variant can only link to an id in the accepted set.
    if (stage === 'ready_for_message') previewAcceptedIds?.add(record.id);
    else previewRejectedIds?.add(record.id);
    const data = {
      id: record.id, idempotencyKey, organization: record.organization, organizationDomain: record.organizationDomain,
      serviceLane: record.serviceLane, stage, scoreTotal: score.total,
      policyDecision: policyResult.decision, reasonCodes: policyResult.reasonCodes
    };
    return { status: stage === 'ready_for_message' ? 'accepted' : 'policyRejected', data };
  }

  try {
    const outcome = await store.transaction(async tx => {
      const existing = await tx.list('opportunities', { filters: { idempotencyKey } });
      if (existing.length > 0) return { duplicate: true };

      const suppressions = await tx.list('suppressions');
      const { score, policyResult } = computeScoreAndPolicy(record, cfg, at, suppressions);
      const stage = policyResult.decision === 'pass' ? 'ready_for_message' : 'policy_rejected';

      const evidence = await resolveSourceEvidence(tx, record);
      const opportunity = await tx.add('opportunities', buildOpportunityRow(record, { idempotencyKey, evidenceId: evidence.id, stage, score }));
      const policyDecision = await tx.add('policyDecisions', buildPolicyDecisionRow(record, opportunity.id, policyResult));
      await tx.log(stage === 'ready_for_message' ? CANONICAL_AUDIT_EVENTS.ACCEPTED : CANONICAL_AUDIT_EVENTS.POLICY_REJECTED, {
        id: record.id, opportunityId: opportunity.id, idempotencyKey, reasonCodes: policyResult.reasonCodes
      });
      return { opportunity, policyDecision: policyResult, score, stage };
    });

    if (outcome.duplicate) {
      await store.log(CANONICAL_AUDIT_EVENTS.DUPLICATE_REJECTED, { id: record.id, idempotencyKey });
      return { status: 'duplicate', data: { id: record.id, idempotencyKey } };
    }
    return {
      status: outcome.stage === 'ready_for_message' ? 'accepted' : 'policyRejected',
      data: { ...outcome.opportunity, scoreTotal: outcome.score.total, policyDecision: outcome.policyDecision }
    };
  } catch (error) {
    await store.log(CANONICAL_AUDIT_EVENTS.TRANSACTION_ROLLED_BACK, { id: record.id, recordType: 'opportunity', reason: error.message });
    if (error instanceof ConflictError) {
      await store.log(CANONICAL_AUDIT_EVENTS.DUPLICATE_REJECTED, { id: record.id, idempotencyKey, reason: error.message });
      return { status: 'duplicate', data: { id: record.id, idempotencyKey } };
    }
    throw error;
  }
}

/** PR #6 second-pass audit item 2: existence alone is insufficient -- an owner_gate or
 * message_variant may only link to an opportunity whose stage is 'ready_for_message'. In preview
 * mode this checks ONLY the accepted-ids set built so far in this batch (never the rejected set);
 * in commit mode it re-reads the real, already-committed opportunity row and checks its stage. */
async function requireOpportunityReadyForMessage(store, opportunityId, previewAcceptedIds, recordId, recordLabel) {
  if (previewAcceptedIds) {
    if (!previewAcceptedIds.has(opportunityId)) {
      throw new CommercialIntelligenceImportError(`${recordLabel}-opportunity-not-ready`, `${recordLabel} ${recordId} references opportunity ${opportunityId}, which is not an accepted (ready_for_message) opportunity in this preview batch`);
    }
    return;
  }
  const opportunity = await store.get('opportunities', opportunityId);
  if (!opportunity) throw new CommercialIntelligenceImportError(`${recordLabel}-opportunity-not-found`, `${recordLabel} ${recordId} references unknown opportunity ${opportunityId}`);
  if (opportunity.stage !== 'ready_for_message') {
    throw new CommercialIntelligenceImportError(`${recordLabel}-opportunity-not-ready`, `${recordLabel} ${recordId} references opportunity ${opportunityId} with stage '${opportunity.stage}', not ready_for_message`);
  }
}

/** Handles one 'owner_gate' record. buildOwnerGate (revenue-os.mjs) enforces the value floor,
 * minutes ceiling, USD-only currency, and future-expiry bounds; this function additionally enforces
 * that the referenced opportunity exists AND is accepted (ready_for_message). */
async function processOwnerGate(store, record, { commit, at, previewAcceptedIds }) {
  await requireOpportunityReadyForMessage(store, record.gate.opportunityId, previewAcceptedIds, record.id, 'gate');

  const gate = buildOwnerGate({
    id: record.id, opportunityId: record.gate.opportunityId, gateType: record.gate.gateType,
    expectedValueCents: record.expectedValueCents, currency: record.currency, ownerMinutes: record.ownerMinutes,
    expiresAt: record.expiresAt, action: record.gate.action, evidenceRequired: record.gate.evidenceRequired,
    risk: record.competition, killCondition: record.killCondition, now: at
  });

  if (!commit) return { status: 'ownerGate', data: gate };

  try {
    const saved = await store.transaction(async tx => {
      const row = await tx.add('ownerGates', gate);
      await tx.log(CANONICAL_AUDIT_EVENTS.OWNER_GATE_CREATED, { id: record.id, opportunityId: record.gate.opportunityId, gateType: gate.gateType });
      return row;
    });
    return { status: 'ownerGate', data: saved };
  } catch (error) {
    await store.log(CANONICAL_AUDIT_EVENTS.TRANSACTION_ROLLED_BACK, { id: record.id, recordType: 'owner_gate', reason: error.message });
    if (error instanceof ConflictError) return { status: 'duplicate', data: { id: record.id, reason: 'duplicate-owner-gate' } };
    throw error;
  }
}

/** Handles one 'message_variant' record: real subject/body, hashed together, linked to an
 * opportunity that must be accepted (ready_for_message), not merely present. */
async function processMessageVariant(store, record, { commit, previewAcceptedIds }) {
  await requireOpportunityReadyForMessage(store, record.messageContent.opportunityId, previewAcceptedIds, record.id, 'message');

  const bodyHash = normalizedContentHash(record.messageContent.subject, record.messageContent.body);
  const row = () => ({
    id: record.id, campaignId: null, experimentId: record.messageContent.experimentId,
    opportunityId: record.messageContent.opportunityId, lane: record.serviceLane,
    subject: record.messageContent.subject, body: record.messageContent.body, bodyHash, status: 'draft',
    data: { prohibitedClaims: record.messageContent.prohibitedClaims }
  });

  if (!commit) return { status: 'messageVariant', data: row() };

  try {
    const saved = await store.transaction(async tx => {
      const savedRow = await tx.add('messageVariants', row());
      await tx.log(CANONICAL_AUDIT_EVENTS.MESSAGE_VARIANT_IMPORTED, { id: record.id, opportunityId: record.messageContent.opportunityId, bodyHash });
      return savedRow;
    });
    return { status: 'messageVariant', data: saved };
  } catch (error) {
    await store.log(CANONICAL_AUDIT_EVENTS.TRANSACTION_ROLLED_BACK, { id: record.id, recordType: 'message_variant', reason: error.message });
    if (error instanceof ConflictError) return { status: 'duplicate', data: { id: record.id, reason: 'duplicate-message-variant' } };
    throw error;
  }
}

const PARTNER_ROUTE_OFFER_REJECTION_COLLECTIONS = Object.freeze({ partner_route: 'partnerRoutes', offer: 'offers', rejection: 'rejections' });
const PARTNER_ROUTE_OFFER_REJECTION_STATUS = Object.freeze({ partner_route: 'partnerRoute', offer: 'offer', rejection: 'rejectionRecord' });

/** Handles 'partner_route' / 'offer' / 'rejection' records: full persistence into
 * migrations/006_pr6_repair.sql's dedicated tables, gated by the same common evidence/policy
 * validation opportunities get (freshness, official source, supported lane, suppression, contact
 * provenance/prohibited-mailbox). */
async function processPartnerRouteOfferOrRejection(store, record, { commit, cfg, at }) {
  const collection = PARTNER_ROUTE_OFFER_REJECTION_COLLECTIONS[record.recordType];
  const status = PARTNER_ROUTE_OFFER_REJECTION_STATUS[record.recordType];

  if (!isEvidenceFresh(record, { maxAgeDays: cfg.revenueOs?.maxEvidenceAgeDays, at })) {
    if (commit) await store.log(CANONICAL_AUDIT_EVENTS.STALE_REJECTED, { id: record.id, recordType: record.recordType, organizationDomain: record.organizationDomain });
    return { status: 'stale', data: { id: record.id, organizationDomain: record.organizationDomain } };
  }

  const idempotencyKey = recordIdempotencyKey(record);

  // rejections has a narrower column set than partner_routes/offers (migrations/006_pr6_repair.sql
  // has no expected_value_cents/currency/owner_minutes/delivery_hours/expires_at on that table --
  // a rejection is a negative signal, not a priced opportunity). Its reason_codes column holds the
  // record's own explicit, canonical-validated reason_codes field -- never `risks`.
  const detail = { organization: record.organization, buyerSignal: record.buyerSignal, risks: record.risks, killCondition: record.killCondition };
  const buildRow = evidenceId => record.recordType === 'rejection'
    ? { id: record.id, idempotencyKey, organizationDomain: record.organizationDomain, serviceLane: record.serviceLane, reasonCodes: record.rejectionReasonCodes, sourceEvidenceId: evidenceId, data: detail }
    : {
        id: record.id, idempotencyKey, organizationDomain: record.organizationDomain, serviceLane: record.serviceLane,
        geography: record.geography, expectedValueCents: record.expectedValueCents, currency: record.currency,
        ownerMinutes: record.ownerMinutes, deliveryHours: record.deliveryHours, sourceEvidenceId: evidenceId,
        expiresAt: record.expiresAt, data: detail
      };

  if (!commit) {
    const existing = await store.list(collection, { filters: { idempotencyKey } });
    if (existing.length > 0) return { status: 'duplicate', data: { id: record.id, idempotencyKey } };
    const suppressions = await store.list('suppressions');
    const reasonCodes = commonEvidenceReasonCodes(record, suppressions);
    if (reasonCodes.length) throw new CommercialIntelligenceImportError('policy-rejected', `${record.recordType} ${record.id} failed common evidence/policy checks: ${reasonCodes.join(', ')}`);
    return { status, data: buildRow(null) };
  }

  try {
    const outcome = await store.transaction(async tx => {
      const existing = await tx.list(collection, { filters: { idempotencyKey } });
      if (existing.length > 0) return { duplicate: true };
      const suppressions = await tx.list('suppressions');
      const reasonCodes = commonEvidenceReasonCodes(record, suppressions);
      if (reasonCodes.length) return { invalid: true, reasonCodes };
      const evidence = await resolveSourceEvidence(tx, record);
      const saved = await tx.add(collection, buildRow(evidence.id));
      await tx.log(CANONICAL_AUDIT_EVENTS.ACCEPTED, { id: record.id, recordType: record.recordType, organizationDomain: record.organizationDomain, idempotencyKey });
      return { saved };
    });
    if (outcome.duplicate) {
      await store.log(CANONICAL_AUDIT_EVENTS.DUPLICATE_REJECTED, { id: record.id, recordType: record.recordType, idempotencyKey });
      return { status: 'duplicate', data: { id: record.id, idempotencyKey } };
    }
    if (outcome.invalid) {
      await store.log(CANONICAL_AUDIT_EVENTS.INVALID_REJECTED, { id: record.id, recordType: record.recordType, reasonCodes: outcome.reasonCodes });
      throw new CommercialIntelligenceImportError('policy-rejected', `${record.recordType} ${record.id} failed common evidence/policy checks: ${outcome.reasonCodes.join(', ')}`);
    }
    return { status, data: outcome.saved };
  } catch (error) {
    if (error instanceof CommercialIntelligenceImportError) throw error;
    await store.log(CANONICAL_AUDIT_EVENTS.TRANSACTION_ROLLED_BACK, { id: record.id, recordType: record.recordType, reason: error.message });
    if (error instanceof ConflictError) return { status: 'duplicate', data: { id: record.id, idempotencyKey } };
    throw error;
  }
}

/**
 * Imports a batch of already-validated commercial-intelligence records.
 *
 * `mode: 'preview'` (default, fail-safe) validates, normalizes, scores, and policy-evaluates every
 * record but writes NOTHING to the store at all -- not an opportunity, evidence, policy decision,
 * gate, message variant, partner route, offer, rejection row, nor any audit-log entry, not even a
 * batch-level summary one. Every fact a preview run establishes is returned directly in this
 * function's return value; if a caller wants a durable trace of a preview, persisting the returned
 * report is the caller's decision to make, not this function's.
 *
 * `mode: 'commit'` performs the same computation and additionally persists everything, one
 * store.transaction() per record, with a canonical audit event for every outcome (including one
 * batch-level 'commercial_intelligence_import_committed' summary entry).
 */
export async function importCommercialIntelligenceBatch(store, records, { mode = 'preview', cfg = {}, at = new Date() } = {}) {
  if (mode !== 'preview' && mode !== 'commit') {
    throw new CommercialIntelligenceImportError('invalid-mode', `mode must be 'preview' or 'commit', got: ${mode}`);
  }
  const commit = mode === 'commit';

  const accepted = [];
  const policyRejected = [];
  const rejectedDuplicate = [];
  const rejectedStale = [];
  const rejectedInvalid = [];
  const ownerGatesCreated = [];
  const messageVariantsImported = [];
  const partnerRoutesImported = [];
  const offersImported = [];
  const rejectionsImported = [];
  const previewAcceptedIds = commit ? null : new Set();
  const previewRejectedIds = commit ? null : new Set();

  for (const record of records) {
    try {
      let outcome;
      if (record.recordType === 'owner_gate') outcome = await processOwnerGate(store, record, { commit, at, previewAcceptedIds });
      else if (record.recordType === 'message_variant') outcome = await processMessageVariant(store, record, { commit, previewAcceptedIds });
      else if (record.recordType === 'partner_route' || record.recordType === 'offer' || record.recordType === 'rejection') outcome = await processPartnerRouteOfferOrRejection(store, record, { commit, cfg, at });
      else outcome = await processOpportunity(store, record, { commit, cfg, at, previewAcceptedIds, previewRejectedIds });

      switch (outcome.status) {
        case 'accepted': accepted.push(outcome.data); break;
        case 'policyRejected': policyRejected.push(outcome.data); break;
        case 'duplicate': rejectedDuplicate.push(outcome.data); break;
        case 'stale': rejectedStale.push(outcome.data); break;
        case 'ownerGate': ownerGatesCreated.push(outcome.data); break;
        case 'messageVariant': messageVariantsImported.push(outcome.data); break;
        case 'partnerRoute': partnerRoutesImported.push(outcome.data); break;
        case 'offer': offersImported.push(outcome.data); break;
        case 'rejectionRecord': rejectionsImported.push(outcome.data); break;
      }
    } catch (error) {
      rejectedInvalid.push({ id: record.id, reason: error.message, code: error.code });
      if (commit) await store.log(CANONICAL_AUDIT_EVENTS.INVALID_REJECTED, { id: record.id, recordType: record.recordType, reason: error.message, code: error.code });
    }
  }

  const summary = {
    recordCount: records.length,
    acceptedCount: accepted.length, policyRejectedCount: policyRejected.length,
    rejectedDuplicateCount: rejectedDuplicate.length, rejectedStaleCount: rejectedStale.length,
    rejectedInvalidCount: rejectedInvalid.length, ownerGatesCreatedCount: ownerGatesCreated.length,
    messageVariantsImportedCount: messageVariantsImported.length,
    partnerRoutesImportedCount: partnerRoutesImported.length, offersImportedCount: offersImported.length,
    rejectionsImportedCount: rejectionsImported.length
  };
  // Only commit mode writes anything -- including its own audit trail. Preview's evidence is the
  // return value itself (see the doc comment above).
  if (commit) await store.log(CANONICAL_AUDIT_EVENTS.IMPORT_COMMITTED, summary);

  return {
    mode, durableWrites: commit, zeroLiveSend: true, // structural: no send path exists in this file regardless of mode
    ...summary,
    accepted, policyRejected,
    rejectedDuplicate, rejectedStale, rejectedInvalid,
    ownerGatesCreated, messageVariantsImported, partnerRoutesImported, offersImported, rejectionsImported,
    importedAt: now()
  };
}
