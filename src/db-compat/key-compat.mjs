import crypto from 'node:crypto';

// Matches src/crypto.mjs: AES-256-GCM, 12-byte IV, 16-byte tag, base64 fields.
const KEY_PATTERN = /^[a-f0-9]{64}$/i;
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const FINGERPRINT_LABEL = 'uberbond-db-compat:key-fingerprint:v1';

export const KEY_COMPAT_STATUSES = Object.freeze(['OK', 'KEY_MISMATCH', 'MALFORMED_KEY', 'MALFORMED_BLOB']);

/**
 * Keyed fingerprint of a key: HMAC-SHA256(key, fixed label), first 16 hex chars.
 * The key is the HMAC key, so only a holder of the key can compute it. It can
 * be compared against a fingerprint recorded in an earlier receipt.
 */
export function keyFingerprint(keyHex) {
  return crypto.createHmac('sha256', Buffer.from(keyHex, 'hex')).update(FINGERPRINT_LABEL).digest('hex').slice(0, 16);
}

function decodeField(value, expectedBytes) {
  if (typeof value !== 'string' || value.length === 0 || value.length % 4 !== 0 || !BASE64_PATTERN.test(value)) return null;
  const bytes = Buffer.from(value, 'base64');
  if (expectedBytes !== null && bytes.length !== expectedBytes) return null;
  return bytes;
}

function parseBlob(blob) {
  let candidate = blob;
  if (typeof candidate === 'string') {
    try { candidate = JSON.parse(candidate); } catch { return null; }
  }
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const iv = decodeField(candidate.iv, IV_BYTES);
  const tag = decodeField(candidate.tag, TAG_BYTES);
  const data = decodeField(candidate.data, null);
  if (!iv || !tag || !data || data.length === 0) return null;
  return { iv, tag, data };
}

/**
 * Check whether `keyHex` can open one sampled stored blob. Read-only and offline.
 * Returns a status, a fixed reason code and a keyed fingerprint. It never
 * returns the key, the plaintext or a parser message.
 *
 *   OK              key authenticates the blob and the plaintext is JSON
 *   KEY_MISMATCH    GCM authentication fails under this key (wrong key, or the blob was altered)
 *   MALFORMED_KEY   not 64 hexadecimal characters; no fingerprint is produced
 *   MALFORMED_BLOB  not the {iv, tag, data} shape, or the authenticated plaintext is not JSON
 */
export function checkEncryptionKeyCompatibility({ keyHex, blob }) {
  if (typeof keyHex !== 'string' || !KEY_PATTERN.test(keyHex)) {
    return { ok: false, status: 'MALFORMED_KEY', reasonCodes: ['MALFORMED_KEY'], keyFingerprint: null, algorithm: 'aes-256-gcm' };
  }
  const fingerprint = keyFingerprint(keyHex);
  const parsed = parseBlob(blob);
  if (!parsed) {
    return { ok: false, status: 'MALFORMED_BLOB', reasonCodes: ['MALFORMED_BLOB'], keyFingerprint: fingerprint, algorithm: 'aes-256-gcm' };
  }
  let plaintext = null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), parsed.iv);
    decipher.setAuthTag(parsed.tag);
    plaintext = Buffer.concat([decipher.update(parsed.data), decipher.final()]);
  } catch {
    return { ok: false, status: 'KEY_MISMATCH', reasonCodes: ['KEY_MISMATCH'], keyFingerprint: fingerprint, algorithm: 'aes-256-gcm' };
  }
  let isJson = true;
  try { JSON.parse(plaintext.toString('utf8')); } catch { isJson = false; }
  plaintext.fill(0);
  if (!isJson) {
    return { ok: false, status: 'MALFORMED_BLOB', reasonCodes: ['MALFORMED_BLOB'], keyFingerprint: fingerprint, algorithm: 'aes-256-gcm' };
  }
  return { ok: true, status: 'OK', reasonCodes: [], keyFingerprint: fingerprint, algorithm: 'aes-256-gcm' };
}
