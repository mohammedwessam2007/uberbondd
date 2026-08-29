import crypto from 'node:crypto';

export const ARTIFACT_STORAGE_POLICY_VERSION = 'uberbond.artifact-storage-contract.v1';

const safeText = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const sensitiveMetadataKey = /(?:secret|password|authorization|cookie|credential|api[_-]?key|access[_-]?token|private[_-]?key)/i;

function fail(reasonCodes) {
  return {
    ok: false,
    status: 'BLOCKED',
    policyVersion: ARTIFACT_STORAGE_POLICY_VERSION,
    reasonCodes: [...new Set(reasonCodes)],
    businessEffectAuthority: 'NONE'
  };
}

export function compileArtifactStorageWrite(input = {}) {
  const backend = String(input.backend || 'postgres').toLowerCase();
  const artifactId = safeText(input.artifactId, 180);
  const contentType = safeText(input.contentType, 120);
  const contentSha256 = safeText(input.sha256, 64).toLowerCase();
  const byteSize = Number(input.byteSize);
  const metadata = input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
    ? input.metadata
    : {};
  const reasons = [];

  if (!artifactId) reasons.push('artifact-id-required');
  if (!contentType) reasons.push('content-type-required');
  if (!/^[a-f0-9]{64}$/.test(contentSha256)) reasons.push('sha256-required');
  if (!Number.isSafeInteger(byteSize) || byteSize < 0) reasons.push('valid-byte-size-required');
  if (!['postgres', 'object'].includes(backend)) reasons.push('unsupported-storage-backend');
  if (Object.keys(metadata).some(key => sensitiveMetadataKey.test(key))) reasons.push('sensitive-metadata-key-prohibited');
  if (reasons.length) return fail(reasons);

  if (backend === 'postgres') {
    return {
      ok: true,
      status: 'LEGACY_POSTGRES_WRITE',
      policyVersion: ARTIFACT_STORAGE_POLICY_VERSION,
      plan: { backend, artifactId, contentType, sha256: contentSha256, byteSize },
      businessEffectAuthority: 'INTERNAL_DB_ONLY'
    };
  }

  if (input.adapterConfigured !== true) return fail(['object-storage-adapter-not-configured']);

  const namespace = safeText(input.namespace || 'crawl-evidence', 80)
    .replace(/[^a-z0-9/_-]+/gi, '-')
    .replace(/^[-/]+|[-/]+$/g, '') || 'crawl-evidence';
  const storageKey = `${namespace}/${contentSha256.slice(0, 2)}/${contentSha256}-${hash(artifactId).slice(0, 12)}`;

  return {
    ok: true,
    status: 'OBJECT_STORAGE_WRITE_PLAN',
    policyVersion: ARTIFACT_STORAGE_POLICY_VERSION,
    plan: {
      backend,
      artifactId,
      storageKey,
      contentType,
      sha256: contentSha256,
      byteSize,
      visibility: 'PRIVATE',
      persistPostgresBytes: false
    },
    businessEffectAuthority: 'OBJECT_WRITE_REQUIRES_CONFIGURED_ADAPTER'
  };
}

export function normalizeArtifactObjectReceipt(input = {}) {
  const reasons = [];
  const storageKey = safeText(input.storageKey, 1000);
  const etag = safeText(input.etag, 300);
  const sha256 = safeText(input.sha256, 64).toLowerCase();

  if (!storageKey) reasons.push('storage-key-required');
  if (!etag) reasons.push('provider-etag-required');
  if (!/^[a-f0-9]{64}$/.test(sha256)) reasons.push('sha256-required');
  if (input.public === true) reasons.push('public-object-default-prohibited');
  if (reasons.length) return fail(reasons);

  const observedAt = new Date(input.observedAt || Date.now());
  if (Number.isNaN(observedAt.getTime())) return fail(['valid-observed-at-required']);

  return {
    ok: true,
    status: 'OBJECT_STORAGE_RECEIPT_NORMALIZED',
    policyVersion: ARTIFACT_STORAGE_POLICY_VERSION,
    receipt: {
      storageKey,
      etag,
      sha256,
      visibility: 'PRIVATE',
      observedAt: observedAt.toISOString()
    },
    businessEffectAuthority: 'NONE'
  };
}
