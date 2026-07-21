// Hostile tests for the bounded-HTTP layer in src/gmail-inbound.mjs (P1-12). Uses an injected fake
// fetch (cfg.fetch) rather than real network -- allowNetwork:true only permits calling into the
// fake, it never reaches the real internet, and these tests never set NODE_ENV=test so the
// allowNetwork gate is actually exercised rather than short-circuited.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGmailInboundReader, GmailInboundError } from '../src/gmail-inbound.mjs';
import { sealInboundTokens } from '../src/gmail-inbound.mjs';

const KEY = Buffer.alloc(32, 7).toString('hex');

function freshAccount() {
  const tokens = { access_token: 'live-token', refresh_token: 'refresh-token', expires_at: Date.now() + 3600000 };
  return { id: 'acct-1', tokens: sealInboundTokens(tokens, KEY) };
}

function jsonHeaders(extra = {}) {
  const map = new Map(Object.entries(extra));
  return { get: name => (map.has(name.toLowerCase()) ? map.get(name.toLowerCase()) : null) };
}

function streamBody(bytes) {
  let sent = false;
  return {
    getReader() {
      return {
        async read() {
          if (sent) return { done: true, value: undefined };
          sent = true;
          return { done: false, value: bytes };
        },
        async cancel() {}
      };
    }
  };
}

test('BND: an honest oversized Content-Length is rejected before any body is read', async () => {
  let bodyTouched = false;
  const fakeFetch = async () => ({
    ok: true, status: 200,
    headers: jsonHeaders({ 'content-length': String(50 * 1024 * 1024) }),
    body: { getReader() { bodyTouched = true; throw new Error('must not read body after Content-Length rejection'); } },
    async text() { bodyTouched = true; throw new Error('must not read body after Content-Length rejection'); }
  });
  const reader = createGmailInboundReader({ clientId: 'x', clientSecret: 'y', redirectUri: 'https://example.com/cb', allowNetwork: true, fetch: fakeFetch, maxResponseBytes: 1024 * 1024 });
  await assert.rejects(() => reader.getProfile(freshAccount(), KEY), error => {
    assert.equal(error.code, 'gmail-inbound-response-too-large');
    return true;
  });
  assert.equal(bodyTouched, false);
});

test('BND: a response with no Content-Length but an actually-oversized body is rejected mid-stream', async () => {
  const oversized = Buffer.alloc(2 * 1024 * 1024, 65);
  const fakeFetch = async () => ({ ok: true, status: 200, headers: jsonHeaders(), body: streamBody(oversized) });
  const reader = createGmailInboundReader({ clientId: 'x', clientSecret: 'y', redirectUri: 'https://example.com/cb', allowNetwork: true, fetch: fakeFetch, maxResponseBytes: 1024 * 1024 });
  await assert.rejects(() => reader.getProfile(freshAccount(), KEY), error => {
    assert.equal(error.code, 'gmail-inbound-response-too-large');
    return true;
  });
});

test('BND: invalid JSON in an otherwise-bounded response is a fixed, non-sensitive error code', async () => {
  const body = Buffer.from('{not valid json', 'utf8');
  const fakeFetch = async () => ({ ok: true, status: 200, headers: jsonHeaders(), body: streamBody(body) });
  const reader = createGmailInboundReader({ clientId: 'x', clientSecret: 'y', redirectUri: 'https://example.com/cb', allowNetwork: true, fetch: fakeFetch, maxResponseBytes: 1024 * 1024 });
  await assert.rejects(() => reader.getProfile(freshAccount(), KEY), error => {
    assert.equal(error.code, 'gmail-inbound-invalid-json');
    return true;
  });
});

test('BND: a hanging fetch is aborted promptly via signal rather than hanging the caller forever', async () => {
  const fakeFetch = (url, options) => new Promise((resolve, reject) => {
    options.signal?.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    });
  });
  const reader = createGmailInboundReader({ clientId: 'x', clientSecret: 'y', redirectUri: 'https://example.com/cb', allowNetwork: true, fetch: fakeFetch });
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 30);
  const start = Date.now();
  await assert.rejects(() => reader.getProfile(freshAccount(), KEY, { signal: controller.signal }));
  assert.ok(Date.now() - start < 2000, 'must not hang past the abort');
});

test('BND: a well-formed, in-bounds response still parses correctly through the bounded reader', async () => {
  const payload = JSON.stringify({ emailAddress: 'me@example.invalid' });
  const fakeFetch = async () => ({ ok: true, status: 200, headers: jsonHeaders({ 'content-length': String(Buffer.byteLength(payload)) }), body: streamBody(Buffer.from(payload, 'utf8')) });
  const reader = createGmailInboundReader({ clientId: 'x', clientSecret: 'y', redirectUri: 'https://example.com/cb', allowNetwork: true, fetch: fakeFetch, maxResponseBytes: 1024 * 1024 });
  const result = await reader.getProfile(freshAccount(), KEY);
  assert.deepEqual(result.data, { emailAddress: 'me@example.invalid' });
});
