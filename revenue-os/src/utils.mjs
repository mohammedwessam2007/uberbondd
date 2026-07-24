import crypto from 'node:crypto';

export const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n) || 0));

export function sha256Hex(content) {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(String(content ?? ''), 'utf8');
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

const HTML_ESCAPES = Object.freeze({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' });
export function escapeHtml(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, char => HTML_ESCAPES[char]);
}

export function redactEmail(value = '') {
  const s = String(value || '');
  if (!s.includes('@')) return s ? '***' : '';
  const [name, domain] = s.split('@');
  return `${name.slice(0, 1)}***@${domain}`;
}

/** Coarse-grained secret-shaped redaction for owner-visible audit/log surfaces -- catches
 * anything that looks like an API key/token/bearer credential so it never round-trips into a
 * report, log line, or UI even if a caller accidentally passed one in. */
export function redactSecretsInText(text = '') {
  return String(text || '')
    .replace(/\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{8,}\b/g, '$1_$2_***REDACTED***')
    .replace(/\bBearer\s+[A-Za-z0-9._-]{10,}\b/gi, 'Bearer ***REDACTED***')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, match => (/^[a-f0-9-]+$/i.test(match) ? match : '***REDACTED***'));
}

const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63})+$/i;
export function isValidDomain(value) {
  return typeof value === 'string' && DOMAIN_RE.test(value.trim());
}
export function normalizeDomain(value) {
  return String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(value) {
  return typeof value === 'string' && EMAIL_RE.test(value.trim());
}
