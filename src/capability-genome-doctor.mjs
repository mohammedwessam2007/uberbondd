import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const CAPABILITY_GENOME_DOCTOR_VERSION = 'capability-genome-doctor-1.0.0';

const SOURCE_TYPES = new Set(['OFFICIAL_REGISTRY', 'PUBLIC_INDEX', 'GITHUB_API', 'PACKAGE_REGISTRY', 'ACADEMIC_CORPUS', 'APPROVED_SUPPLIER_REGISTRY']);
const ACCESS_MODES = new Set(['API', 'PUBLIC_WEB', 'GIT_METADATA', 'LOCAL_FILE']);
const EFFECT_STATES = new Set(['DISCOVERY_ONLY', 'READ_ONLY']);

function clone(value) { return structuredClone(value); }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function fail(reasonCodes, extra = {}) { return { ok: false, status: 'CAPABILITY_GENOME_UNHEALTHY', reasonCodes: [...new Set(reasonCodes)], businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS), ...extra }; }

export function inspectCapabilityGenome({ sourceRegistry, atomTaxonomy, capabilityRecords = [], existingSupplierRegistry = null, now = new Date() } = {}) {
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
  const measuredRawCount = (sources || []).reduce((sum, source) => sum + (source.countEvidence?.class === 'MEASURED_IMPORT' && Number.isSafeInteger(source.countEvidence.count) ? source.countEvidence.count : 0), 0);
  const worldMeasuredCount = (sources || []).reduce((sum, source) => sum + (source.countEvidence?.class === 'MEASURED_IMPORT' && source.countEvidence?.scope === 'WORLD_CORPUS' && Number.isSafeInteger(source.countEvidence.count) ? source.countEvidence.count : 0), 0);
  const creatorClaims = (sources || []).filter(source => source.countEvidence?.class === 'CREATOR_CLAIM').map(source => ({ sourceId: source.id, count: source.countEvidence.count, unit: source.countEvidence.unit || 'UNSPECIFIED_NONCOMPARABLE', observedAt: source.countEvidence.observedAt }));
  const approvedSupplierCount = Array.isArray(existingSupplierRegistry?.entries) ? existingSupplierRegistry.entries.length : 0;
  if (reasons.length) return fail(reasons);
  const states = new Map();
  for (const record of capabilityRecords) states.set(record.promotionState, (states.get(record.promotionState) || 0) + 1);
  const state = {
    capabilityGenomeVersion: '1.0.0-foundation',
    sourceCount: sources.length,
    rawCandidateCount: measuredRawCount,
    rawCandidateCreatorClaimCount: null,
    rawCandidateCreatorClaims: creatorClaims,
    dedupedCapabilityCount: new Set(capabilityRecords.map(record => record.canonicalIdentity)).size,
    approvedCapabilityCount: states.get('APPROVED') || 0,
    activeCapabilityCount: states.get('ACTIVE') || 0,
    revokedCapabilityCount: states.get('REVOKED') || 0,
    approvedSupplierCount,
    capabilityAtomCount: atoms.length,
    corpusTruth: worldMeasuredCount === 0 ? 'SEED_SUPPLIER_REGISTRY_ONLY__NO_WORLD_CORPUS_IMPORTED' : 'MEASURED_WORLD_IMPORT_PRESENT',
    runtimeTruth: 'CONTROL_PLANE_PROJECT_INTEGRATED__WORLD_REFRESH_RUNTIME_NOT_ACTIVATED',
    lastRefresh: null,
    health: 'FOUNDATION_HEALTHY'
  };
  return { ok: true, status: 'CAPABILITY_GENOME_FOUNDATION_HEALTHY', state, capabilityGraphDigest: digest({ sources, atoms, capabilityRecords: capabilityRecords.map(record => ({ id: record.id, canonicalIdentity: record.canonicalIdentity, sourceHash: record.sourceHash, promotionState: record.promotionState })) }), securityPolicyVersion: 'capability-genome-admission-1.0.0', evaluatedAt: new Date(now).toISOString(), businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS) };
}
