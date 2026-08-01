import test from 'node:test';
import assert from 'node:assert/strict';
import { huntOpportunitySignals, createOpportunityAdapters, buildCommercialIntelligenceRecord, assessActivation } from '../src/opportunity-hunter.mjs';
import { validateCommercialIntelligenceRecord } from '../src/commercial-intelligence-import.mjs';

test('disabled (unconfigured) adapters fail closed with zero signals, not fabricated data', async () => {
  const adapters = createOpportunityAdapters({});
  const { signals, blocked } = await huntOpportunitySignals({ adapters, now: new Date() });
  assert.equal(signals.length, 0);
  assert.equal(blocked.length, 6);
  assert.ok(blocked.every(row => row.reason === 'adapter-not-configured'));
});

test('a configured adapter contributes signals tagged with its kind; others still fail closed', async () => {
  const adapters = createOpportunityAdapters({
    officialReleases: async () => [{ organizationDomain: 'acme.com' }]
  });
  const { signals, blocked } = await huntOpportunitySignals({ adapters, now: new Date() });
  assert.equal(signals.length, 1);
  assert.equal(signals[0].adapterKind, 'officialReleases');
  assert.equal(blocked.length, 5);
});

test('a throwing adapter is reported as blocked, never thrown to the caller', async () => {
  const adapters = createOpportunityAdapters({ publicHiring: async () => { throw new Error('network down'); } });
  const { blocked } = await huntOpportunitySignals({ adapters, now: new Date() });
  assert.ok(blocked.some(row => row.kind === 'publicHiring' && row.reason === 'adapter-error'));
});

test('buildCommercialIntelligenceRecord output validates against the real import schema', () => {
  const record = buildCommercialIntelligenceRecord({
    organizationDomain: 'acme.com', serviceLane: 'ai-workflow', sourceUrl: 'https://acme.com/careers',
    signalKey: 'hiring-ai-lead', organization: 'Acme', capturedAt: '2026-07-30T00:00:00.000Z',
    official: true, confidence: 0.8, buyerSignal: 'hiring an AI workflow lead',
    expectedValueCents: 50000, ownerMinutes: 10, deliveryHours: 4, killCondition: 'role filled'
  });
  const validated = validateCommercialIntelligenceRecord(record);
  assert.equal(validated.organizationDomain, 'acme.com');
  assert.equal(validated.serviceLane, 'ai-workflow');
});

test('assessActivation requires 3 independent evidence families and 1 live buyer signal', () => {
  const oneFamily = assessActivation({
    evidence: [{ sourceFamily: 'acme.com' }, { sourceFamily: 'acme.com' }, { sourceFamily: 'acme.com' }],
    buyerSignals: [{ liveValidated: true }]
  });
  assert.equal(oneFamily.eligible, false);
  assert.ok(oneFamily.blockers.includes('insufficient-independent-evidence'));

  const threeFamiliesNoLiveSignal = assessActivation({
    evidence: [{ sourceFamily: 'a.com' }, { sourceFamily: 'b.com' }, { sourceFamily: 'c.com' }],
    buyerSignals: []
  });
  assert.equal(threeFamiliesNoLiveSignal.eligible, false);
  assert.ok(threeFamiliesNoLiveSignal.blockers.includes('missing-live-buyer-signal'));

  const eligible = assessActivation({
    evidence: [{ sourceFamily: 'a.com' }, { sourceFamily: 'b.com' }, { sourceFamily: 'c.com' }],
    buyerSignals: [{ liveValidated: true }]
  });
  assert.equal(eligible.eligible, true);
});
