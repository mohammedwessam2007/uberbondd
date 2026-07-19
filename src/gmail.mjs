import crypto from 'node:crypto';
import { encryptJson, decryptJson } from './crypto.mjs';

const scopes = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send'];

export class GmailProviderError extends Error {
  constructor(code, { status = 0, ambiguous = true } = {}) {
    super(code);
    this.name = 'GmailProviderError';
    this.code = code;
    this.status = Number(status || 0);
    this.ambiguous = ambiguous;
  }
}

function requireNetwork(cfg = {}) {
  if (cfg.allowNetwork !== true || process.env.NODE_ENV === 'test' || String(process.env.CI || '').toLowerCase() === 'true') {
    throw new GmailProviderError('gmail-network-disabled-in-test', { ambiguous: false });
  }
}

function cleanHeader(value = '', maximum = 998) {
  return String(value || '').replace(/[\r\n\0]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum);
}

function encodedSubject(value = '') {
  const clean = cleanHeader(value, 160);
  return /[^\x20-\x7e]/.test(clean) ? `=?UTF-8?B?${Buffer.from(clean).toString('base64')}?=` : clean;
}

function safeOneClickUrl(value = '') {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : '';
  } catch { return ''; }
}

const b64url = value => Buffer.from(value).toString('base64url');

export function buildRawMessage(message = {}) {
  const headers = [
    `From: ${cleanHeader(message.from, 320)}`,
    `To: ${cleanHeader(message.to, 320)}`,
    `Subject: ${encodedSubject(message.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit'
  ];
  const replyToId = cleanHeader(message.replyToId, 500);
  if (replyToId) headers.push(`In-Reply-To: ${replyToId}`, `References: ${replyToId}`);
  const listUnsubscribe = safeOneClickUrl(message.listUnsubscribe);
  if (listUnsubscribe) {
    headers.push(`List-Unsubscribe: <${listUnsubscribe}>`, 'List-Unsubscribe-Post: List-Unsubscribe=One-Click');
  }
  const body = String(message.body || '').replace(/\r?\n/g, '\r\n');
  return `${headers.join('\r\n')}\r\n\r\n${body}`;
}

export function googleAuthUrl(cfg, state) {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  Object.entries({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state
  }).forEach(([key, value]) => u.searchParams.set(key, value));
  return u.href;
}

function signedValue(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createOAuthState(slot, secret, currentTime = Date.now(), nonce = crypto.randomBytes(18).toString('base64url')) {
  if (!['A', 'B'].includes(slot) || String(secret || '').length < 32) throw new GmailProviderError('gmail-oauth-state-not-configured', { ambiguous: false });
  const payload = b64url(JSON.stringify({ slot, issuedAt: Number(currentTime), nonce: cleanHeader(nonce, 120) }));
  return `${payload}.${signedValue(payload, secret)}`;
}

export function verifyOAuthState(value, secret, currentTime = Date.now(), maximumAgeMs = 10 * 60 * 1000) {
  const [payload, signature] = String(value || '').split('.');
  if (!payload || !signature || String(secret || '').length < 32) return null;
  const expected = signedValue(payload, secret);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const age = Number(currentTime) - Number(parsed.issuedAt);
    if (!['A', 'B'].includes(parsed.slot) || !parsed.nonce || age < 0 || age > maximumAgeMs) return null;
    return { slot: parsed.slot, issuedAt: Number(parsed.issuedAt), nonce: parsed.nonce };
  } catch { return null; }
}

async function tokenRequest(cfg, body) {
  requireNetwork(cfg);
  let res;
  try {
    res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body)
    });
  } catch {
    throw new GmailProviderError('google-token-transport-uncertain');
  }
  if (!res.ok) throw new GmailProviderError(`google-token-http-${res.status}`, { status: res.status, ambiguous: false });
  return res.json();
}

export async function exchangeCode(cfg, code) {
  return tokenRequest(cfg, { code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri, grant_type: 'authorization_code' });
}

export async function refresh(cfg, refreshToken) {
  return tokenRequest(cfg, { refresh_token: refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: 'refresh_token' });
}

export function sealTokens(tokens, key) { return encryptJson(tokens, key); }
export function openTokens(blob, key) { return decryptJson(blob, key); }

async function accessToken(cfg, account, key) {
  const tokens = openTokens(account.tokens, key);
  if (tokens.access_token && tokens.expires_at > Date.now() + 60000) return { token: tokens.access_token, tokens };
  if (!tokens.refresh_token) throw new GmailProviderError('gmail-refresh-token-missing', { ambiguous: false });
  const fresh = await refresh(cfg, tokens.refresh_token);
  const merged = { ...tokens, ...fresh, expires_at: Date.now() + (fresh.expires_in || 3600) * 1000 };
  return { token: merged.access_token, tokens: merged };
}

async function gmail(cfg, account, key, path, options = {}) {
  requireNetwork(cfg);
  const auth = await accessToken(cfg, account, key);
  let res;
  try {
    res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
      ...options,
      headers: { ...(options.headers || {}), authorization: `Bearer ${auth.token}` }
    });
  } catch {
    throw new GmailProviderError('gmail-transport-uncertain');
  }
  if (!res.ok) throw new GmailProviderError(`gmail-http-${res.status}`, { status: res.status, ambiguous: false });
  return { data: res.status === 204 ? null : await res.json(), tokens: auth.tokens };
}

export async function getProfile(cfg, account, key) { return gmail(cfg, account, key, 'profile'); }

export async function sendEmail(cfg, account, key, message) {
  const raw = b64url(buildRawMessage(message));
  return gmail(cfg, account, key, 'messages/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ raw, threadId: cleanHeader(message.threadId, 300) || undefined })
  });
}

export async function listMessages(cfg, account, key, query, maxResults = 50) {
  const qs = new URLSearchParams({ q: query, maxResults: String(maxResults) });
  return gmail(cfg, account, key, `messages?${qs}`);
}

export async function getMessage(cfg, account, key, id) {
  return gmail(cfg, account, key, `messages/${encodeURIComponent(id)}?format=full`);
}

export function parseGmailMessage(message) {
  const headers = Object.fromEntries((message.payload?.headers || []).map(header => [header.name.toLowerCase(), header.value]));
  const collect = part => {
    if (part.mimeType === 'text/plain' && part.body?.data) return Buffer.from(part.body.data, 'base64url').toString('utf8');
    return (part.parts || []).map(collect).join('\n');
  };
  return {
    id: message.id,
    threadId: message.threadId,
    from: headers.from || '',
    to: headers.to || '',
    subject: headers.subject || '',
    messageId: headers['message-id'] || '',
    inReplyTo: headers['in-reply-to'] || '',
    autoSubmitted: headers['auto-submitted'] || '',
    date: headers.date || '',
    body: collect(message.payload || {}) || message.snippet || ''
  };
}

export function createTestGmailAdapter() {
  const records = [];
  return {
    kind: 'test',
    async sendEmail(_cfg, _account, _key, message) {
      const sequence = records.length + 1;
      const id = `test-gmail-${sequence}`;
      const threadId = cleanHeader(message.threadId, 300) || `test-thread-${sequence}`;
      const messageId = `<test-message-${sequence}@gmail.invalid>`;
      records.push({ id, threadId, messageId, raw: buildRawMessage(message), simulated: true });
      return { data: { id, threadId }, simulated: true };
    },
    async getMessage(_cfg, _account, _key, id) {
      const record = records.find(item => item.id === id);
      if (!record) throw new GmailProviderError('test-message-not-found', { ambiguous: false });
      return { data: { id: record.id, threadId: record.threadId, payload: { headers: [{ name: 'Message-ID', value: record.messageId }] } }, simulated: true };
    },
    async listMessages() { return { data: { messages: [] }, simulated: true }; },
    async getProfile() { return { data: { emailAddress: 'test-sender@gmail.invalid' }, simulated: true }; },
    inspect() { return structuredClone(records); }
  };
}
