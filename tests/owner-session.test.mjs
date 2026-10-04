import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createOwnerSessionManager, authorizeOwnerCookie, cookieHeader, clearCookieHeader, parseCookies,
  OWNER_SESSION_COOKIE, OWNER_SESSION_CSRF_HEADER, OWNER_SESSION_ABSOLUTE_MS, OWNER_SESSION_IDLE_MS
} from '../src/owner-session.mjs';

const TOKEN = 'a-very-long-admin-token-for-owner-session-tests-0001';
const clock = start => { let t = start; return { now: () => t, advance: ms => { t += ms; } }; };
const req = (value, { method = 'GET', headers = {} } = {}) => ({ method, headers: { cookie: value ? `${OWNER_SESSION_COOKIE}=${value}` : '', host: 'app.example', ...headers } });

test('issued session verifies and carries no secret material', () => {
  const m = createOwnerSessionManager({ adminToken: TOKEN });
  const s = m.issue();
  assert.equal(s.ok, true);
  assert.equal(s.value.includes(TOKEN), false);
  assert.equal(m.verify(s.value).ok, true);
});

test('disabled without a strong admin token (fail closed)', () => {
  const m = createOwnerSessionManager({ adminToken: '' });
  assert.equal(m.issue().ok, false);
  assert.equal(m.verify('a.b').ok, false);
});

test('tampered, truncated, and foreign-key cookies are refused', () => {
  const m = createOwnerSessionManager({ adminToken: TOKEN });
  const other = createOwnerSessionManager({ adminToken: TOKEN + 'x' });
  const s = m.issue();
  const [body, sig] = s.value.split('.');
  const forgedBody = Buffer.from(JSON.stringify({ ...s.payload, iat: s.payload.iat + 1 })).toString('base64url');
  assert.equal(m.verify(`${forgedBody}.${sig}`).reason, 'BAD_SIGNATURE');
  assert.equal(m.verify(body).reason, 'MALFORMED');
  assert.equal(m.verify(`${body}.${sig}.zz`).reason, 'MALFORMED');
  assert.equal(other.verify(s.value).reason, 'BAD_SIGNATURE');
});

test('rotating ADMIN_TOKEN revokes all sessions', () => {
  const s = createOwnerSessionManager({ adminToken: TOKEN }).issue();
  assert.equal(createOwnerSessionManager({ adminToken: TOKEN + '2' }).verify(s.value).ok, false);
});

test('absolute and idle expiry; sliding refresh extends idle only', () => {
  const c = clock(1_000_000);
  const m = createOwnerSessionManager({ adminToken: TOKEN, now: c.now });
  const s = m.issue();
  c.advance(OWNER_SESSION_IDLE_MS - 1000);
  const v = m.verify(s.value);
  assert.equal(v.ok, true);
  const refreshed = m.refreshed(v.payload);
  c.advance(OWNER_SESSION_IDLE_MS - 1000);
  assert.equal(m.verify(refreshed).ok, true);
  assert.equal(m.verify(s.value).reason, 'EXPIRED_IDLE');
  // keep refreshing past the absolute cap: must still die
  let cur = refreshed;
  while (c.now() - 1_000_000 < OWNER_SESSION_ABSOLUTE_MS + 1000) {
    c.advance(OWNER_SESSION_IDLE_MS / 2);
    const r = m.verify(cur);
    if (!r.ok) { assert.equal(r.reason, 'EXPIRED_ABSOLUTE'); return; }
    cur = m.refreshed(r.payload);
  }
  assert.equal(m.verify(cur).reason, 'EXPIRED_ABSOLUTE');
});

test('future-dated cookie refused', () => {
  const c = clock(5_000_000);
  const m = createOwnerSessionManager({ adminToken: TOKEN, now: c.now });
  const s = m.issue();
  const early = createOwnerSessionManager({ adminToken: TOKEN, now: () => 5_000_000 - 3600_000 });
  assert.equal(early.verify(s.value).reason, 'FUTURE_DATED');
});

test('revocation kills only that session, including its refreshed forms', () => {
  const m = createOwnerSessionManager({ adminToken: TOKEN });
  const a = m.issue(); const b = m.issue();
  m.revoke(a.sid);
  assert.equal(m.verify(a.value).reason, 'REVOKED');
  assert.equal(m.verify(m.refreshed(a.payload)).reason, 'REVOKED');
  assert.equal(m.verify(b.value).ok, true);
});

test('GET with cookie passes; mutating methods need CSRF header', () => {
  const m = createOwnerSessionManager({ adminToken: TOKEN });
  const s = m.issue();
  assert.equal(authorizeOwnerCookie(m, req(s.value)).ok, true);
  assert.equal(authorizeOwnerCookie(m, req(s.value, { method: 'POST' })).reason, 'CSRF_HEADER_MISSING');
  assert.equal(authorizeOwnerCookie(m, req(s.value, { method: 'POST', headers: { [OWNER_SESSION_CSRF_HEADER]: '1' } })).ok, true);
});

test('cross-origin and malformed Origin refused on mutations', () => {
  const m = createOwnerSessionManager({ adminToken: TOKEN });
  const s = m.issue();
  const h = origin => req(s.value, { method: 'POST', headers: { [OWNER_SESSION_CSRF_HEADER]: '1', origin } });
  assert.equal(authorizeOwnerCookie(m, h('https://evil.example')).reason, 'CROSS_ORIGIN');
  assert.equal(authorizeOwnerCookie(m, h('not a url')).reason, 'BAD_ORIGIN');
  assert.equal(authorizeOwnerCookie(m, h('https://app.example')).ok, true);
});

test('no cookie / garbage cookie refused', () => {
  const m = createOwnerSessionManager({ adminToken: TOKEN });
  assert.equal(authorizeOwnerCookie(m, req('')).reason, 'NO_COOKIE');
  assert.equal(authorizeOwnerCookie(m, req('garbage')).ok, false);
});

test('cookie flags: HttpOnly, SameSite=Strict, Secure unless local', () => {
  const h = cookieHeader('v');
  assert.match(h, /HttpOnly/); assert.match(h, /SameSite=Strict/); assert.match(h, /Secure/);
  assert.doesNotMatch(cookieHeader('v', { secure: false }), /Secure/);
  assert.match(clearCookieHeader(), /Max-Age=0/);
  assert.deepEqual(parseCookies('a=1; ub_owner=xyz; b=2'), { a: '1', ub_owner: 'xyz', b: '2' });
});

const server = readFileSync(new URL('../server-core.mjs', import.meta.url), 'utf8');
const shim = readFileSync(new URL('../public/owner-session.js', import.meta.url), 'utf8');

test('server wiring: login requires the real bearer, is rate limited, and sessions add no authority', () => {
  assert.match(server, /owner-session\/login[\s\S]{0,400}ownerLoginLimited[\s\S]{0,300}if \(!bearerOk\(req\)\) return json\(res, 401/);
  assert.match(server, /if \(safeEqual\(bearer, config\.adminToken\)\) return true;\s*return authorizeOwnerCookie/);
  assert.match(server, /authorityWidening: false/);
});

test('client shim never persists or reads the credential outside memory', () => {
  assert.doesNotMatch(shim, /localStorage|sessionStorage|document\.cookie|indexedDB/);
  assert.doesNotMatch(shim, /searchParams\.(set|append)/);
});
