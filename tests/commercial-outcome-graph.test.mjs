import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { buildCommercialOutcomeGraph, persistCommercialOutcomeGraph } from '../src/commercial-outcome-graph.mjs';
import { normalizeMarketSignal } from '../src/market-signal.mjs';
import { extractGenomeCandidate } from '../src/genome-extraction.mjs';
import { scoreOpportunity } from '../src/opportunity-registry.mjs';
import { compileExperiment } from '../src/experiment-compiler.mjs';

const monday = new Date('2026-07-13T10:00:00.000Z');

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-outcome-graph-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

function fullChain() {
  const signal = normalizeMarketSignal({
    sourceAdapter: 'test', sourceKind: 'WEB_PAGE', entityType: 'PRODUCT', entityIdentity: 'https://x.example',
    signalType: 'PRICE_CHANGE', observedAt: '2026-07-13T09:00:00.000Z', payload: { price: 49 }, evidenceClass: 'SYNTHETIC_TEST_FIXTURE'
  }, { date: monday });
  const genomeCandidate = extractGenomeCandidate({ signals: [signal], id: 'cand-1', priceHint: 49 });
  const scoredOpportunity = scoreOpportunity({ candidate: genomeCandidate.candidate, date: monday });
  const experiment = compileExperiment({ scoredOpportunity, date: monday, maxBudgetUsd: 0 });
  return { signal, genomeCandidate, scoredOpportunity, experiment };
}

test('an empty input produces an empty, valid graph rather than an error', () => {
  const graph = buildCommercialOutcomeGraph({});
  assert.equal(graph.ok, true);
  assert.deepEqual(graph.nodes, []);
  assert.deepEqual(graph.edges, []);
});

test('each stage present adds exactly one node and links to the prior stage', () => {
  const { signal, genomeCandidate, scoredOpportunity, experiment } = fullChain();
  const graph = buildCommercialOutcomeGraph({ signals: [signal], genomeCandidate, scoredOpportunity, experiment });
  assert.equal(graph.nodes.filter(n => n.type === 'MarketSignal').length, 1);
  assert.equal(graph.nodes.filter(n => n.type === 'BusinessGenome').length, 1);
  assert.equal(graph.nodes.filter(n => n.type === 'Opportunity').length, 1);
  assert.equal(graph.nodes.filter(n => n.type === 'CommercialExperiment').length, 1);
  assert.equal(graph.edges.find(e => e.relation === 'INFORMS').to, genomeCandidate.candidate.id);
  assert.equal(graph.edges.find(e => e.relation === 'SCORED_AS').to, scoredOpportunity.id);
  assert.equal(graph.edges.find(e => e.relation === 'COMPILED_INTO').to, experiment.experimentId);
});

test('a synthetic outcome is tagged SimulatedOutcome, never RealOutcome', () => {
  const { signal, genomeCandidate, scoredOpportunity, experiment } = fullChain();
  const graph = buildCommercialOutcomeGraph({
    signals: [signal], genomeCandidate, scoredOpportunity, experiment,
    outcome: { id: 'out-1', type: 'CLEARED_PAYMENT' }, isSynthetic: true
  });
  const outcomeNode = graph.nodes.find(n => n.type === 'SimulatedOutcome' || n.type === 'RealOutcome');
  assert.equal(outcomeNode.type, 'SimulatedOutcome');
  assert.equal(outcomeNode.synthetic, true);
});

test('a real (non-synthetic) outcome is tagged RealOutcome', () => {
  const { signal, genomeCandidate, scoredOpportunity, experiment } = fullChain();
  const graph = buildCommercialOutcomeGraph({
    signals: [signal], genomeCandidate, scoredOpportunity, experiment,
    outcome: { id: 'out-1', type: 'CLEARED_PAYMENT' }, isSynthetic: false
  });
  assert.equal(graph.nodes.find(n => n.type === 'RealOutcome')?.synthetic, false);
});

test('a malformed/failed stage is simply omitted from the graph, not fabricated as a node', () => {
  const graph = buildCommercialOutcomeGraph({ scoredOpportunity: { ok: false } });
  assert.equal(graph.nodes.some(n => n.type === 'Opportunity'), false);
});

test('persistCommercialOutcomeGraph writes one receipt per edge via the existing auditLog writer', async () => {
  const store = await tempStore();
  const { signal, genomeCandidate, scoredOpportunity, experiment } = fullChain();
  const graph = buildCommercialOutcomeGraph({ signals: [signal], genomeCandidate, scoredOpportunity, experiment });
  await persistCommercialOutcomeGraph(store, graph);
  const receipts = await store.list('auditLog', { filters: { type: 'commercial_outcome_edge' } });
  assert.equal(receipts.length, graph.edges.length);
});

test('persistCommercialOutcomeGraph never throws on a malformed store', async () => {
  const result = await persistCommercialOutcomeGraph(null, buildCommercialOutcomeGraph({}));
  assert.equal(result, null);
});
