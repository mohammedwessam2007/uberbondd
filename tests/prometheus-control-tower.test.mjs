import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Store } from '../src/store.mjs';
import { buildPrometheusControlTower, logPrometheusControlTower } from '../src/prometheus-control-tower.mjs';

const date = new Date('2026-08-18T12:00:00.000Z');

function cfg() {
  return {
    outbound: { enabled: false, dryRun: true, reservationRecoveryTimeoutMs: 1800000, reservationRecoverySweepLimit: 50 },
    revenue: {
      fullAuditPrice: 49, strategyAuditPrice: 299, monitoringPrice: 99, implementationFrom: 1000,
      fullAuditCheckoutUrl: '', strategyAuditCheckoutUrl: '', monitoringCheckoutUrl: '', bookingUrl: ''
    }
  };
}

async function tempStore() {
  const dir = await fs.mkdtemp('/tmp/uberbond-control-tower-');
  const store = new Store(dir);
  await store.init();
  return store;
}

test('malformed store input fails closed', async () => {
  const result = await buildPrometheusControlTower({ date });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'malformed-input-store');
});

test('empty state is truthful and never fabricates money, customers, or agent work', async () => {
  const store = await tempStore();
  const report = await buildPrometheusControlTower({ store, cfg: cfg(), date });
  assert.equal(report.ok, true);
  assert.equal(report.truthMode, 'LOCAL_FACTS_ONLY');
  assert.equal(report.money.clearedPaymentCount, 0);
  assert.equal(report.money.clearedRevenueDisplay, 'UNKNOWN');
  assert.equal(report.businesses.customers, 'UNKNOWN');
  assert.equal(report.aiWorkforce.agentRuns, 0);
  assert.equal(report.distribution.externalExecution, 'DISABLED_OR_OWNER_REQUIRED');
  assert.equal(report.capital.spendCents, 0);
  assert.equal(report.externalEffectLedger.messages, 0);
});

test('audit preparation events are counted but not upgraded into commercial proof', async () => {
  const store = await tempStore();
  await store.log('market_signal', { signalId: 'sig-1' });
  await store.log('commercial_experiment', { experimentId: 'exp-1' });
  await store.log('distribution_allocation', { status: 'DO_NOT_DISTRIBUTE' });
  await store.log('task_generation', { status: 'GENERATED' });
  await store.log('upgrade_proposal', { proposalId: 'up-1' });
  const report = await buildPrometheusControlTower({ store, cfg: cfg(), date });
  assert.equal(report.sourceCounts.signals, 1);
  assert.equal(report.businesses.experimentsPrepared, 1);
  assert.equal(report.distribution.allocationsPrepared, 1);
  assert.equal(report.aiWorkforce.taskGenerations, 1);
  assert.equal(report.product.upgradeProposals, 1);
  assert.equal(report.money.clearedPaymentCount, 0);
  assert.equal(report.businesses.promotedBusinesses, 'UNKNOWN');
});

test('founder action queue remains capped at three and local audit logging is explicit', async () => {
  const store = await tempStore();
  const report = await buildPrometheusControlTower({ store, cfg: cfg(), date });
  assert.ok(report.founder.ownerActionQueue.length <= 3);
  const calls = [];
  await logPrometheusControlTower({ log: async (type, detail) => { calls.push({ type, detail }); return { id: 'tower-1' }; } }, report);
  assert.equal(calls[0].type, 'prometheus_control_tower');
  assert.equal(calls[0].detail.truthMode, 'LOCAL_FACTS_ONLY');
  assert.equal(calls[0].detail.money.clearedRevenueDisplay, 'UNKNOWN');
});

test('control tower source has no provider, message, spend, or deployment boundary', async () => {
  const source = await fs.readFile(new URL('../src/prometheus-control-tower.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\(|http\.request|https\.request|sendEmail|purchase\(|child_process|process\.env/);
});
