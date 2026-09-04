import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const admin = readFileSync(new URL('../public/admin.js', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');

function assertAbsent(source, pattern, message) {
  assert.equal(pattern.test(source), false, message);
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
    'server still accepts privileged admin token from query string');
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
