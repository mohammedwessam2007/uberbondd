import test from 'node:test';
import assert from 'node:assert/strict';
import { compileOfferPacket, compilePrimaryOffer, OFFER_PRODUCTS, OFFER_COMPILER_POLICY_VERSION } from '../src/offer-compiler.mjs';

const monday = new Date('2026-07-13T10:00:00.000Z');

function baseCfg(overrides = {}) {
  return {
    revenue: {
      fullAuditPrice: 49, strategyAuditPrice: 299, monitoringPrice: 99, implementationFrom: 1000,
      fullAuditCheckoutUrl: 'https://shop.test/buy/full', strategyAuditCheckoutUrl: 'https://shop.test/buy/strategy',
      monitoringCheckoutUrl: 'https://shop.test/buy/watch', bookingUrl: 'https://cal.test/book',
      founderHourlyRateCents: 0,
      ...overrides.revenue
    }
  };
}

function baseProspect(overrides = {}) {
  return {
    id: 'pros', company: 'Clinic', website: 'https://clinic.example', country: 'United Kingdom',
    score: { total: 78, tier: 'B' },
    issue: { title: 'Booking button fails on mobile', category: 'conversion', severity: 4, confidence: 0.85, evidenceUrl: 'https://clinic.example/book', evidenceExcerpt: 'Tap target returns a 500 error.', safeForOutreach: true },
    ...overrides
  };
}

function baseCampaign(overrides = {}) {
  return { id: 'camp', approved: true, ...overrides };
}

test('a fully eligible offer is ready to present', () => {
  const packet = compileOfferPacket({ prospect: baseProspect(), campaign: baseCampaign(), cfg: baseCfg(), product: 'full', date: monday });
  assert.equal(packet.ok, true);
  assert.equal(packet.readyToOffer, true);
  assert.equal(packet.price.amountUsd, 49);
  assert.equal(packet.paymentRequirement.checkoutReadiness.configured, true);
  assert.equal(packet.policyVersion, OFFER_COMPILER_POLICY_VERSION);
});

test('insufficient evidence blocks readiness and sets an explicit kill condition', () => {
  const packet = compileOfferPacket({ prospect: baseProspect({ issue: { title: 'X', confidence: 0.9 } }), campaign: baseCampaign(), cfg: baseCfg(), product: 'full', date: monday });
  assert.equal(packet.readyToOffer, false);
  assert.ok(packet.evidence.reasonCodes.includes('incomplete-evidence'));
  assert.match(packet.killCondition, /Do not offer/);
});

test('low-confidence evidence blocks readiness', () => {
  const packet = compileOfferPacket({ prospect: baseProspect({ issue: { ...baseProspect().issue, confidence: 0.2 } }), campaign: baseCampaign(), cfg: baseCfg(), product: 'full', date: monday });
  assert.equal(packet.readyToOffer, false);
  assert.ok(packet.evidence.reasonCodes.includes('confidence-below-threshold'));
});

test('evidence marked unsafe for outreach blocks readiness', () => {
  const packet = compileOfferPacket({ prospect: baseProspect({ issue: { ...baseProspect().issue, safeForOutreach: false } }), campaign: baseCampaign(), cfg: baseCfg(), product: 'full', date: monday });
  assert.equal(packet.readyToOffer, false);
  assert.ok(packet.evidence.reasonCodes.includes('marked-unsafe'));
});

test('an unconfigured checkout URL is reported honestly, never assumed configured', () => {
  const cfg = baseCfg({ revenue: { fullAuditCheckoutUrl: '' } });
  const packet = compileOfferPacket({ prospect: baseProspect(), campaign: baseCampaign(), cfg, product: 'full', date: monday });
  assert.equal(packet.paymentRequirement.checkoutReadiness.configured, false);
  assert.equal(packet.readyToOffer, false);
});

test('the implementation product uses a booking URL, not a checkout URL, and its price is reported as a floor', () => {
  const packet = compileOfferPacket({ prospect: baseProspect(), campaign: baseCampaign(), cfg: baseCfg(), product: 'implementation', date: monday });
  assert.equal(packet.paymentRequirement.checkoutReadiness.mechanism, 'booking-call');
  assert.equal(packet.price.floor, true);
  assert.equal(packet.price.amountUsd, 1000);
});

test('the agency white-label product has no configured price anywhere and says so rather than inventing one', () => {
  const packet = compileOfferPacket({ prospect: baseProspect(), campaign: baseCampaign(), cfg: baseCfg(), product: 'agency', date: monday });
  assert.equal(packet.price.status, 'NOT_CONFIGURED');
  assert.equal(packet.price.amountUsd, null);
  assert.equal(packet.readyToOffer, false);
});

test('gross margin is NOT_COMPUTED (never fabricated) when no founder hourly rate is configured', () => {
  const packet = compileOfferPacket({ prospect: baseProspect(), campaign: baseCampaign(), cfg: baseCfg(), product: 'full', date: monday });
  assert.equal(packet.deliveryEconomics.status, 'NOT_COMPUTED');
  assert.equal(packet.deliveryEconomics.grossMarginPercent, null);
});

test('gross margin is computed only when a founder hourly rate is explicitly configured', () => {
  const cfg = baseCfg({ revenue: { founderHourlyRateCents: 6000 } });
  const packet = compileOfferPacket({ prospect: baseProspect(), campaign: baseCampaign(), cfg, product: 'full', date: monday });
  assert.equal(packet.deliveryEconomics.status, 'COMPUTED');
  assert.ok(packet.deliveryEconomics.estimatedCostUsd > 0);
  assert.ok(Number.isFinite(packet.deliveryEconomics.grossMarginPercent));
});

test('an unapproved campaign reports pending owner approval, not silently approved', () => {
  const packet = compileOfferPacket({ prospect: baseProspect(), campaign: baseCampaign({ approved: false }), cfg: baseCfg(), product: 'full', date: monday });
  assert.equal(packet.ownerApprovalStatus, 'pending-owner-approval');
});

test('a refund/cancellation policy is reported as unconfigured, matching the actual codebase state', () => {
  const packet = compileOfferPacket({ prospect: baseProspect(), campaign: baseCampaign(), cfg: baseCfg(), product: 'full', date: monday });
  assert.equal(packet.refundCancellationState.configured, false);
});

test('malformed input (missing prospect) is denied cleanly without throwing', () => {
  const packet = compileOfferPacket({ prospect: null, campaign: baseCampaign(), cfg: baseCfg(), product: 'full', date: monday });
  assert.equal(packet.ok, false);
  assert.equal(packet.reason, 'malformed-input-prospect');
});

test('an unknown product name is rejected cleanly', () => {
  const packet = compileOfferPacket({ prospect: baseProspect(), campaign: baseCampaign(), cfg: baseCfg(), product: 'not-a-real-product', date: monday });
  assert.equal(packet.ok, false);
  assert.match(packet.reason, /unknown-product/);
});

test('compilePrimaryOffer defaults to the lowest-friction already-automated product', () => {
  const packet = compilePrimaryOffer({ prospect: baseProspect(), campaign: baseCampaign(), cfg: baseCfg(), date: monday });
  assert.equal(packet.product, 'full');
});

test('every declared product can produce a structured packet without throwing', () => {
  for (const product of OFFER_PRODUCTS) {
    const packet = compileOfferPacket({ prospect: baseProspect(), campaign: baseCampaign(), cfg: baseCfg(), product, date: monday });
    assert.equal(packet.ok, true, `product ${product} should compile`);
    assert.ok(Array.isArray(packet.acceptanceCriteria) && packet.acceptanceCriteria.length > 0);
  }
});

test('the same reference date produces a byte-identical offer packet for identical input', () => {
  const a = compileOfferPacket({ prospect: baseProspect(), campaign: baseCampaign(), cfg: baseCfg(), product: 'full', date: monday });
  const b = compileOfferPacket({ prospect: baseProspect(), campaign: baseCampaign(), cfg: baseCfg(), product: 'full', date: monday });
  assert.deepEqual(a, b);
});
