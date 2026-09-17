import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRevenueOfferCatalog, PAID_REVENUE_OFFER_IDS, REVENUE_OFFER_CATALOG_VERSION } from '../src/revenue-offers.mjs';

const revenue = {
  fullAuditPrice: 49,
  strategyAuditPrice: 299,
  implementationFrom: 1000,
  monitoringPrice: 99,
  fullAuditCheckoutUrl: '',
  strategyAuditCheckoutUrl: 'https://checkout.example/strategy',
  bookingUrl: '',
  monitoringCheckoutUrl: 'https://checkout.example/watch'
};

test('the revenue catalog preserves one lead generator and four paid offers', () => {
  const catalog = buildRevenueOfferCatalog(revenue);
  assert.equal(REVENUE_OFFER_CATALOG_VERSION, 'uberbond.revenue-offers-1.0.0');
  assert.deepEqual(catalog.map(item => item.id), ['snapshot', 'full', 'strategy', 'implementation', 'monitoring']);
  assert.equal(catalog.filter(item => item.kind === 'paid').length, 4);
  assert.equal(PAID_REVENUE_OFFER_IDS.length, 4);
});

test('unconfigured payment routes remain request routes rather than fake checkout', () => {
  const catalog = buildRevenueOfferCatalog(revenue);
  assert.equal(catalog.find(item => item.id === 'full').route, 'request');
  assert.equal(catalog.find(item => item.id === 'strategy').route, 'checkout');
  assert.equal(catalog.find(item => item.id === 'implementation').route, 'request');
  assert.equal(catalog.find(item => item.id === 'monitoring').route, 'checkout');
  assert.equal(catalog.find(item => item.id === 'full').configured, false);
  assert.equal(catalog.find(item => item.id === 'strategy').configured, true);
});
