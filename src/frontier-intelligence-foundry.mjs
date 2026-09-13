import crypto from 'node:crypto';

export const FRONTIER_INTELLIGENCE_FOUNDRY_VERSION = 'uberbond.frontier-intelligence-foundry.v1';
export const FRONTIER_FINAL_RETAINED_TARGET = 1_000_000;
export const FRONTIER_ACTIVE_CORTEX_MAX = 64;

export const FRONTIER_SOURCE_CLASSES = Object.freeze([
  'OFFICIAL_DOC', 'SYSTEM_CARD', 'FIRST_PARTY_RESEARCH', 'PAPER', 'AUTHOR_CODE',
  'PUBLIC_GITHUB_ARTIFACT', 'PUBLIC_MODEL_RUN', 'PUBLIC_DEMO', 'PATENT', 'BENCHMARK',
  'ENGINEERING_BLOG', 'OTHER_PUBLIC_EVIDENCE'
]);

export const FRONTIER_PROVENANCE_TIERS = Object.freeze({
  P0: { min: 0.95, max: 1.00, meaning: 'FIRST_PARTY_OR_CRYPTOGRAPHICALLY_ANCHORED' },
  P1: { min: 0.80, max: 0.95, meaning: 'STRONG_AUTHOR_ATTESTATION_WITH_SUPPORTING_EVIDENCE' },
  P2: { min: 0.60, max: 0.80, meaning: 'CORROBORATED_INFERENCE' },
  P3: { min: 0.30, max: 0.60, meaning: 'WEAK_SELF_CLAIM_OR_SINGLE_SOURCE' },
  P4: { min: 0.00, max: 0.30, meaning: 'UNKNOWN_MODEL_PROVENANCE' },
  PX: { min: 0.00, max: 0.00, meaning: 'PROHIBITED_CONFIDENTIAL_OR_LEAKED_MATERIAL' }
});

const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text = (value, max = 4000) => String(value ?? '').trim().slice(0, max);
const clamp = value => Math.max(0, Math.min(1, Number(value) || 0));
const list = (value, max = 128) => Array.isArray(value) ? [...new Set(value.map(v => text(v, 500)).filter(Boolean))].slice(0, max) : [];

export function classifyFrontierSourcePolicy(input = {}) {
  const sourceClass = text(input.sourceClass, 80).toUpperCase();
  const publicSource = input.publicSource === true;
  const confidential = input.confidential === true || input.leaked === true || input.accessControlBypassed === true;
  const seeksHiddenInternals = input.seeksHiddenInternals === true || input.seeksHiddenChainOfThought === true || input.seeksWeights === true || input.seeksTrainingDataExtraction === true;
  const prohibitedOutputHarvest = input.bulkProviderOutputHarvest === true && input.explicitContractualPermission !== true;
  const licenseStatus = text(input.licenseStatus || 'UNKNOWN', 80).toUpperCase();

  if (!FRONTIER_SOURCE_CLASSES.includes(sourceClass)) return { ok: false, decision: 'DENY', reasonCodes: ['RECOGNIZED_SOURCE_CLASS_REQUIRED'] };
  if (confidential) return { ok: true, decision: 'DENY', reasonCodes: ['CONFIDENTIAL_OR_LEAKED_MATERIAL_PROHIBITED'], reusableCode: false, executable: false };
  if (seeksHiddenInternals) return { ok: true, decision: 'DENY', reasonCodes: ['PROPRIETARY_MODEL_EXTRACTION_PROHIBITED'], reusableCode: false, executable: false };
  if (prohibitedOutputHarvest) return { ok: true, decision: 'DENY', reasonCodes: ['BULK_PROVIDER_OUTPUT_HARVEST_REQUIRES_EXPLICIT_PERMISSION'], reusableCode: false, executable: false };
  if (!publicSource) return { ok: true, decision: 'REVIEW', reasonCodes: ['PUBLIC_OR_EXPLICITLY_AUTHORIZED_SOURCE_REQUIRED'], reusableCode: false, executable: false };

  const reusableCode = ['MIT', 'APACHE-2.0', 'BSD-2-CLAUSE', 'BSD-3-CLAUSE', 'ISC'].includes(licenseStatus);
  return {
    ok: true,
    decision: 'ALLOW_EVIDENCE',
    reasonCodes: reusableCode ? ['PUBLIC_EVIDENCE_AND_REUSABLE_LICENSE_OBSERVED'] : ['PUBLIC_EVIDENCE_ONLY_UNTIL_REUSE_RIGHTS_PROVEN'],
    reusableCode,
    executable: false,
    law: 'DISCOVERY_RIGHTS_NE_REPRODUCTION_RIGHTS_NE_EXECUTION_RIGHTS'
  };
}

export function normalizeFrontierIntelligenceRecord(input = {}) {
  const sourceUrl = text(input.sourceUrl, 1500);
  const sourceClass = text(input.sourceClass, 80).toUpperCase();
  const name = text(input.name, 300);
  const provenanceTier = text(input.provenanceTier || 'P4', 10).toUpperCase();
  const mechanismFamily = text(input.mechanismFamily, 120).toLowerCase();
  const mechanism = text(input.mechanism, 4000);
  const observableClaim = text(input.observableClaim, 4000);
  const evidenceRefs = list(input.evidenceRefs || [], 256);
  const tags = list(input.tags || [], 256).map(v => v.toLowerCase());
  const confidence = clamp(input.provenanceConfidence);
  const policy = classifyFrontierSourcePolicy({ ...input, sourceClass });
  const reasons = [];
  if (!/^https:\/\//i.test(sourceUrl)) reasons.push('HTTPS_SOURCE_URL_REQUIRED');
  if (!FRONTIER_SOURCE_CLASSES.includes(sourceClass)) reasons.push('RECOGNIZED_SOURCE_CLASS_REQUIRED');
  if (!name) reasons.push('NAME_REQUIRED');
  if (!FRONTIER_PROVENANCE_TIERS[provenanceTier]) reasons.push('RECOGNIZED_PROVENANCE_TIER_REQUIRED');
  if (!mechanismFamily) reasons.push('MECHANISM_FAMILY_REQUIRED');
  if (!mechanism) reasons.push('MECHANISM_REQUIRED');
  if (!observableClaim) reasons.push('OBSERVABLE_CLAIM_REQUIRED');
  if (!policy.ok || policy.decision === 'DENY') reasons.push(...(policy.reasonCodes || []));
  if (provenanceTier === 'PX') reasons.push('PX_PROVENANCE_IS_NOT_INGESTIBLE');
  if (reasons.length) return { ok: false, status: 'FRONTIER_RECORD_REJECTED', reasonCodes: [...new Set(reasons)], policy };

  const semanticIdentity = digest({ mechanismFamily, mechanism: mechanism.toLowerCase().replace(/\s+/g, ' '), observableClaim: observableClaim.toLowerCase().replace(/\s+/g, ' ') });
  const record = {
    schemaVersion: FRONTIER_INTELLIGENCE_FOUNDRY_VERSION,
    id: `frontier:${semanticIdentity.slice(0, 40)}`,
    name,
    sourceUrl,
    sourceClass,
    provenanceTier,
    provenanceConfidence: confidence,
    generatingOrAssistingModel: text(input.generatingOrAssistingModel || 'UNKNOWN', 200),
    mechanismFamily,
    mechanism,
    observableClaim,
    evidenceRefs,
    tags,
    reproducibility: text(input.reproducibility || 'UNKNOWN', 80).toUpperCase(),
    licenseStatus: text(input.licenseStatus || 'UNKNOWN', 80).toUpperCase(),
    policy,
    promotionState: 'OBSERVED',
    executionAuthority: 'NONE',
    consequenceAuthority: 'NONE',
    observedAt: new Date(input.observedAt || Date.now()).toISOString()
  };
  return { ok: true, status: 'FRONTIER_RECORD_NORMALIZED', record, recordDigest: digest(record) };
}

export function extractFrontierMechanismAtoms(record = {}) {
  const normalized = record?.schemaVersion === FRONTIER_INTELLIGENCE_FOUNDRY_VERSION ? { ok: true, record } : normalizeFrontierIntelligenceRecord(record);
  if (!normalized.ok) return normalized;
  const r = normalized.record;
  const declared = Array.isArray(record.capabilityAtoms) ? record.capabilityAtoms : [];
  const atoms = declared.map((atom, index) => ({
    id: text(atom.id || `${r.mechanismFamily}:${index + 1}`, 200).toLowerCase(),
    family: text(atom.family || r.mechanismFamily, 120).toLowerCase(),
    verb: text(atom.verb || 'apply', 80).toLowerCase(),
    noun: text(atom.noun || 'mechanism', 120).toLowerCase(),
    description: text(atom.description || r.mechanism, 1200),
    inputs: list(atom.inputs || [], 64),
    outputs: list(atom.outputs || [], 64),
    sideEffectClass: text(atom.sideEffectClass || 'NONE', 80).toUpperCase(),
    provenanceRecordId: r.id,
    executionAuthority: 'NONE'
  }));
  return {
    ok: true,
    status: atoms.length ? 'FRONTIER_MECHANISM_ATOMS_EXTRACTED' : 'FRONTIER_MECHANISM_REQUIRES_ATOMIZATION',
    atoms,
    sourceRecordId: r.id,
    atomDigest: digest(atoms),
    truthBoundary: 'EXTRACTION_DESCRIBES_A_REUSABLE_MECHANISM_CLAIM. IT_DOES_NOT PROVE PERFORMANCE OR GRANT EXECUTION.'
  };
}

export function scoreFrontierDiscovery(record = {}, evidence = {}) {
  const efficacy = clamp(evidence.efficacy);
  const generality = clamp(evidence.generality);
  const novelty = clamp(evidence.novelty);
  const composability = clamp(evidence.composability);
  const provenance = clamp(record.provenanceConfidence);
  const reproducibility = clamp(evidence.reproducibility);
  const frontierRelevance = clamp(evidence.frontierRelevance);
  const temporalRelevance = clamp(evidence.temporalRelevance);
  return Number((0.20 * efficacy + 0.15 * generality + 0.15 * novelty + 0.15 * composability + 0.10 * provenance + 0.10 * reproducibility + 0.10 * frontierRelevance + 0.05 * temporalRelevance).toFixed(6));
}

export function buildFrontierMillionTournament({ records = [], evidenceById = {}, target = FRONTIER_FINAL_RETAINED_TARGET } = {}) {
  const bestByIdentity = new Map();
  const rejected = [];
  for (const raw of records) {
    const normalized = raw?.schemaVersion === FRONTIER_INTELLIGENCE_FOUNDRY_VERSION ? { ok: true, record: raw } : normalizeFrontierIntelligenceRecord(raw);
    if (!normalized.ok) { rejected.push({ input: raw, reasonCodes: normalized.reasonCodes || ['INVALID'] }); continue; }
    const record = normalized.record;
    const identity = record.id;
    const score = scoreFrontierDiscovery(record, evidenceById[record.id] || evidenceById[record.sourceUrl] || {});
    const candidate = { ...record, discoveryScore: score };
    const incumbent = bestByIdentity.get(identity);
    if (!incumbent || candidate.discoveryScore > incumbent.discoveryScore || (candidate.discoveryScore === incumbent.discoveryScore && candidate.provenanceConfidence > incumbent.provenanceConfidence)) bestByIdentity.set(identity, candidate);
  }
  const deduped = [...bestByIdentity.values()].sort((a, b) => b.discoveryScore - a.discoveryScore || b.provenanceConfidence - a.provenanceConfidence || a.id.localeCompare(b.id));
  const retained = deduped.slice(0, Math.max(0, Number(target) || FRONTIER_FINAL_RETAINED_TARGET));
  return {
    ok: true,
    status: retained.length >= FRONTIER_FINAL_RETAINED_TARGET ? 'FRONTIER_FINAL_MILLION_OBSERVED' : 'FRONTIER_FINAL_MILLION_INCOMPLETE',
    observedRows: records.length,
    distinctCapabilityRecords: deduped.length,
    retainedCapabilityRecords: retained.length,
    immutableProgramTarget: FRONTIER_FINAL_RETAINED_TARGET,
    retained,
    rejected,
    completionFraction: Number((Math.min(retained.length, FRONTIER_FINAL_RETAINED_TARGET) / FRONTIER_FINAL_RETAINED_TARGET).toFixed(9)),
    truthBoundary: 'THE_ONE_MILLION_TARGET IS SATISFIED ONLY BY ONE_MILLION DISTINCT RETAINED EVIDENCE-BACKED RECORDS. DISCOVERY, REPOSITORY COUNT, OR MODEL BRAND CANNOT SUBSTITUTE.'
  };
}

export function compileFrontierReproductionExperiment(record = {}, { baselineCapabilityId = 'UBERBOND_CURRENT', mutationOperators = ['COMPOSE', 'VERIFY', 'RETRIEVE'] } = {}) {
  const normalized = record?.schemaVersion === FRONTIER_INTELLIGENCE_FOUNDRY_VERSION ? { ok: true, record } : normalizeFrontierIntelligenceRecord(record);
  if (!normalized.ok) return normalized;
  const r = normalized.record;
  const experiment = {
    experimentId: `frontier-exp:${digest({ id: r.id, baselineCapabilityId, mutationOperators }).slice(0, 32)}`,
    sourceRecordId: r.id,
    hypothesis: r.observableClaim,
    baselineCapabilityId,
    variants: [
      { id: 'A', class: 'CURRENT_UBERBOND_BASELINE' },
      { id: 'B', class: 'INDEPENDENT_DONOR_MECHANISM_REPRODUCTION' },
      { id: 'C', class: 'UBERBOND_NATIVE_HYBRID_MUTATION', mutationOperators: list(mutationOperators, 16) }
    ],
    requiredEvidence: ['SEALED_HOLDOUT', 'MULTI_SEED_REPLICATION', 'TRAJECTORY_EVALUATION', 'FALSE_ACCEPT_RATE', 'COST_PER_COMPLETED_TASK', 'ROBUSTNESS'],
    promotionRule: 'NO_PROMOTION_FROM_SOURCE_CLAIMS_OR_MODEL_BRAND. WINNER_MUST_SURVIVE_SEALED_HOLDOUTS_AND_EXISTING_CAPABILITY_GENOME_GATES.',
    executionAuthority: 'NONE',
    consequenceAuthority: 'NONE'
  };
  return { ok: true, status: 'FRONTIER_REPRODUCTION_EXPERIMENT_COMPILED', experiment, experimentDigest: digest(experiment) };
}

export function observableChatAssistantMechanismMap() {
  return Object.freeze([
    'MODEL_ROUTING_AND_EFFORT_ALLOCATION',
    'SEARCHABLE_CONVERSATION_AND_EPISODIC_MEMORY',
    'STRUCTURED_LONG_HORIZON_TASK_STATE',
    'RETRIEVAL_AND_SOURCE_GROUNDING',
    'TOOL_PLUGIN_INTERFACE',
    'BROWSER_AND_COMPUTER_ORCHESTRATION',
    'CODE_EXECUTION_AND_ARTIFACT_CREATION',
    'MULTIMODAL_INPUT_OUTPUT',
    'VERIFICATION_BEFORE_COMMIT',
    'SUBAGENT_ORCHESTRATION',
    'CAPABILITY_ACQUISITION_AND_ROUTING',
    'SAFETY_PERMISSION_AND_AUTHORITY_BOUNDARIES',
    'FAILURE_RECOVERY_AND_RESUMPTION',
    'CONTINUOUS_EVALUATION_AND_REPLACEMENT'
  ]);
}
