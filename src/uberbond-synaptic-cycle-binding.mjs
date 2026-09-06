export const UBERBOND_SYNAPTIC_CYCLE_BINDING_POLICY_VERSION = 'uberbond-synaptic-cycle-binding-1.0.0';

const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : null;
const arrayCount = value => Array.isArray(value) ? value.length : 0;

export function validateSynapticCycleBinding({ featureGenome, synapticMap } = {}) {
  const reasons = [];
  if (!object(featureGenome) || featureGenome.ok !== true) reasons.push('valid-feature-genome-required');
  if (!object(synapticMap) || synapticMap.ok !== true) reasons.push('valid-synaptic-map-required');
  const genomeDigest = featureGenome?.genomeDigest || null;
  const mapGenomeDigest = synapticMap?.featureGenomeDigest || synapticMap?.genomeDigest || null;
  if (!genomeDigest) reasons.push('feature-genome-digest-required');
  if (!mapGenomeDigest) reasons.push('synaptic-map-feature-genome-digest-required');
  if (genomeDigest && mapGenomeDigest && genomeDigest !== mapGenomeDigest) reasons.push('synaptic-map-must-match-feature-genome');
  if (Array.isArray(synapticMap?.orphanArtifacts) && synapticMap.orphanArtifacts.length) reasons.push('synaptic-map-has-orphan-artifacts');
  if (Array.isArray(synapticMap?.orphanFeatureAtoms) && synapticMap.orphanFeatureAtoms.length) reasons.push('synaptic-map-has-orphan-feature-atoms');
  if (Array.isArray(synapticMap?.orphanOrgans) && synapticMap.orphanOrgans.length) reasons.push('synaptic-map-has-orphan-organs');
  return {
    ok: reasons.length === 0,
    policyVersion: UBERBOND_SYNAPTIC_CYCLE_BINDING_POLICY_VERSION,
    status: reasons.length ? 'SYNAPTIC_CYCLE_BINDING_REFUSED' : 'SYNAPTIC_CYCLE_BINDING_READY',
    reasonCodes: reasons,
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE'
  };
}

export function augmentCognitiveCycleWithSynapticMap({ receipt, featureGenome, synapticMap } = {}) {
  const binding = validateSynapticCycleBinding({ featureGenome, synapticMap });
  if (!binding.ok || !object(receipt)) return {
    ok: false,
    status: 'SYNAPTIC_CYCLE_AUGMENTATION_REFUSED',
    reasonCodes: [...binding.reasonCodes, ...(!object(receipt) ? ['cognitive-cycle-receipt-required'] : [])],
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE'
  };
  const out = structuredClone(receipt);
  out.sources = { ...(object(out.sources) || {}), synapticMap: true };
  out.synapticMap = {
    policyVersion: synapticMap.policyVersion || null,
    status: synapticMap.status || null,
    mapDigest: synapticMap.mapDigest || null,
    featureGenomeDigest: synapticMap.featureGenomeDigest || synapticMap.genomeDigest || null,
    nodeCount: Number(synapticMap.nodeCount || arrayCount(synapticMap.nodes)),
    edgeCount: Number(synapticMap.edgeCount || arrayCount(synapticMap.edges)),
    edgeTypeCounts: object(synapticMap.edgeTypeCounts) || {},
    orphanArtifactCount: arrayCount(synapticMap.orphanArtifacts),
    orphanFeatureAtomCount: arrayCount(synapticMap.orphanFeatureAtoms),
    orphanOrganCount: arrayCount(synapticMap.orphanOrgans),
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE'
  };
  out.synapticBinding = binding;
  const boundary = String(out.truthBoundary || '').trim();
  const synapticLaw = 'SYNAPTIC TOPOLOGY IS REPOSITORY/FEATURE CONNECTION EVIDENCE ONLY; AN EDGE DOES NOT CREATE CALLABILITY, MARKET TRUTH OR CONSEQUENCE AUTHORITY.';
  out.truthBoundary = boundary ? `${boundary} ${synapticLaw}` : synapticLaw;
  return out;
}
