import assert from 'node:assert/strict';
import test from 'node:test';
import { compileArtifactStorageWrite, normalizeArtifactObjectReceipt } from '../src/artifact-storage-contract.mjs';

const valid = {
  artifactId: 'artifact-1',
  contentType: 'application/json',
  sha256: 'a'.repeat(64),
  byteSize: 128
};

test('legacy postgres remains the default storage backend', () => {
  const result = compileArtifactStorageWrite(valid);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'LEGACY_POSTGRES_WRITE');
  assert.equal(result.plan.backend, 'postgres');
  assert.equal(result.businessEffectAuthority, 'INTERNAL_DB_ONLY');
});

test('object storage fails closed without an explicitly configured adapter', () => {
  const result = compileArtifactStorageWrite({ ...valid, backend: 'object' });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasonCodes, ['object-storage-adapter-not-configured']);
});

test('object storage plan is private and never silently persists postgres bytes', () => {
  const result = compileArtifactStorageWrite({ ...valid, backend: 'object', adapterConfigured: true, namespace: 'audit/evidence' });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'OBJECT_STORAGE_WRITE_PLAN');
  assert.equal(result.plan.visibility, 'PRIVATE');
  assert.equal(result.plan.persistPostgresBytes, false);
  assert.match(result.plan.storageKey, /^audit\/evidence\/aa\/[a-f0-9]{64}-[a-f0-9]{12}$/);
});

test('storage plan rejects sensitive metadata keys', () => {
  const result = compileArtifactStorageWrite({ ...valid, metadata: { authorization: 'Bearer x' } });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('sensitive-metadata-key-prohibited'));
});

test('storage plan rejects unsafe byte size and unsupported backend', () => {
  const result = compileArtifactStorageWrite({ ...valid, byteSize: Number.MAX_SAFE_INTEGER + 1, backend: 'mystery' });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('valid-byte-size-required'));
  assert.ok(result.reasonCodes.includes('unsupported-storage-backend'));
});

test('object receipt refuses public-by-default objects', () => {
  const result = normalizeArtifactObjectReceipt({ storageKey: 'private/k', etag: 'etag-1', sha256: 'b'.repeat(64), public: true });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('public-object-default-prohibited'));
});

test('object receipt requires integrity fields and valid observation time', () => {
  const missing = normalizeArtifactObjectReceipt({ storageKey: '', etag: '', sha256: 'nope' });
  assert.equal(missing.ok, false);
  assert.ok(missing.reasonCodes.includes('storage-key-required'));
  assert.ok(missing.reasonCodes.includes('provider-etag-required'));
  assert.ok(missing.reasonCodes.includes('sha256-required'));

  const badTime = normalizeArtifactObjectReceipt({ storageKey: 'private/k', etag: 'etag-1', sha256: 'b'.repeat(64), observedAt: 'not-a-date' });
  assert.equal(badTime.ok, false);
  assert.deepEqual(badTime.reasonCodes, ['valid-observed-at-required']);
});

test('valid private object receipt normalizes without business-effect authority', () => {
  const result = normalizeArtifactObjectReceipt({ storageKey: 'private/k', etag: 'etag-1', sha256: 'b'.repeat(64), observedAt: '2026-08-29T18:00:00Z' });
  assert.equal(result.ok, true);
  assert.equal(result.receipt.visibility, 'PRIVATE');
  assert.equal(result.receipt.observedAt, '2026-08-29T18:00:00.000Z');
  assert.equal(result.businessEffectAuthority, 'NONE');
});
