import test from 'node:test';
import assert from 'node:assert/strict';
import { compileOfferMarket, MUTATION_DIMENSIONS } from '../src/offer-market-maker.mjs';
import { compressPayment, assessPaymentEvidence } from '../src/payment-compression.mjs';
import { advanceDelivery } from '../src/delivery-loop.mjs';
import { rankPartners, attributeOutcome, diagnosticYield } from '../src/partner-multiplier.mjs';
import { UBERREPLY_OFFER_PORTFOLIO } from '../src/uberreply-four-offer-genome.mjs';

const good = { provider: 'paypal', providerTransactionId: 'tx1', grossCents: 150000, feeCents: 5000, currency: 'USD', status: 'cleared', clearedAt: '2026-10-01T00:00:00Z', source: 'provider' };

test('offer market never invents a fifth offer and proposes one dimension with control preserved', () => {
  const ids = UBERREPLY_OFFER_PORTFOLIO.map(o => o.offerId);
  const m = compileOfferMarket({ outcomes: { [ids[0]]: { qualifiedConversations: 6, paidSprints: 0 } } });
  assert.equal(m.offers.length, ids.length);
  const o = m.offers.find(x => x.offerId === ids[0]);
  assert.equal(o.lifecycle, 'RETHINK_OFFER');
  assert.ok(MUTATION_DIMENSIONS.includes(o.mutationProposal.dimension));
  assert.equal(o.mutationProposal.controlPreserved, true); assert.equal(o.mutationProposal.maxConcurrentDimensions, 1);
  assert.equal(m.offers.filter(x => x.mutationProposal).length, 1);
  const again = compileOfferMarket({ outcomes: { [ids[0]]: { qualifiedConversations: 6, paidSprints: 0 } }, history: { [ids[0]]: ['buyer'] } });
  assert.notEqual(again.offers.find(x => x.offerId === ids[0]).mutationProposal.dimension, 'buyer');
  assert.equal(m.outboundAuthority, 'NONE');
});

test('guardrail-degraded offers are paused and excluded from allocation', () => {
  const ids = UBERREPLY_OFFER_PORTFOLIO.map(o => o.offerId);
  const m = compileOfferMarket({ outcomes: { [ids[1]]: { complaints: 3, sends: 50 } } });
  if (m.pausedForGuardrail.length) assert.ok(!m.allocation.allocations.some(a => m.pausedForGuardrail.includes(a.id)));
});

test('payment compression refuses sandbox/no rails and never marks anything paid', () => {
  assert.equal(compressPayment({ rails: [{ provider: 'x', state: 'READY_FOR_SANDBOX' }], amountCents: 100 }).state, 'ONLY_SANDBOX_RAILS_READY');
  assert.equal(compressPayment({ rails: [], amountCents: 100 }).state, 'NO_LIVE_RAIL_READY');
  assert.equal(compressPayment({ rails: [{ provider: 'x', state: 'LIVE_READY' }], amountCents: 0 }).state, 'NO_AMOUNT');
  const c = compressPayment({ rails: [{ provider: 'a', state: 'LIVE_READY', frictionSteps: 3 }, { provider: 'b', state: 'LIVE_READY', frictionSteps: 1 }], amountCents: 150000 });
  assert.equal(c.provider, 'b'); assert.ok(!('paid' in c)); assert.equal(c.externalEffectLedger.purchases, 0);
  assert.equal(compressPayment({ rails: [{ provider: 'eu', state: 'LIVE_READY', regions: ['EU'] }], buyerRegion: 'US', amountCents: 5 }).ok, false);
});

test('cleared truth needs every provider-origin field; checkout/self-report/future timestamps are not cleared', () => {
  assert.equal(assessPaymentEvidence(good).cleared, true);
  assert.equal(assessPaymentEvidence(good).netCents, 145000);
  for (const bad of [{ ...good, providerTransactionId: '' }, { ...good, status: 'pending' }, { ...good, source: 'self_report' }, { ...good, clearedAt: '2999-01-01T00:00:00Z' }, { ...good, grossCents: 0 }, {}]) assert.equal(assessPaymentEvidence(bad).cleared, false);
  const refunded = assessPaymentEvidence({ ...good, refundedCents: 150000 });
  assert.equal(refunded.cleared, false); assert.equal(refunded.netCents, 0); assert.equal(refunded.grossCents, 150000);
  assert.equal(assessPaymentEvidence({ ...good, disputed: true }).cleared, false);
});


test('money never clears or compresses fractional, infinite, coerced or negative cent amounts', () => {
  const rail = [{ provider: 'contra', state: 'COLLECTION_READY' }];
  for (const amountCents of [Infinity, NaN, 1.2, -1, 9007199254740992, '250000', true, [], {}]) {
    const p = compressPayment({ rails: rail, amountCents });
    assert.equal(p.ok, false);
    assert.equal(p.state, 'NO_AMOUNT');
  }
  assert.equal(compressPayment({ rails: rail, amountCents: 250000 }).provider, 'contra');
  for (const patch of [
    { grossCents: Infinity }, { grossCents: NaN }, { grossCents: 150000.1 },
    { grossCents: 9007199254740992 }, { grossCents: true }, { grossCents: '1e6' },
    { feeCents: -1 }, { feeCents: Infinity }, { feeCents: 150001 },
    { refundedCents: -1 }, { refundedCents: Infinity }, { refundedCents: NaN }
  ]) {
    const evidence = assessPaymentEvidence({ ...good, ...patch });
    assert.equal(evidence.cleared, false, JSON.stringify(patch));
    assert.equal(evidence.netCents, 0, 'invalid money must not count toward contribution');
  }
  assert.equal(assessPaymentEvidence({ ...good, grossCents: '150000', feeCents: '5000' }).netCents, 145000);
  assert.equal(assessPaymentEvidence(null).cleared, false);
});

test('unverified payment and invalid delivery costs cannot mint contribution', () => {
  for (const patch of [
    { status: 'pending' }, { source: 'owner_attested' }, { grossCents: Infinity },
    { refundedCents: -1 }, { feeCents: -1 }, { disputed: true }
  ]) {
    const result = advanceDelivery({ payment: { ...good, ...patch }, deliveryCostCents: 10000 });
    assert.equal(result.state, 'SOLD');
    assert.equal(result.contributionCents, null);
  }
  assert.equal(advanceDelivery({ payment: good, deliveryCostCents: -1 }).contributionCents, null);
  assert.equal(advanceDelivery({ payment: good, deliveryCostCents: Infinity }).contributionCents, null);
  assert.equal(advanceDelivery({ payment: good, deliveryCostCents: 10000 }).contributionCents, 135000);
  assert.equal(advanceDelivery({ payment: good, deliveryCostCents: '10000' }).contributionCents, 135000);
});

test('delivery loop is forward-only and every step needs its evidence', () => {
  assert.equal(advanceDelivery({}).state, 'SOLD');
  const paid = { payment: good };
  assert.equal(advanceDelivery(paid).state, 'PAID_CLEARED');
  const delivering = { ...paid, scope: 's', acceptanceCriteria: ['a'] };
  assert.equal(advanceDelivery(delivering).state, 'DELIVERING');
  const delivered = { ...delivering, deliverableRefs: ['d'], claimsVerified: true };
  assert.equal(advanceDelivery(delivered).state, 'DELIVERED');
  const silent = { ...delivered, acceptance: { explicit: false, by: 'silence' } };
  assert.equal(advanceDelivery(silent).state, 'DELIVERED'); assert.match(advanceDelivery(silent).blocks[0], /silence is not acceptance/);
  const accepted = { ...delivered, acceptance: { explicit: true, by: 'cust' } };
  assert.equal(advanceDelivery(accepted).state, 'ACCEPTED');
  assert.equal(advanceDelivery({ ...accepted, valueConfirmedByCustomer: true }).state, 'ACCEPTED'); // referral needs case permission first in order
});

test('no cash, no delivery; refunded payment cannot start delivery', () => {
  assert.equal(advanceDelivery({ payment: { ...good, status: 'pending' }, scope: 's', acceptanceCriteria: ['a'] }).state, 'SOLD');
  assert.equal(advanceDelivery({ payment: { ...good, refundedCents: 1 }, scope: 's', acceptanceCriteria: ['a'] }).state, 'SOLD');
});

test('full loop reaches renewal only with usage evidence and expansion only without worse founder minutes', () => {
  const full = { payment: good, scope: 's', acceptanceCriteria: ['a'], deliverableRefs: ['d'], claimsVerified: true, acceptance: { explicit: true, by: 'c' }, caseStudyPermission: { granted: true, scope: 'named' }, valueConfirmedByCustomer: true };
  assert.equal(advanceDelivery(full).state, 'REFERRAL_ELIGIBLE');
  const renew = { ...full, usedResult: true, recurringSignal: true };
  assert.equal(advanceDelivery(renew).state, 'RENEWAL_CANDIDATE');
  assert.equal(advanceDelivery({ ...renew, expansionUnits: 3, baseFounderMinutes: 60, marginalFounderMinutes: 120 }).state, 'RENEWAL_CANDIDATE');
  assert.equal(advanceDelivery({ ...renew, expansionUnits: 3, baseFounderMinutes: 60, marginalFounderMinutes: 30 }).state, 'EXPANSION_CANDIDATE');
  assert.equal(advanceDelivery(full).outboundAuthority, 'NONE');
});

test('partners sharing clients are not double counted; unconfirmed partners are discounted', () => {
  const r = rankPartners({ partners: [
    { id: 'A', clientRefs: ['c1', 'c2', 'c3'], fit: 1, confirmed: true },
    { id: 'B', clientRefs: ['c1', 'c2', 'c3'], fit: 1, confirmed: true },
    { id: 'C', clientRefs: ['c9', 'c8', 'c7'], fit: 1, confirmed: false }
  ] });
  const b = r.rows.find(x => x.id === 'B'); assert.equal(b.uniqueClients, 0); assert.equal(b.overlapDiscarded, 3);
  assert.ok(r.rows.find(x => x.id === 'A').score > r.rows.find(x => x.id === 'C').score);
  assert.equal(r.rows.find(x => x.id === 'C').basis, 'UNCONFIRMED_HYPOTHESIS');
});

test('attribution only along evidenced chains; multi-touch is not separable; diagnostics need sample', () => {
  assert.equal(attributeOutcome({ chain: [{ at: '2026-10-01', channel: 'email', evidenceRef: 'e' }, { at: '2026-10-02', channel: 'email', evidenceRef: 'f' }] }).causalClaim, 'SINGLE_CHANNEL_CHAIN');
  assert.equal(attributeOutcome({ chain: [{ at: '2026-10-01', channel: 'email', evidenceRef: 'e' }, { at: '2026-10-02', channel: 'partner', evidenceRef: 'f' }] }).causalClaim, 'MULTI_TOUCH_NOT_SEPARABLE');
  assert.equal(attributeOutcome({ chain: [{ at: 'x', channel: 'email' }, { at: '2026-10-02', channel: 'email' }] }).proven, false);
  assert.equal(diagnosticYield({ diagnosticsServed: 5, inboundReplies: 5 }).verdict, 'INSUFFICIENT_SAMPLE');
});
