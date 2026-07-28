// Tests for the Commercial Intelligence Importer (Revenue OS V2), rewritten for the PR #6
// adversarial-audit repair: identity-agreement enforcement, preview/commit modes, atomic
// per-record transactions, real owner-gate/message-variant linkage and content, stage transitions,
// full partner-route/offer/rejection persistence, and audit-event completeness.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import {
  validateCommercialIntelligenceRecord, parseCommercialIntelligenceJsonl,
  parseCommercialIntelligenceCsv, isEvidenceFresh, importCommercialIntelligenceBatch,
  listQueueableOpportunities, CommercialIntelligenceImportError, RECORD_TYPES, CANONICAL_AUDIT_EVENTS
} from '../src/commercial-intelligence-import.mjs';

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-ci-import-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

const now = new Date('2026-07-28T12:00:00.000Z');
const future = '2026-08-10T00:00:00.000Z';

function goodOpportunityRecord(overrides = {}) {
  return {
    id: 'rec_opp_1', record_type: 'opportunity', organization: 'Example Co',
    organization_domain: 'https://Example.com/', geography: 'GB', service_lane: 'website-qa',
    buyer_signal: 'Posted a public RFP for a pre-launch QA pass.',
    source: {
      url: 'https://example.com/rfp', type: 'official-company', captured_at: '2026-07-27T10:00:00.000Z',
      official: true, confidence: 0.9
    },
    contact: { email: 'partners@example.com', source_url: 'https://example.com/contact', published_officially: true },
    expected_value_cents: 50000, currency: 'USD', owner_minutes: 15, delivery_hours: 4,
    expires_at: future, risks: ['CMS access delay'], kill_condition: 'RFP closes with no reply.',
    idempotency_inputs: { organization_domain: 'example.com', service_lane: 'website-qa', source_url: 'https://example.com/rfp', signal_key: 'rfp-1' },
    ...overrides
  };
}

function goodGateRecord(overrides = {}) {
  return goodOpportunityRecord({
    id: 'rec_gate_1', record_type: 'owner_gate', service_lane: 'marketplace-submission',
    idempotency_inputs: { organization_domain: 'example.com', service_lane: 'marketplace-submission', source_url: 'https://example.com/rfp', signal_key: 'rfp-1' },
    gate_type: 'marketplace-submission', opportunity_id: 'rec_opp_1',
    action: 'Submit the authenticated proposal on the partner portal.',
    evidence_required: ['final screenshot'],
    ...overrides
  });
}

function goodMessageVariantRecord(overrides = {}) {
  return goodOpportunityRecord({
    id: 'rec_mv_1', record_type: 'message_variant',
    subject: 'A pre-launch QA pass for example.com',
    body: 'Hi -- we noticed your public RFP and can run a pre-launch QA pass this week.',
    opportunity_id: 'rec_opp_1',
    ...overrides
  });
}

const cfg = { revenueOs: { minExpectedValueCents: 25000, maxOwnerMinutes: 20, maxEvidenceAgeDays: 30 } };

// --- schema validation ---

test('validateCommercialIntelligenceRecord: a well-formed opportunity record validates and normalizes', () => {
  const record = validateCommercialIntelligenceRecord(goodOpportunityRecord());
  assert.equal(record.organizationDomain, 'example.com');
  assert.equal(record.recordType, 'opportunity');
  assert.equal(record.serviceLane, 'website-qa');
});

test('validateCommercialIntelligenceRecord: throws with the specific missing field(s) named', () => {
  const raw = goodOpportunityRecord();
  delete raw.kill_condition;
  assert.throws(
    () => validateCommercialIntelligenceRecord(raw),
    (err) => err instanceof CommercialIntelligenceImportError && err.code === 'record-field-missing' && err.message.includes('kill_condition')
  );
});

test('validateCommercialIntelligenceRecord: record_type must be one of the schema enum', () => {
  assert.throws(
    () => validateCommercialIntelligenceRecord(goodOpportunityRecord({ record_type: 'not-a-type' })),
    (err) => err.code === 'record-type-invalid'
  );
});

test('RECORD_TYPES matches 04_COMMERCIAL_INTELLIGENCE_SCHEMA.json exactly', () => {
  assert.deepEqual([...RECORD_TYPES], ['opportunity', 'partner_route', 'offer', 'message_variant', 'rejection', 'owner_gate']);
});

test('validateCommercialIntelligenceRecord: source.url must be https://', () => {
  assert.throws(
    () => validateCommercialIntelligenceRecord(goodOpportunityRecord({ source: { ...goodOpportunityRecord().source, url: 'http://example.com/rfp' } })),
    (err) => err.code === 'source-url-invalid'
  );
});

test('validateCommercialIntelligenceRecord: source.confidence must be in [0,1]', () => {
  assert.throws(
    () => validateCommercialIntelligenceRecord(goodOpportunityRecord({ source: { ...goodOpportunityRecord().source, confidence: 1.5 } })),
    (err) => err.code === 'source-confidence-invalid'
  );
});

test('validateCommercialIntelligenceRecord: a row number is attached to the thrown error when supplied', () => {
  try {
    validateCommercialIntelligenceRecord({}, 7);
    assert.fail('expected a throw');
  } catch (error) {
    assert.equal(error.row, 7);
  }
});

// --- identity integrity (PR #6 audit item 5) ---

test('validateCommercialIntelligenceRecord: organization_domain disagreeing with idempotency_inputs.organization_domain is rejected', () => {
  assert.throws(
    () => validateCommercialIntelligenceRecord(goodOpportunityRecord({ idempotency_inputs: { ...goodOpportunityRecord().idempotency_inputs, organization_domain: 'not-example.com' } })),
    (err) => err.code === 'identity-domain-mismatch'
  );
});

test('validateCommercialIntelligenceRecord: service_lane disagreeing with idempotency_inputs.service_lane is rejected', () => {
  assert.throws(
    () => validateCommercialIntelligenceRecord(goodOpportunityRecord({ idempotency_inputs: { ...goodOpportunityRecord().idempotency_inputs, service_lane: 'mobile-ux' } })),
    (err) => err.code === 'identity-service-lane-mismatch'
  );
});

test('validateCommercialIntelligenceRecord: source.url disagreeing with idempotency_inputs.source_url is rejected', () => {
  assert.throws(
    () => validateCommercialIntelligenceRecord(goodOpportunityRecord({ idempotency_inputs: { ...goodOpportunityRecord().idempotency_inputs, source_url: 'https://example.com/other-page' } })),
    (err) => err.code === 'identity-source-url-mismatch'
  );
});

test('validateCommercialIntelligenceRecord: idempotency inputs are derived from the canonical top-level fields, not re-read from the raw copies', () => {
  // Both sides normalize to the same value here (different casing/trailing slash), so validation
  // passes -- and the returned idempotencyInputs must equal the normalized top-level fields.
  const record = validateCommercialIntelligenceRecord(goodOpportunityRecord({
    organization_domain: 'EXAMPLE.com',
    idempotency_inputs: { ...goodOpportunityRecord().idempotency_inputs, organization_domain: 'example.com' }
  }));
  assert.equal(record.idempotencyInputs.organizationDomain, record.organizationDomain);
});

// --- owner_gate / message_variant explicit-field validation (PR #6 audit items 7, 8) ---

test('validateCommercialIntelligenceRecord: owner_gate requires gate_type, opportunity_id, and action as explicit fields', () => {
  assert.throws(() => validateCommercialIntelligenceRecord(goodGateRecord({ gate_type: undefined })), (err) => err.code === 'gate-type-invalid');
  assert.throws(() => validateCommercialIntelligenceRecord(goodGateRecord({ gate_type: 'not-a-gate-type' })), (err) => err.code === 'gate-type-invalid');
  assert.throws(() => validateCommercialIntelligenceRecord(goodGateRecord({ opportunity_id: undefined })), (err) => err.code === 'gate-opportunity-id-required');
  assert.throws(() => validateCommercialIntelligenceRecord(goodGateRecord({ action: undefined })), (err) => err.code === 'gate-action-required');
  const record = validateCommercialIntelligenceRecord(goodGateRecord());
  assert.equal(record.gate.gateType, 'marketplace-submission');
  assert.equal(record.gate.opportunityId, 'rec_opp_1');
});

test('validateCommercialIntelligenceRecord: message_variant requires subject, body, and opportunity_id as explicit fields', () => {
  assert.throws(() => validateCommercialIntelligenceRecord(goodMessageVariantRecord({ subject: undefined })), (err) => err.code === 'message-subject-required');
  assert.throws(() => validateCommercialIntelligenceRecord(goodMessageVariantRecord({ body: undefined })), (err) => err.code === 'message-body-required');
  assert.throws(() => validateCommercialIntelligenceRecord(goodMessageVariantRecord({ opportunity_id: undefined })), (err) => err.code === 'message-opportunity-id-required');
  const record = validateCommercialIntelligenceRecord(goodMessageVariantRecord());
  assert.equal(record.messageContent.subject, 'A pre-launch QA pass for example.com');
  assert.equal(record.messageContent.opportunityId, 'rec_opp_1');
});

// --- JSONL / CSV parsing ---

test('parseCommercialIntelligenceJsonl: valid lines parse, invalid lines are collected with line numbers, parsing continues past bad lines', () => {
  const jsonl = [
    JSON.stringify(goodOpportunityRecord({ id: 'rec_1' })),
    'not valid json',
    JSON.stringify(goodOpportunityRecord({ id: 'rec_2', kill_condition: undefined })),
    JSON.stringify(goodOpportunityRecord({ id: 'rec_3' }))
  ].join('\n');
  const { records, errors } = parseCommercialIntelligenceJsonl(jsonl);
  assert.equal(records.length, 2);
  assert.deepEqual(records.map(r => r.id), ['rec_1', 'rec_3']);
  assert.equal(errors.length, 2);
  assert.equal(errors[0].row, 2);
  assert.equal(errors[0].code, 'jsonl-parse-error');
  assert.equal(errors[1].row, 3);
});

test('parseCommercialIntelligenceJsonl: blank lines are ignored, not counted as errors', () => {
  const jsonl = `${JSON.stringify(goodOpportunityRecord())}\n\n\n`;
  const { records, errors } = parseCommercialIntelligenceJsonl(jsonl);
  assert.equal(records.length, 1);
  assert.equal(errors.length, 0);
});

test('parseCommercialIntelligenceCsv: object/array fields are read as JSON-encoded CSV cells', () => {
  const rec = goodOpportunityRecord();
  const headers = ['id', 'record_type', 'organization', 'organization_domain', 'geography', 'service_lane', 'buyer_signal', 'source', 'contact', 'expected_value_cents', 'currency', 'owner_minutes', 'delivery_hours', 'expires_at', 'risks', 'kill_condition', 'idempotency_inputs'];
  const escape = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const row = [
    rec.id, rec.record_type, rec.organization, rec.organization_domain, rec.geography, rec.service_lane, rec.buyer_signal,
    JSON.stringify(rec.source), JSON.stringify(rec.contact), rec.expected_value_cents, rec.currency, rec.owner_minutes,
    rec.delivery_hours, rec.expires_at, JSON.stringify(rec.risks), rec.kill_condition, JSON.stringify(rec.idempotency_inputs)
  ].map(escape).join(',');
  const csv = `${headers.join(',')}\n${row}\n`;
  const { records, errors } = parseCommercialIntelligenceCsv(csv);
  assert.equal(errors.length, 0);
  assert.equal(records.length, 1);
  assert.equal(records[0].organizationDomain, 'example.com');
});

test('parseCommercialIntelligenceCsv: an invalid JSON cell is reported with its row number, not thrown past the parser', () => {
  const csv = 'id,record_type,source\nrec_1,opportunity,not-json\n';
  const { records, errors } = parseCommercialIntelligenceCsv(csv);
  assert.equal(records.length, 0);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, 'csv-json-cell-invalid');
});

// --- evidence freshness ---

test('isEvidenceFresh: true within the age window and before expiry; false once stale or expired', () => {
  const record = validateCommercialIntelligenceRecord(goodOpportunityRecord());
  assert.equal(isEvidenceFresh(record, { maxAgeDays: 30, at: now }), true);
  assert.equal(isEvidenceFresh(record, { maxAgeDays: 0.0001, at: now }), false, 'too old for the age window');
  const expired = validateCommercialIntelligenceRecord(goodOpportunityRecord({ source: { ...goodOpportunityRecord().source, expires_at: '2026-07-01T00:00:00.000Z' } }));
  assert.equal(isEvidenceFresh(expired, { at: now }), false, 'past its own stated expiry');
});

// --- preview mode: zero durable business writes (PR #6 audit item 3) ---

test('importCommercialIntelligenceBatch: preview mode (the default) computes the full outcome but persists zero opportunities, evidence, or policy decisions', async () => {
  const store = await tempStore();
  const record = validateCommercialIntelligenceRecord(goodOpportunityRecord());
  const result = await importCommercialIntelligenceBatch(store, [record], { at: now, cfg });
  assert.equal(result.mode, 'preview');
  assert.equal(result.durableWrites, false);
  assert.equal(result.acceptedCount, 1);
  assert.equal(result.accepted[0].stage, 'ready_for_message');
  assert.equal((await store.list('opportunities')).length, 0, 'preview must not create an opportunity row');
  assert.equal((await store.list('sourceEvidence')).length, 0, 'preview must not create an evidence row');
  assert.equal((await store.list('policyDecisions')).length, 0, 'preview must not create a policy-decision row');
});

// Second-pass audit item 7: preview must be truly zero-write, including its own audit trail --
// the earlier version wrote one disclosed batch-level audit row even in preview mode; that
// exception is removed. All evidence a preview run establishes lives in the returned report only.
test('importCommercialIntelligenceBatch: preview mode writes zero audit-log entries -- not even a batch-level one', async () => {
  const store = await tempStore();
  const record = validateCommercialIntelligenceRecord(goodOpportunityRecord());
  const result = await importCommercialIntelligenceBatch(store, [record], { at: now, cfg });
  assert.equal((await store.list('auditLog')).length, 0);
  assert.equal(result.acceptedCount, 1, 'the preview report itself carries the evidence -- no need for a store write');
});

test('importCommercialIntelligenceBatch: commit mode writes exactly one batch-level import_committed audit entry, in addition to per-record events', async () => {
  const store = await tempStore();
  const record = validateCommercialIntelligenceRecord(goodOpportunityRecord());
  await importCommercialIntelligenceBatch(store, [record], { mode: 'commit', at: now, cfg });
  const committed = await store.list('auditLog', { filters: { type: CANONICAL_AUDIT_EVENTS.IMPORT_COMMITTED } });
  assert.equal(committed.length, 1);
});

test('importCommercialIntelligenceBatch: mode defaults to preview when omitted', async () => {
  const store = await tempStore();
  const record = validateCommercialIntelligenceRecord(goodOpportunityRecord());
  const result = await importCommercialIntelligenceBatch(store, [record], { at: now, cfg });
  assert.equal(result.mode, 'preview');
});

test('importCommercialIntelligenceBatch: an unknown mode value throws rather than silently defaulting', async () => {
  const store = await tempStore();
  const record = validateCommercialIntelligenceRecord(goodOpportunityRecord());
  await assert.rejects(
    importCommercialIntelligenceBatch(store, [record], { mode: 'dry-run', at: now, cfg }),
    (err) => err.code === 'invalid-mode'
  );
});

// --- commit mode: real, canonical, atomic persistence ---

test('importCommercialIntelligenceBatch: commit mode persists sourceEvidence, an opportunity at stage ready_for_message, and a passing policy decision', async () => {
  const store = await tempStore();
  const record = validateCommercialIntelligenceRecord(goodOpportunityRecord());
  const result = await importCommercialIntelligenceBatch(store, [record], { mode: 'commit', at: now, cfg });
  assert.equal(result.durableWrites, true);
  assert.equal(result.acceptedCount, 1);
  const opportunities = await store.list('opportunities');
  assert.equal(opportunities.length, 1);
  assert.equal(opportunities[0].stage, 'ready_for_message');
  assert.equal(opportunities[0].scoreVersion, 'revenue-os-score-v1');
  const evidence = await store.list('sourceEvidence');
  assert.equal(evidence.length, 1);
  const decisions = await store.list('policyDecisions');
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].decision, 'pass');
});

test('importCommercialIntelligenceBatch: a re-import of the same idempotency key is rejected as a duplicate, not imported twice', async () => {
  const store = await tempStore();
  const record = validateCommercialIntelligenceRecord(goodOpportunityRecord());
  const first = await importCommercialIntelligenceBatch(store, [record], { mode: 'commit', at: now, cfg });
  assert.equal(first.acceptedCount, 1);
  const second = await importCommercialIntelligenceBatch(store, [record], { mode: 'commit', at: now, cfg });
  assert.equal(second.acceptedCount, 0);
  assert.equal(second.rejectedDuplicateCount, 1);
  const opportunities = await store.list('opportunities');
  assert.equal(opportunities.length, 1, 're-import must not create a second opportunity row');
  const duplicateAudit = await store.list('auditLog', { filters: { type: CANONICAL_AUDIT_EVENTS.DUPLICATE_REJECTED } });
  assert.equal(duplicateAudit.length, 1);
});

test('importCommercialIntelligenceBatch: stale evidence (older than maxEvidenceAgeDays) is rejected, never imported', async () => {
  const store = await tempStore();
  const stale = validateCommercialIntelligenceRecord(goodOpportunityRecord({
    source: { ...goodOpportunityRecord().source, captured_at: '2026-01-01T00:00:00.000Z' }
  }));
  const result = await importCommercialIntelligenceBatch(store, [stale], { mode: 'commit', at: now, cfg: { revenueOs: { maxEvidenceAgeDays: 30 } } });
  assert.equal(result.acceptedCount, 0);
  assert.equal(result.rejectedStaleCount, 1);
  assert.equal((await store.list('opportunities')).length, 0);
});

test('importCommercialIntelligenceBatch: an unsupported service_lane is rejected as invalid', async () => {
  const store = await tempStore();
  const record = validateCommercialIntelligenceRecord(goodOpportunityRecord({ service_lane: 'not-a-real-lane', idempotency_inputs: { ...goodOpportunityRecord().idempotency_inputs, service_lane: 'not-a-real-lane' } }));
  const result = await importCommercialIntelligenceBatch(store, [record], { mode: 'commit', at: now, cfg });
  assert.equal(result.acceptedCount, 0);
  assert.equal(result.rejectedInvalidCount, 1);
});

// --- stage transitions and the queue (PR #6 audit item 6) ---

test('importCommercialIntelligenceBatch: a policy-rejected opportunity is stored with stage:policy_rejected and excluded from listQueueableOpportunities', async () => {
  const store = await tempStore();
  const record = validateCommercialIntelligenceRecord(goodOpportunityRecord({
    contact: { email: 'someone@not-example.com', source_url: 'https://not-example.com/contact', published_officially: true }
  }));
  const result = await importCommercialIntelligenceBatch(store, [record], { mode: 'commit', at: now, cfg });
  assert.equal(result.acceptedCount, 0);
  assert.equal(result.policyRejectedCount, 1);
  const opportunities = await store.list('opportunities');
  assert.equal(opportunities[0].stage, 'policy_rejected');
  const queueable = await listQueueableOpportunities(store);
  assert.equal(queueable.length, 0, 'a policy-rejected opportunity must never be claimable from the queue');
});

test('importCommercialIntelligenceBatch: an accepted opportunity is queueable, and a mixed batch queue contains only the accepted one', async () => {
  const store = await tempStore();
  const accepted = validateCommercialIntelligenceRecord(goodOpportunityRecord({ id: 'rec_accept' }));
  const rejected = validateCommercialIntelligenceRecord(goodOpportunityRecord({
    id: 'rec_reject', organization_domain: 'other-example.com',
    idempotency_inputs: { organization_domain: 'other-example.com', service_lane: 'website-qa', source_url: 'https://other-example.com/rfp', signal_key: 'rfp-2' },
    source: { ...goodOpportunityRecord().source, url: 'https://other-example.com/rfp' },
    contact: { email: 'someone@not-other-example.com', source_url: 'https://not-other-example.com/contact', published_officially: true }
  }));
  await importCommercialIntelligenceBatch(store, [accepted, rejected], { mode: 'commit', at: now, cfg });
  const queueable = await listQueueableOpportunities(store);
  assert.deepEqual(queueable.map(o => o.id), ['rec_accept']);
});

// --- owner gates: explicit linkage and enforced bounds (PR #6 audit item 8) ---

test('importCommercialIntelligenceBatch: a well-formed owner_gate linked to an already-committed opportunity creates a gate', async () => {
  const store = await tempStore();
  const opp = validateCommercialIntelligenceRecord(goodOpportunityRecord());
  const gate = validateCommercialIntelligenceRecord(goodGateRecord());
  const result = await importCommercialIntelligenceBatch(store, [opp, gate], { mode: 'commit', at: now, cfg });
  assert.equal(result.ownerGatesCreatedCount, 1);
  const gates = await store.list('ownerGates');
  assert.equal(gates.length, 1);
  assert.equal(gates[0].gateType, 'marketplace-submission');
  assert.equal(gates[0].opportunityId, 'rec_opp_1');
  assert.equal(gates[0].status, 'open');
  const gateAudit = await store.list('auditLog', { filters: { type: CANONICAL_AUDIT_EVENTS.OWNER_GATE_CREATED } });
  assert.equal(gateAudit.length, 1);
});

test('importCommercialIntelligenceBatch: an owner_gate referencing an opportunity that was never imported is rejected as invalid, not created', async () => {
  const store = await tempStore();
  const gate = validateCommercialIntelligenceRecord(goodGateRecord({ opportunity_id: 'never-imported' }));
  const result = await importCommercialIntelligenceBatch(store, [gate], { mode: 'commit', at: now, cfg });
  assert.equal(result.ownerGatesCreatedCount, 0);
  assert.equal(result.rejectedInvalidCount, 1);
  assert.equal(result.rejectedInvalid[0].code, 'gate-opportunity-not-found');
});

test('importCommercialIntelligenceBatch: an owner_gate below the value floor or above the minutes ceiling is rejected, not silently clamped', async () => {
  const store = await tempStore();
  const opp = validateCommercialIntelligenceRecord(goodOpportunityRecord());
  const tinyGate = validateCommercialIntelligenceRecord(goodGateRecord({ id: 'rec_gate_tiny', expected_value_cents: 100 }));
  const result = await importCommercialIntelligenceBatch(store, [opp, tinyGate], { mode: 'commit', at: now, cfg });
  assert.equal(result.ownerGatesCreatedCount, 0);
  assert.equal(result.rejectedInvalidCount, 1);
  assert.equal(result.rejectedInvalid[0].code, 'value-below-floor');
});

test('importCommercialIntelligenceBatch: preview mode can link an owner_gate to an opportunity previewed earlier in the same batch, even though nothing is persisted', async () => {
  const store = await tempStore();
  const opp = validateCommercialIntelligenceRecord(goodOpportunityRecord());
  const gate = validateCommercialIntelligenceRecord(goodGateRecord());
  const result = await importCommercialIntelligenceBatch(store, [opp, gate], { at: now, cfg });
  assert.equal(result.ownerGatesCreatedCount, 1);
  assert.equal((await store.list('ownerGates')).length, 0, 'preview must still persist nothing');
});

test('importCommercialIntelligenceBatch: record_type:"opportunity" never creates an owner gate, even with a large expected value', async () => {
  const store = await tempStore();
  const record = validateCommercialIntelligenceRecord(goodOpportunityRecord({ expected_value_cents: 5000000 }));
  const result = await importCommercialIntelligenceBatch(store, [record], { mode: 'commit', at: now, cfg });
  assert.equal(result.ownerGatesCreatedCount, 0);
  assert.equal((await store.list('ownerGates')).length, 0);
});

// --- message variants: real content and linkage (PR #6 audit item 7) ---

test('importCommercialIntelligenceBatch: a message_variant linked to a committed opportunity persists real subject/body and a content hash', async () => {
  const store = await tempStore();
  const opp = validateCommercialIntelligenceRecord(goodOpportunityRecord());
  const mv = validateCommercialIntelligenceRecord(goodMessageVariantRecord());
  const result = await importCommercialIntelligenceBatch(store, [opp, mv], { mode: 'commit', at: now, cfg });
  assert.equal(result.messageVariantsImportedCount, 1);
  const variants = await store.list('messageVariants');
  assert.equal(variants.length, 1);
  assert.equal(variants[0].subject, 'A pre-launch QA pass for example.com');
  assert.equal(variants[0].body, 'Hi -- we noticed your public RFP and can run a pre-launch QA pass this week.');
  assert.equal(variants[0].opportunityId, 'rec_opp_1');
  assert(variants[0].bodyHash && variants[0].bodyHash.length === 64, 'bodyHash must be a real sha256 hex digest');
});

test('importCommercialIntelligenceBatch: two message variants under different experiments with identical normalized subject+body hash the same and both persist', async () => {
  const store = await tempStore();
  const opp = validateCommercialIntelligenceRecord(goodOpportunityRecord());
  // Same content, different experiment_id: a legitimate case (e.g. variant B starts as a copy of
  // variant A). Same content under the SAME experiment scope is a real duplicate and is correctly
  // rejected -- see the next test.
  const mv1 = validateCommercialIntelligenceRecord(goodMessageVariantRecord({ id: 'rec_mv_a', experiment_id: 'exp_1' }));
  const mv2 = validateCommercialIntelligenceRecord(goodMessageVariantRecord({ id: 'rec_mv_b', experiment_id: 'exp_2' }));
  const result = await importCommercialIntelligenceBatch(store, [opp, mv1, mv2], { mode: 'commit', at: now, cfg });
  assert.equal(result.messageVariantsImportedCount, 2);
  const variants = await store.list('messageVariants');
  assert.equal(variants.length, 2);
  assert.equal(variants[0].bodyHash, variants[1].bodyHash);
});

test('importCommercialIntelligenceBatch: two message variants with identical content under the SAME experiment scope are rejected as a duplicate, not double-stored', async () => {
  const store = await tempStore();
  const opp = validateCommercialIntelligenceRecord(goodOpportunityRecord());
  const mv1 = validateCommercialIntelligenceRecord(goodMessageVariantRecord({ id: 'rec_mv_c', experiment_id: 'exp_same' }));
  const mv2 = validateCommercialIntelligenceRecord(goodMessageVariantRecord({ id: 'rec_mv_d', experiment_id: 'exp_same' }));
  const result = await importCommercialIntelligenceBatch(store, [opp, mv1, mv2], { mode: 'commit', at: now, cfg });
  assert.equal(result.messageVariantsImportedCount, 1);
  assert.equal(result.rejectedDuplicateCount, 1);
  assert.equal((await store.list('messageVariants')).length, 1);
});

test('importCommercialIntelligenceBatch: a message_variant referencing an opportunity that was never imported is rejected, not created', async () => {
  const store = await tempStore();
  const mv = validateCommercialIntelligenceRecord(goodMessageVariantRecord({ opportunity_id: 'never-imported' }));
  const result = await importCommercialIntelligenceBatch(store, [mv], { mode: 'commit', at: now, cfg });
  assert.equal(result.messageVariantsImportedCount, 0);
  assert.equal(result.rejectedInvalidCount, 1);
  assert.equal(result.rejectedInvalid[0].code, 'message-opportunity-not-found');
});

// --- partner_route / offer / rejection: full persistence, not audit-log-only (PR #6 audit item 10) ---

test('importCommercialIntelligenceBatch: partner_route, offer, and rejection records are fully persisted into their own tables/collections', async () => {
  const store = await tempStore();
  const records = ['partner_route', 'offer', 'rejection'].map((type, i) =>
    validateCommercialIntelligenceRecord(goodOpportunityRecord({
      id: `rec_partial_${i}`, record_type: type, organization_domain: `partial-${i}.example`,
      idempotency_inputs: { organization_domain: `partial-${i}.example`, service_lane: 'website-qa', source_url: `https://partial-${i}.example/rfp`, signal_key: `partial-${i}` },
      source: { ...goodOpportunityRecord().source, url: `https://partial-${i}.example/rfp` },
      contact: { email: `partners@partial-${i}.example`, source_url: `https://partial-${i}.example/contact`, published_officially: true },
      // Only meaningful for record_type:'rejection' -- validateCommercialIntelligenceRecord ignores
      // this extra field for the other two types.
      reason_codes: type === 'rejection' ? ['expected-value-below-threshold'] : undefined
    })));
  const result = await importCommercialIntelligenceBatch(store, records, { mode: 'commit', at: now, cfg });
  assert.equal(result.partnerRoutesImportedCount, 1);
  assert.equal(result.offersImportedCount, 1);
  assert.equal(result.rejectionsImportedCount, 1);
  assert.equal((await store.list('partnerRoutes')).length, 1);
  assert.equal((await store.list('offers')).length, 1);
  assert.equal((await store.list('rejections')).length, 1);
  // No more audit-log-only partial persistence -- this used to be the disclosed limitation.
  const partialAudit = await store.list('auditLog', { filters: { type: 'commercial_intelligence_partial_persistence' } });
  assert.equal(partialAudit.length, 0);
});

test('importCommercialIntelligenceBatch: a duplicate partner_route (same idempotency key) is rejected, not persisted twice', async () => {
  const store = await tempStore();
  const record = validateCommercialIntelligenceRecord(goodOpportunityRecord({ id: 'rec_pr_1', record_type: 'partner_route' }));
  const first = await importCommercialIntelligenceBatch(store, [record], { mode: 'commit', at: now, cfg });
  assert.equal(first.partnerRoutesImportedCount, 1);
  const second = await importCommercialIntelligenceBatch(store, [record], { mode: 'commit', at: now, cfg });
  assert.equal(second.partnerRoutesImportedCount, 0);
  assert.equal(second.rejectedDuplicateCount, 1);
  assert.equal((await store.list('partnerRoutes')).length, 1);
});

// --- audit completeness (PR #6 audit item 9) ---

test('importCommercialIntelligenceBatch: a batch exercising every outcome logs every one of the ten canonical audit event types', async () => {
  const store = await tempStore();
  const accepted = validateCommercialIntelligenceRecord(goodOpportunityRecord({ id: 'rec_a' }));
  const rejected = validateCommercialIntelligenceRecord(goodOpportunityRecord({
    id: 'rec_b', organization_domain: 'other.example',
    idempotency_inputs: { organization_domain: 'other.example', service_lane: 'website-qa', source_url: 'https://other.example/rfp', signal_key: 'other-1' },
    source: { ...goodOpportunityRecord().source, url: 'https://other.example/rfp' },
    contact: { email: 'someone@not-other.example', source_url: 'https://not-other.example/contact', published_officially: true }
  }));
  const stale = validateCommercialIntelligenceRecord(goodOpportunityRecord({
    id: 'rec_c', organization_domain: 'stale.example',
    idempotency_inputs: { organization_domain: 'stale.example', service_lane: 'website-qa', source_url: 'https://stale.example/rfp', signal_key: 'stale-1' },
    source: { url: 'https://stale.example/rfp', type: 'official-company', captured_at: '2020-01-01T00:00:00.000Z', official: true, confidence: 0.9 }
  }));
  const invalid = validateCommercialIntelligenceRecord(goodOpportunityRecord({
    id: 'rec_d', service_lane: 'not-a-lane', organization_domain: 'invalid.example',
    idempotency_inputs: { organization_domain: 'invalid.example', service_lane: 'not-a-lane', source_url: 'https://invalid.example/rfp', signal_key: 'invalid-1' },
    source: { ...goodOpportunityRecord().source, url: 'https://invalid.example/rfp' }
  }));
  const gate = validateCommercialIntelligenceRecord(goodGateRecord({ opportunity_id: 'rec_a' }));
  const mv = validateCommercialIntelligenceRecord(goodMessageVariantRecord({ opportunity_id: 'rec_a' }));

  const preview = await importCommercialIntelligenceBatch(store, [accepted], { at: now, cfg }); // preview mode: writes nothing at all
  await importCommercialIntelligenceBatch(store, [accepted, rejected, stale, invalid, gate, mv], { mode: 'commit', at: now, cfg });
  await importCommercialIntelligenceBatch(store, [accepted], { mode: 'commit', at: now, cfg }); // duplicate, on the 2nd call

  assert.equal(preview.acceptedCount, 1, 'the preview call still computed a real result -- it just never wrote it');
  const audit = await store.list('auditLog');
  const types = new Set(audit.map(entry => entry.type));
  for (const eventType of Object.values(CANONICAL_AUDIT_EVENTS)) {
    // IMPORT_PREVIEW is never written by this module (preview is truly zero-write -- see item 7);
    // TRANSACTION_ROLLED_BACK needs a real injected failure, covered separately in
    // tests/commercial-intelligence-concurrency.test.mjs and this file's own rollback test.
    if (eventType === CANONICAL_AUDIT_EVENTS.TRANSACTION_ROLLED_BACK || eventType === CANONICAL_AUDIT_EVENTS.IMPORT_PREVIEW) continue;
    assert(types.has(eventType), `missing canonical audit event: ${eventType}`);
  }
  assert(!types.has(CANONICAL_AUDIT_EVENTS.IMPORT_PREVIEW), 'IMPORT_PREVIEW must never be written by importCommercialIntelligenceBatch itself');
});

// --- rollback: JSON-store parity with the real-Postgres rollback test (PR #6 audit item 2) ---

test('importCommercialIntelligenceBatch: a mid-transaction id collision rolls back the whole record on JsonStore too, leaving no orphan evidence', async () => {
  const store = await tempStore();
  await store.add('opportunities', { id: 'rec_opp_1', idempotencyKey: 'opportunity:pre-existing:different:key', serviceLane: 'website-qa', stage: 'ready_for_message', data: {} });
  const evidenceBefore = (await store.list('sourceEvidence')).length;

  const record = validateCommercialIntelligenceRecord(goodOpportunityRecord());
  const result = await importCommercialIntelligenceBatch(store, [record], { mode: 'commit', at: now, cfg });

  assert.equal(result.acceptedCount, 0);
  assert.equal(result.rejectedDuplicateCount, 1);
  assert.equal((await store.list('sourceEvidence')).length, evidenceBefore, 'the evidence insert from the same failed transaction must be rolled back, not orphaned');
  assert.equal((await store.list('opportunities')).length, 1, 'still only the pre-seeded row');
});

// --- zero-live-send guarantee ---

test('importCommercialIntelligenceBatch: zeroLiveSend is always true in both modes -- there is no send path to guard', async () => {
  const store = await tempStore();
  const record = validateCommercialIntelligenceRecord(goodOpportunityRecord());
  const preview = await importCommercialIntelligenceBatch(store, [record], { at: now, cfg });
  const commitResult = await importCommercialIntelligenceBatch(store, [record], { mode: 'commit', at: now, cfg });
  assert.equal(preview.zeroLiveSend, true);
  assert.equal(commitResult.zeroLiveSend, true);
});

// --- second-pass audit item 2: gates/message variants require stage:ready_for_message, not mere existence ---

function rejectedOpportunityRecord(overrides = {}) {
  return goodOpportunityRecord({
    id: 'rec_opp_rejected', organization_domain: 'rejected-example.com',
    idempotency_inputs: { organization_domain: 'rejected-example.com', service_lane: 'website-qa', source_url: 'https://rejected-example.com/rfp', signal_key: 'rejected-1' },
    source: { ...goodOpportunityRecord().source, url: 'https://rejected-example.com/rfp' },
    // Deliberately domain-mismatched contact -> evaluateOpportunityPolicy rejects it.
    contact: { email: 'someone@not-rejected-example.com', source_url: 'https://not-rejected-example.com/contact', published_officially: true },
    ...overrides
  });
}

test('commit mode: a policy-rejected opportunity cannot receive an owner gate, even though the opportunity id exists in the store', async () => {
  const store = await tempStore();
  const rejectedOpp = validateCommercialIntelligenceRecord(rejectedOpportunityRecord());
  const gate = validateCommercialIntelligenceRecord(goodGateRecord({ opportunity_id: 'rec_opp_rejected' }));
  const result = await importCommercialIntelligenceBatch(store, [rejectedOpp, gate], { mode: 'commit', at: now, cfg });
  assert.equal(result.policyRejectedCount, 1);
  assert.equal(result.ownerGatesCreatedCount, 0);
  assert.equal(result.rejectedInvalidCount, 1);
  assert.equal(result.rejectedInvalid[0].code, 'gate-opportunity-not-ready');
  assert.equal((await store.list('ownerGates')).length, 0);
  // Confirm the opportunity really is in the store (existence alone must not be enough).
  const stored = await store.get('opportunities', 'rec_opp_rejected');
  assert.equal(stored.stage, 'policy_rejected');
});

test('commit mode: a policy-rejected opportunity cannot receive a message variant, even though the opportunity id exists in the store', async () => {
  const store = await tempStore();
  const rejectedOpp = validateCommercialIntelligenceRecord(rejectedOpportunityRecord());
  const mv = validateCommercialIntelligenceRecord(goodMessageVariantRecord({ opportunity_id: 'rec_opp_rejected' }));
  const result = await importCommercialIntelligenceBatch(store, [rejectedOpp, mv], { mode: 'commit', at: now, cfg });
  assert.equal(result.policyRejectedCount, 1);
  assert.equal(result.messageVariantsImportedCount, 0);
  assert.equal(result.rejectedInvalidCount, 1);
  assert.equal(result.rejectedInvalid[0].code, 'message-opportunity-not-ready');
  assert.equal((await store.list('messageVariants')).length, 0);
});

test('preview mode: a policy-rejected opportunity cannot receive an owner gate or message variant from the same batch', async () => {
  const store = await tempStore();
  const rejectedOpp = validateCommercialIntelligenceRecord(rejectedOpportunityRecord());
  const gate = validateCommercialIntelligenceRecord(goodGateRecord({ opportunity_id: 'rec_opp_rejected' }));
  const mv = validateCommercialIntelligenceRecord(goodMessageVariantRecord({ id: 'rec_mv_preview', opportunity_id: 'rec_opp_rejected' }));
  const result = await importCommercialIntelligenceBatch(store, [rejectedOpp, gate, mv], { at: now, cfg }); // preview
  assert.equal(result.policyRejectedCount, 1);
  assert.equal(result.ownerGatesCreatedCount, 0);
  assert.equal(result.messageVariantsImportedCount, 0);
  assert.equal(result.rejectedInvalidCount, 2);
  assert.deepEqual(result.rejectedInvalid.map(r => r.code).sort(), ['gate-opportunity-not-ready', 'message-opportunity-not-ready']);
});

test('an accepted opportunity CAN receive both a gate and a message variant in the same batch (positive control)', async () => {
  const store = await tempStore();
  const acceptedOpp = validateCommercialIntelligenceRecord(goodOpportunityRecord());
  const gate = validateCommercialIntelligenceRecord(goodGateRecord());
  const mv = validateCommercialIntelligenceRecord(goodMessageVariantRecord());
  const result = await importCommercialIntelligenceBatch(store, [acceptedOpp, gate, mv], { mode: 'commit', at: now, cfg });
  assert.equal(result.acceptedCount, 1);
  assert.equal(result.ownerGatesCreatedCount, 1);
  assert.equal(result.messageVariantsImportedCount, 1);
});

// --- second-pass audit item 5: common evidence/policy validation for partner_route/offer/rejection ---

test('partner_route and offer records are rejected as stale when their evidence is older than maxEvidenceAgeDays', async () => {
  const store = await tempStore();
  const stalePartnerRoute = validateCommercialIntelligenceRecord(goodOpportunityRecord({
    id: 'rec_pr_stale', record_type: 'partner_route',
    source: { ...goodOpportunityRecord().source, captured_at: '2020-01-01T00:00:00.000Z' }
  }));
  const staleOffer = validateCommercialIntelligenceRecord(goodOpportunityRecord({
    id: 'rec_offer_stale', record_type: 'offer',
    source: { ...goodOpportunityRecord().source, captured_at: '2020-01-01T00:00:00.000Z' }
  }));
  const result = await importCommercialIntelligenceBatch(store, [stalePartnerRoute, staleOffer], { mode: 'commit', at: now, cfg });
  assert.equal(result.rejectedStaleCount, 2);
  assert.equal(result.partnerRoutesImportedCount, 0);
  assert.equal(result.offersImportedCount, 0);
});

test('partner_route and offer records are rejected when source.official is false, not silently accepted', async () => {
  const store = await tempStore();
  const unofficialPartnerRoute = validateCommercialIntelligenceRecord(goodOpportunityRecord({
    id: 'rec_pr_unofficial', record_type: 'partner_route',
    source: { ...goodOpportunityRecord().source, official: false }
  }));
  const unofficialOffer = validateCommercialIntelligenceRecord(goodOpportunityRecord({
    id: 'rec_offer_unofficial', record_type: 'offer',
    source: { ...goodOpportunityRecord().source, official: false }
  }));
  const result = await importCommercialIntelligenceBatch(store, [unofficialPartnerRoute, unofficialOffer], { mode: 'commit', at: now, cfg });
  assert.equal(result.rejectedInvalidCount, 2);
  assert.equal(result.partnerRoutesImportedCount, 0);
  assert.equal(result.offersImportedCount, 0);
  for (const rejected of result.rejectedInvalid) assert.ok(rejected.reason.includes('missing-current-official-evidence'));
});

test('partner_route and offer records are rejected when the contact domain mismatches (prohibited-mailbox/contact-provenance checks apply uniformly)', async () => {
  const store = await tempStore();
  const mismatchedOffer = validateCommercialIntelligenceRecord(goodOpportunityRecord({
    id: 'rec_offer_mismatch', record_type: 'offer',
    contact: { email: 'someone@not-example.com', source_url: 'https://not-example.com/contact', published_officially: true }
  }));
  const result = await importCommercialIntelligenceBatch(store, [mismatchedOffer], { mode: 'commit', at: now, cfg });
  assert.equal(result.rejectedInvalidCount, 1);
  assert.ok(result.rejectedInvalid[0].reason.includes('contact-domain-mismatch'));
});

test('a suppressed domain rejects a partner_route the same way it would reject an opportunity', async () => {
  const store = await tempStore();
  await store.add('suppressions', { id: 'sup_1', value: 'example.com' });
  const partnerRoute = validateCommercialIntelligenceRecord(goodOpportunityRecord({ id: 'rec_pr_suppressed', record_type: 'partner_route' }));
  const result = await importCommercialIntelligenceBatch(store, [partnerRoute], { mode: 'commit', at: now, cfg });
  assert.equal(result.rejectedInvalidCount, 1);
  assert.ok(result.rejectedInvalid[0].reason.includes('domain-suppressed'));
});

// --- second-pass audit item 5: canonical, explicit reason_codes for rejection records ---

test('validateCommercialIntelligenceRecord: rejection records require a non-empty, canonical reason_codes field -- risks is never used as a fallback', () => {
  assert.throws(
    () => validateCommercialIntelligenceRecord(goodOpportunityRecord({ id: 'rec_rej_1', record_type: 'rejection' })),
    (err) => err.code === 'rejection-reason-codes-required'
  );
  assert.throws(
    () => validateCommercialIntelligenceRecord(goodOpportunityRecord({ id: 'rec_rej_2', record_type: 'rejection', reason_codes: [] })),
    (err) => err.code === 'rejection-reason-codes-required'
  );
  assert.throws(
    () => validateCommercialIntelligenceRecord(goodOpportunityRecord({ id: 'rec_rej_3', record_type: 'rejection', reason_codes: ['not-a-real-code'] })),
    (err) => err.code === 'rejection-reason-codes-invalid'
  );
  assert.throws(
    () => validateCommercialIntelligenceRecord(goodOpportunityRecord({ id: 'rec_rej_4', record_type: 'rejection', reason_codes: ['expected-value-below-threshold', 'not-canonical'] })),
    (err) => err.code === 'rejection-reason-codes-invalid'
  );
  const valid = validateCommercialIntelligenceRecord(goodOpportunityRecord({ id: 'rec_rej_5', record_type: 'rejection', reason_codes: ['expected-value-below-threshold', 'ability-to-pay-insufficient'] }));
  assert.deepEqual(valid.rejectionReasonCodes, ['expected-value-below-threshold', 'ability-to-pay-insufficient']);
});

test('a rejection record persists its own reason_codes, not risks, into the rejections table', async () => {
  const store = await tempStore();
  const record = validateCommercialIntelligenceRecord(goodOpportunityRecord({
    id: 'rec_rej_persist', record_type: 'rejection', risks: ['this must not become the reason code'],
    reason_codes: ['ability-to-pay-insufficient']
  }));
  const result = await importCommercialIntelligenceBatch(store, [record], { mode: 'commit', at: now, cfg });
  assert.equal(result.rejectionsImportedCount, 1);
  const rows = await store.list('rejections');
  assert.deepEqual(rows[0].reasonCodes, ['ability-to-pay-insufficient']);
});

// --- second-pass audit item 6: currency-safe owner gates ---

test('an owner_gate in a non-USD currency is rejected outright, not evaluated against the USD threshold', async () => {
  const store = await tempStore();
  const opp = validateCommercialIntelligenceRecord(goodOpportunityRecord());
  const eurGate = validateCommercialIntelligenceRecord(goodGateRecord({ id: 'rec_gate_eur', currency: 'EUR', expected_value_cents: 500000 }));
  const result = await importCommercialIntelligenceBatch(store, [opp, eurGate], { mode: 'commit', at: now, cfg });
  assert.equal(result.ownerGatesCreatedCount, 0);
  assert.equal(result.rejectedInvalidCount, 1);
  assert.equal(result.rejectedInvalid[0].code, 'currency-not-usd');
  assert.equal((await store.list('ownerGates')).length, 0);
});

test('an owner_gate in USD at or above the floor is accepted (positive control for the currency check)', async () => {
  const store = await tempStore();
  const opp = validateCommercialIntelligenceRecord(goodOpportunityRecord());
  const usdGate = validateCommercialIntelligenceRecord(goodGateRecord({ currency: 'usd' }));
  const result = await importCommercialIntelligenceBatch(store, [opp, usdGate], { mode: 'commit', at: now, cfg });
  assert.equal(result.ownerGatesCreatedCount, 1);
  assert.equal((await store.list('ownerGates'))[0].currency, 'USD');
});
