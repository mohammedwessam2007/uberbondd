export const UBERBOND_ULTIMATE_GRAPH_CYCLE_BINDING_POLICY_VERSION = 'uberbond-ultimate-graph-cycle-binding-1.0.0';

const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : null;
const count = value => Array.isArray(value) ? value.length : 0;

export function validateUltimateGraphCycleBinding({ featureGenome, synapticMap, ultimateGraph } = {}) {
  const reasons = [];
  if (!object(featureGenome) || featureGenome.ok !== true) reasons.push('valid-feature-genome-required');
  if (!object(synapticMap) || synapticMap.ok !== true) reasons.push('valid-synaptic-map-required');
  if (!object(ultimateGraph) || ultimateGraph.ok !== true) reasons.push('valid-ultimate-graph-required');
  if (featureGenome?.genomeDigest && ultimateGraph?.featureGenomeDigest !== featureGenome.genomeDigest) reasons.push('ultimate-graph-must-match-feature-genome');
  if (synapticMap?.mapDigest && ultimateGraph?.synapticMapDigest !== synapticMap.mapDigest) reasons.push('ultimate-graph-must-match-synaptic-map');
  if (count(ultimateGraph?.orphanNodes)) reasons.push('ultimate-graph-has-orphan-nodes');
  if (count(ultimateGraph?.missingArtifacts)) reasons.push('ultimate-graph-missing-artifacts');
  if (count(ultimateGraph?.missingFeatureAtoms)) reasons.push('ultimate-graph-missing-feature-atoms');
  if (count(ultimateGraph?.missingDeepFeatures)) reasons.push('ultimate-graph-missing-deep-features');
  return {
    ok: reasons.length === 0,
    policyVersion: UBERBOND_ULTIMATE_GRAPH_CYCLE_BINDING_POLICY_VERSION,
    status: reasons.length ? 'ULTIMATE_GRAPH_CYCLE_BINDING_REFUSED' : 'ULTIMATE_GRAPH_CYCLE_BINDING_READY',
    reasonCodes: reasons,
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE'
  };
}

export function augmentCognitiveCycleWithUltimateGraph({ receipt, featureGenome, synapticMap, ultimateGraph } = {}) {
  const binding = validateUltimateGraphCycleBinding({ featureGenome, synapticMap, ultimateGraph });
  if (!binding.ok || !object(receipt)) return {
    ok: false,
    status: 'ULTIMATE_GRAPH_CYCLE_AUGMENTATION_REFUSED',
    reasonCodes: [...binding.reasonCodes, ...(!object(receipt) ? ['cognitive-cycle-receipt-required'] : [])],
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE'
  };
  const out = structuredClone(receipt);
  out.sources = { ...(object(out.sources) || {}), ultimateGraph: true };
  out.ultimateGraph = {
    policyVersion: ultimateGraph.policyVersion || null,
    status: ultimateGraph.status || null,
    graphDigest: ultimateGraph.graphDigest || null,
    featureGenomeDigest: ultimateGraph.featureGenomeDigest || null,
    featureAtomAtlasDigest: ultimateGraph.featureAtomAtlasDigest || null,
    synapticMapDigest: ultimateGraph.synapticMapDigest || null,
    repositoryDeepAtlasDigest: ultimateGraph.repositoryDeepAtlasDigest || null,
    repositoryArtifactCount: Number(ultimateGraph.repositoryArtifactCount || 0),
    featureAtomCount: Number(ultimateGraph.featureAtomCount || 0),
    deepFeatureCount: Number(ultimateGraph.deepFeatureCount || 0),
    nodeCount: Number(ultimateGraph.nodeCount || 0),
    edgeCount: Number(ultimateGraph.edgeCount || 0),
    classCounts: object(ultimateGraph.classCounts) || {},
    edgeTypeCounts: object(ultimateGraph.edgeTypeCounts) || {},
    orphanNodeCount: count(ultimateGraph.orphanNodes),
    missingArtifactCount: count(ultimateGraph.missingArtifacts),
    missingFeatureAtomCount: count(ultimateGraph.missingFeatureAtoms),
    missingDeepFeatureCount: count(ultimateGraph.missingDeepFeatures),
    canonicalPointer: ultimateGraph?.memoryContract?.canonicalPointer || 'artifacts/cognitive/uberbond-ultimate-graph-latest.json',
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE'
  };
  out.ultimateGraphBinding = binding;
  out.memory = {
    ...(object(out.memory) || {}),
    ultimateGraph: {
      digest: ultimateGraph.graphDigest,
      pointer: ultimateGraph?.memoryContract?.canonicalPointer || 'artifacts/cognitive/uberbond-ultimate-graph-latest.json',
      repositoryArtifactCount: Number(ultimateGraph.repositoryArtifactCount || 0),
      featureAtomCount: Number(ultimateGraph.featureAtomCount || 0),
      deepFeatureCount: Number(ultimateGraph.deepFeatureCount || 0),
      nodeCount: Number(ultimateGraph.nodeCount || 0),
      edgeCount: Number(ultimateGraph.edgeCount || 0)
    }
  };
  const boundary = String(out.truthBoundary || '').trim();
  const law = 'ULTIMATE GRAPH MEMORY IS A DIGEST-BOUND REPOSITORY SELF-MAP. STALE, DISCONNECTED OR AMPUTATED MAPS MUST FAIL CLOSED; THE GRAPH NEVER CREATES CONSEQUENCE AUTHORITY.';
  out.truthBoundary = boundary ? `${boundary} ${law}` : law;
  return out;
}
