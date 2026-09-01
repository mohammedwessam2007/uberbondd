import crypto from 'node:crypto';

export const WORLD_BRAIN_FIELD_MISSION_VERSION = 'uberbond.world-brain-field-mission.v1';

const zeroTruth = {
  realCustomers: 0,
  clearedRevenueUsd: 0,
  acceptedDeliveries: 0,
  retainedCustomers: 0
};

export function digestWorldBrainFieldMission(record) {
  return crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex');
}

export function validateWorldBrainFieldMission(record, artifacts = {}) {
  const failures = [];
  if (record?.schemaVersion !== WORLD_BRAIN_FIELD_MISSION_VERSION) failures.push('invalid-schema-version');
  if (JSON.stringify(record?.commercialTruth) !== JSON.stringify(zeroTruth)) failures.push('unsupported-commercial-outcome');
  if (record?.champion?.id !== 'lead-path-attribution-integrity-sprint' || record?.champion?.priceHypothesisUsd !== 450) failures.push('invalid-champion');
  if (record?.canary?.maximumQualifiedConversations !== 5 || record?.canary?.externalEffectAuthority !== 'NONE') failures.push('invalid-canary-boundary');
  if (record?.externalEffectLedger && Object.values(record.externalEffectLedger).some(value => value !== 0)) failures.push('nonzero-external-effect');
  if (record?.capabilityCorpus?.approvedCapabilityCount !== 0 || record?.capabilityCorpus?.activeCapabilityCount !== 0 || record?.capabilityCorpus?.securityCleanCapabilityCount !== 0) failures.push('unsupported-capability-promotion');
  if (record?.storage?.primary !== 'cloudflare-r2' || record?.storage?.status !== 'RESEARCH_ONLY') failures.push('invalid-storage-decision');
  if (record?.modelGateway?.role !== 'TRANSPORT_SUPPLIER_BENEATH_UBERBOND_ROUTING_POLICY') failures.push('gateway-became-policy-brain');
  if (record?.paypal?.liveMerchantCapability !== 'NOT_PROVEN' || record?.paypal?.sandboxAppCreated !== false) failures.push('unsupported-payment-activation');

  const partners = artifacts.partners?.candidates;
  if (!Array.isArray(partners) || partners.filter(candidate => candidate.status.startsWith('PROMOTE')).length < 5) failures.push('insufficient-qualified-partner-pool');
  if (Array.isArray(partners) && partners.some(candidate => candidate.contactRoutes?.some(route => route.provenance !== 'PUBLIC_BUSINESS_ROUTE'))) failures.push('unsafe-contact-route');

  const corpus = artifacts.corpus?.candidates;
  const metadataOnly = Object.values(artifacts.corpus?.metadataOnlyCandidateIdsByFamily || {}).flat();
  const corpusCount = (Array.isArray(corpus) ? corpus.length : 0) + metadataOnly.length;
  if (!Array.isArray(corpus) || corpusCount !== 92) failures.push('invalid-capability-corpus-count');
  if (Array.isArray(corpus) && corpus.some(candidate => candidate.promotionState !== 'DISCOVERED' || candidate.securityAdmission !== 'NOT_ADMITTED')) failures.push('unsafe-capability-state');

  return {
    ok: failures.length === 0,
    health: failures.length === 0 ? 'WORLD_BRAIN_FIELD_MISSION_HEALTHY' : 'WORLD_BRAIN_FIELD_MISSION_UNHEALTHY',
    failures,
    digest: digestWorldBrainFieldMission(record),
    champion: record?.champion?.id,
    commercialTruth: record?.commercialTruth,
    corpusCandidateCount: corpusCount
  };
}

export function summarizeWorldBrainFieldMission(record, artifacts = {}) {
  const validation = validateWorldBrainFieldMission(record, artifacts);
  return {
    ...validation,
    canary: record?.canary,
    nextCommercialMove: record?.nextCommercialMove,
    storage: record?.storage,
    modelGateway: record?.modelGateway,
    paypal: record?.paypal
  };
}
