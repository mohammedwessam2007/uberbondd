import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../../revenue-os/src/store.mjs';
import { buildRepairTask, implementationGate, authorizeRepairTask, contributionMargin, ImplementationError, DEFAULT_MARGIN_FLOOR_RATE } from '../../revenue-os/src/implementation.mjs';
import {
  buildMonitoringProposal, validateMonitoringConsent, activateMonitoring, recordMonitoringIncident,
  falsePositiveRate, buildMonthlyReport, buildMonitoringInvoiceHandoff, cancelMonitoring,
  exportMonitoringData, purgeExpiredEvidence, MonitoringError
} from '../../revenue-os/src/monitoring.mjs';

async function harness() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ros-impl-mon-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

function fullGateInput(repairTask, overrides = {}) {
  return {
    payment: { status: 'VERIFIED' }, scopeAcceptance: { accepted: true }, authorization: { authorized: true, authorizedBy: 'owner' },
    backup: { taken: true }, staging: { path: '/staging' }, qaResult: { passed: true }, rollbackPlan: { plan: 'revert commit' },
    evidenceItems: [{ id: 'ev1' }], repairTask, siteCount: 1, revisionCount: 0, ...overrides
  };
}

// --- implementation ---

test('contributionMargin computes real numbers, including a negative margin when cost exceeds revenue', () => {
  assert.deepEqual(contributionMargin({ revenueCents: 10000, directCostCents: 4000 }), { marginCents: 6000, marginRate: 0.6 });
  const negative = contributionMargin({ revenueCents: 10000, directCostCents: 12000 });
  assert.ok(negative.marginRate < 0);
});

test('implementationGate passes when every one of the 10 requirements is satisfied', () => {
  const repairTask = buildRepairTask({ id: 'd1', effortHours: 2 }, { hourlyRateCents: 15000, contractorCostCentsPerHour: 3000 });
  assert.equal(implementationGate(fullGateInput(repairTask)).blocked, false);
});

test('implementationGate blocks on each of the 8 named blocker categories independently', () => {
  const repairTask = buildRepairTask({ id: 'd1', effortHours: 2 }, { hourlyRateCents: 15000, contractorCostCentsPerHour: 3000 });
  assert.ok(implementationGate(fullGateInput(repairTask, { payment: { status: 'PENDING_VERIFICATION' } })).blockers.some(b => b.code === 'missing-payment'));
  assert.ok(implementationGate(fullGateInput(repairTask, { scopeAcceptance: { accepted: false } })).blockers.some(b => b.code === 'unsupported-scope'));
  assert.ok(implementationGate(fullGateInput(repairTask, { authorization: { authorized: true } })).blockers.some(b => b.code === 'ambiguous-authorization'));
  assert.ok(implementationGate(fullGateInput(repairTask, { backup: { taken: false } })).blockers.some(b => b.code === 'missing-backup'));
  assert.ok(implementationGate(fullGateInput(repairTask, { staging: { path: '' } })).blockers.some(b => b.code === 'unsafe-production-change'));
  assert.ok(implementationGate(fullGateInput(repairTask, { siteCount: 10, maxSites: 3 })).blockers.some(b => b.code === 'excessive-sites'));
  assert.ok(implementationGate(fullGateInput(repairTask, { revisionCount: 5, maxRevisions: 2 })).blockers.some(b => b.code === 'unbounded-revisions'));
  assert.ok(implementationGate(fullGateInput(null)).blockers.some(b => b.code === 'missing-direct-cost-estimate'));
});

test('implementationGate blocks a below-floor (including negative) margin repair task', () => {
  const lowMarginTask = buildRepairTask({ id: 'd1', effortHours: 2 }, { hourlyRateCents: 10000, contractorCostCentsPerHour: 9000 }); // 10% margin
  const result = implementationGate(fullGateInput(lowMarginTask, { marginFloorRate: DEFAULT_MARGIN_FLOOR_RATE }));
  assert.ok(result.blockers.some(b => b.code === 'negative-or-below-floor-margin'));
});

test('a production change without a staging/safe-edit path is blocked; a non-production change is not', () => {
  const repairTask = buildRepairTask({ id: 'd1', effortHours: 1 }, { hourlyRateCents: 15000, contractorCostCentsPerHour: 3000 });
  assert.ok(implementationGate(fullGateInput(repairTask, { staging: { path: '' }, isProductionChange: true })).blockers.some(b => b.code === 'unsafe-production-change'));
  assert.equal(implementationGate(fullGateInput(repairTask, { staging: { path: '' }, isProductionChange: false })).blocked, false);
});

test('authorizeRepairTask refuses to authorize a blocked gate and records margin when it succeeds', async () => {
  const store = await harness();
  const repairTask = await store.add('repairTasks', buildRepairTask({ id: 'd1', effortHours: 2 }, { hourlyRateCents: 15000, contractorCostCentsPerHour: 3000 }));
  await assert.rejects(() => authorizeRepairTask(store, repairTask.id, fullGateInput(repairTask, { backup: { taken: false } })), ImplementationError);
  const authorized = await authorizeRepairTask(store, repairTask.id, fullGateInput(repairTask));
  assert.equal(authorized.status, 'authorized');
  assert.ok(authorized.marginRate > 0);
});

// --- monitoring ---

test('buildMonitoringProposal rejects a price outside the configured $199-$499 range', () => {
  assert.throws(() => buildMonitoringProposal({ diagnosticProjectId: 'p1', priceCents: 10000 }), MonitoringError);
  assert.throws(() => buildMonitoringProposal({ diagnosticProjectId: 'p1', priceCents: 100000 }), MonitoringError);
  const ok = buildMonitoringProposal({ diagnosticProjectId: 'p1', priceCents: 29900 });
  assert.equal(ok.priceCents, 29900);
});

test('validateMonitoringConsent flags every missing one of the 8 required fields', () => {
  const result = validateMonitoringConsent({ sites: ['a.example.com'] });
  assert.equal(result.valid, false);
  assert.ok(result.missing.includes('schedule'));
  assert.ok(result.missing.includes('falsePositiveThreshold'));
});

test('a monitoring offer is inactive by default, and activateMonitoring refuses without complete consent', async () => {
  const store = await harness();
  const offer = await store.add('monitoringOffers', { kind: 'monitoring', status: 'offered', priceCents: 29900, active: false, data: {} });
  assert.equal(offer.active, false);
  await assert.rejects(() => activateMonitoring(store, offer.id, { sites: ['a.example.com'] }), MonitoringError);
  assert.equal((await store.get('monitoringOffers', offer.id)).active, false);
});

test('activateMonitoring activates only with complete consent, and never on its own initiative', async () => {
  const store = await harness();
  const offer = await store.add('monitoringOffers', { kind: 'monitoring', status: 'offered', priceCents: 29900, active: false, data: {} });
  const consent = { sites: ['a.example.com'], schedule: 'daily', usageLimits: { maxChecksPerDay: 10 }, cancellationTerms: 'anytime', falsePositiveThreshold: 0.05, ownerTimeThreshold: 60, marginFloorRate: 0.3 };
  const activated = await activateMonitoring(store, offer.id, consent);
  assert.equal(activated.active, true);
  assert.equal(activated.status, 'active');
});

test('recordMonitoringIncident refuses on an inactive offer', async () => {
  const store = await harness();
  const offer = await store.add('monitoringOffers', { kind: 'monitoring', status: 'offered', priceCents: 29900, active: false, data: {} });
  await assert.rejects(() => recordMonitoringIncident(store, offer.id, { severity: 'low', description: 'x' }), MonitoringError);
});

test('falsePositiveRate computes a real ratio, 0 for no incidents', () => {
  assert.equal(falsePositiveRate([]), 0);
  assert.equal(falsePositiveRate([{ falsePositive: true }, { falsePositive: false }, { falsePositive: false }]), 1 / 3);
});

test('buildMonthlyReport flags an owner-time threshold breach against the offer\'s own consent term', () => {
  const offer = { id: 'm1', data: { incidents: [], consent: { ownerTimeThreshold: 30 } } };
  const report = buildMonthlyReport(offer, { period: '2026-07', ownerMinutesSpent: 45 });
  assert.equal(report.ownerTimeThresholdExceeded, true);
});

test('buildMonitoringInvoiceHandoff is always draft -- no live billing', () => {
  const invoice = buildMonitoringInvoiceHandoff({ id: 'm1', priceCents: 29900 }, '2026-07');
  assert.equal(invoice.status, 'draft');
});

test('cancelMonitoring deactivates and records a reason without wiping prior data', async () => {
  const store = await harness();
  const offer = await store.add('monitoringOffers', { kind: 'monitoring', status: 'active', priceCents: 29900, active: true, data: { consent: { sites: ['a.example.com'] } } });
  const canceled = await cancelMonitoring(store, offer.id, { reason: 'client requested cancellation' });
  assert.equal(canceled.active, false);
  assert.equal(canceled.status, 'canceled');
  assert.equal(canceled.data.cancellation.reason, 'client requested cancellation');
  assert.deepEqual(canceled.data.consent.sites, ['a.example.com'], 'prior consent data must survive cancellation, not be wiped');
});

test('exportMonitoringData produces valid, parseable JSON', () => {
  const offer = { id: 'm1', priceCents: 29900, active: true, status: 'active', data: { incidents: [{ id: 'i1' }], consent: { sites: [] } } };
  const exported = exportMonitoringData(offer);
  const parsed = JSON.parse(exported);
  assert.equal(parsed.incidents.length, 1);
});

test('purgeExpiredEvidence soft-deletes evidence past retention but preserves the audit row', async () => {
  const store = await harness();
  const old = await store.add('evidenceItems', { capturedAt: new Date(Date.now() - 200 * 86400000).toISOString(), sourceUrl: 'https://x.example.com', rawHash: 'realhash' });
  const fresh = await store.add('evidenceItems', { capturedAt: new Date().toISOString(), sourceUrl: 'https://y.example.com', rawHash: 'realhash2' });
  const result = await purgeExpiredEvidence(store, 90);
  assert.equal(result.purged, 1);
  const purgedItem = await store.get('evidenceItems', old.id);
  assert.ok(purgedItem.deletedAt);
  assert.equal(purgedItem.sourceUrl, null);
  assert.equal(purgedItem.rawHash, 'purged');
  const freshItem = await store.get('evidenceItems', fresh.id);
  assert.equal(freshItem.deletedAt, undefined);
});
