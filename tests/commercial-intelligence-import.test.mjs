// Tests for the Commercial Intelligence Importer (Revenue OS V2): schema validation against
// 04_COMMERCIAL_INTELLIGENCE_SCHEMA.json's exact contract, JSONL/CSV parsing, duplicate/stale
// rejection, owner-gate creation limited to record_type:'owner_gate', and the zero-live-send
// guarantee.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import {
  validateCommercialIntelligenceRecord, parseCommercialIntelligenceJsonl,
  parseCommercialIntelligenceCsv, isEvidenceFresh, importCommercialIntelligenceBatch,
  CommercialIntelligenceImportError, RECORD_TYPES
} from '../src/commercial-intelligence-import.mjs';

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-ci-import-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

const now = new Date('2026-07-28T12:00:00.000Z');

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
    expires_at: '2026-08-10T00:00:00.000Z', risks: ['CMS access delay'], kill_condition: 'RFP closes with no reply.',
    idempotency_inputs: { organization_domain: 'example.com', service_lane: 'website-qa', source_url: 'https://example.com/rfp', signal_key: 'rfp-1' },
    ...overrides
  };
}

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

// --- JSONL parsing ---

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

// --- CSV parsing ---

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

// --- batch import: opportunities ---

test('importCommercialIntelligenceBatch: a fresh, valid opportunity is imported with sourceEvidence, a score, and a policy decision', async () => {
  const store = await tempStore();
  const record = validateCommercialIntelligenceRecord(goodOpportunityRecord());
  const result = await importCommercialIntelligenceBatch(store, [record], { at: now, cfg: { revenueOs: { minExpectedValueCents: 25000, maxOwnerMinutes: 20, maxEvidenceAgeDays: 30 } } });
  assert.equal(result.importedCount, 1);
  assert.equal(result.dryRun, true);
  const opportunities = await store.list('opportunities');
  assert.equal(opportunities.length, 1);
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
  const first = await importCommercialIntelligenceBatch(store, [record], { at: now });
  assert.equal(first.importedCount, 1);
  const second = await importCommercialIntelligenceBatch(store, [record], { at: now });
  assert.equal(second.importedCount, 0);
  assert.equal(second.rejectedDuplicateCount, 1);
  const opportunities = await store.list('opportunities');
  assert.equal(opportunities.length, 1, 're-import must not create a second opportunity row');
});

test('importCommercialIntelligenceBatch: stale evidence (older than maxEvidenceAgeDays) is rejected, never imported', async () => {
  const store = await tempStore();
  const stale = validateCommercialIntelligenceRecord(goodOpportunityRecord({
    source: { ...goodOpportunityRecord().source, captured_at: '2026-01-01T00:00:00.000Z' }
  }));
  const result = await importCommercialIntelligenceBatch(store, [stale], { at: now, cfg: { revenueOs: { maxEvidenceAgeDays: 30 } } });
  assert.equal(result.importedCount, 0);
  assert.equal(result.rejectedStaleCount, 1);
  assert.equal((await store.list('opportunities')).length, 0);
});

test('importCommercialIntelligenceBatch: an unsupported service_lane is rejected as invalid', async () => {
  const store = await tempStore();
  const record = validateCommercialIntelligenceRecord(goodOpportunityRecord({ service_lane: 'not-a-real-lane', idempotency_inputs: { ...goodOpportunityRecord().idempotency_inputs, service_lane: 'not-a-real-lane' } }));
  const result = await importCommercialIntelligenceBatch(store, [record], { at: now });
  assert.equal(result.importedCount, 0);
  assert.equal(result.rejectedInvalidCount, 1);
});

// --- batch import: owner gates only for record_type:'owner_gate' ---

test('importCommercialIntelligenceBatch: record_type:"owner_gate" with a valid OWNER_GATE_TYPES value creates a gate', async () => {
  const store = await tempStore();
  const record = validateCommercialIntelligenceRecord(goodOpportunityRecord({
    id: 'rec_gate_1', record_type: 'owner_gate', service_lane: 'marketplace-submission',
    buyer_signal: 'Submit the authenticated proposal on the partner portal.'
  }));
  const result = await importCommercialIntelligenceBatch(store, [record], { at: now });
  assert.equal(result.ownerGatesCreatedCount, 1);
  const gates = await store.list('ownerGates');
  assert.equal(gates.length, 1);
  assert.equal(gates[0].gateType, 'marketplace-submission');
  assert.equal(gates[0].status, 'open');
});

test('importCommercialIntelligenceBatch: an "opportunity" record never creates an owner gate, even with a large expected value', async () => {
  const store = await tempStore();
  const record = validateCommercialIntelligenceRecord(goodOpportunityRecord({ expected_value_cents: 5000000 }));
  const result = await importCommercialIntelligenceBatch(store, [record], { at: now });
  assert.equal(result.ownerGatesCreatedCount, 0);
  assert.equal((await store.list('ownerGates')).length, 0);
});

test('importCommercialIntelligenceBatch: record_type:"owner_gate" with an unsupported gate type in service_lane is rejected, not coerced', async () => {
  const store = await tempStore();
  const record = validateCommercialIntelligenceRecord(goodOpportunityRecord({
    id: 'rec_gate_bad', record_type: 'owner_gate', service_lane: 'website-qa' // a service lane, not an OWNER_GATE_TYPES value
  }));
  const result = await importCommercialIntelligenceBatch(store, [record], { at: now });
  assert.equal(result.ownerGatesCreatedCount, 0);
  assert.equal(result.rejectedInvalidCount, 1);
});

// --- message_variant and partial-persistence record types ---

test('importCommercialIntelligenceBatch: record_type:"message_variant" is stored in messageVariants', async () => {
  const store = await tempStore();
  const record = validateCommercialIntelligenceRecord(goodOpportunityRecord({ id: 'rec_mv_1', record_type: 'message_variant' }));
  const result = await importCommercialIntelligenceBatch(store, [record], { at: now });
  assert.equal(result.importedCount, 1);
  assert.equal((await store.list('messageVariants')).length, 1);
});

test('importCommercialIntelligenceBatch: partner_route/offer/rejection records are counted as partiallyPersisted and audited, not silently dropped', async () => {
  const store = await tempStore();
  const records = ['partner_route', 'offer', 'rejection'].map((type, i) =>
    validateCommercialIntelligenceRecord(goodOpportunityRecord({ id: `rec_partial_${i}`, record_type: type })));
  const result = await importCommercialIntelligenceBatch(store, records, { at: now });
  assert.equal(result.partiallyPersistedCount, 3);
  const auditLog = await store.list('auditLog', { filters: { type: 'commercial_intelligence_partial_persistence' } });
  assert.equal(auditLog.length, 3);
});

// --- zero-live-send guarantee ---

test('importCommercialIntelligenceBatch: the result always reports dryRun:true regardless of the dryRun argument -- there is no send path to guard', async () => {
  const store = await tempStore();
  const record = validateCommercialIntelligenceRecord(goodOpportunityRecord());
  const result = await importCommercialIntelligenceBatch(store, [record], { at: now, dryRun: false });
  assert.equal(result.dryRun, true);
});
