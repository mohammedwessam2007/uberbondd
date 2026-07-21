import { encryptJson, decryptJson } from './crypto.mjs';

// Read-only Gmail capability for P2.2. This file must never export anything that can send, draft,
// reply, forward, modify, or delete a Gmail message, and must never import ./gmail.mjs (which does
// all of that). Every network call here is GET except the OAuth token exchange, which only ever
// talks to Google's token endpoint, never Gmail's API.
export const INBOUND_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

export class GmailInboundError extends Error {
  constructor(code, { status = 0 } = {}) {
    super(code);
    this.name = 'GmailInboundError';
    this.code = code;
    this.status = Number(status || 0);
  }
}

export function inboundAuthUrl(cfg, state) {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  Object.entries({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: INBOUND_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state
  }).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.href;
}

// Fails closed unless the caller explicitly set cfg.allowNetwork === true. Deliberately does not
// look at process.env.CI: CI describes where code is hosted, not whether it may read a mailbox.
// Still blocks NODE_ENV==='test' so automated tests never depend on live external state.
function requireInboundNetwork(cfg = {}) {
  if (cfg.allowNetwork !== true || process.env.NODE_ENV === 'test') {
    throw new GmailInboundError('gmail-inbound-network-disabled');
  }
}

async function tokenRequest(cfg, body) {
  requireInboundNetwork(cfg);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body)
  });
  if (!res.ok) throw new GmailInboundError('gmail-inbound-token-error', { status: res.status });
  return res.json();
}

export function sealInboundTokens(tokens, key) { return encryptJson(tokens, key); }
export function openInboundTokens(blob, key) { return decryptJson(blob, key); }

async function inboundAccessToken(cfg, account, key) {
  const tokens = openInboundTokens(account.tokens, key);
  if (tokens.access_token && tokens.expires_at > Date.now() + 60000) return { token: tokens.access_token, tokens };
  const fresh = await tokenRequest(cfg, {
    refresh_token: tokens.refresh_token,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: 'refresh_token'
  });
  const merged = { ...tokens, ...fresh, expires_at: Date.now() + (fresh.expires_in || 3600) * 1000 };
  return { token: merged.access_token, tokens: merged };
}

async function inboundGet(cfg, account, key, path) {
  requireInboundNetwork(cfg);
  const auth = await inboundAccessToken(cfg, account, key);
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    method: 'GET',
    headers: { authorization: `Bearer ${auth.token}` }
  });
  if (!res.ok) throw new GmailInboundError('gmail-inbound-api-error', { status: res.status });
  return { data: res.status === 204 ? null : await res.json(), tokens: auth.tokens };
}

// Clamps a caller-supplied page size into a safe range regardless of input (huge numbers, zero,
// negative, NaN, Infinity, numeric strings) so a bound is enforced even before any network call.
export function boundMessageLimit(maxResults) {
  const n = Number(maxResults);
  if (!Number.isFinite(n)) return 50;
  return Math.max(1, Math.min(500, Math.trunc(n)));
}

// Returns a frozen object with only read operations. 'sendEmail' in reader is false structurally —
// there is no such key to be missing, not an unset/undefined one.
export function createGmailInboundReader(cfg) {
  return Object.freeze({
    getProfile: (account, key) => inboundGet(cfg, account, key, 'profile'),
    listMessages: (account, key, q, maxResults = 50) => {
      const qs = new URLSearchParams({ q: String(q || ''), maxResults: String(boundMessageLimit(maxResults)) });
      return inboundGet(cfg, account, key, `messages?${qs}`);
    },
    getMessage: (account, key, id) => inboundGet(cfg, account, key, `messages/${encodeURIComponent(id)}?format=full`)
  });
}
