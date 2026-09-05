import test from 'node:test';
import assert from 'node:assert/strict';
import { compileUberBondSynapticMap, querySynapticNeighbors } from '../src/uberbond-synaptic-map.mjs';

const DIGEST = 'a'.repeat(64);
const ATLAS_DIGEST = 'b'.repeat(64);

const artifacts = [
  ['package.json', ['world-brain', 'context-spine']],
  ['src/a.mjs', ['world-brain']],
  ['src/b.mjs', ['truth-evidence']],
  ['tests/a.test.mjs', ['world-brain']],
  ['config/system-readiness-input.json', ['truth-evidence']],
  ['config/reachability-classification.json', ['omnia']],
  ['docs/PERPETUAL_FRONTIER_GENESIS_CANON.md', ['genesis']],
  ['artifacts/perpetual-frontier-genesis-latest.json', ['genesis']],
  ['artifacts/uberbond-total-brain.json', ['context-spine']],
  ['config/uberbond-cognitive-lineage.json', ['context-spine']]
].map(([path, organs]) => ({
  id: `artifact:${path}`,
  path,
  kind: path.startsWith('src/') ? 'SOURCE_MODULE' : path.startsWith('tests/') ? 'TEST' : 'REPOSITORY_ARTIFACT',
  primaryFamily: 'general-runtime',
  families: ['general-runtime'],
  organs,
  classificationConfidence: 'FIXTURE'
}));

const FEATURE_GENOME = {
  ok: true,
  genomeDigest: DIGEST,
  artifactNodes: artifacts,
  dependencyEdges: [{ from: 'src/a.mjs', to: 'src/b.mjs', specifier: './b.mjs' }],
  reachabilityModules: [{ path: 'src/b.mjs', category: 'AWAITING_ACTIVATION', gate: 'TEST_GATE', reason: 'fixture' }]
};

const FEATURE_ATLAS = {
  ok: true,
  atlasDigest: ATLAS_DIGEST,
  featureGenomeDigest: DIGEST,
  allAtoms: [
    { id: 'export:src/a.mjs#runA', class: 'EXPORTED_CODE_FEATURE', name: 'runA', sourcePath: 'src/a.mjs', organs: ['world-brain'], truthClass: 'REPOSITORY_DECLARATION' },
    { id: 'operator:fixture', class: 'OPERATOR_COMMAND', name: 'fixture', command: 'node src/a.mjs', organs: ['world-brain'], truthClass: 'REPOSITORY_DECLARATION' },
    { id: 'readiness:truth-evidence', class: 'READINESS_CAPABILITY', name: 'truth-evidence', evidence: ['src/b.mjs'], tests: ['tests/a.test.mjs'], organs: ['truth-evidence'], truthClass: 'CANONICAL_READINESS_CLAIM' },
    { id: 'activation-gate:TEST_GATE', class: 'ACTIVATION_GATE', name: 'TEST_GATE', truthClass: 'CANONICAL_GOVERNANCE_GATE' },
    { id: 'genesis-idea:1', class: 'GENESIS_IDEA', name: 'Unknown-Unknown Engine', sourcePath: 'docs/PERPETUAL_FRONTIER_GENESIS_CANON.md', organs: ['genesis'], implementationSources: ['src/a.mjs'], implementationTests: ['tests/a.test.mjs'], runtimeReceipts: ['artifacts/perpetual-frontier-genesis-latest.json'], truthClass: 'CHAT_SPEC_GOAL_OR_INTERNAL_RESEARCH' },
    { id: 'total-brain:1', class: 'TOTAL_BRAIN_MEMORY_ATOM', name: 'World Brain', sourcePath: 'artifacts/uberbond-total-brain.json', truthClass: 'ANTI_AMPUTATION_MEMORY_NOT_PRESENT_TENSE_PROOF' },
    { id: 'donor:fixture:1', class: 'HISTORICAL_DONOR', name: 'Kilimanjaro donor', livingOrgans: ['kilimanjaro'], truthClass: 'HISTORICAL_DONOR' }
  ],
  classes: {
    activationGates: [{ id: 'activation-gate:TEST_GATE', class: 'ACTIVATION_GATE', name: 'TEST_GATE' }]
  }
};

test('synaptic map connects every repository artifact, feature atom and cognitive organ', () => {
  const map = compileUberBondSynapticMap({ featureGenome: FEATURE_GENOME, featureAtomAtlas: FEATURE_ATLAS });
  assert.equal(map.ok, true, JSON.stringify(map));
  assert.equal(map.status, 'SYNAPTIC_MAP_COMPLETE');
  assert.deepEqual(map.orphanArtifacts, []);
  assert.deepEqual(map.orphanFeatureAtoms, []);
  assert.deepEqual(map.orphanOrgans, []);
  assert.ok(map.edgeTypeCounts.IMPORTS >= 1);
  assert.ok(map.edgeTypeCounts.IMPLEMENTED_BY >= 1);
  assert.ok(map.edgeTypeCounts.TESTED_BY >= 1);
  assert.ok(map.edgeTypeCounts.GATED_BY >= 1);
  assert.ok(map.edgeTypeCounts.DONATES_TO >= 1);
  assert.ok(map.edgeTypeCounts.ORGAN_RELATION >= 1);
  assert.equal(map.businessEffectAuthority, 'NONE');
});

test('exported feature can traverse to its file, organ and neighboring imports', () => {
  const map = compileUberBondSynapticMap({ featureGenome: FEATURE_GENOME, featureAtomAtlas: FEATURE_ATLAS });
  const feature = querySynapticNeighbors(map, { nodeId: 'feature:export:src/a.mjs#runA' });
  assert.equal(feature.ok, true, JSON.stringify(feature));
  assert.ok(feature.neighbors.some(node => node.id === 'artifact:src/a.mjs'));
  assert.ok(feature.neighbors.some(node => node.id === 'organ:world-brain'));

  const source = querySynapticNeighbors(map, { nodeId: 'artifact:src/a.mjs', direction: 'OUT' });
  assert.equal(source.ok, true);
  assert.ok(source.neighbors.some(node => node.id === 'artifact:src/b.mjs'));
});

test('activation gate connects both directions to the module it governs', () => {
  const map = compileUberBondSynapticMap({ featureGenome: FEATURE_GENOME, featureAtomAtlas: FEATURE_ATLAS });
  const gate = querySynapticNeighbors(map, { nodeId: 'feature:activation-gate:TEST_GATE' });
  assert.equal(gate.ok, true, JSON.stringify(gate));
  assert.ok(gate.edges.some(edge => edge.type === 'GATE_APPLIES_TO' && edge.to === 'artifact:src/b.mjs'));
  assert.ok(gate.neighbors.some(node => node.id === 'artifact:src/b.mjs'));
});

test('atlas from a different repository genome is rejected instead of cross-wiring stale memory', () => {
  const map = compileUberBondSynapticMap({
    featureGenome: FEATURE_GENOME,
    featureAtomAtlas: { ...FEATURE_ATLAS, featureGenomeDigest: 'c'.repeat(64) }
  });
  assert.equal(map.ok, false);
  assert.ok(map.reasonCodes.includes('feature-atlas-genome-digest-mismatch'));
});
