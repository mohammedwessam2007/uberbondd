import test from 'node:test';
import assert from 'node:assert/strict';
import { augmentCognitiveCycleWithUltimateGraph, validateUltimateGraphCycleBinding } from '../src/uberbond-ultimate-graph-cycle-binding.mjs';

const featureGenome = { ok: true, genomeDigest: 'a'.repeat(64) };
const synapticMap = { ok: true, mapDigest: 'b'.repeat(64) };
const ultimateGraph = {
  ok: true,
  policyVersion: 'fixture',
  status: 'ULTIMATE_GRAPH_COMPLETE',
  graphDigest: 'c'.repeat(64),
  featureGenomeDigest: featureGenome.genomeDigest,
  featureAtomAtlasDigest: 'd'.repeat(64),
  synapticMapDigest: synapticMap.mapDigest,
  repositoryDeepAtlasDigest: 'e'.repeat(64),
  repositoryArtifactCount: 10,
  featureAtomCount: 20,
  deepFeatureCount: 30,
  nodeCount: 64,
  edgeCount: 128,
  classCounts: { REPOSITORY_ARTIFACT: 10 },
  edgeTypeCounts: { DETAIL_DECLARED_IN: 30 },
  orphanNodes: [],
  missingArtifacts: [],
  missingFeatureAtoms: [],
  missingDeepFeatures: [],
  memoryContract: { canonicalPointer: 'artifacts/cognitive/uberbond-ultimate-graph-latest.json' }
};

test('ultimate graph can be bound into cognitive memory only on matching digests', () => {
  const binding = validateUltimateGraphCycleBinding({ featureGenome, synapticMap, ultimateGraph });
  assert.equal(binding.ok, true, JSON.stringify(binding));
  const augmented = augmentCognitiveCycleWithUltimateGraph({ receipt: { ok: true, sources: {}, truthBoundary: 'BASE.' }, featureGenome, synapticMap, ultimateGraph });
  assert.equal(augmented.ok, true);
  assert.equal(augmented.sources.ultimateGraph, true);
  assert.equal(augmented.memory.ultimateGraph.digest, ultimateGraph.graphDigest);
  assert.equal(augmented.memory.ultimateGraph.pointer, 'artifacts/cognitive/uberbond-ultimate-graph-latest.json');
  assert.equal(augmented.ultimateGraph.deepFeatureCount, 30);
  assert.match(augmented.truthBoundary, /ULTIMATE GRAPH MEMORY/);
});

test('stale ultimate graph is refused instead of entering memory', () => {
  const binding = validateUltimateGraphCycleBinding({ featureGenome, synapticMap, ultimateGraph: { ...ultimateGraph, synapticMapDigest: 'f'.repeat(64) } });
  assert.equal(binding.ok, false);
  assert.ok(binding.reasonCodes.includes('ultimate-graph-must-match-synaptic-map'));
});
