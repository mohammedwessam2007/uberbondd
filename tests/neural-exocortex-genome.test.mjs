import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FINAL_NEURAL_CAPABILITY_TARGET,
  normalizeNeuralCapabilityObservation,
  buildNeuralExocortexCorpus,
  retrieveNeuralReferenceBundle,
  selectActiveNeuralCortex,
  neuralExocortexProgress
} from '../src/neural-exocortex-genome.mjs';
import { compileNeuralExocortexCognitiveGraph } from '../src/neural-exocortex-cognitive-binding.mjs';
import { compileNeuralAtlasPlan } from '../src/neural-repository-atlas.mjs';

const observed = (overrides = {}) => ({
  repositoryFullName: 'example/neural-tool',
  sourceUrl: 'https://github.com/example/neural-tool',
  family: 'reasoning',
  seed: 'reasoning agent',
  description: 'Reasoning agent with verification and planning',
  topics: ['reasoning', 'agent', 'verification'],
  stars: 100,
  forks: 10,
  visibility: 'PUBLIC',
  observedAt: '2026-09-14T00:00:00.000Z',
  ...overrides
});

test('neural atlas targets one million final retained capabilities rather than a 50k terminal shortlist', () => {
  const plan = compileNeuralAtlasPlan();
  assert.equal(plan.finalCapabilityTarget, 1_000_000);
  assert.equal(FINAL_NEURAL_CAPABILITY_TARGET, 1_000_000);
  assert.ok(plan.familyCount >= 50);
  assert.ok(plan.queryCount >= 2_000);
  assert.match(plan.law, /1000000/);
  assert.match(plan.law, /NEVER_COMPRESS_THE_FINAL_LIBRARY_TO_50000/);
});

test('same repository and neural family dedupe into one capability record', () => {
  const corpus = buildNeuralExocortexCorpus({ observations: [
    observed({ discoveryQuery: 'reasoning agent stars:10..49' }),
    observed({ discoveryQuery: 'formal reasoning ai stars:50..199', stars: 200 })
  ], target: 10 });
  assert.equal(corpus.manifest.distinctCapabilityRecords, 1);
  assert.equal(corpus.capabilities.length, 1);
  assert.equal(corpus.capabilities[0].discoveryEvidenceCount, 2);
});

test('same repository may contribute distinct neural capabilities across families', () => {
  const corpus = buildNeuralExocortexCorpus({ observations: [
    observed({ family: 'reasoning' }),
    observed({ family: 'memory', seed: 'agent memory' })
  ], target: 10 });
  assert.equal(corpus.manifest.distinctCapabilityRecords, 2);
  assert.deepEqual(new Set(corpus.capabilities.map(item => item.family)), new Set(['reasoning', 'memory']));
});

test('private repositories are rejected and never enter the exocortex corpus', () => {
  const normalized = normalizeNeuralCapabilityObservation(observed({ private: true, visibility: 'private' }));
  assert.equal(normalized.ok, false);
  assert.ok(normalized.reasonCodes.includes('private-repository-not-eligible'));
});

test('one million completion cannot be claimed from a partial corpus', () => {
  const corpus = buildNeuralExocortexCorpus({ observations: [observed()] });
  const progress = neuralExocortexProgress(corpus);
  assert.equal(corpus.manifest.targetSatisfied, false);
  assert.equal(progress.complete, false);
  assert.equal(progress.target, 1_000_000);
  assert.equal(progress.retained, 1);
  assert.equal(progress.remaining, 999_999);
});

test('discovered reference records can be retrieved for research but cannot enter active cortex', () => {
  const corpus = buildNeuralExocortexCorpus({ observations: [observed()] });
  const reference = retrieveNeuralReferenceBundle({ mission: 'reason carefully and verify answer', capabilities: corpus.capabilities });
  assert.equal(reference.ok, true);
  assert.equal(reference.selected.length, 1);
  assert.equal(reference.executionAuthority, 'NONE');
  const active = selectActiveNeuralCortex({ mission: 'reason carefully', capabilities: corpus.capabilities });
  assert.equal(active.ok, true);
  assert.equal(active.selected.length, 0);
  assert.equal(active.status, 'NEURAL_REFERENCE_RECORDS_NOT_EXECUTABLE_USE_CAPABILITY_GENOME_BACKED_SELECTION');
  assert.equal(active.executionAuthority, 'NONE');
});

test('manually flipping discovery flags still cannot bypass Capability Genome-backed admission', () => {
  const normalized = normalizeNeuralCapabilityObservation(observed()).capability;
  const forged = {
    ...normalized,
    promotionState: 'APPROVED',
    securityState: 'APPROVED',
    benchmarkState: 'ELIGIBLE',
    executionAuthority: 'BOUNDED_MISSION_ONLY'
  };
  const active = selectActiveNeuralCortex({ mission: 'reasoning verification', capabilities: [forged] });
  assert.equal(active.status, 'NEURAL_REFERENCE_RECORDS_NOT_EXECUTABLE_USE_CAPABILITY_GENOME_BACKED_SELECTION');
  assert.equal(active.selected.length, 0);
  assert.equal(active.executionAuthority, 'NONE');
  assert.match(active.authorityLaw, /selectCapabilityGenomeBackedNeuralCortex/);
});

test('Neural Exocortex is connected to the whole brain and preserves graph integrity', () => {
  const graph = compileNeuralExocortexCognitiveGraph();
  assert.equal(graph.ok, true, JSON.stringify(graph.integrity));
  assert.equal(graph.nodes.some(node => node.id === 'neural-exocortex'), true);
  assert.equal(graph.integrity.orphanNodes.length, 0);
  assert.equal(graph.integrity.unreachableFromWorld.length, 0);
  assert.equal(graph.integrity.cannotReturnToLearning.length, 0);
  assert.equal(graph.businessEffectAuthority, 'NONE');
});
