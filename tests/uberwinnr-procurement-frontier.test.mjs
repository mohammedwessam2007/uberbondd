import test from 'node:test';
import assert from 'node:assert/strict';
import { compileWinnrProcurementFrontier } from '../src/uberwinnr-procurement-frontier.mjs';

test('minimum pre-warmed pilot is $9/month for 3 addresses and nominal 45/day', () => {
  const r = compileWinnrProcurementFrontier({ targetDailyCold: 45, firstCashUrgent: true });
  assert.equal(r.route, 'WINNR_PREWARMED_MINIMUM_CANARY');
  assert.equal(r.minimumPilot.addresses, 3);
  assert.equal(r.minimumPilot.monthlyUsd, 9);
  assert.equal(r.minimumPilot.nominalNormalColdDaily, 45);
  assert.equal(r.purchaseReady, false);
});

test('300/day public-price target needs 20 pre-warmed addresses for $60/month', () => {
  const r = compileWinnrProcurementFrontier({ targetDailyCold: 300, firstCashUrgent: false });
  assert.equal(r.targetEconomics.prewarmedAddressesForTarget, 20);
  assert.equal(r.targetEconomics.prewarmedMonthlyUsd, 60);
  assert.equal(r.targetEconomics.prewarmedCheaperAtTarget, true);
  assert.equal(r.route, 'WINNR_PREWARMED_TARGET_CAPACITY');
});

test('500/day crosses public recurring-price frontier toward Startup', () => {
  const r = compileWinnrProcurementFrontier({ targetDailyCold: 500, firstCashUrgent: false });
  assert.equal(r.targetEconomics.prewarmedAddressesForTarget, 34);
  assert.equal(r.targetEconomics.prewarmedMonthlyUsd, 102);
  assert.equal(r.targetEconomics.startupMonthlyUsd, 69);
  assert.equal(r.targetEconomics.prewarmedCheaperAtTarget, false);
  assert.equal(r.route, 'WINNR_STARTUP_CAPACITY_ROUTE');
  assert.equal(r.crossover.addressesAtOrBelowStartupMonthlyPrice, 23);
  assert.equal(r.crossover.normalColdDailyAtCrossover, 345);
});

test('checkout, country payment, inventory and exact charge must all be observed before purchase-ready', () => {
  const blocked = compileWinnrProcurementFrontier({
    targetDailyCold: 45,
    firstCashUrgent: true,
    publicTermsCurrent: true,
    publicTermsCompatible: true
  });
  assert.ok(blocked.blockers.includes('authenticated-checkout-required'));
  assert.ok(blocked.blockers.includes('country-payment-acceptance-unobserved'));
  assert.ok(blocked.blockers.includes('live-prewarmed-inventory-unobserved'));
  assert.ok(blocked.blockers.includes('exact-first-charge-unobserved'));

  const ready = compileWinnrProcurementFrontier({
    targetDailyCold: 45,
    firstCashUrgent: true,
    publicTermsCurrent: true,
    publicTermsCompatible: true,
    checkoutObserved: true,
    countryPaymentAccepted: true,
    inventoryObserved: true,
    exactFirstChargeObserved: true,
    exactFirstChargeUsd: 9,
    maxPilotSpendUsd: 15
  });
  assert.equal(ready.purchaseReady, true);
  assert.deepEqual(ready.blockers, []);
});

test('observed charge above founder ceiling holds the gate closed', () => {
  const r = compileWinnrProcurementFrontier({
    targetDailyCold: 45,
    checkoutObserved: true,
    countryPaymentAccepted: true,
    inventoryObserved: true,
    exactFirstChargeObserved: true,
    exactFirstChargeUsd: 25,
    maxPilotSpendUsd: 15
  });
  assert.equal(r.purchaseReady, false);
  assert.ok(r.blockers.includes('first-charge-exceeds-founder-pilot-ceiling'));
});
