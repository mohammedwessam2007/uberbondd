import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compileUberBondCognitiveGraph,
  cognitiveGraphIntegrity,
  reachableNodes
} from '../src/uberbond-cognitive-graph.mjs';

const REQUIRED_ORGANS = [
  'world-sensing', 'gamechanger', 'genesis', 'genesis-evolution', 'genesis-scientist',
  'genesis-ontology', 'genesis-metabolism', 'business-genome', 'idea-generator',
  'opportunity-factory', 'event-horizon', 'capability-genome', 'saas-cannibal',
  'open-model-universe', 'world-brain', 'avengers', 'max-council', 'wallbreaker',
  'self-maintainer', 'omnia', 'kilimanjaro', 'distribution-os', 'payment-reconciliation',
  'fulfilment-qa', 'retention-learning', 'economic-memory'
];

test('canonical cognitive graph has no orphan UberBond organs and closes the learning loop', () => {
  const graph = compileUberBondCognitiveGraph();
  assert.equal(graph.ok, true);
  const integrity = cognitiveGraphIntegrity(graph);
  assert.equal(integrity.ok, true, JSON.stringify(integrity));
  assert.deepEqual(integrity.orphanNodes, []);
  assert.deepEqual(integrity.unreachableFromWorld, []);
  assert.deepEqual(integrity.cannotReturnToLearning, []);
  assert.equal(graph.businessEffectAuthority, 'NONE');
});

test('all named UberBond brain organs survive in the executable map', () => {
  const graph = compileUberBondCognitiveGraph();
  const ids = new Set(graph.nodes.map(node => node.id));
  for (const id of REQUIRED_ORGANS) assert.equal(ids.has(id), true, `missing cognitive organ: ${id}`);
});

test('world signals can traverse discovery, invention, allocation, execution and learning', () => {
  const graph = compileUberBondCognitiveGraph();
  const reachable = new Set(reachableNodes({ graph, startNodeId: 'world-sensing' }));
  for (const id of ['gamechanger', 'genesis', 'idea-generator', 'opportunity-factory', 'event-horizon', 'capability-genome', 'max-council', 'self-maintainer', 'economic-memory']) {
    assert.equal(reachable.has(id), true, `world signal cannot reach ${id}`);
  }
});

test('commercial learning can reshape opportunity, capability, model and world-brain state', () => {
  const graph = compileUberBondCognitiveGraph();
  const reachable = new Set(reachableNodes({ graph, startNodeId: 'economic-memory' }));
  for (const id of ['gamechanger', 'genesis', 'business-genome', 'opportunity-factory', 'event-horizon', 'capability-genome', 'open-model-universe', 'world-brain', 'omnia']) {
    assert.equal(reachable.has(id), true, `economic learning cannot feed back to ${id}`);
  }
});

test('OMNIA and Kilimanjaro remain constraints and proof consumers, not consequence authority grants', () => {
  const graph = compileUberBondCognitiveGraph();
  const omniaEdges = graph.edges.filter(edge => edge.from === 'omnia');
  assert.ok(omniaEdges.some(edge => edge.type === 'GOVERNS'));
  assert.ok(omniaEdges.some(edge => edge.type === 'CONSTRAINS'));
  assert.ok(graph.edges.some(edge => edge.to === 'kilimanjaro' && edge.type === 'PROVES_FOR'));
  assert.equal(graph.externalEffectLedger.messages, 0);
  assert.equal(graph.externalEffectLedger.deployments, 0);
  assert.equal(graph.externalEffectLedger.spendCents, 0);
});
