import crypto from 'node:crypto';
function keyFrom(hex) { if (!/^[a-f0-9]{64}$/i.test(hex||'')) throw new Error('TOKEN_ENCRYPTION_KEY must be 64 hex characters'); return Buffer.from(hex,'hex'); }
export function encryptJson(value, hex) {
  const iv=crypto.randomBytes(12), cipher=crypto.createCipheriv('aes-256-gcm',keyFrom(hex),iv);
  const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return {iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')};
}
export function decryptJson(blob, hex) {
  const decipher=crypto.createDecipheriv('aes-256-gcm',keyFrom(hex),Buffer.from(blob.iv,'base64'));
  decipher.setAuthTag(Buffer.from(blob.tag,'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(blob.data,'base64')),decipher.final()]).toString('utf8'));
}
// Same keyed-secret (TOKEN_ENCRYPTION_KEY) and HMAC construction already used by
// src/unsubscribe.mjs for signed links -- reused here for dedupe identifiers (P1-11) rather than
// inventing a second cryptographic format. Deterministic (same input+key always hashes the same),
// which is required for dedupe lookups, but one-way: the original provider ID cannot be recovered
// from the hash alone.
export function keyedHash(value, hex) {
  return crypto.createHmac('sha256', keyFrom(hex)).update(String(value ?? '')).digest('base64url');
}
