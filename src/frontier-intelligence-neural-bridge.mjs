import { selectCapabilityGenomeBackedNeuralCortex } from './neural-exocortex-admission.mjs';
import { FRONTIER_INTELLIGENCE_FOUNDRY_VERSION } from './frontier-intelligence-foundry.mjs';

export const FRONTIER_NEURAL_BRIDGE_VERSION = 'uberbond.frontier-neural-bridge.v1';

export function frontierRecordsToNeuralReferences(records = []) {
  return records
    .filter(record => record?.schemaVersion === FRONTIER_INTELLIGENCE_FOUNDRY_VERSION && record?.policy?.decision === 'ALLOW_EVIDENCE')
    .map(record => ({
      id: record.id,
      sourceUrl: record.sourceUrl,
      family: record.mechanismFamily,
      role: 'FRONTIER_INTELLIGENCE_REFERENCE',
      description: `${record.name}: ${record.mechanism}`,
      topics: [...new Set([record.mechanismFamily, ...(record.tags || []), record.generatingOrAssistingModel].filter(Boolean))],
      neuralPrior: {
        score: Math.max(0, Math.min(1, (Number(record.provenanceConfidence) || 0) * 0.25)),
        provenanceOnly: true
      },
      promotionState: 'REFERENCE_ONLY',
      executionAuthority: 'NONE',
      consequenceAuthority: 'NONE'
    }));
}

export function selectFrontierCapabilityGenomeBackedCortex({
  mission,
  frontierRecords = [],
  canonicalCapabilities = [],
  securityEvidenceByCapability = {},
  benchmarkEvidenceByCapability = {},
  authorizedPermissions = [],
  limit
} = {}) {
  const neuralReferences = frontierRecordsToNeuralReferences(frontierRecords);
  const selection = selectCapabilityGenomeBackedNeuralCortex({
    mission,
    neuralReferences,
    canonicalCapabilities,
    securityEvidenceByCapability,
    benchmarkEvidenceByCapability,
    authorizedPermissions,
    limit
  });
  return {
    ...selection,
    bridgeVersion: FRONTIER_NEURAL_BRIDGE_VERSION,
    frontierReferenceCount: neuralReferences.length,
    truthBoundary: `${selection.truthBoundary || ''} FRONTIER_MODEL_PROVENANCE_IS_A_DISCOVERY_PRIOR_ONLY_AND_NEVER_CREATES_EXECUTABILITY.`.trim()
  };
}
