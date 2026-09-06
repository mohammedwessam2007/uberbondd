import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// `server.mjs` is 614 lines with 87 branches behind one http.createServer, and
// no gate executed any of it. That was the largest coverage hole in the
// repository, and the reason it stayed open is structural: the handler is an
// inline anonymous function, and importing the module runs validateStartupConfig,
// creates a store, awaits store.init() and can start a scheduler. Nothing can
// reach the routing logic without a running process.
//
// So this gate runs the process. It starts the real server on loopback with a
// throwaway JSON store and PROCESS_ROLE=web, which is the same code production
// runs minus the scheduler, and probes the surface that actually matters: does
// every admin route refuse without a token, does a wrong token get anywhere, and
// do the security headers reach the client.
//
// It makes no external request. Every URL below is 127.0.0.1.
//
// This is a smoke gate, not a substitute for extracting the handler. Extracting
// it stays worth doing -- it would make the branches individually testable
// instead of only reachable through a socket. But a running gate today is worth
// more than a refactor with nothing to catch a mistake in it, and this is the
// net the refactor should be done under.

const ADMIN_TOKEN = 'a-strong-admin-token-value-000000000000';

// Routes that must never answer without an admin token. Not exhaustive of the
// server, deliberately: this is the set whose exposure would matter.
const ADMIN_ROUTES = [
  '/api/summary',
  '/api/campaigns',
  '/api/run',
  '/api/run-monitoring',
  '/api/export.json',
  '/api/export.csv',
  '/api/discovery/config',
  '/api/discovery/run',
  '/api/outbound/pause',
  '/api/outbound/resume',
  '/api/worker/pause',
  '/api/worker/resume',
  '/api/poll-replies',
  '/api/suppress',
  '/api/notifications/read',
  '/api/prospects/import'
];

const PUBLIC_ROUTES = ['/api/health', '/api/public/config', '/unsubscribe'];

const SECURITY_HEADERS = {
  'cache-control': /no-store/,
  'x-content-type-options': /nosniff/,
  'x-frame-options': /DENY/,
  'referrer-policy': /strict-origin-when-cross-origin/,
  'permissions-policy': /camera=\(\)/
};

let child;
let dataDir;
let base;

async function waitForReady(url, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(500) });
      if (response.status) return true;
    } catch { /* not up yet */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return false;
}

test.before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'uberbond-server-surface-'));
  // A high, unlikely port rather than 0: the server reads its port from config,
  // so it cannot report back an OS-assigned one.
  const port = 8700 + Math.floor(Math.random() * 200);
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['server.mjs'], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: String(port),
      PROCESS_ROLE: 'web',
      STORE_BACKEND: 'json',
      DATA_DIR: dataDir,
      APP_BASE_URL: base,
      ADMIN_TOKEN,
      NODE_ENV: 'test'
    }
  });
  const ready = await waitForReady(`${base}/api/health`);
  assert.ok(ready, 'the server must start; if this fails the server is broken, not the test');
});

test.after(async () => {
  child?.kill('SIGTERM');
  await new Promise(resolve => setTimeout(resolve, 200));
  child?.kill('SIGKILL');
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

test('the server starts and serves', async () => {
  const response = await fetch(`${base}/api/health`);
  assert.equal(response.status, 200);
});

test('every admin route refuses without a token', async () => {
  const admitted = [];
  for (const route of ADMIN_ROUTES) {
    const response = await fetch(`${base}${route}`);
    if (response.status !== 401) admitted.push(`${route} -> ${response.status}`);
  }
  assert.deepEqual(admitted, [],
    'an admin route answered something other than 401 to an anonymous caller');
});

test('a wrong token reaches nothing', async () => {
  const admitted = [];
  for (const route of ADMIN_ROUTES) {
    for (const authorization of ['Bearer wrong', `Bearer ${ADMIN_TOKEN}x`, `Bearer ${ADMIN_TOKEN.slice(0, 10)}`, ADMIN_TOKEN]) {
      const response = await fetch(`${base}${route}`, { headers: { authorization } });
      if (response.status !== 401) admitted.push(`${route} with ${authorization.slice(0, 18)} -> ${response.status}`);
    }
  }
  assert.deepEqual(admitted, [], 'a bad token reached an admin route');
});

test('public routes are public, and stay a short list', async () => {
  for (const route of PUBLIC_ROUTES) {
    const response = await fetch(`${base}${route}`);
    assert.equal(response.status, 200, `${route} must answer anonymously`);
  }
});

// These are set once in `baseHeaders` and applied by the json/text helpers. A
// response that skipped them would be a route that built its own reply, which is
// exactly the kind of drift worth catching.
test('security headers reach the client on public and refused responses alike', async () => {
  for (const route of [...PUBLIC_ROUTES, '/api/summary', '/does-not-exist']) {
    const response = await fetch(`${base}${route}`);
    for (const [header, pattern] of Object.entries(SECURITY_HEADERS)) {
      const value = response.headers.get(header);
      assert.ok(value && pattern.test(value),
        `${route} (${response.status}) is missing or weakening ${header}: ${value}`);
    }
  }
});

test('wrapper-owned privileged query-token refusal carries hardening headers', async () => {
  const response = await fetch(`${base}/api/summary?token=forbidden`);
  assert.equal(response.status, 401);
  const expected = {
    'cache-control': /no-store/,
    'x-content-type-options': /nosniff/,
    'x-frame-options': /DENY/,
    'referrer-policy': /no-referrer/
  };
  for (const [header, pattern] of Object.entries(expected)) {
    const value = response.headers.get(header);
    assert.ok(value && pattern.test(value),
      `wrapper-owned refusal is missing or weakening ${header}: ${value}`);
  }
});

test('an unknown path is a plain 404 that describes nothing', async () => {
  const response = await fetch(`${base}/definitely-not-a-route`);
  assert.equal(response.status, 404);
  const body = await response.text();
  assert.equal(/at .*server\.mjs|node:internal|stack/i.test(body), false,
    'a 404 must not carry a stack trace or internal path');
});

// A refusal must not describe the thing it is refusing to serve.
test('a refused admin response leaks no internal detail', async () => {
  const response = await fetch(`${base}/api/summary`);
  const body = await response.text();
  assert.equal(response.status, 401);
  assert.equal(body.includes(ADMIN_TOKEN), false, 'the expected token must never be echoed');
  assert.equal(/node:internal|\/home\/|server\.mjs/.test(body), false,
    'no internal path in a refusal');
});
