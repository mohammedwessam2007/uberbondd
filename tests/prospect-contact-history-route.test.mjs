import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyContactHistorySignature, contactHistoryReceiptUsable } from '../src/prospect-contact-history.mjs';

const ADMIN_TOKEN = 'a-strong-admin-token-value-000000000000';
const KEY = 'c'.repeat(64);
let handler;
let dataDir;

test.before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'uberbond-contact-history-'));
  process.env.PROCESS_ROLE = 'web';
  process.env.STORE_BACKEND = 'json';
  process.env.DATA_DIR = dataDir;
  process.env.APP_BASE_URL = 'http://127.0.0.1:9999';
  process.env.ADMIN_TOKEN = ADMIN_TOKEN;
  process.env.TOKEN_ENCRYPTION_KEY = KEY;
  process.env.NODE_ENV = 'test';
  ({ requestHandler: handler } = await import('../server.mjs'));
});
test.after(async () => { if (dataDir) await rm(dataDir, { recursive: true, force: true }); });

function response() {
  const res = { status: null, headers: {}, body: '' };
  res.writeHead = (status, headers) => { res.status = status; res.headers = headers || {}; };
  res.end = body => { res.body = body || ''; };
  return res;
}
async function call(url, { method = 'GET', token, body } = {}) {
  const res = response();
  await handler({
    method, url, headers: token ? { authorization: `Bearer ${token}` } : {},
    async *[Symbol.asyncIterator]() { if (body !== undefined) yield Buffer.from(body); }
  }, res);
  return res;
}
const json = res => { try { return JSON.parse(res.body); } catch { return null; } };
const route = (email, domain = '') => `/api/prospect-preflight/contact-history?email=${encodeURIComponent(email)}${domain ? `&domain=${encodeURIComponent(domain)}` : ''}`;

test('unauthenticated and wrong-token callers are refused and learn nothing', async () => {
  assert.equal((await call(route('hello@agency.example'))).status, 401);
  assert.equal((await call(route('hello@agency.example'), { token: 'wrong-token-value-000000000000000000' })).status, 401);
});

test('authenticated clean read returns a signed, usable, read-only zero-authority receipt', async () => {
  const res = await call(route('hello@agency.example', 'agency.example'), { token: ADMIN_TOKEN });
  assert.equal(res.status, 200);
  const body = json(res);
  assert.equal(body.status, 'CLEAN');
  assert.equal(body.overallContactHistoryHit, false);
  assert.equal(body.sendAuthority, false);
  assert.equal(body.externalEffects, 0);
  assert.equal(verifyContactHistorySignature(body, KEY), true);
  assert.equal(contactHistoryReceiptUsable(body, { email: 'hello@agency.example', domain: 'agency.example', now: new Date() }).usable, true);
});

test('a real production suppression written through the existing API is found by exact email, domain and suffix', async () => {
  for (const [value, email] of [['hit@exact.example', 'hit@exact.example'], ['domainwide.example', 'x@domainwide.example'], ['@suffix.example', 'y@suffix.example']]) {
    const create = await call('/api/suppress', { method: 'POST', token: ADMIN_TOKEN, body: JSON.stringify({ value, reason: 'manual' }) });
    assert.equal(create.status, 201);
    const body = json(await call(route(email), { token: ADMIN_TOKEN }));
    assert.equal(body.status, 'HIT', value);
    assert.equal(body.overallContactHistoryHit, true);
  }
  const other = json(await call(route('someone@unrelated.example'), { token: ADMIN_TOKEN }));
  assert.equal(other.status, 'CLEAN');
});

test('invalid input is CHECK_FAILED (never clean) and the route is read-only and idempotent', async () => {
  const bad = json(await call(route('not-an-email'), { token: ADMIN_TOKEN }));
  assert.equal(bad.status, 'CHECK_FAILED');
  assert.equal(bad.overallContactHistoryHit, null);
  const mismatch = json(await call(route('a@b.example', 'c.example'), { token: ADMIN_TOKEN }));
  assert.equal(mismatch.status, 'CHECK_FAILED');
  const first = json(await call(route('same@read.example'), { token: ADMIN_TOKEN }));
  const second = json(await call(route('same@read.example'), { token: ADMIN_TOKEN }));
  assert.deepEqual(first.findings, second.findings);
  for (const path of ['/api/outbound-reservations', '/api/outbound-events', '/api/prospects']) {
    assert.deepEqual(json(await call(path, { token: ADMIN_TOKEN })), [], `${path} untouched by reads`);
  }
});

test('the route accepts no write method', async () => {
  const res = await call(route('hello@agency.example'), { method: 'POST', token: ADMIN_TOKEN, body: '{}' });
  assert.notEqual(res.status, 200);
});
