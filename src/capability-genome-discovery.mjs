import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const CAPABILITY_GENOME_DISCOVERY_VERSION = 'capability-genome-discovery-1.0.0';
const ALLOWED_ACCESS = new Set(['API', 'PUBLIC_WEB', 'GIT_METADATA', 'LOCAL_FILE']);
const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function clone(value) { return structuredClone(value); }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function fail(reasonCodes, extra = {}) {
  return { ok: false, status: 'CAPABILITY_DISCOVERY_DENIED', reasonCodes: [...new Set(reasonCodes)], businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS), ...extra };
}

export function loadCapabilityGenomeSourceRegistry({ rootDir = REPOSITORY_ROOT } = {}) {
  try {
    return JSON.parse(fs.readFileSync(path.join(rootDir, 'artifacts/capability-genome/source-registry.json'), 'utf8'));
  } catch (error) {
    return fail(['source-registry-load-failed'], { errorClass: error?.code || error?.name || 'UNKNOWN' });
  }
}

export function planIncrementalDiscovery({ sourceRegistry, sourceIds = [], cursors = {}, budget = {} } = {}) {
  if (sourceRegistry?.schemaVersion !== 'uberbond.capability-genome.sources.v1' || !Array.isArray(sourceRegistry.sources)) return fail(['valid-source-registry-required']);
  const wanted = new Set(sourceIds.map(String));
  const selected = sourceRegistry.sources.filter(source => wanted.size === 0 || wanted.has(source.id));
  const unknown = [...wanted].filter(id => !selected.some(source => source.id === id));
  if (unknown.length) return fail(['unknown-source-requested'], { unknownSourceIds: unknown });
  const maxSources = Number.isSafeInteger(budget.maxSources) ? Math.max(1, Math.min(100, budget.maxSources)) : 20;
  const maxRecordsPerSource = Number.isSafeInteger(budget.maxRecordsPerSource) ? Math.max(1, Math.min(10_000, budget.maxRecordsPerSource)) : 100;
  const plans = [];
  for (const source of selected.slice(0, maxSources)) {
    const reasons = [];
    if (!ALLOWED_ACCESS.has(source.accessMode)) reasons.push('unsupported-access-mode');
    if (!source.prohibited?.includes('CAPTCHA_BYPASS') || !source.prohibited?.includes('PRIVATE_SESSION')) reasons.push('required-access-prohibitions-missing');
    if (!String(source.url || '').startsWith('https://')) reasons.push('https-source-required');
    if (reasons.length) return fail(reasons.map(reason => `${source.id}:${reason}`));
    plans.push({
      sourceId: source.id,
      accessMode: source.accessMode,
      sourceUrl: source.url,
      artifactTypes: [...source.artifactTypes],
      cursor: source.incrementalCursor ? (cursors[source.id] ?? null) : null,
      maxRecords: maxRecordsPerSource,
      policy: {
        publicOrAuthorizedOnly: true,
        prohibited: [...source.prohibited],
        networkEffectRequiresSeparateExecutor: source.accessMode !== 'LOCAL_FILE'
      }
    });
  }
  return {
    ok: true,
    status: 'DISCOVERY_PLAN_COMPILED_NOT_EXECUTED',
    plans,
    refreshMode: 'HASH_AND_CURSOR_INCREMENTAL',
    next: 'EXECUTE_ONLY_IN_AN_AUTHORIZED_BOUNDED_ADAPTER',
    planDigest: digest(plans),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS)
  };
}

export function normalizeDiscoveryArtifact({ sourceId, artifactType, sourceUrl, sourceRevision, contentHash, observedAt, metadata = {} } = {}) {
  const reasons = [];
  if (!String(sourceId || '').trim()) reasons.push('source-id-required');
  if (!String(artifactType || '').trim()) reasons.push('artifact-type-required');
  if (!String(sourceUrl || '').startsWith('https://')) reasons.push('https-source-url-required');
  if (!String(sourceRevision || '').trim()) reasons.push('source-revision-required');
  if (!/^[a-f0-9]{64}$/.test(String(contentHash || '').toLowerCase())) reasons.push('sha256-content-hash-required');
  const date = new Date(observedAt);
  if (!Number.isFinite(date.getTime())) reasons.push('valid-observed-at-required');
  if (reasons.length) return fail(reasons);
  const artifact = {
    artifactIdentity: `artifact:${sourceId}:${contentHash.toLowerCase()}`,
    sourceId,
    artifactType: String(artifactType).toUpperCase(),
    sourceUrl,
    sourceRevision: String(sourceRevision),
    contentHash: contentHash.toLowerCase(),
    observedAt: date.toISOString(),
    metadata: clone(metadata),
    trustState: 'UNTRUSTED_DISCOVERED',
    promotionAuthority: 'NONE'
  };
  return { ok: true, status: 'DISCOVERY_ARTIFACT_NORMALIZED', artifact, artifactDigest: digest(artifact), businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS) };
}

export function buildCapabilityProvenance({ artifact, maintainer, declaredLicense = 'UNKNOWN', detectedLicense = 'UNKNOWN', concludedLicense = 'UNKNOWN', dependencyBomRef = null, attestationRefs = [] } = {}) {
  if (!artifact?.artifactIdentity || !artifact?.contentHash || !artifact?.sourceRevision) return fail(['normalized-artifact-required']);
  if (!maintainer?.name) return fail(['maintainer-required']);
  const provenance = {
    artifactIdentity: artifact.artifactIdentity,
    sourceId: artifact.sourceId,
    sourceUrl: artifact.sourceUrl,
    sourceRevision: artifact.sourceRevision,
    contentHash: artifact.contentHash,
    maintainer: clone(maintainer),
    license: { declared: declaredLicense, detected: detectedLicense, concluded: concludedLicense, legalConclusion: false },
    dependencyBomRef,
    attestationRefs: [...new Set(attestationRefs.map(String))],
    truthBoundary: 'IDENTITY_AND_BUILD_EVIDENCE_DO_NOT_PROVE_SAFETY_OR_LICENSE_COMPATIBILITY'
  };
  return { ok: true, status: 'PROVENANCE_ENVELOPE_COMPILED', provenance, provenanceDigest: digest(provenance), businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS) };
}
