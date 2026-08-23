import test from 'node:test';
import assert from 'node:assert/strict';
import { compileServiceSku, compileFulfillmentFromSku } from '../src/service-sku.mjs';

function sku(overrides = {}) {
  return compileServiceSku({
    skuId: 'sku_missed_call_textback',
    offerId: 'offer_creator_bundle_2',
    buyer: 'local service business',
    pain: 'missed calls become lost leads',
    promise: 'prepare a governed missed-call follow-up workflow',
    inputs: ['business hours', 'approved response policy'],
    requiredCapabilities: ['telephony-event', 'sms', 'crm-state', 'suppression'],
    setupRequirements: ['verified business number'],
    recurringTrigger: 'MISSED_CALL',
    deliveryRequirements: ['missed-call trigger configured', 'CRM disposition written'],
    acceptanceCriteria: ['synthetic missed call creates one bounded follow-up plan', 'suppression blocks follow-up'],
    pricing: {
      amountCents: 50000,
      currency: 'USD',
      evidenceClass: 'CREATOR_CLAIM'
    },
    costModel: [
      { name: 'sms', status: 'UNKNOWN' },
      { name: 'hosting', status: 'KNOWN', amountCents: 1000, sourceRef: 'evidence:hosting-price' }
    ],
    failureModes: ['carrier delay'],
    supportBurden: ['number configuration support'],
    refundRisk: ['trigger fails during acceptance'],
    ownerBurdenMinutes: 20,
    distributionConstraints: ['lawful-contact-only'],
    maxRevisions: 2,
    supportWindowDays: 30,
    renewalIntervalDays: 30,
    date: '2026-08-23T00:00:00Z',
    ...overrides
  });
}

test('requires explicit delivery obligations and acceptance criteria', () => {
  assert.equal(sku({ deliveryRequirements: [] }).ok, false);
  assert.equal(sku({ acceptanceCriteria: [] }).ok, false);
});

test('requires a reusable capability set', () => {
  const result = sku({ requiredCapabilities: [] });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('required-capabilities-required'));
});

test('creator price stays a creator claim and does not become market or revenue proof', () => {
  const result = sku();
  assert.equal(result.ok, true);
  assert.equal(result.pricing.evidenceClass, 'CREATOR_CLAIM');
  assert.equal(result.pricing.verifiedMarketPrice, false);
  assert.equal(result.pricing.claimBoundary, 'CREATOR_CLAIM_NOT_MARKET_OR_REVENUE_PROOF');
  assert.equal(result.commercialTruth.clearedRevenue, 'NOT_INFERRED_FROM_SKU');
});

test('verified transaction pricing requires a transaction-shaped receipt reference', () => {
  assert.equal(sku({ pricing: { amountCents: 50000, currency: 'USD', evidenceClass: 'VERIFIED_TRANSACTION', sourceRef: 'evidence:blog' } }).ok, false);
  const result = sku({ pricing: { amountCents: 50000, currency: 'USD', evidenceClass: 'VERIFIED_TRANSACTION', sourceRef: 'payment:settled-1' } });
  assert.equal(result.ok, true);
  assert.equal(result.pricing.verifiedMarketPrice, true);
  assert.equal(result.pricing.claimBoundary, 'ONE_VERIFIED_TRANSACTION_NOT_REPEATABILITY_PROOF');
});

test('market/buyer/transaction evidence needs a source ref', () => {
  assert.equal(sku({ pricing: { amountCents: 50000, currency: 'USD', evidenceClass: 'MARKET_OBSERVED' } }).ok, false);
  assert.equal(sku({ pricing: { amountCents: 50000, currency: 'USD', evidenceClass: 'BUYER_QUOTE' } }).ok, false);
});

test('unknown cost stays unknown instead of becoming zero', () => {
  const result = sku();
  assert.equal(result.ok, true);
  assert.equal(result.costModel.knownCostCents, 1000);
  assert.equal(result.costModel.unknownItemCount, 1);
  assert.equal(result.costModel.completeness, 'PARTIAL');
});

test('known cost requires explicit amount and source', () => {
  assert.equal(sku({ costModel: [{ name: 'sms', status: 'KNOWN' }] }).ok, false);
  assert.equal(sku({ costModel: [{ name: 'sms', status: 'KNOWN', amountCents: 50 }] }).ok, false);
});

test('recurring trigger and renewal interval must agree', () => {
  assert.equal(sku({ renewalIntervalDays: null, recurringTrigger: 'MISSED_CALL' }).ok, false);
  assert.equal(sku({ renewalIntervalDays: 30, recurringTrigger: null }).ok, false);
});

test('invalid owner burden cannot pass', () => {
  assert.equal(sku({ ownerBurdenMinutes: -1 }).ok, false);
});

test('capabilities and obligations are deduplicated', () => {
  const result = sku({ requiredCapabilities: ['sms', 'sms', 'crm'], deliveryRequirements: ['a', 'a', 'b'] });
  assert.deepEqual(result.requiredCapabilities, ['sms', 'crm']);
  assert.deepEqual(result.deliveryRequirements, ['a', 'b']);
});

test('SKU compiles directly into zero-authority fulfillment contract', () => {
  const result = compileFulfillmentFromSku({ sku: sku(), customerRef: 'customer:test-1', date: '2026-08-23T02:00:00Z' });
  assert.equal(result.ok, true);
  assert.equal(result.fulfillmentPlan.serviceSkuId, 'sku_missed_call_textback');
  assert.deepEqual(result.fulfillmentPlan.acceptanceCriteria, sku().acceptanceCriteria);
  assert.equal(result.fulfillmentPlan.economicTruth.clearedRevenue, 'NOT_INFERRED');
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.deepEqual(Object.values(result.externalEffectLedger), Array(8).fill(0));
});

test('compiling fulfillment requires valid SKU and customer ref', () => {
  assert.equal(compileFulfillmentFromSku({ sku: {}, customerRef: 'customer:x' }).ok, false);
  assert.equal(compileFulfillmentFromSku({ sku: sku(), customerRef: '' }).ok, false);
});
