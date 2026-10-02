import test from 'node:test';
import assert from 'node:assert/strict';
import { compileWinnrProcurementFrontier } from '../src/uberwinnr-procurement-frontier.mjs';

test('minimum pre-warmed pilot preserves $9 first charge and support-resolved no-minimum-term', () => {
  const r = compileWinnrProcurementFrontier({ targetDailyCold: 45, firstCashUrgent: true });
  assert.equal(r.route, 'WINNR_PREWARMED_MINIMUM_CANARY');
  assert.equal(r.minimumPilot.addresses, 3);
  assert.equal(r.minimumPilot.firstMonthUsd, 9);
  assert.equal(r.minimumPilot.writtenSupportMinimumCommittedUsd, 9);
  assert.equal(r.minimumPilot.minimumTermConflictObserved, false);
  assert.equal(r.minimumPilot.historicalMinimumTermConflictObserved, true);
  assert.equal(r.minimumPilot.nominalNormalColdDaily, 45);
  assert.equal(r.minimumPilot.hardTechnicalMailCeilingDaily, 150);
  assert.equal(r.purchaseReady, false);
  assert.ok(!r.blockers.includes('prewarmed-minimum-term-conflict-unresolved'));
  assert.ok(r.blockers.includes('authenticated-checkout-required'));
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

test('written support resolution still requires authenticated checkout and exact commitment observation', () => {
  const r = compileWinnrProcurementFrontier({
    targetDailyCold: 45,
    publicTermsCurrent: true,
    publicTermsCompatible: true,
    checkoutObserved: false,
    countryPaymentAccepted: true,
    inventoryObserved: true,
    exactFirstChargeObserved: false,
    maxPilotSpendUsd: 15,
    maxPilotCommittedSpendUsd: 15
  });
  assert.equal(r.purchaseReady, false);
  assert.ok(r.blockers.includes('authenticated-checkout-required'));
  assert.ok(r.blockers.includes('exact-first-charge-unobserved'));
  assert.ok(r.blockers.includes('exact-minimum-commitment-unobserved'));
  assert.ok(!r.blockers.includes('prewarmed-minimum-term-conflict-unresolved'));
});

test('unexpected 90-day checkout terms still block when $27 commitment exceeds founder ceiling', () => {
  const r = compileWinnrProcurementFrontier({
    targetDailyCold: 45,
    publicTermsCurrent: true,
    publicTermsCompatible: true,
    checkoutObserved: true,
    countryPaymentAccepted: true,
    inventoryObserved: true,
    exactFirstChargeObserved: true,
    exactFirstChargeUsd: 9,
    prewarmedMinimumTermConflictResolved: true,
    resolvedPrewarmedMinimumTermMonths: 3,
    minimumCommitmentObserved: true,
    exactMinimumCommittedUsd: 27,
    maxPilotSpendUsd: 15,
    maxPilotCommittedSpendUsd: 15
  });
  assert.equal(r.purchaseReady, false);
  assert.ok(r.blockers.includes('minimum-commitment-exceeds-founder-pilot-ceiling'));
});

test('pre-warmed route becomes procurement-ready only after exact term and commitment are reconciled within ceilings', () => {
  const r = compileWinnrProcurementFrontier({
    targetDailyCold: 45,
    publicTermsCurrent: true,
    publicTermsCompatible: true,
    checkoutObserved: true,
    countryPaymentAccepted: true,
    inventoryObserved: true,
    exactFirstChargeObserved: true,
    exactFirstChargeUsd: 9,
    prewarmedMinimumTermConflictResolved: true,
    resolvedPrewarmedMinimumTermMonths: 0,
    minimumCommitmentObserved: true,
    exactMinimumCommittedUsd: 9,
    maxPilotSpendUsd: 15,
    maxPilotCommittedSpendUsd: 15
  });
  assert.equal(r.purchaseReady, true);
  assert.deepEqual(r.blockers, []);
  assert.equal(r.termEvidence.resolvedMinimumTermMonths, 0);
  assert.equal(r.termEvidence.exactMinimumCommittedUsd, 9);
  assert.equal(r.spendAuthorized, false);
  assert.equal(r.ownerPurchasePacket.automaticPurchaseAuthority, false);
});

test('observed first charge above founder ceiling holds the gate closed', () => {
  const r = compileWinnrProcurementFrontier({
    targetDailyCold: 45,
    checkoutObserved: true,
    countryPaymentAccepted: true,
    inventoryObserved: true,
    exactFirstChargeObserved: true,
    exactFirstChargeUsd: 25,
    prewarmedMinimumTermConflictResolved: true,
    resolvedPrewarmedMinimumTermMonths: 0,
    minimumCommitmentObserved: true,
    exactMinimumCommittedUsd: 9,
    maxPilotSpendUsd: 15,
    maxPilotCommittedSpendUsd: 15
  });
  assert.equal(r.purchaseReady, false);
  assert.ok(r.blockers.includes('first-charge-exceeds-founder-pilot-ceiling'));
});
