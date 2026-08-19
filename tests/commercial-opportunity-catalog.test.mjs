import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  COMMERCIAL_OPPORTUNITY_CATALOG_POLICY_VERSION,
  listCommercialOpportunityCatalog,
  getCommercialOpportunity,
  buildOpportunityCandidate,
  compileCommercialOpportunity,
  compileAllCommercialOpportunities,
  logCommercialOpportunityCatalog
} from '../src/commercial-opportunity-catalog.mjs';

const date = new Date('2026-08-19T08:00:00.000Z');

test('catalog contains the three ranked, evidence-labeled opportunities', () => {
  const entries = listCommercialOpportunityCatalog();
  assert.deepEqual(entries.slice(0, 3).map(entry => entry.id), [
    'paid-media-revenue-assurance',
    'ai-automation-reliability',
    'conversational-funnel-reliability'
  ]);
  assert.ok(entries.length >= 200);
  for (const entry of entries) {
    assert.ok(['BUYER_SIGNAL', 'HYPOTHESIS'].includes(entry.evidence.classification));
    assert.ok(entry.evidence.sources.length > 0);
    assert.ok(entry.sevenDayExperiment.length >= 7);
    assert.ok(entry.taskBlueprint.policy.externalEffects.length === 0);
  }
});

test('catalog exposes hypotheses separately from evidence and never calls a provider', async () => {
  const entry = getCommercialOpportunity('paid-media-revenue-assurance');
  assert.ok(entry);
  assert.equal(entry.priceHypotheses[0].classification, 'HYPOTHESIS');
  assert.equal(entry.observedBuyerSignals[0].source.claimType, 'BUYER_SIGNAL');
  const source = await fs.readFile(new URL('../src/commercial-opportunity-catalog.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\(|http\.request|https\.request|child_process|exec\(/);
});

test('candidate compilation preserves lineage and does not mutate the catalog', () => {
  const before = JSON.stringify(getCommercialOpportunity('ai-automation-reliability'));
  const candidate = buildOpportunityCandidate('ai-automation-reliability', { signalId: 'signal-1' });
  assert.equal(candidate.id, 'ai-automation-reliability');
  assert.equal(candidate.signalId, 'signal-1');
  assert.equal(JSON.stringify(getCommercialOpportunity('ai-automation-reliability')), before);
});

test('thread-explicit opportunities remain research-only and fail closed on proof', () => {
  const entry = getCommercialOpportunity('agent-acceptance-api');
  assert.ok(entry);
  assert.equal(entry.origin, 'THREAD_EXPLICIT');
  assert.equal(entry.verdict, 'RESEARCH_ONLY');
  assert.equal(entry.evidence.classification, 'HYPOTHESIS');
  assert.equal(entry.evidence.sources[0].sourceType, 'USER_THREAD');
  const result = compileCommercialOpportunity({ opportunityId: entry.id, date });
  assert.equal(result.ok, true);
  assert.equal(result.experiment.paymentTruth, 'EXTERNAL_PROOF_REQUIRED');
  assert.equal(result.experiment.promotion.advanced, false);
});

test('each opportunity compiles into a local-only task blueprint and seven-day probe', () => {
  for (const entry of listCommercialOpportunityCatalog()) {
    const result = compileCommercialOpportunity({ opportunityId: entry.id, date });
    assert.equal(result.ok, true);
    assert.equal(result.policyVersion, COMMERCIAL_OPPORTUNITY_CATALOG_POLICY_VERSION);
    assert.equal(result.status, 'READY_FOR_LOCAL_PREPARATION');
    assert.equal(result.taskBlueprint.status, 'COMPILED');
    assert.equal(result.experiment.mode, 'LOCAL_PREPARATION_ONLY');
    assert.equal(result.experiment.paymentTruth, 'EXTERNAL_PROOF_REQUIRED');
    assert.equal(result.experiment.authorization.messages, 'DISABLED');
    assert.equal(result.externalEffectLedger.providerCalls, 0);
    assert.equal(result.externalEffectLedger.spendCents, 0);
  }
});

test('all-catalog compilation is deterministic for a fixed reference date', () => {
  const a = compileAllCommercialOpportunities({ date });
  const b = compileAllCommercialOpportunities({ date });
  assert.deepEqual(a, b);
  assert.equal(a.catalogCount, listCommercialOpportunityCatalog().length);
  assert.equal(a.externalEffectLedger.productionMutations, 0);
});

test('unknown opportunity fails closed and logging uses one bounded audit receipt', async () => {
  const unknown = compileCommercialOpportunity({ opportunityId: 'missing', date });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.externalEffectLedger.messages, 0);

  const calls = [];
  const store = { log: async (type, detail) => { calls.push({ type, detail }); return { id: 'audit-1' }; } };
  const result = compileAllCommercialOpportunities({ date });
  const receipt = await logCommercialOpportunityCatalog(store, result);
  assert.deepEqual(receipt, { id: 'audit-1' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, 'commercial_opportunity_catalog');
  assert.equal(calls[0].detail.catalogCount, listCommercialOpportunityCatalog().length);
  assert.equal(Object.prototype.hasOwnProperty.call(calls[0].detail, 'payload'), false);
});
