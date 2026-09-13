import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSovereignMoneyMachineProof, MIN_ENDURANCE_MS } from '../src/sovereign-money-machine-proof.mjs';

const now = new Date('2026-09-14T00:00:00.000Z');
const sourceRevision = 'a'.repeat(40);
const fullBundle = () => ({
  sourceRevision,
  runtimeReceipt: {
    ready: true,
    status: 'SOVEREIGN_REVENUE_RUNTIME_READY',
    observedAt: '2026-09-13T23:58:00.000Z',
    blockers: []
  },
  pulseReceipt: {
    status: 'FOUNDER_ECONOMIC_MISSION_PULSE_DISPATCHED',
    observedAt: '2026-09-13T23:59:00.000Z',
    jobsQueued: [{ type: 'outbound.process' }, { type: 'payment.reconciliation.tick' }],
    jobFailures: []
  },
  workerReceipts: [{
    id: 'worker:1',
    externalEffectLedger: { providerCalls: 1, messages: 1, purchases: 0, deployments: 0, credentialChanges: 0, dnsChanges: 0, productionMutations: 0, spendCents: 0 }
  }],
  paymentReceipts: [{
    id: 'pay:1',
    paymentReceiptId: 'pay:1',
    providerOrigin: true,
    state: 'CLEARED',
    clearedAmountCents: 1000,
    providerEventId: 'evt-live-1',
    evidenceRefs: ['provider:evt-live-1']
  }],
  deliveryReceipts: [{
    id: 'delivery:1',
    accepted: true,
    paymentReceiptId: 'pay:1',
    evidenceRefs: ['customer-acceptance:1']
  }],
  economics: {
    clearedRevenueCents: 1000,
    variableCostCents: 200,
    clearedContributionProfitCents: 800,
    evidenceRefs: ['pay:1', 'cost-ledger:1']
  },
  endurance: {
    startedAt: '2026-09-13T00:00:00.000Z',
    observedAt: '2026-09-14T00:00:00.000Z',
    maxPulseGapMs: 5 * 60 * 1000,
    consecutivePulseCount: 288,
    evidenceRefs: ['pulse-ledger:24h']
  }
});

test('proves the money machine only with real-wire profit and 24h endurance', () => {
  const result = evaluateSovereignMoneyMachineProof(fullBundle(), { now });
  assert.equal(result.proven, true);
  assert.equal(result.softwareChainProven, true);
  assert.equal(result.realWireProven, true);
  assert.equal(result.enduranceProven, true);
  assert.equal(result.status, 'SOVEREIGN_MONEY_MACHINE_PROVEN_24H');
  assert.equal(result.evidence.endurance.elapsedMs, MIN_ENDURANCE_MS);
});

test('sandbox or internal payment claims cannot prove real wire', () => {
  const bundle = fullBundle();
  bundle.paymentReceipts = [{
    id: 'pay:sandbox',
    providerOrigin: false,
    state: 'CLEARED',
    clearedAmountCents: 1000,
    providerEventId: 'sandbox-1',
    evidenceRefs: ['sandbox:1']
  }];
  const result = evaluateSovereignMoneyMachineProof(bundle, { now });
  assert.equal(result.proven, false);
  assert.equal(result.realWireProven, false);
  assert.ok(result.reasonCodes.includes('positive-provider-origin-cleared-payment-required'));
});

test('queued jobs without provider effects are not outcomes', () => {
  const bundle = fullBundle();
  bundle.workerReceipts = [{
    id: 'worker:no-effect',
    externalEffectLedger: { providerCalls: 0, messages: 0, purchases: 0, deployments: 0, credentialChanges: 0, dnsChanges: 0, productionMutations: 0, spendCents: 0 }
  }];
  const result = evaluateSovereignMoneyMachineProof(bundle, { now });
  assert.equal(result.softwareChainProven, true);
  assert.equal(result.realWireProven, false);
  assert.equal(result.proven, false);
  assert.ok(result.reasonCodes.includes('provider-origin-external-effect-receipt-required'));
});

test('positive payment without accepted delivery cannot prove the machine', () => {
  const bundle = fullBundle();
  bundle.deliveryReceipts = [];
  const result = evaluateSovereignMoneyMachineProof(bundle, { now });
  assert.equal(result.realWireProven, false);
  assert.ok(result.reasonCodes.includes('accepted-paid-delivery-receipt-required'));
});

test('profit must reconcile exactly to cleared revenue minus variable cost', () => {
  const bundle = fullBundle();
  bundle.economics.clearedContributionProfitCents = 900;
  const result = evaluateSovereignMoneyMachineProof(bundle, { now });
  assert.equal(result.realWireProven, false);
  assert.ok(result.reasonCodes.includes('positive-evidence-backed-cleared-contribution-profit-required'));
});

test('real wire can be proven before 24h but cannot be called 24h proven', () => {
  const bundle = fullBundle();
  bundle.endurance.observedAt = '2026-09-13T12:00:00.000Z';
  bundle.endurance.consecutivePulseCount = 144;
  const result = evaluateSovereignMoneyMachineProof(bundle, { now });
  assert.equal(result.realWireProven, true);
  assert.equal(result.enduranceProven, false);
  assert.equal(result.proven, false);
  assert.equal(result.status, 'SOVEREIGN_MONEY_MACHINE_REAL_WIRE_PROVEN_ENDURANCE_PENDING');
});
