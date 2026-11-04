import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateRailwayFreeFloor as estimate } from '../src/railway-free-cost-floor.mjs';

const period = 30 * 86400;
const input = () => ({
  billingPeriodSeconds: period,
  services: [
    { role: 'web', memoryGb: 0.01, averageCpuVcpu: 0, runningSeconds: period / 4 },
    { role: 'worker', memoryGb: 0.01, averageCpuVcpu: 0, runningSeconds: period / 4 }
  ],
  volumeGb: 0, volumeSeconds: 0, egressGb: 0, remainingFreeCreditUsd: 1,
  freePlanAuthenticated: true, providerZeroOverageVerified: true,
  requiresRailwayCron: false, requiresCustomDomain: false
});

for (const stoppedRole of ['web', 'worker']) {
  test(`stopped ${stoppedRole} cannot be represented as a viable two-service runtime`, () => {
    const evidence = input();
    evidence.services.find(s => s.role === stoppedRole).runningSeconds = 0;
    const result = estimate(evidence);
    assert.equal(result.status, 'HOLD');
    assert.ok(result.reasons.includes('WEB_AND_WORKER_MUST_BOTH_RUN'));
    assert.equal(result.deploymentPermitted, false);
    assert.equal(result.resourceCreationPermitted, false);
  });
}

test('both services running may be budget-plausible but never authorized', () => {
  const result = estimate(input());
  assert.equal(result.status, 'BUDGET_PLAUSIBLE_UNVERIFIED');
  assert.equal(result.deploymentPermitted, false);
  assert.equal(result.spendingPermitted, false);
});

test('both services stopped preserves existing NO_RUNNING_RUNTIME reason', () => {
  const evidence = input();
  evidence.services.forEach(s => { s.runningSeconds = 0; });
  const result = estimate(evidence);
  assert.equal(result.status, 'HOLD');
  assert.ok(result.reasons.includes('NO_RUNNING_RUNTIME'));
  assert.ok(result.reasons.includes('WEB_AND_WORKER_MUST_BOTH_RUN'));
});
