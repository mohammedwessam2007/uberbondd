// Commercial Intelligence Importer (Revenue OS V2, mission steps 3-10). Validates JSONL/CSV
// batches from ChatGPT Work against UBERBOND_AI_REVENUE_SWARM.../04_COMMERCIAL_INTELLIGENCE_SCHEMA.json
// (transcribed here as hand-written validation, matching this repo's existing style --
// prospect-import.mjs, json-import.mjs -- no new JSON-Schema library dependency), normalizes
// domains/contacts, computes idempotency keys, rejects duplicates and stale evidence, stores
// versioned policy decisions, and creates owner gates ONLY for `record_type: 'owner_gate'`
// records. This module has no send capability of any kind -- there is no code path here that
// could contact anyone, so "never send mail" is true structurally, not by a flag someone could
// flip.
//
// Reuses, never duplicates: parseCsv (./csv.mjs), id/now/normalizeDomain (./utils.mjs),
// ConflictError (./store.mjs), and revenue-os.mjs's own opportunityIdempotencyKey,
// evaluateOpportunityPolicy, scoreOpportunity, buildOwnerGate, SUPPORTED_SERVICE_LANES,
// OWNER_GATE_TYPES -- this file adds only the batch-ingestion/validation layer on top.
import { parseCsv } from './csv.mjs';
import { id, now, normalizeDomain } from './utils.mjs';
import { ConflictError } from './store.mjs';
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

// Record types this importer can persist into a real, already-migrated table (see
// migrations/005_revenue_os_control_plane.sql). partner_route/offer/rejection are still fully
// schema-validated below, but this mission's tranche did not add dedicated tables for them -- see
// PARTIAL_PERSISTENCE_RECORD_TYPES and this module's own doc comment on importCommercialIntelligenceBatch
// for the disclosed limitation, rather than inventing new schema beyond what was actually applied.
export const PERSISTABLE_RECORD_TYPES = Object.freeze(['opportunity', 'message_variant', 'owner_gate']);
export const PARTIAL_PERSISTENCE_RECORD_TYPES = Object.freeze(['partner_route', 'offer', 'rejection']);

function isIsoDateTime(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

/** Validates one raw commercial-intelligence record against the schema's exact contract. Throws
 * CommercialIntelligenceImportError with a `row` on the error object when rowContext is supplied,
 * so a batch-level caller can report which line/row failed without losing the reason. */
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

  return {
    id: recordId,
    recordType: raw.record_type,
    organization: String(raw.organization || '').trim(),
    organizationDomain: normalizeDomain(raw.organization_domain || ''),
    geography: String(raw.geography || '').trim(),
    source: {
      url: String(raw.source.url), type: String(raw.source.type || '').trim(),
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
    serviceLane: String(raw.service_lane || '').trim().toLowerCase(),
    buyerSignal: String(raw.buyer_signal || '').trim(),
    expectedValueCents, currency: String(raw.currency || 'USD').trim().toUpperCase(),
    ownerMinutes, deliveryHours,
    expiresAt: new Date(Date.parse(raw.expires_at)).toISOString(),
    competition: raw.competition ? String(raw.competition).trim() : '',
    recurringPotential: raw.recurring_potential !== undefined ? Number(raw.recurring_potential) : null,
    risks: raw.risks.map(String),
    killCondition: String(raw.kill_condition).trim(),
    idempotencyInputs: {
      organizationDomain: normalizeDomain(raw.idempotency_inputs.organization_domain || ''),
      serviceLane: String(raw.idempotency_inputs.service_lane || '').trim().toLowerCase(),
      sourceUrl: String(raw.idempotency_inputs.source_url || ''),
      signalKey: String(raw.idempotency_inputs.signal_key || '')
    }
  };
}

/** Parses a JSONL batch (one JSON object per non-empty line). Every line is attempted -- a
 * malformed or schema-invalid line is collected as an error with its 1-indexed line number, it
 * does not abort parsing of the rest of the batch (a caller reviewing a large ChatGPT Work batch
 * needs to see every problem at once, not fix-and-rerun one at a time). */
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

/** Parses a CSV batch via this repo's existing parseCsv (./csv.mjs). CSV is flat, so the
 * object-valued fields the schema requires (source, contact, idempotency_inputs) and the
 * array-valued field (risks) must be supplied as JSON-encoded cell values (a CSV convention this
 * function documents rather than silently working around by inventing implicit structure). */
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
        expected_value_cents: row.expected_value_cents !== undefined ? Number(row.expected_value_cents) : undefined,
        owner_minutes: row.owner_minutes !== undefined ? Number(row.owner_minutes) : undefined,
        delivery_hours: row.delivery_hours !== undefined ? Number(row.delivery_hours) : undefined,
        recurring_potential: row.recurring_potential !== '' && row.recurring_potential !== undefined ? Number(row.recurring_potential) : undefined
      };
    } catch {
      errors.push({ row: rowNumber, code: 'csv-json-cell-invalid', message: `row ${rowNumber}: source/contact/idempotency_inputs/risks must be valid JSON in their CSV cell` });
      continue;
    }
    try { records.push(validateCommercialIntelligenceRecord(candidate, rowNumber)); }
    catch (error) { errors.push({ row: rowNumber, code: error.code || 'record-invalid', message: error.message }); }
  }
  return { records, errors };
}

/** Evidence freshness per the shared handoff contract's own target (98% of accepted opportunities
 * must carry evidence fresher than maxAgeDays, and not past its own stated expiry). */
export function isEvidenceFresh(record, { maxAgeDays = 30, at = new Date() } = {}) {
  const capturedAt = new Date(record.source.capturedAt);
  const ageMs = at.getTime() - capturedAt.getTime();
  const freshByAge = !Number.isNaN(capturedAt.getTime()) && ageMs >= 0 && ageMs <= maxAgeDays * 86400000;
  const freshByExpiry = !record.source.expiresAt || new Date(record.source.expiresAt) > at;
  return freshByAge && freshByExpiry;
}

/**
 * Imports one already-validated batch of commercial-intelligence records into the store. This
 * function never sends anything to anyone -- it has no email/HTTP-outbound dependency of any
 * kind, so `dryRun` is reported in the return summary for transparency but is not actually a
 * switch that enables sending; there is nothing here that could send regardless of its value.
 *
 * Per record:
 *   - stale or duplicate (by idempotency key) records are rejected before any store write;
 *   - 'opportunity' records get a sourceEvidence row, an opportunities row (idempotency_key
 *     unique constraint is the authoritative duplicate guard -- the pre-check above is a fast
 *     path, not the only one), a deterministic score, and a policyDecisions row;
 *   - 'message_variant' records get a messageVariants row;
 *   - 'owner_gate' records get an ownerGates row via revenue-os.mjs#buildOwnerGate, gated on
 *     OWNER_GATE_TYPES -- an owner_gate record naming an unsupported gate_type is rejected, not
 *     silently coerced into one that happens to validate;
 *   - 'partner_route' / 'offer' / 'rejection' records are fully schema-validated (see
 *     validateCommercialIntelligenceRecord) but this mission's applied migration
 *     (005_revenue_os_control_plane.sql) did not add dedicated tables for them. They are counted
 *     as `partiallyPersisted` and written to the existing generic `auditLog` collection so the
 *     record is not silently discarded, but they do NOT get their own queryable table this pass --
 *     a disclosed limitation, not a claim of full persistence.
 */
export async function importCommercialIntelligenceBatch(store, records, { dryRun = true, cfg = {}, at = new Date() } = {}) {
  const imported = [];
  const rejectedDuplicate = [];
  const rejectedStale = [];
  const rejectedInvalid = [];
  const ownerGatesCreated = [];
  const partiallyPersisted = [];

  for (const record of records) {
    if (record.recordType === 'owner_gate') {
      // 04_COMMERCIAL_INTELLIGENCE_SCHEMA.json has no field dedicated to "which owner-gate type is
      // this" -- it reuses the generic `service_lane` string across all 6 record_types. For
      // record_type:'owner_gate' this importer therefore expects `service_lane` to hold one of
      // revenue-os.mjs's OWNER_GATE_TYPES (e.g. 'marketplace-submission'), not a service lane --
      // buildOwnerGate itself rejects anything else, so a mismatched value fails loudly here
      // (rejectedInvalid) rather than silently creating a gate of the wrong type.
      try {
        const gate = buildOwnerGate({
          id: record.id, opportunityId: null, gateType: record.serviceLane,
          expectedValueCents: record.expectedValueCents, currency: record.currency,
          ownerMinutes: record.ownerMinutes, expiresAt: record.expiresAt,
          action: record.buyerSignal, evidenceRequired: record.risks,
          risk: record.competition, killCondition: record.killCondition
        });
        const saved = await store.add('ownerGates', gate);
        ownerGatesCreated.push(saved);
      } catch (error) {
        rejectedInvalid.push({ id: record.id, reason: error.message });
      }
      continue;
    }

    if (record.recordType === 'message_variant') {
      try {
        const saved = await store.add('messageVariants', {
          id: record.id, lane: record.serviceLane, subject: record.buyerSignal.slice(0, 200),
          bodyHash: record.idempotencyInputs.signalKey || record.id, status: 'draft'
        });
        imported.push(saved);
      } catch (error) {
        if (error instanceof ConflictError) { rejectedDuplicate.push({ id: record.id, reason: 'duplicate-message-variant' }); continue; }
        rejectedInvalid.push({ id: record.id, reason: error.message });
      }
      continue;
    }

    if (PARTIAL_PERSISTENCE_RECORD_TYPES.includes(record.recordType)) {
      await store.log('commercial_intelligence_partial_persistence', { id: record.id, recordType: record.recordType, organizationDomain: record.organizationDomain });
      partiallyPersisted.push({ id: record.id, recordType: record.recordType });
      continue;
    }

    // record.recordType === 'opportunity' from here on.
    if (!SUPPORTED_SERVICE_LANES.includes(record.serviceLane)) { rejectedInvalid.push({ id: record.id, reason: 'unsupported-service-lane' }); continue; }
    if (!isEvidenceFresh(record, { maxAgeDays: cfg.revenueOs?.maxEvidenceAgeDays, at })) { rejectedStale.push({ id: record.id, organizationDomain: record.organizationDomain }); continue; }

    let idempotencyKey;
    try {
      idempotencyKey = opportunityIdempotencyKey({
        organizationDomain: record.idempotencyInputs.organizationDomain,
        serviceLane: record.idempotencyInputs.serviceLane,
        sourceUrl: record.idempotencyInputs.sourceUrl,
        signalKey: record.idempotencyInputs.signalKey
      });
    } catch (error) { rejectedInvalid.push({ id: record.id, reason: error.message }); continue; }

    const existing = await store.list('opportunities', { filters: { idempotencyKey } });
    if (existing.length > 0) { rejectedDuplicate.push({ id: record.id, idempotencyKey }); continue; }

    const evidence = await store.add('sourceEvidence', {
      id: id('ev'), organizationDomain: record.organizationDomain, sourceUrl: record.source.url,
      sourceType: record.source.type, status: 'active', contactEmail: record.contact?.email || null,
      contentHash: record.idempotencyInputs.signalKey || record.id,
      capturedAt: record.source.capturedAt, expiresAt: record.source.expiresAt,
      data: { excerpt: record.source.excerpt, official: record.source.official, confidence: record.source.confidence }
    });

    const dimensions = {
      activeDemand: record.source.confidence * 10, abilityToPay: record.competition ? 5 : 6,
      capabilityFit: SUPPORTED_SERVICE_LANES.includes(record.serviceLane) ? 8 : 0,
      evidenceConfidence: record.source.confidence * 10, timeToCash: 6, grossProfit: 6,
      ownerEfficiency: record.ownerMinutes > 0 ? Math.max(0, 10 - record.ownerMinutes / 5) : 10,
      deliveryEase: record.deliveryHours > 0 ? Math.max(0, 10 - record.deliveryHours / 4) : 8,
      recurringPotential: record.recurringPotential ?? 0, strategicLeverage: 5
    };
    const score = scoreOpportunity(dimensions);

    const opportunity = await store.add('opportunities', {
      id: record.id, idempotencyKey, sourceEvidenceId: evidence.id, stage: 'discovered',
      serviceLane: record.serviceLane, geography: record.geography,
      expectedValueCents: record.expectedValueCents, currency: record.currency,
      ownerMinutes: record.ownerMinutes, deliveryHours: record.deliveryHours,
      scoreTotal: score.total, scoreVersion: score.version, expiresAt: record.expiresAt,
      data: { organization: record.organization, buyerSignal: record.buyerSignal, risks: record.risks, killCondition: record.killCondition, score }
    });

    const policyResult = evaluateOpportunityPolicy({
      opportunity: { serviceLane: record.serviceLane, expectedValueCents: record.expectedValueCents, ownerMinutes: record.ownerMinutes, expiresAt: record.expiresAt },
      prospect: { website: record.organizationDomain, domain: record.organizationDomain, status: 'new', contact: record.contact ? { email: record.contact.email, source: record.contact.publishedOfficially ? 'website' : 'other', verified: 'unverified' } : {} },
      evidence: [{ id: evidence.id, sourceUrl: record.source.url, sourceType: record.source.type, official: record.source.official, status: 'active', capturedAt: record.source.capturedAt, expiresAt: record.source.expiresAt }],
      suppressions: await store.list('suppressions'),
      cfg, at
    });

    await store.add('policyDecisions', {
      id: id('policy'), opportunityId: opportunity.id, policyVersion: REVENUE_OS_POLICY_VERSION,
      decision: policyResult.decision, reasonCodes: policyResult.reasonCodes, evaluatedAt: policyResult.evaluatedAt,
      data: { evidenceIds: policyResult.evidenceIds }
    });

    imported.push({ ...opportunity, policyDecision: policyResult });
  }

  return {
    dryRun: true, // structural: this function has no send path, regardless of the dryRun argument
    importedCount: imported.length, imported,
    rejectedDuplicateCount: rejectedDuplicate.length, rejectedDuplicate,
    rejectedStaleCount: rejectedStale.length, rejectedStale,
    rejectedInvalidCount: rejectedInvalid.length, rejectedInvalid,
    ownerGatesCreatedCount: ownerGatesCreated.length, ownerGatesCreated,
    partiallyPersistedCount: partiallyPersisted.length, partiallyPersisted,
    importedAt: now()
  };
}
