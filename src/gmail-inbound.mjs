import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { encryptJson, decryptJson } from './crypto.mjs';

export const INBOUND_SCOPES = Object.freeze(['https://www.googleapis.com/auth/gmail.readonly']);
const DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

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

function requireInboundNetwork(cfg = {}) {
  if (cfg.allowNetwork !== true || process.env.NODE_ENV === 'test') {
    throw new GmailInboundError('gmail-inbound-network-disabled');
  }
}

function parseContentLength(headers) {
  const raw = headers?.get ? headers.get('content-length') : null;
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

async function readBoundedJson(res, { signal, maxBytes = DEFAULT_MAX_RESPONSE_BYTES } = {}) {
  const declared = parseContentLength(res.headers);
  if (declared !== null && declared > maxBytes) {
    await res.body?.cancel?.('response-too-large').catch(() => {});
    throw new GmailInboundError('gmail-inbound-response-too-large');
  }
  if (!res.body || typeof res.body.getReader !== 'function') {
    const raw = await res.text();
    if (Buffer.byteLength(raw, 'utf8') > maxBytes) throw new GmailInboundError('gmail-inbound-response-too-large');
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { throw new GmailInboundError('gmail-inbound-invalid-json'); }
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
    chunks.push(Buffer.from(value));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { throw new GmailInboundError('gmail-inbound-invalid-json'); }
}

export function sealInboundTokens(tokens, key) { return encryptJson(tokens, key); }
export function openInboundTokens(blob, key) { return decryptJson(blob, key); }

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

async function inboundAccessToken(cfg, account, key, { signal } = {}) {
  const tokens = openInboundTokens(account.tokens, key);
  if (tokens.access_token && tokens.expires_at > Date.now() + 60000) return tokens.access_token;
  const fresh = await tokenRequest(cfg, {
    refresh_token: tokens.refresh_token,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: 'refresh_token'
  }, { signal });
  if (!fresh?.access_token) throw new GmailInboundError('gmail-inbound-token-missing-access-token');
  return fresh.access_token;
}

async function inboundGet(cfg, account, key, path, { signal } = {}) {
  requireInboundNetwork(cfg);
  signal?.throwIfAborted();
  const accessToken = await inboundAccessToken(cfg, account, key, { signal });
  signal?.throwIfAborted();
  const doFetch = cfg.fetch || fetch;
  const res = await doFetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    method: 'GET',
    headers: { authorization: `Bearer ${accessToken}` },
    signal
  });
  if (!res.ok) throw new GmailInboundError('gmail-inbound-api-error', { status: res.status });
  return res.status === 204 ? null : readBoundedJson(res, { signal, maxBytes: cfg.maxResponseBytes });
}

export function boundMessageLimit(maxResults) {
  const n = Number(maxResults);
  if (!Number.isFinite(n)) return 50;
  return Math.max(1, Math.min(500, Math.trunc(n)));
}

// Provider-observation attestation.
//
// Evidence class used to be a string the caller passed in, which meant
// `evidence: 'PROVIDER_OBSERVED'` next to a hand-written message object was
// enough to mint a DIRECT edge in the causal graph -- a fabricated reply
// carrying the same weight as one Gmail actually delivered. Typing a string is
// not an observation.
//
// So the class is now bound to a token only a real read path can produce. The
// secret is generated per process and never leaves it: this is not a defence
// against code running inside this process (nothing in-process can be), it is
// the structural guarantee that PROVIDER_OBSERVED is reachable only by going
// through a reader that actually fetched the message.
const OBSERVATION_SECRET = randomBytes(32);
const OBSERVATION_VERSION = 'gmail-inbound-observation-1';

function observationTag({ provider, providerMessageId, fetchedAt }) {
  return createHmac('sha256', OBSERVATION_SECRET)
    .update(JSON.stringify([OBSERVATION_VERSION, provider, providerMessageId, fetchedAt]))
    .digest('hex');
}

/** Mint an attestation for a message this process actually fetched. */
export function attestProviderObservation({ provider = 'gmail', providerMessageId, fetchedAt } = {}) {
  const id = String(providerMessageId ?? '').trim();
  const at = fetchedAt instanceof Date ? fetchedAt.toISOString() : String(fetchedAt ?? '').trim();
  if (!id || !at) return null;
  const normalizedProvider = String(provider || 'gmail').trim().toLowerCase();
  return Object.freeze({
    version: OBSERVATION_VERSION,
    provider: normalizedProvider,
    providerMessageId: id,
    fetchedAt: at,
    tag: observationTag({ provider: normalizedProvider, providerMessageId: id, fetchedAt: at })
  });
}

/** True only for an attestation this process minted for exactly this message. */
export function verifyProviderObservation(attestation, { provider = 'gmail', providerMessageId } = {}) {
  if (!attestation || typeof attestation !== 'object' || Array.isArray(attestation)) return false;
  if (attestation.version !== OBSERVATION_VERSION) return false;
  const normalizedProvider = String(provider || 'gmail').trim().toLowerCase();
  if (attestation.provider !== normalizedProvider) return false;
  if (attestation.providerMessageId !== String(providerMessageId ?? '').trim()) return false;
  const expected = observationTag({
    provider: attestation.provider,
    providerMessageId: attestation.providerMessageId,
    fetchedAt: attestation.fetchedAt
  });
  const actual = String(attestation.tag ?? '');
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export function createGmailInboundReader(cfg = {}) {
  return Object.freeze({
    getProfile: (account, key, options = {}) => inboundGet(cfg, account, key, 'profile', options),
    listMessages: (account, key, q, maxResults = 50, pageToken = '', options = {}) => {
      const params = { q: String(q || ''), maxResults: String(boundMessageLimit(maxResults)) };
      if (pageToken) params.pageToken = String(pageToken);
      return inboundGet(cfg, account, key, `messages?${new URLSearchParams(params)}`, options);
    },
    getMessage: async (account, key, id, options = {}) => {
      const message = await inboundGet(cfg, account, key, `messages/${encodeURIComponent(id)}?format=full`, options);
      if (!message || typeof message !== 'object') return message;
      // The attestation rides with the message it belongs to, so a caller
      // cannot pair one message's proof with another message's content.
      return {
        ...message,
        providerObservation: attestProviderObservation({
          provider: 'gmail',
          providerMessageId: String(message.id ?? id),
          fetchedAt: new Date()
        })
      };
    }
  });
}

export function createTestGmailInboundReader(fixture = { messagesByPage: [], messages: {} }) {
  let pageIndex = 0;
  return Object.freeze({
    getProfile: async () => ({ emailAddress: 'test@example.invalid' }),
    listMessages: async () => fixture.messagesByPage[pageIndex++] || { messages: [] },
    getMessage: async (account, key, id) => fixture.messages[id] || { id, payload: {} }
  });
}
