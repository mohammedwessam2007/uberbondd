import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { encryptJson } from '../src/crypto.mjs';
import { checkEncryptionKeyCompatibility, keyFingerprint } from '../src/db-compat/key-compat.mjs';

// Synthetic keys, generated per run and never written anywhere.
const correctKey = crypto.randomBytes(32).toString('hex');
const stagingKey = crypto.randomBytes(32).toString('hex');
const plainValue = 'synthetic-token-value-do-not-print';
const blob = encryptJson({ accessToken: plainValue }, correctKey);

function assertNoKeyMaterial(result, ...secrets) {
  const text = JSON.stringify(result);
  for (const secret of secrets) {
    assert.ok(!text.includes(secret), 'output must not contain key material or plaintext');
    assert.ok(!text.includes(secret.toUpperCase()), 'output must not contain key material in any case');
  }
  assert.ok(!text.includes(plainValue), 'output must not contain decrypted plaintext');
}

test('the correct key authenticates the sampled blob and reports OK with a keyed fingerprint', () => {
  const result = checkEncryptionKeyCompatibility({ keyHex: correctKey, blob });
  assert.equal(result.status, 'OK');
  assert.equal(result.ok, true);
  assert.deepEqual(result.reasonCodes, []);
  assert.match(result.keyFingerprint, /^[0-9a-f]{16}$/);
  assertNoKeyMaterial(result, correctKey);
});

test('a wrong staging-style key reports KEY_MISMATCH and a different fingerprint', () => {
  const result = checkEncryptionKeyCompatibility({ keyHex: stagingKey, blob });
  assert.equal(result.status, 'KEY_MISMATCH');
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasonCodes, ['KEY_MISMATCH']);
  assert.notEqual(result.keyFingerprint, keyFingerprint(correctKey));
  assertNoKeyMaterial(result, correctKey, stagingKey);
});

test('malformed keys report MALFORMED_KEY, produce no fingerprint, and never echo the value', () => {
  const malformed = [
    'not-a-hex-key-value',
    'a'.repeat(63),
    'a'.repeat(65),
    `${'g'.repeat(10)}${crypto.randomBytes(27).toString('hex').slice(0, 54)}`,
    '',
    null,
    undefined,
    42
  ];
  for (const keyHex of malformed) {
    const result = checkEncryptionKeyCompatibility({ keyHex, blob });
    assert.equal(result.status, 'MALFORMED_KEY');
    assert.equal(result.ok, false);
    assert.equal(result.keyFingerprint, null);
    if (typeof keyHex === 'string' && keyHex) assert.ok(!JSON.stringify(result).includes(keyHex));
  }
});

test('uppercase hexadecimal is accepted as a key, matching src/crypto.mjs', () => {
  const result = checkEncryptionKeyCompatibility({ keyHex: correctKey.toUpperCase(), blob });
  assert.equal(result.status, 'OK');
  assert.equal(result.keyFingerprint, keyFingerprint(correctKey));
});

test('malformed blobs report MALFORMED_BLOB', () => {
  const iv = Buffer.from(blob.iv, 'base64');
  const tag = Buffer.from(blob.tag, 'base64');
  const bad = [
    null,
    'not json at all {',
    [blob.iv, blob.tag, blob.data],
    { tag: blob.tag, data: blob.data },
    { ...blob, iv: iv.subarray(0, 8).toString('base64') },
    { ...blob, tag: tag.subarray(0, 12).toString('base64') },
    { ...blob, data: '' },
    { ...blob, data: 'not*base64!' },
    { ...blob, data: 'abc' }
  ];
  for (const candidate of bad) {
    const result = checkEncryptionKeyCompatibility({ keyHex: correctKey, blob: candidate });
    assert.equal(result.status, 'MALFORMED_BLOB', JSON.stringify(candidate)?.slice(0, 40));
    assert.equal(result.ok, false);
    assertNoKeyMaterial(result, correctKey);
  }
});

test('an altered ciphertext fails authentication and reports KEY_MISMATCH', () => {
  const data = Buffer.from(blob.data, 'base64');
  data[0] ^= 0xff;
  const result = checkEncryptionKeyCompatibility({ keyHex: correctKey, blob: { ...blob, data: data.toString('base64') } });
  assert.equal(result.status, 'KEY_MISMATCH');
});

test('the blob may be supplied as the JSON text a database column holds', () => {
  const result = checkEncryptionKeyCompatibility({ keyHex: correctKey, blob: JSON.stringify(blob) });
  assert.equal(result.status, 'OK');
});

test('authenticated plaintext that is not JSON reports MALFORMED_BLOB without echoing it', () => {
  const key = Buffer.from(correctKey, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update('not json {SYNTHETIC}', 'utf8'), cipher.final()]);
  const sampled = { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
  const result = checkEncryptionKeyCompatibility({ keyHex: correctKey, blob: sampled });
  assert.equal(result.status, 'MALFORMED_BLOB');
  assert.ok(!JSON.stringify(result).includes('SYNTHETIC'));
  assertNoKeyMaterial(result, correctKey);
});

test('the keyed fingerprint is deterministic, 16 hex characters, and not a plain digest of the key', () => {
  const fingerprint = keyFingerprint(correctKey);
  assert.equal(fingerprint, keyFingerprint(correctKey));
  assert.match(fingerprint, /^[0-9a-f]{16}$/);
  assert.notEqual(fingerprint, crypto.createHash('sha256').update(correctKey).digest('hex').slice(0, 16));
  assert.notEqual(fingerprint, keyFingerprint(stagingKey));
});
