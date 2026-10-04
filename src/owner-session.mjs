// Persistent owner session: an HttpOnly, SameSite=Strict, HMAC-signed cookie that
// proves the owner already presented ADMIN_TOKEN once. The token itself is never
// stored client-side. The signing key is derived from ADMIN_TOKEN, so rotating
// the token revokes every session. Sessions grant exactly the authority that a
// correct bearer already grants on `auth()` routes; they add no new authority.
import crypto from 'node:crypto';

export const OWNER_SESSION_COOKIE = 'ub_owner';
export const OWNER_SESSION_CSRF_HEADER = 'x-uberbond-owner-csrf';
export const OWNER_SESSION_ABSOLUTE_MS = 30 * 24 * 3600 * 1000;
export const OWNER_SESSION_IDLE_MS = 14 * 24 * 3600 * 1000;
const VERSION = 1;
const MAX_REVOKED = 2000;

const b64 = value => Buffer.from(value).toString('base64url');
const unb64 = value => Buffer.from(String(value), 'base64url').toString('utf8');
const deriveKey = adminToken => crypto.createHmac('sha256', 'uberbond-owner-session-v1').update(String(adminToken)).digest();
const sign = (key, body) => crypto.createHmac('sha256', key).update(body).digest('base64url');
const equal = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export const parseCookies = header => {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    out[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return out;
};

export const createOwnerSessionManager = ({ adminToken, now = () => Date.now() } = {}) => {
  const revoked = new Set();
  const enabled = typeof adminToken === 'string' && adminToken.length >= 16;
  const key = enabled ? deriveKey(adminToken) : null;

  const issue = () => {
    if (!enabled) return { ok: false, reason: 'OWNER_SESSION_DISABLED_NO_ADMIN_TOKEN' };
    const issuedAt = now();
    const payload = { v: VERSION, sid: crypto.randomBytes(18).toString('base64url'), iat: issuedAt, seen: issuedAt };
    const body = b64(JSON.stringify(payload));
    return { ok: true, sid: payload.sid, value: `${body}.${sign(key, body)}`, payload };
  };

  const verify = value => {
    if (!enabled) return { ok: false, reason: 'DISABLED' };
    const [body, sig, extra] = String(value || '').split('.');
    if (!body || !sig || extra !== undefined) return { ok: false, reason: 'MALFORMED' };
    if (!equal(sig, sign(key, body))) return { ok: false, reason: 'BAD_SIGNATURE' };
    let payload;
    try { payload = JSON.parse(unb64(body)); } catch { return { ok: false, reason: 'MALFORMED' }; }
    if (!payload || payload.v !== VERSION || typeof payload.sid !== 'string' || !Number.isFinite(payload.iat) || !Number.isFinite(payload.seen)) {
      return { ok: false, reason: 'MALFORMED' };
    }
    const t = now();
    if (revoked.has(payload.sid)) return { ok: false, reason: 'REVOKED' };
    if (payload.iat > t + 60000) return { ok: false, reason: 'FUTURE_DATED' };
    if (t - payload.iat > OWNER_SESSION_ABSOLUTE_MS) return { ok: false, reason: 'EXPIRED_ABSOLUTE' };
    if (t - payload.seen > OWNER_SESSION_IDLE_MS) return { ok: false, reason: 'EXPIRED_IDLE' };
    return { ok: true, sid: payload.sid, payload };
  };

  // Sliding idle window, never past the absolute lifetime.
  const refreshed = payload => {
    const next = { ...payload, seen: now() };
    const body = b64(JSON.stringify(next));
    return `${body}.${sign(key, body)}`;
  };

  const revoke = sid => {
    revoked.add(sid);
    if (revoked.size > MAX_REVOKED) revoked.delete(revoked.values().next().value);
  };

  return { enabled, issue, verify, refreshed, revoke };
};

export const cookieHeader = (value, { secure = true, maxAgeMs = OWNER_SESSION_ABSOLUTE_MS } = {}) =>
  `${OWNER_SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(maxAgeMs / 1000)}${secure ? '; Secure' : ''}`;
export const clearCookieHeader = ({ secure = true } = {}) =>
  `${OWNER_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`;

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Cookie authority for a request. State-changing methods additionally need the
// custom CSRF header (not sendable cross-site without a CORS preflight) and a
// same-origin Origin header when one is present.
export const authorizeOwnerCookie = (manager, req) => {
  const cookie = parseCookies(req.headers?.cookie)[OWNER_SESSION_COOKIE];
  if (!cookie) return { ok: false, reason: 'NO_COOKIE' };
  const verdict = manager.verify(cookie);
  if (!verdict.ok) return verdict;
  if (!SAFE_METHODS.has(String(req.method || 'GET').toUpperCase())) {
    if (req.headers?.[OWNER_SESSION_CSRF_HEADER] !== '1') return { ok: false, reason: 'CSRF_HEADER_MISSING' };
    const origin = req.headers?.origin;
    if (origin) {
      const host = String(req.headers?.host || '');
      let originHost = '';
      try { originHost = new URL(origin).host; } catch { return { ok: false, reason: 'BAD_ORIGIN' }; }
      if (originHost !== host) return { ok: false, reason: 'CROSS_ORIGIN' };
    }
  }
  return verdict;
};
