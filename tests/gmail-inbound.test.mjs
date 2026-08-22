import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INBOUND_SCOPES, GmailInboundError, inboundAuthUrl, boundMessageLimit,
  createGmailInboundReader, createTestGmailInboundReader, sealInboundTokens
} from '../src/gmail-inbound.mjs';

const KEY = '11'.repeat(32);
const activeAccount = () => ({ tokens: sealInboundTokens({ access_token: 'access', expires_at: Date.now() + 3600000 }, KEY) });
const response = (json, opts = {}) => ({
  ok: opts.ok ?? true,
  status: opts.status ?? 200,
  headers: { get: name => name.toLowerCase() === 'content-length' ? opts.contentLength ?? null : null },
  body: opts.body,
  text: async () => typeof json === 'string' ? json : JSON.stringify(json)
});

test('Gmail inbound OAuth scope is exactly gmail.readonly', () => {
  assert.deepEqual([...INBOUND_SCOPES], ['https://www.googleapis.com/auth/gmail.readonly']);
  const url = new URL(inboundAuthUrl({ clientId: 'c', redirectUri: 'https://example.invalid/cb' }, 'state'));
  assert.equal(url.searchParams.get('scope'), 'https://www.googleapis.com/auth/gmail.readonly');
});

test('reader is structurally read-only', () => {
  const reader = createGmailInboundReader();
  assert.deepEqual(Object.keys(reader).sort(), ['getMessage', 'getProfile', 'listMessages']);
  for (const key of ['send', 'sendEmail', 'draft', 'reply', 'forward', 'modify', 'delete', 'trash']) assert.equal(key in reader, false);
  assert.equal(Object.isFrozen(reader), true);
});

test('test reader is also structurally read-only', () => {
  const reader = createTestGmailInboundReader();
  assert.deepEqual(Object.keys(reader).sort(), ['getMessage', 'getProfile', 'listMessages']);
  assert.equal('sendEmail' in reader, false);
});

test('network is disabled by default', async () => {
  const reader = createGmailInboundReader({ allowNetwork: false });
  await assert.rejects(() => reader.getProfile(activeAccount(), KEY), error => error instanceof GmailInboundError && error.code === 'gmail-inbound-network-disabled');
});

test('message limit clamps hostile input', () => {
  assert.equal(boundMessageLimit(0), 1);
  assert.equal(boundMessageLimit(-50), 1);
  assert.equal(boundMessageLimit(999999), 500);
  assert.equal(boundMessageLimit(Infinity), 50);
  assert.equal(boundMessageLimit('10'), 10);
});

test('reader uses GET for Gmail API reads', async () => {
  const calls = [];
  const reader = createGmailInboundReader({ allowNetwork: true, fetch: async (url, init) => { calls.push({ url, init }); return response({ emailAddress: 'x@example.invalid' }); } });
  const value = await reader.getProfile(activeAccount(), KEY);
  assert.equal(value.emailAddress, 'x@example.invalid');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^https:\/\/gmail\.googleapis\.com\/gmail\/v1\/users\/me\/profile$/);
  assert.equal(calls[0].init.method, 'GET');
});

test('declared oversized response is rejected before parse', async () => {
  const reader = createGmailInboundReader({ allowNetwork: true, maxResponseBytes: 10, fetch: async () => response({}, { contentLength: '100' }) });
  await assert.rejects(() => reader.getProfile(activeAccount(), KEY), error => error.code === 'gmail-inbound-response-too-large');
});

test('actual oversized non-stream response is rejected', async () => {
  const reader = createGmailInboundReader({ allowNetwork: true, maxResponseBytes: 10, fetch: async () => response('12345678901') });
  await assert.rejects(() => reader.getProfile(activeAccount(), KEY), error => error.code === 'gmail-inbound-response-too-large');
});

test('malformed JSON is rejected', async () => {
  const reader = createGmailInboundReader({ allowNetwork: true, fetch: async () => response('{bad json') });
  await assert.rejects(() => reader.getProfile(activeAccount(), KEY), error => error.code === 'gmail-inbound-invalid-json');
});
