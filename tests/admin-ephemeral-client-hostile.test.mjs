import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const admin = readFileSync(new URL('../public/admin.js', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const serverCore = readFileSync(new URL('../server-core.mjs', import.meta.url), 'utf8');

function assertAbsent(source, pattern, message) {
  assert.equal(pattern.test(source), false, message);
}

function extractConstFunction(source, name) {
  const marker = `const ${name} = req => {`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${name} function must exist`);
  const bodyStart = start + marker.length;
  const end = source.indexOf('\n};', bodyStart);
  assert.notEqual(end, -1, `${name} function must have a bounded body`);
  return source.slice(bodyStart, end);
}

test('admin bearer is never persisted in browser application storage', () => {
  assertAbsent(admin, /localStorage\s*\.|localStorage\[|sessionStorage\s*\.|sessionStorage\[/,
    'protected admin client still persists state in browser storage');
  assertAbsent(admin, /IndexedDB|indexedDB|CacheStorage|caches\./,
    'protected admin client introduced another persistent browser store');
});

test('protected admin requests never put the bearer into a query URL', () => {
  assertAbsent(admin, /[?&]token=|token=\$\{encodeURIComponent\(token\)\}/,
    'admin bearer is still serialized into a URL/query string');
  assertAbsent(admin, /location\.href\s*=\s*`[^`]*token=/,
    'protected navigation still carries bearer in URL');
});

test('server admin auth accepts bearer header only, never query-token fallback', () => {
  assert.match(server, /headers\.authorization/);
  assert.match(server, /startsWith\(['"]Bearer ['"]\)/);
  assertAbsent(server, /searchParams\.get\(['"]token['"]\)/,
    'server facade still accepts privileged admin token from query string');
});

test('canonical server core cannot resurrect privileged query-token authentication', () => {
  const authBody = extractConstFunction(serverCore, 'auth');
  assert.match(authBody, /req\.headers\.authorization/,
    'canonical auth must source privileged credentials from Authorization');
  assert.match(authBody, /startsWith\(['"]Bearer ['"]\)/,
    'canonical auth must parse Bearer authorization');
  assert.match(authBody, /safeEqual\(bearer\s*,\s*config\.adminToken\)/,
    'canonical auth must compare only the parsed bearer with the admin token');
  assertAbsent(authBody, /URL\s*\(|searchParams|query|req\.url|token\s*=\s*new URL/i,
    'canonical auth must not inspect URL/query material for privileged credentials');
  assertAbsent(serverCore, /const\s+queryToken\s*=\s*new URL\([^\n]+searchParams\.get\(['"]token['"]\)/,
    'canonical server core still accepts the privileged admin bearer from a query string');
  assertAbsent(serverCore, /return\s+safeEqual\(queryToken\s*,\s*config\.adminToken\)/,
    'canonical server core still authenticates privileged requests with the query token');
});

test('public capability-token surfaces remain distinct from privileged admin authentication', () => {
  const authBody = extractConstFunction(serverCore, 'auth');
  assertAbsent(authBody, /unsubscribe|report|artifact|capability/i,
    'privileged auth must not absorb public capability-token semantics');
  assert.match(serverCore, /verifyUnsubscribeToken\(/,
    'public unsubscribe capability-token verification must remain preserved');
  assert.match(serverCore, /\/api\/public\/unsubscribe/,
    'public unsubscribe route must remain preserved');
});

test('admin exports are implemented as authenticated fetch rather than token-bearing navigation', () => {
  assert.match(admin, /fetch\(/, 'admin client must use authenticated fetch');
  assertAbsent(admin, /function\s+download\s*\([^)]*\)\s*\{\s*location\.href/,
    'protected download still uses navigation instead of authenticated fetch');
});

test('Gmail OAuth start cannot serialize the admin bearer into its launch URL', () => {
  assertAbsent(admin, /oauth[^\n]{0,200}[?&]token=|[?&]token=[^\n]{0,200}oauth/i,
    'OAuth start path still embeds admin bearer in URL');
});
