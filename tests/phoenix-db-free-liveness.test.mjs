import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../server-core.mjs', import.meta.url), 'utf8');
const railway = JSON.parse(readFileSync(new URL('../railway.json', import.meta.url), 'utf8'));
const handler = source.slice(source.indexOf('export const requestHandler ='));
const route = /if \(method === 'GET' && url\.pathname === '\/api\/live'\) \{\s*return json\(res, 200, \{ ok: true, kind: 'liveness' \}\);\s*\}/;

test('liveness is an explicit DB-free route before cookie/session restoration', () => {
  assert.equal((handler.match(/url\.pathname === '\/api\/live'/g) || []).length, 1);
  assert.match(handler, route);
  assert.ok(handler.indexOf("url.pathname === '/api/live'") < handler.indexOf('parseCookies('));
  const body = handler.match(route)[0];
  assert.doesNotMatch(body, /\b(store|queue|database|await)\b/);
});

test('liveness returns success without a queue or database dependency', () => {
  const match = handler.match(route);
  assert.ok(match);
  const execute = new Function('method', 'url', 'res', 'json',
    '"use strict"; ' + match[0] + '; return null;');
  const json = (_res, status, payload) => ({ status, payload });
  assert.deepEqual(execute('GET', { pathname: '/api/live' }, {}, json),
    { status: 200, payload: { ok: true, kind: 'liveness' } });
  assert.equal(execute('POST', { pathname: '/api/live' }, {}, json), null);
  assert.equal(execute('GET', { pathname: '/api/health' }, {}, json), null);
});

test('existing database-backed readiness is preserved for deployment', () => {
  assert.match(handler, /url\.pathname === '\/api\/health'/);
  assert.match(handler, /queue\.pausedState\(\), queue\.liveWorkers\(\), queue\.stats\(\)/);
  assert.equal(railway.deploy.healthcheckPath, '/api/health');
});
