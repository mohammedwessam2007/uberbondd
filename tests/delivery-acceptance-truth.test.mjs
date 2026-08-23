import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DELIVERY_ZERO_EFFECTS,
  createDeliveryRecord,
  summarizeDeliveryTruth,
  transitionDelivery
} from '../src/delivery-acceptance-truth.mjs';

function fresh() {
  return createDeliveryRecord({
    deliveryId: 'delivery-1',
    customerId: 'customer-1',
    scopeId: 'scope-1',
    skuId: 'sku:test',
    deliveryVersion: 'v3',
    deliverables: ['Artifact A', 'Artifact B']
  }).record;
}

function step(record, to, extra = {}) {
  const result = transitionDelivery(record, { to, ...extra });
  assert.equal(result.ok, true, result.reason);
  return result.record;
}

function customerEvidence(decision, overrides = {}) {
  return {
    evidenceId: `customer-${decision.toLowerCase()}-1`,
    origin: 'CUSTOMER_ORIGIN',
    sourceRef: 'authenticated-customer-ack:test-only',
    customerId: 'customer-1',
    scopeId: 'scope-1',
    deliveryVersion: 'v3',
    observedAt: '2026-08-22T00:00:00Z',
    customerDecision: decision,
    ...overrides
  };
}

test('delivery cannot begin without exact customer/scope/sku identity', () => {
  assert.equal(createDeliveryRecord({}).reason, 'missing-delivery-id');
  assert.equal(createDeliveryRecord({ deliveryId: 'd' }).reason, 'missing-customer-id');
  assert.equal(createDeliveryRecord({ deliveryId: 'd', customerId: 'c' }).reason, 'missing-scope-id');
  assert.equal(createDeliveryRecord({ deliveryId: 'd', customerId: 'c', scopeId: 's' }).reason, 'missing-sku-id');
});

test('normal delivery path remains unaccepted until explicit customer-origin evidence', () => {
  let record = fresh();
  record = step(record, 'IN_PROGRESS');
  record = step(record, 'DELIVERY_READY');
  record = step(record, 'DELIVERED_UNACKNOWLEDGED');
  const summary = summarizeDeliveryTruth(record);
  assert.equal(summary.delivered, true);
  assert.equal(summary.customerAccepted, false);
  assert.equal(summary.customerAcceptanceProof, 'ABSENT');
});

test('model, operator and synthetic evidence can never self-accept delivery', () => {
  let record = fresh();
  record = step(record, 'IN_PROGRESS');
  record = step(record, 'DELIVERY_READY');
  record = step(record, 'DELIVERED_UNACKNOWLEDGED');

  for (const origin of ['MODEL_OUTPUT', 'OPERATOR_ASSERTION', 'SYNTHETIC']) {
    const result = transitionDelivery(record, {
      to: 'ACCEPTED',
      evidence: {
        ...customerEvidence('ACCEPT'),
        evidenceId: `e-${origin}`,
        origin
      }
    });
    assert.equal(result.ok, false, origin);
  }
});

test('customer acceptance must bind exact customer, scope and delivery version', () => {
  let record = fresh();
  record = step(record, 'IN_PROGRESS');
  record = step(record, 'DELIVERY_READY');
  record = step(record, 'DELIVERED_UNACKNOWLEDGED');

  for (const evidence of [
    customerEvidence('ACCEPT', { customerId: 'customer-2' }),
    customerEvidence('ACCEPT', { scopeId: 'scope-2' }),
    customerEvidence('ACCEPT', { deliveryVersion: 'v2' })
  ]) {
    assert.equal(transitionDelivery(record, { to: 'ACCEPTED', evidence }).reason, 'acceptance-evidence-identity-mismatch');
  }
});

test('valid customer acceptance becomes terminal and cannot resurrect', () => {
  let record = fresh();
  record = step(record, 'IN_PROGRESS');
  record = step(record, 'DELIVERY_READY');
  record = step(record, 'DELIVERED_UNACKNOWLEDGED');
  record = step(record, 'ACCEPTED', { evidence: customerEvidence('ACCEPT') });

  assert.equal(record.truth.customerAccepted, true);
  assert.equal(record.truth.customerAcceptanceProof, 'CUSTOMER_ORIGIN_VERIFIED');
  assert.equal(record.acceptanceEvidenceId, 'customer-accept-1');
  assert.equal(transitionDelivery(record, { to: 'REPAIR_REQUIRED' }).reason, 'terminal-delivery-state-cannot-transition');
});

test('customer rejection requires a reason and routes to repair without implying acceptance', () => {
  let record = fresh();
  record = step(record, 'IN_PROGRESS');
  record = step(record, 'DELIVERY_READY');
  record = step(record, 'DELIVERED_UNACKNOWLEDGED');

  assert.equal(
    transitionDelivery(record, { to: 'REJECTED_WITH_REASON', evidence: customerEvidence('REJECT') }).reason,
    'customer-rejection-reason-required'
  );

  record = step(record, 'REJECTED_WITH_REASON', {
    evidence: customerEvidence('REJECT', { reason: 'Artifact B does not match agreed scope.' })
  });
  assert.equal(record.rejectionReason, 'Artifact B does not match agreed scope.');
  assert.equal(record.truth.customerAccepted, false);
  record = step(record, 'REPAIR_REQUIRED');
  record = step(record, 'IN_PROGRESS');
  assert.equal(record.state, 'IN_PROGRESS');
});

test('sequence conflicts fail closed', () => {
  const result = transitionDelivery(fresh(), { to: 'IN_PROGRESS', sequence: 9 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'delivery-sequence-conflict');
  assert.equal(result.expectedSequence, 1);
});

test('evidence ID cannot be reused with contradictory content', () => {
  let record = fresh();
  record = step(record, 'IN_PROGRESS', {
    evidence: {
      evidenceId: 'internal-proof-1',
      origin: 'INTERNAL_DETERMINISTIC',
      sourceRef: 'test-a',
      customerDecision: 'NONE'
    }
  });
  const conflict = transitionDelivery(record, {
    to: 'DELIVERY_READY',
    evidence: {
      evidenceId: 'internal-proof-1',
      origin: 'INTERNAL_DETERMINISTIC',
      sourceRef: 'test-b',
      customerDecision: 'NONE'
    }
  });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.reason, 'delivery-evidence-id-conflict');
});

test('all transition receipts remain zero external effect', () => {
  const result = transitionDelivery(fresh(), { to: 'IN_PROGRESS' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.transitionReceipt.externalEffectLedger, DELIVERY_ZERO_EFFECTS);
  assert.deepEqual(result.record.externalEffectLedger, DELIVERY_ZERO_EFFECTS);
});
