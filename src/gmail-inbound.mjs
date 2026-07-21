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

const DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

function parseContentLength(headers) {
  const raw = headers?.get ? headers.get('content-length') : null;
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// Rejects an oversized response before allocating anything for it: a declared Content-Length over
// the cap is rejected outright, and even without one (or a lying one), a byte-counting stream
// reader aborts as soon as the actual bytes read exceed the cap -- so neither a huge honest
// response nor an adversarial one with a false/missing Content-Length can force unbounded memory
// use or an unbounded JSON.parse. Every awaited chunk read also re-checks the signal, so an
// in-flight bounded read still stops promptly on cancellation, not just at completion.
async function readBoundedJson(res, { signal, maxBytes = DEFAULT_MAX_RESPONSE_BYTES } = {}) {
  const declared = parseContentLength(res.headers);
  if (declared !== null && declared > maxBytes) {
    await res.body?.cancel?.('response-too-large').catch(() => {});
    throw new GmailInboundError('gmail-inbound-response-too-large');
  }
  if (!res.body || typeof res.body.getReader !== 'function') {
    // Fallback for fetch implementations/fixtures without a streamable body -- still bounded, just
    // via a single read instead of incremental chunks.
    const text = await res.text();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new GmailInboundError('gmail-inbound-response-too-large');
    if (!text) return null;
    try { return JSON.parse(text); } catch { throw new GmailInboundError('gmail-inbound-invalid-json'); }
  }
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    signal?.throwIfAborted();
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel('response-too-large').catch(() => {});
      throw new GmailInboundError('gmail-inbound-response-too-large');
    }
    chunks.push(value);
  }
  const text = Buffer.concat(chunks.map(chunk => Buffer.from(chunk))).toString('utf8');
  if (!text) return null;
  try { return JSON.parse(text); } catch { throw new GmailInboundError('gmail-inbound-invalid-json'); }
}

async function tokenRequest(cfg, body, { signal } = {}) {
  requireInboundNetwork(cfg);
  const doFetch = cfg.fetch || fetch;
  const res = await doFetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
    signal
  });
  if (!res.ok) throw new GmailInboundError('gmail-inbound-token-error', { status: res.status });
  return readBoundedJson(res, { signal, maxBytes: cfg.maxResponseBytes });
}

export function sealInboundTokens(tokens, key) { return encryptJson(tokens, key); }
export function openInboundTokens(blob, key) { return decryptJson(blob, key); }

async function inboundAccessToken(cfg, account, key, { signal } = {}) {
  const tokens = openInboundTokens(account.tokens, key);
  if (tokens.access_token && tokens.expires_at > Date.now() + 60000) return { token: tokens.access_token, tokens, refreshed: false };
  const fresh = await tokenRequest(cfg, {
    refresh_token: tokens.refresh_token,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: 'refresh_token'
  }, { signal });
  const merged = { ...tokens, ...fresh, expires_at: Date.now() + (fresh.expires_in || 3600) * 1000 };
  return { token: merged.access_token, tokens: merged, refreshed: true };
}

async function inboundGet(cfg, account, key, path, { signal } = {}) {
  requireInboundNetwork(cfg);
  signal?.throwIfAborted();
  const auth = await inboundAccessToken(cfg, account, key, { signal });
  signal?.throwIfAborted();
  const doFetch = cfg.fetch || fetch;
  const res = await doFetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    method: 'GET',
    headers: { authorization: `Bearer ${auth.token}` },
    signal
  });
  if (!res.ok) throw new GmailInboundError('gmail-inbound-api-error', { status: res.status });
  const data = res.status === 204 ? null : await readBoundedJson(res, { signal, maxBytes: cfg.maxResponseBytes });
  return { data, tokens: auth.tokens, tokenRefreshed: auth.refreshed };
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
    getProfile: (account, key, options = {}) => inboundGet(cfg, account, key, 'profile', options),
    listMessages: (account, key, q, maxResults = 50, pageToken = '', options = {}) => {
      const params = { q: String(q || ''), maxResults: String(boundMessageLimit(maxResults)) };
      if (pageToken) params.pageToken = String(pageToken);
      const qs = new URLSearchParams(params);
      return inboundGet(cfg, account, key, `messages?${qs}`, options);
    },
    getMessage: (account, key, id, options = {}) => inboundGet(cfg, account, key, `messages/${encodeURIComponent(id)}?format=full`, options)
  });
}

// A structurally send-incapable stand-in reader for tests and for any run where
// config.inbound.provider !== 'gmail'. Same shape as createGmailInboundReader's result (frozen,
// no sendEmail key) but never performs network I/O — returns caller-supplied fixture data.
export function createTestGmailInboundReader(fixture = { messagesByPage: [], messages: {} }) {
  let pageIndex = 0;
  return Object.freeze({
    getProfile: async () => ({ data: { emailAddress: 'test@example.invalid' } }),
    listMessages: async () => {
      const page = fixture.messagesByPage[pageIndex] || { messages: [] };
      pageIndex += 1;
      return { data: page };
    },
    getMessage: async (account, key, id) => ({ data: fixture.messages[id] || { id, payload: {} } })
  });
}
