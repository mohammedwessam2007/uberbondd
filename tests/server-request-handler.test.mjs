import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The companion to tests/server-http-surface.test.mjs, and the reason the handler
// was extracted.
//
// That suite spawns the process and proves the surface an anonymous caller sees.
// It cannot cheaply go deeper: every assertion costs a socket round trip, and
// the authenticated paths need a running store to say anything interesting.
//
// This one drives requests straight through the exported handler. No port is
// bound and no request leaves the process, so the authenticated half of the
// server -- the half that actually does things -- becomes testable at the price
// of a function call.
//
// Importing server.mjs still validates config and initializes a store, which is
// why the environment is set before the dynamic import below. Listening and the
// signal handlers are guarded behind the entry-point check, so the import does
// not start a server.

const ADMIN_TOKEN = 'a-strong-admin-token-value-000000000000';
let handler;
let coreHandler;
let dataDir;

test.before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'uberbond-handler-'));
  process.env.PROCESS_ROLE = 'web';
  process.env.STORE_BACKEND = 'json';
  process.env.DATA_DIR = dataDir;
  process.env.APP_BASE_URL = 'http://127.0.0.1:9999';
  process.env.ADMIN_TOKEN = ADMIN_TOKEN;
  process.env.NODE_ENV = 'test';
  ({ requestHandler: handler } = await import('../server.mjs'));
  ({ requestHandler: coreHandler } = await import('../server-core.mjs'));
});

test.after(async () => {
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

function response() {
  const res = { status: null, headers: {}, body: '' };
  res.writeHead = (status, headers) => { res.status = status; res.headers = headers || {}; };
  res.end = body => { res.body = body || ''; };
  return res;
}

async function call(url, { method = 'GET', token, body, headers = {} } = {}) {
  const res = response();
  const request = {
    method,
    url,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    // The handler reads a body by async-iterating the request.
    async *[Symbol.asyncIterator]() { if (body !== undefined) yield Buffer.from(body); }
  };
  await handler(request, res);
  return res;
}

const json = res => { try { return JSON.parse(res.body); } catch { return null; } };

test('the handler is exported and usable without binding a port', () => {
  assert.equal(typeof handler, 'function');
});

test('the core handler remains a named export usable without binding a port', () => {
  assert.equal(typeof coreHandler, 'function',
    'server-core.mjs must keep its named requestHandler export; wrapper capture is not a substitute for a directly reachable handler');
});

test('an authenticated read answers, an unauthenticated one does not', async () => {
  const anonymous = await call('/api/summary');
  assert.equal(anonymous.status, 401);

  const authenticated = await call('/api/summary', { token: ADMIN_TOKEN });
  assert.equal(authenticated.status, 200);
  assert.ok(json(authenticated), 'an authenticated summary must be JSON');
});

// Every admin read, with a good token. This is the half the spawned surface gate
// cannot reach cheaply, and where a routing mistake would actually show.
test('every admin read answers with a valid token', async () => {
  const failures = [];
  for (const route of ['/api/summary', '/api/campaigns', '/api/export.json', '/api/export.csv', '/api/discovery/config']) {
    const res = await call(route, { token: ADMIN_TOKEN });
    if (res.status !== 200) failures.push(`${route} -> ${res.status} ${res.body.slice(0, 80)}`);
  }
  assert.deepEqual(failures, []);
});

// A token is not a licence to use any verb on any route.
test('a valid token does not relax method discipline', async () => {
  const wrongVerb = [];
  for (const [route, method] of [
    ['/api/summary', 'DELETE'],
    ['/api/campaigns', 'PATCH'],
    ['/api/export.json', 'POST'],
    ['/api/discovery/config', 'DELETE']
  ]) {
    const res = await call(route, { method, token: ADMIN_TOKEN });
    if (res.status === 200) wrongVerb.push(`${method} ${route} was served`);
  }
  assert.deepEqual(wrongVerb, [], 'an authenticated caller still may not use any verb');
});

// The error mapping is small, pure and security-relevant: it decides whether a
// caller learns "you asked too often", "this is switched off", or nothing at all.
test('a malformed authenticated request is a client error, never a 500', async () => {
  const surprises = [];
  // `null` is the one that mattered. It is valid JSON, so it parsed cleanly and
  // then threw a TypeError on the first property access -- a caller's mistake
  // surfacing as a 500, producible at will with a one-word body. Every other
  // non-object shape had the same route into the handler.
  for (const [route, body] of [
    ['/api/campaigns', '{'],
    ['/api/campaigns', 'null'],
    ['/api/campaigns', '[]'],
    ['/api/campaigns', '42'],
    ['/api/campaigns', '"a string"'],
    ['/api/campaigns', 'true'],
    ['/api/suppress', 'null'],
    ['/api/suppress', '{}'],
    ['/api/prospects/import', 'null'],
    ['/api/prospects/import', '{"prospects":"not-an-array"}']
  ]) {
    const res = await call(route, { method: 'POST', token: ADMIN_TOKEN, body });
    if (res.status >= 500) surprises.push(`POST ${route} with ${body} -> ${res.status}`);
  }
  assert.deepEqual(surprises, [],
    'bad input from an authenticated caller is their mistake, not a server fault');
});

// A non-object body is refused with a message that says so, rather than being
// coerced into an empty object and quietly creating something.
test('a non-object JSON body is refused, not coerced into a default', async () => {
  const before = json(await call('/api/campaigns', { token: ADMIN_TOKEN })) || [];
  for (const body of ['null', '[]', '42', '"a string"', 'true']) {
    const res = await call('/api/campaigns', { method: 'POST', token: ADMIN_TOKEN, body });
    assert.equal(res.status, 400, `a body of ${body} must be refused`);
    assert.match(res.body, /must be an object/);
  }
  const after = json(await call('/api/campaigns', { token: ADMIN_TOKEN })) || [];
  assert.equal(after.length, before.length,
    'a refused body must not have created a campaign on the way through');
});

test('an error response never carries a stack trace, an internal path, or the token', async () => {
  const leaks = [];
  for (const [route, options] of [
    ['/api/summary', {}],
    ['/api/campaigns', { method: 'POST', token: ADMIN_TOKEN, body: '{' }],
    ['/does-not-exist', {}],
    ['/api/summary', { token: 'Bearer-shaped-but-wrong' }]
  ]) {
    const res = await call(route, options);
    const body = res.body || '';
    if (/node:internal|\/home\/|at Object\.|at async /.test(body)) leaks.push(`${route}: stack or path`);
    if (body.includes(ADMIN_TOKEN)) leaks.push(`${route}: token echoed`);
  }
  assert.deepEqual(leaks, []);
});

// Security headers are set once in a shared object and applied by the json/text
// helpers. A route that built its own reply would skip them silently.
test('every response carries the security headers, whatever its status', async () => {
  const missing = [];
  for (const [route, options] of [
    ['/api/health', {}],
    ['/api/summary', {}],
    ['/api/summary', { token: ADMIN_TOKEN }],
    ['/does-not-exist', {}],
    ['/api/campaigns', { method: 'POST', token: ADMIN_TOKEN, body: '{' }]
  ]) {
    const res = await call(route, options);
    for (const header of ['x-content-type-options', 'x-frame-options', 'referrer-policy', 'cache-control']) {
      if (!res.headers[header]) missing.push(`${route} (${res.status}) missing ${header}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('the public surface stays reachable without a token', async () => {
  for (const route of ['/api/health', '/api/public/config']) {
    const res = await call(route);
    assert.equal(res.status, 200, `${route} must answer anonymously`);
  }
});

// An unknown route under an authenticated prefix must not become a 200 by
// accident of prefix matching.
test('an unknown path under an admin prefix is not served', async () => {
  for (const route of ['/api/definitely-not-a-route', '/api/prospects/', '/api/jobs/']) {
    const res = await call(route, { token: ADMIN_TOKEN });
    assert.notEqual(res.status, 200, `${route} must not be served`);
  }
});
