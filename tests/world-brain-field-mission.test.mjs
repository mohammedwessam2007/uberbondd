import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateWorldBrainFieldMission } from '../src/world-brain-field-mission.mjs';

const base = new URL('../artifacts/world-brain-field-mission-2026-09-01/', import.meta.url);
const read = name => JSON.parse(fs.readFileSync(new URL(name, base), 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));
const record = read('mission-summary.json');
const artifacts = { partners: read('first-cash-partner-candidates.json'), corpus: read('capability-genome-candidates.json') };

test('World Brain field mission is evidence-only and leaves commercial truth at zero', () => {
  const result = validateWorldBrainFieldMission(record, artifacts);
  assert.equal(result.ok, true);
  assert.deepEqual(result.commercialTruth, { realCustomers: 0, clearedRevenueUsd: 0, acceptedDeliveries: 0, retainedCustomers: 0 });
  assert.equal(result.corpusCandidateCount, 92);
});

test('forged revenue, unsafe contact authority, capability promotion, and payment activation fail closed', () => {
  const revenue = clone(record);
  revenue.commercialTruth.clearedRevenueUsd = 450;
  assert.ok(validateWorldBrainFieldMission(revenue, artifacts).failures.includes('unsupported-commercial-outcome'));

  const promotion = clone(record);
  promotion.capabilityCorpus.approvedCapabilityCount = 1;
  assert.ok(validateWorldBrainFieldMission(promotion, artifacts).failures.includes('unsupported-capability-promotion'));

  const payment = clone(record);
  payment.paypal.sandboxAppCreated = true;
  assert.ok(validateWorldBrainFieldMission(payment, artifacts).failures.includes('unsupported-payment-activation'));

  const contact = clone(artifacts);
  contact.partners.candidates[0].contactRoutes[0].provenance = 'INFERRED';
  assert.ok(validateWorldBrainFieldMission(record, contact).failures.includes('unsafe-contact-route'));
});
