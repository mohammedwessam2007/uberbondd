import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSynapticCycleBinding, augmentCognitiveCycleWithSynapticMap } from '../src/uberbond-synaptic-cycle-binding.mjs';

const genome = { ok: true, genomeDigest: 'genome-123' };
const map = {
  ok: true,
  status: 'SYNAPTIC_MAP_READY',
  mapDigest: 'map-456',
  featureGenomeDigest: 'genome-123',
  nodeCount: 777,
  edgeCount: 1444,
  edgeTypeCounts: { IMPORTS: 90, MEMBER_OF_ORGAN: 200 },
  orphanArtifacts: [],
  orphanFeatureAtoms: [],
  orphanOrgans: [],
  businessEffectAuthority: 'NONE'
};

test('synaptic cycle binding requires exact Feature Genome digest', () => {
  assert.equal(validateSynapticCycleBinding({ featureGenome: genome, synapticMap: map }).ok, true);
  const stale = validateSynapticCycleBinding({ featureGenome: genome, synapticMap: { ...map, featureGenomeDigest: 'old-genome' } });
  assert.equal(stale.ok, false);
  assert.ok(stale.reasonCodes.includes('synaptic-map-must-match-feature-genome'));
});

test('synaptic cycle binding refuses orphan topology', () => {
  const result = validateSynapticCycleBinding({ featureGenome: genome, synapticMap: { ...map, orphanFeatureAtoms: ['atom:lost'] } });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('synaptic-map-has-orphan-feature-atoms'));
});

test('augmentation preserves cognitive receipt and adds bounded topology truth only', () => {
  const receipt = {
    schemaVersion: 'uberbond.cognitive-cycle.v1',
    sources: { featureGenome: true },
    graph: { graphDigest: 'graph' },
    truthBoundary: 'BASE TRUTH.',
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE'
  };
  const result = augmentCognitiveCycleWithSynapticMap({ receipt, featureGenome: genome, synapticMap: map });
  assert.equal(result.sources.synapticMap, true);
  assert.equal(result.sources.featureGenome, true);
  assert.equal(result.synapticMap.mapDigest, 'map-456');
  assert.equal(result.synapticMap.nodeCount, 777);
  assert.equal(result.synapticMap.edgeCount, 1444);
  assert.equal(result.synapticMap.orphanArtifactCount, 0);
  assert.equal(result.synapticMap.businessEffectAuthority, 'NONE');
  assert.match(result.truthBoundary, /SYNAPTIC TOPOLOGY/);
  assert.equal(receipt.sources.synapticMap, undefined, 'input receipt remains immutable');
});

test('augmentation fails closed without a valid topology binding', () => {
  const result = augmentCognitiveCycleWithSynapticMap({ receipt: {}, featureGenome: genome, synapticMap: { ...map, orphanOrgans: ['ghost'] } });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'SYNAPTIC_CYCLE_AUGMENTATION_REFUSED');
});
