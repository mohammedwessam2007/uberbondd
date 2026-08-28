import test from 'node:test';
import assert from 'node:assert/strict';
import { compileJourneyOffer, DEFAULT_JOURNEY_OFFER_NAME } from '../../src/overnight/journey/offer-compiler.mjs';
import { ZERO_EXTERNAL_EFFECTS, EFFECT_STATES } from '../../src/effect-ledgers.mjs';
import { diagnostic, TEST_DATE } from './fixtures.mjs';

test('one actionable diagnostic compiles into a truthful channel-neutral offer', () => {
  const result = compileJourneyOffer({
    diagnostic: diagnostic({ statusByType: { CRM_RECEIPT: 'FAIL' } }),
    subject: { subjectRef: 'org_test_target', relationship: 'PROSPECT', displayName: 'Test Target' },
    date: TEST_DATE
  });
  assert.equal(result.ok, true);
  assert.equal(result.offer.name, DEFAULT_JOURNEY_OFFER_NAME);
  assert.equal(result.offer.price.status, 'NOT_CONFIGURED');
  assert.equal(result.recipient.customerStatus, 'UNVERIFIED');
  assert.ok(result.proofPoints.length >= 1);
  assert.ok(result.proofPoints.every(point => point.relation === 'DERIVED' && point.evidenceRefs.length > 0));
  assert.equal(result.channelNeutralAssets.channel, 'CHANNEL_NEUTRAL');
  assert.match(result.channelNeutralAssets.body, /does not claim lost revenue/);
  assert.match(result.channelNeutralAssets.body, /synthetic check/);
  assert.equal(result.dispatch.status, 'NOT_AUTHORIZED');
  assert.equal(result.executionReceipt.effectState, EFFECT_STATES.ZERO_EFFECT);
  assert.deepEqual(result.externalEffectLedger, ZERO_EXTERNAL_EFFECTS);
});

test('only explicitly owner-configured pricing is retained; no market price is invented', () => {
  const configured = compileJourneyOffer({
    diagnostic: diagnostic({ statusByType: { CRM_RECEIPT: 'FAIL' } }),
    offer: { name: 'Journey Review', scope: 'One funnel', price: { source: 'OWNER_CONFIG', amountMinor: 9900, currency: 'USD' } },
    date: TEST_DATE
  });
  assert.equal(configured.ok, true);
  assert.deepEqual(configured.offer.price, { status: 'CONFIGURED', amountMinor: 9900, currency: 'USD', source: 'OWNER_CONFIG' });

  const untrusted = compileJourneyOffer({
    diagnostic: diagnostic({ statusByType: { CRM_RECEIPT: 'FAIL' } }),
    offer: { price: { source: 'MARKET_BENCHMARK', amountMinor: 999999, currency: 'USD' } },
    date: TEST_DATE
  });
  assert.equal(untrusted.ok, true);
  assert.equal(untrusted.offer.price.status, 'NOT_CONFIGURED');
  assert.equal(untrusted.offer.price.amountMinor, null);
});

test('predictions and inferences never become offer proof points', () => {
  const result = compileJourneyOffer({
    diagnostic: diagnostic({
      statusByType: { CRM_RECEIPT: 'FAIL' },
      reasoning: {
        inferences: [{ statement: 'A handoff may be delayed.', inferenceBasis: 'CRM failure', evidenceRefs: ['witness:crm_receipt'] }],
        predictions: [{ statement: 'Conversion could decline.', modelRef: 'model:journey:v1', evidenceRefs: ['witness:crm_receipt'] }]
      }
    }),
    date: TEST_DATE
  });
  assert.equal(result.ok, true);
  assert.ok(result.internalHypotheses.inferences.length > 0);
  assert.ok(result.internalHypotheses.predictions.length > 0);
  assert.equal(result.proofPoints.some(point => /may be delayed|could decline/i.test(point.statement)), false);
});

test('a clean run cannot be turned into an offer without an actionable finding', () => {
  const result = compileJourneyOffer({ diagnostic: diagnostic(), date: TEST_DATE });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('no-actionable-journey-finding'));
});

test('tampered diagnostic effects are refused before offer compilation', () => {
  const source = diagnostic({ statusByType: { CRM_RECEIPT: 'FAIL' } });
  const tampered = { ...source, externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS, purchases: 1 } };
  const result = compileJourneyOffer({ diagnostic: tampered, date: TEST_DATE });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('offer-requires-proven-zero-effect'));
});

test('identical inputs produce an identical offer packet', () => {
  const args = { diagnostic: diagnostic({ statusByType: { CRM_RECEIPT: 'FAIL' } }), date: TEST_DATE };
  const a = compileJourneyOffer(args);
  const b = compileJourneyOffer(args);
  assert.deepEqual(a, b);
});
