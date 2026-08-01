import test from 'node:test';
import assert from 'node:assert/strict';
import { portfolioScore, isLaneProven, allocatePortfolio, buildMonthlyCapacityPlan } from '../src/portfolio-allocator.mjs';

test('P2-002 acceptance: a one-payment tiny sample cannot absorb the portfolio', () => {
  const lanes = [
    { serviceLane: 'tiny-lucky', paidCustomers: 1, evidenceWindowDays: 3, collectedMarginProvenance: true, collectedContributionMarginPct: 100, paidConversionRatePct: 100, buyerUrgencyScore: 10, evidenceConfidenceScore: 10, riskScore: 0 },
    { serviceLane: 'established', paidCustomers: 20, evidenceWindowDays: 90, collectedMarginProvenance: true, collectedContributionMarginPct: 40, paidConversionRatePct: 20, buyerUrgencyScore: 5, evidenceConfidenceScore: 7, riskScore: 3 }
  ];
  const allocation = allocatePortfolio(lanes, { minimumPaidSamples: 3 });
  const tiny = allocation.find(row => row.serviceLane === 'tiny-lucky');
  const established = allocation.find(row => row.serviceLane === 'established');
  assert.equal(isLaneProven(lanes[0], { minimumPaidSamples: 3 }), false);
  assert.equal(isLaneProven(lanes[1], { minimumPaidSamples: 3 }), true);
  // the unproven lane can only draw from the (default 20%) exploration share, never the 80% proven pool
  assert.ok(tiny.allocationPct <= 20 + 0.01);
  assert.ok(established.allocationPct > tiny.allocationPct);
});

test('a lane with no evidence window or provenance is never proven regardless of paidCustomers', () => {
  assert.equal(isLaneProven({ paidCustomers: 50, evidenceWindowDays: 0, collectedMarginProvenance: true }), false);
  assert.equal(isLaneProven({ paidCustomers: 50, evidenceWindowDays: 30, collectedMarginProvenance: false }), false);
});

test('portfolioScore is bounded to [0,100]', () => {
  const score = portfolioScore({ collectedContributionMarginPct: 1000, paidConversionRatePct: -50, riskScore: -5 });
  assert.ok(score >= 0 && score <= 100);
});

test('buildMonthlyCapacityPlan is architecture-only (no activation side effects)', () => {
  const plan = buildMonthlyCapacityPlan({ monthlyTarget: 30000, mailboxes: [{ id: 'm1', dailyCap: 300 }, { id: 'm2', dailyCap: 300 }] });
  assert.equal(plan.monthlyTarget, 30000);
  assert.equal(typeof plan.sufficient, 'boolean');
  assert.ok(!('activate' in plan) && !('liveOutboundEnabled' in plan));
});
