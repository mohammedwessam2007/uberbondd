import crypto from 'node:crypto';

// 256-bit URL-safe capability token. Only its SHA-256 is stored.
export function createReportToken() {
  return crypto.randomBytes(32).toString('base64url');
}
export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}
export function isTokenShape(token) {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{24,100}$/.test(token);
}
export function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}
