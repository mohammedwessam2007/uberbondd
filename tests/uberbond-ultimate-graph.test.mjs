import test from 'node:test';
import assert from 'node:assert/strict';
import { compileUberBondUltimateGraph, queryUberBondUltimateGraph } from '../src/uberbond-ultimate-graph.mjs';

const DIGEST = 'a'.repeat(64);
const ATLAS = 'b'.repeat(64);
const MAP = 'c'.repeat(64);
const DEEP = 'd'.repeat(64);
const featureGenome = {
  ok: true,
  genomeDigest: DIGEST,
  artifactNodes: [{ id: 'artifact:src/a.mjs', path: 'src/a.mjs', kind: 'SOURCE_MODULE', primaryFamily: 'general-runtime', families: ['general-runtime'], organs: ['world-brain'] }]
};
const featureAtomAtlas = {
  ok: true,
  atlasDigest: ATLAS,
  featureGenomeDigest: DIGEST,
  allAtoms: [{ id: 'export:src/a.mjs#run', class: 'EXPORTED_CODE_FEATURE', name: 'run', sourcePath: 'src/a.mjs' }]
};
const synapticMap = {
  ok: true,
  mapDigest: MAP,
  featureGenomeDigest: DIGEST,
  featureAtomAtlasDigest: ATLAS,
  nodes: [
    { id: 'artifact:src/a.mjs', class: 'REPOSITORY_ARTIFACT', path: 'src/a.mjs' },
    { id: 'feature:export:src/a.mjs#run', class: 'EXPORTED_CODE_FEATURE' },
    { id: 'organ:world-brain', class: 'COGNITIVE_ORGAN' }
  ],
  edges: [
    { id: 'e1', from: 'feature:export:src/a.mjs#run', to: 'artifact:src/a.mjs', type: 'DECLARED_IN' },
    { id: 'e2', from: 'artifact:src/a.mjs', to: 'organ:world-brain', type: 'MEMBER_OF_ORGAN' }
  ]
};
const repositoryDeepAtlas = {
  ok: true,
  atlasDigest: DEEP,
  featureGenomeDigest: DIGEST,
  details: [{ id: 'deep1', class: 'CODE_SYMBOL', name: 'function:run', sourcePath: 'src/a.mjs', line: 1, organs: ['world-brain'], families: ['general-runtime'], truthClass: 'REPOSITORY_DECLARATION' }]
};

test('ultimate graph preserves synaptic topology and connects every deep feature', () => {
  const graph = compileUberBondUltimateGraph({ featureGenome, featureAtomAtlas, synapticMap, repositoryDeepAtlas });
  assert.equal(graph.ok, true, JSON.stringify(graph));
  assert.equal(graph.status, 'ULTIMATE_GRAPH_COMPLETE');
  assert.deepEqual(graph.orphanNodes, []);
  assert.deepEqual(graph.missingArtifacts, []);
  assert.deepEqual(graph.missingFeatureAtoms, []);
  assert.deepEqual(graph.missingDeepFeatures, []);
  assert.ok(graph.nodes.some(node => node.id === 'detail:deep1'));
  assert.ok(graph.edges.some(edge => edge.type === 'DETAIL_DECLARED_IN' && edge.from === 'detail:deep1' && edge.to === 'artifact:src/a.mjs'));
  assert.ok(graph.edges.some(edge => edge.type === 'DETAIL_MEMBER_OF_ORGAN' && edge.from === 'detail:deep1' && edge.to === 'organ:world-brain'));
  assert.equal(graph.memoryContract.canonicalPointer, 'artifacts/cognitive/uberbond-ultimate-graph-latest.json');
});

test('ultimate graph query can retrieve deep feature nodes by text', () => {
  const graph = compileUberBondUltimateGraph({ featureGenome, featureAtomAtlas, synapticMap, repositoryDeepAtlas });
  const result = queryUberBondUltimateGraph(graph, { text: 'function:run' });
  assert.equal(result.ok, true);
  assert.ok(result.nodes.some(node => node.id === 'detail:deep1'));
});

test('ultimate graph rejects stale deep atlas', () => {
  const graph = compileUberBondUltimateGraph({
    featureGenome,
    featureAtomAtlas,
    synapticMap,
    repositoryDeepAtlas: { ...repositoryDeepAtlas, featureGenomeDigest: 'e'.repeat(64) }
  });
  assert.equal(graph.ok, false);
  assert.ok(graph.reasonCodes.includes('deep-atlas-genome-digest-mismatch'));
});
