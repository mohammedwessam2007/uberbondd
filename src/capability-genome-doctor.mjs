import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const CAPABILITY_GENOME_DOCTOR_VERSION = 'capability-genome-doctor-1.2.0';

const SOURCE_TYPES = new Set(['OFFICIAL_REGISTRY', 'PUBLIC_INDEX', 'GITHUB_API', 'PACKAGE_REGISTRY', 'ACADEMIC_CORPUS', 'APPROVED_SUPPLIER_REGISTRY']);
const ACCESS_MODES = new Set(['API', 'PUBLIC_WEB', 'GIT_METADATA', 'LOCAL_FILE']);
const EFFECT_STATES = new Set(['DISCOVERY_ONLY', 'READ_ONLY']);
const CORPUS_STATE_SCHEMA = 'uberbond.capability-genome.corpus-state.v1';

function clone(value) { return structuredClone(value); }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function fail(reasonCodes, extra = {}) { return { ok: false, status: 'CAPABILITY_GENOME_UNHEALTHY', reasonCodes: [...new Set(reasonCodes)], businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS), ...extra }; }
function count(value) { return Number.isSafeInteger(value) && value >= 0 ? value : null; }
function observedAt(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function inspectCapabilityGenome({ sourceRegistry, atomTaxonomy, capabilityRecords = [], existingSupplierRegistry = null, corpusState = null, bodyCorpusState = null, now = new Date() } = {}) {
  const reasons = [];
  const sources = sourceRegistry?.sources;
  const atoms = atomTaxonomy?.atoms;
  if (sourceRegistry?.schemaVersion !== 'uberbond.capability-genome.sources.v1' || !Array.isArray(sources)) reasons.push('valid-source-registry-required');
  if (atomTaxonomy?.schemaVersion !== 'uberbond.capability-genome.atoms.v1' || !Array.isArray(atoms)) reasons.push('valid-atom-taxonomy-required');
  const sourceIds = new Set();
  for (const source of sources || []) {
    if (!source?.id || sourceIds.has(source.id)) reasons.push('unique-source-id-required');
    sourceIds.add(source?.id);
    if (!SOURCE_TYPES.has(source?.sourceClass) || !ACCESS_MODES.has(source?.accessMode) || !EFFECT_STATES.has(source?.effectClass)) reasons.push('recognized-source-policy-required');
    if (!String(source?.url || '').startsWith('https://')) reasons.push('https-source-url-required');
    if (source?.prohibited?.includes('CAPTCHA_BYPASS') !== true || source?.prohibited?.includes('PRIVATE_SESSION') !== true) reasons.push('source-bypass-prohibitions-required');
  }
  const atomIds = new Set();
  for (const atom of atoms || []) {
    if (!atom?.id || atomIds.has(atom.id)) reasons.push('unique-atom-id-required');
    atomIds.add(atom?.id);
    if (!atom?.verb || !atom?.noun || !atom?.description || !atom?.sideEffectClass) reasons.push('typed-atom-fields-required');
  }
  if (!Array.isArray(capabilityRecords)) reasons.push('capability-record-array-required');

  let worldRepositoryCandidateCount = 0;
  let worldRepositoryProviderCalls = 0;
  let repositoryCorpusObservedAt = null;
  let worldCorpusBatchId = null;
  if (corpusState != null) {
    if (corpusState?.schemaVersion !== CORPUS_STATE_SCHEMA) reasons.push('valid-corpus-state-required');
    const repositoryCandidates = count(corpusState?.distinctRepositoryCandidates);
    const skillBodies = count(corpusState?.skillBodiesImported);
    const normalizedRecords = count(corpusState?.capabilityRecordsNormalized);
    const providerCalls = count(corpusState?.providerCalls);
    if ([repositoryCandidates, skillBodies, normalizedRecords, providerCalls].some(value => value == null)) reasons.push('nonnegative-corpus-counts-required');
    if (corpusState?.evidenceClass !== 'MEASURED_IMPORT') reasons.push('measured-corpus-evidence-required');
    if (corpusState?.sourceId !== 'github-public-capability-search') reasons.push('recognized-corpus-source-required');
    if (corpusState?.corpusKind !== 'WORLD_REPOSITORY_CANDIDATE_METADATA') reasons.push('recognized-corpus-kind-required');
    if (corpusState?.corpusKind === 'WORLD_REPOSITORY_CANDIDATE_METADATA' && (skillBodies > 0 || normalizedRecords > 0)) reasons.push('repository-metadata-corpus-cannot-claim-body-or-capability-import');
    const observed = observedAt(corpusState?.observedAt);
    if (!observed) reasons.push('valid-corpus-observed-at-required');
    if (reasons.length === 0) {
      worldRepositoryCandidateCount = repositoryCandidates;
      worldRepositoryProviderCalls = providerCalls;
      repositoryCorpusObservedAt = observed;
      worldCorpusBatchId = corpusState.batchId || null;
    }
  }

  let worldSkillBodyCount = 0;
  let distinctSkillBodyContentCount = 0;
  let worldSkillBodyProviderCalls = 0;
  let bodyCorpusObservedAt = null;
  let bodyEvidenceDigest = null;
  if (bodyCorpusState != null) {
    if (bodyCorpusState?.schemaVersion !== CORPUS_STATE_SCHEMA) reasons.push('valid-body-corpus-state-required');
    const skillBodies = count(bodyCorpusState?.skillBodiesImported);
    const distinctBodies = count(bodyCorpusState?.distinctSkillBodyContentCount);
    const normalizedRecords = count(bodyCorpusState?.capabilityRecordsNormalized);
    const providerCalls = count(bodyCorpusState?.providerCalls);
    const repositoryCount = count(bodyCorpusState?.repositoryCount);
    if ([skillBodies, distinctBodies, normalizedRecords, providerCalls, repositoryCount].some(value => value == null)) reasons.push('nonnegative-body-corpus-counts-required');
    if (bodyCorpusState?.evidenceClass !== 'MEASURED_IMPORT') reasons.push('measured-body-corpus-evidence-required');
    if (bodyCorpusState?.sourceId !== 'github-public-capability-search') reasons.push('recognized-body-corpus-source-required');
    if (bodyCorpusState?.corpusKind !== 'WORLD_SKILL_BODY_EVIDENCE') reasons.push('recognized-body-corpus-kind-required');
    if (normalizedRecords !== 0) reasons.push('skill-body-evidence-cannot-claim-normalized-capabilities');
    if (count(bodyCorpusState?.approvedCapabilities) !== 0 || count(bodyCorpusState?.activeCapabilities) !== 0) reasons.push('skill-body-evidence-cannot-claim-promotion');
    if (distinctBodies != null && skillBodies != null && distinctBodies > skillBodies) reasons.push('distinct-skill-body-count-cannot-exceed-import-count');
    if (bodyCorpusState?.storageMode !== 'SOURCE_PINNED_REFERENCE_ONLY') reasons.push('recognized-body-storage-mode-required');
    if (!/^[a-f0-9]{64}$/.test(String(bodyCorpusState?.bodyEvidenceDigest || ''))) reasons.push('body-evidence-digest-required');
    const observed = observedAt(bodyCorpusState?.observedAt);
    if (!observed) reasons.push('valid-body-corpus-observed-at-required');
    if (Array.isArray(bodyCorpusState?.bodies)) {
      if (bodyCorpusState.bodies.length !== skillBodies) reasons.push('body-evidence-list-count-mismatch');
      for (const body of bodyCorpusState.bodies) {
        if (body?.trustState !== 'UNTRUSTED_DISCOVERED' || body?.promotionAuthority !== 'NONE') reasons.push('body-evidence-must-remain-untrusted-zero-authority');
        if (!validBodyEvidence(body)) reasons.push('valid-pinned-body-evidence-required');
      }
    }
    if (reasons.length === 0) {
      worldSkillBodyCount = skillBodies;
      distinctSkillBodyContentCount = distinctBodies;
      worldSkillBodyProviderCalls = providerCalls;
      bodyCorpusObservedAt = observed;
      bodyEvidenceDigest = bodyCorpusState.bodyEvidenceDigest;
    }
  }

  const measuredRawCount = (sources || []).reduce((sum, source) => sum + (source.countEvidence?.class === 'MEASURED_IMPORT' && Number.isSafeInteger(source.countEvidence.count) ? source.countEvidence.count : 0), 0);
  const worldMeasuredCount = (sources || []).reduce((sum, source) => sum + (source.countEvidence?.class === 'MEASURED_IMPORT' && source.countEvidence?.scope === 'WORLD_CORPUS' && Number.isSafeInteger(source.countEvidence.count) ? source.countEvidence.count : 0), 0);
  const creatorClaims = (sources || []).filter(source => source.countEvidence?.class === 'CREATOR_CLAIM').map(source => ({ sourceId: source.id, count: source.countEvidence.count, unit: source.countEvidence.unit || 'UNSPECIFIED_NONCOMPARABLE', observedAt: source.countEvidence.observedAt }));
  const approvedSupplierCount = Array.isArray(existingSupplierRegistry?.entries) ? existingSupplierRegistry.entries.length : 0;
  if (reasons.length) return fail(reasons);

  const states = new Map();
  for (const record of capabilityRecords) states.set(record.promotionState, (states.get(record.promotionState) || 0) + 1);
  const worldCapabilityRecordsNormalized = capabilityRecords.length;
  const approvedCapabilityCount = states.get('APPROVED') || 0;
  const activeCapabilityCount = states.get('ACTIVE') || 0;
  const revokedCapabilityCount = states.get('REVOKED') || 0;
  const corpusTruth = worldSkillBodyCount > 0
    ? 'MEASURED_WORLD_SKILL_BODY_IMPORT_PRESENT__CAPABILITIES_NOT_AUTO_PROMOTED'
    : worldRepositoryCandidateCount > 0
      ? 'MEASURED_WORLD_REPOSITORY_CANDIDATES_PRESENT__SKILL_BODIES_NOT_IMPORTED'
      : worldMeasuredCount === 0
        ? 'SEED_SUPPLIER_REGISTRY_ONLY__NO_WORLD_CORPUS_IMPORTED'
        : 'MEASURED_WORLD_IMPORT_PRESENT';
  const runtimeTruth = worldSkillBodyCount > 0
    ? 'CONTROL_PLANE_PROJECT_INTEGRATED__BOUNDED_WORLD_HARVEST_AND_BODY_IMPORT_PROVEN__CONTINUOUS_REFRESH_NOT_ACTIVATED'
    : worldRepositoryCandidateCount > 0
      ? 'CONTROL_PLANE_PROJECT_INTEGRATED__BOUNDED_WORLD_HARVEST_PROVEN__CONTINUOUS_REFRESH_NOT_ACTIVATED'
      : 'CONTROL_PLANE_PROJECT_INTEGRATED__WORLD_REFRESH_RUNTIME_NOT_ACTIVATED';
  const refreshTimes = [repositoryCorpusObservedAt, bodyCorpusObservedAt].filter(Boolean).sort();

  const state = {
    capabilityGenomeVersion: '1.0.0-foundation',
    sourceCount: sources.length,
    rawCandidateCount: measuredRawCount,
    rawCandidateCreatorClaimCount: null,
    rawCandidateCreatorClaims: creatorClaims,
    worldRepositoryCandidateCount,
    worldSkillBodyCount,
    distinctSkillBodyContentCount,
    worldCapabilityRecordsNormalized,
    worldRepositoryProviderCalls,
    worldSkillBodyProviderCalls,
    worldCorpusProviderCalls: worldRepositoryProviderCalls + worldSkillBodyProviderCalls,
    worldCorpusBatchId,
    bodyEvidenceDigest,
    dedupedCapabilityCount: new Set(capabilityRecords.map(record => record.canonicalIdentity)).size,
    approvedCapabilityCount,
    activeCapabilityCount,
    revokedCapabilityCount,
    approvedSupplierCount,
    capabilityAtomCount: atoms.length,
    corpusTruth,
    runtimeTruth,
    lastRefresh: refreshTimes.at(-1) || null,
    promotionTruthSource: 'CAPABILITY_RECORD_LIFECYCLE_ONLY__CORPUS_AND_BODY_METADATA_CANNOT_APPROVE_OR_ACTIVATE',
    health: 'FOUNDATION_HEALTHY'
  };
  return {
    ok: true,
    status: 'CAPABILITY_GENOME_FOUNDATION_HEALTHY',
    state,
    capabilityGraphDigest: digest({
      sources,
      atoms,
      repositoryCorpusState: corpusState ? { batchId: worldCorpusBatchId, worldRepositoryCandidateCount } : null,
      bodyCorpusState: bodyCorpusState ? { bodyEvidenceDigest, worldSkillBodyCount, distinctSkillBodyContentCount } : null,
      capabilityRecords: capabilityRecords.map(record => ({ id: record.id, canonicalIdentity: record.canonicalIdentity, sourceHash: record.sourceHash, promotionState: record.promotionState }))
    }),
    securityPolicyVersion: 'capability-genome-admission-1.0.0',
    evaluatedAt: new Date(now).toISOString(),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS)
  };
}

function validBodyEvidence(body) {
  if (!/^[^/\s]+\/[^/\s]+$/.test(String(body?.repositoryFullName || ''))) return false;
  if (!/^[a-f0-9]{40}$/i.test(String(body?.sourceCommit || ''))) return false;
  if (!/^[a-f0-9]{40}$/i.test(String(body?.gitBlobSha || ''))) return false;
  if (!/^[a-f0-9]{64}$/i.test(String(body?.contentSha256 || ''))) return false;
  if (!Number.isSafeInteger(body?.byteLength) || body.byteLength <= 0) return false;
  if (!String(body?.skillPath || '').endsWith('SKILL.md')) return false;
  if (!String(body?.sourceUrl || '').startsWith('https://github.com/')) return false;
  return true;
}
