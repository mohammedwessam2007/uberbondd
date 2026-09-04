import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = path => fs.readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('protected admin client never persists its bearer or puts it in protected URLs', async () => {
  const source = await read('public/admin.js');
  assert.doesNotMatch(source, /\blocalStorage\b/);
  assert.doesNotMatch(source, /\bsessionStorage\b/);
  assert.doesNotMatch(source, /\bindexedDB\b/);
  assert.doesNotMatch(source, /\bcaches\.open\b|\bCacheStorage\b/);
  assert.doesNotMatch(source, /[?&]token=\$\{encodeURIComponent\(token\)\}/);
  assert.doesNotMatch(source, /oauth\/google\/start\?[^`'"\n]*token=/);
  assert.doesNotMatch(source, /location\.href\s*=\s*`\/api\/export\./);
  assert.match(source, /Authorization|authorization/);
  assert.match(source, /URL\.createObjectURL|createObjectURL/);
  assert.match(source, /URL\.revokeObjectURL|revokeObjectURL/);
});

test('admin server authorization is bearer-only while public capability-token flows remain separate', async () => {
  const source = await read('server.mjs');
  const start = source.indexOf('const auth = req =>');
  const end = source.indexOf('const relayConfigured', start);
  assert.ok(start >= 0 && end > start, 'admin auth function must remain identifiable');
  const adminAuth = source.slice(start, end);
  assert.match(adminAuth, /Bearer /);
  assert.match(adminAuth, /safeEqual\(bearer, config\.adminToken\)/);
  assert.doesNotMatch(adminAuth, /searchParams|get\(['"]token['"]\)|queryToken/);

  // These are deliberately public capability-token surfaces, not the admin
  // bearer. Removing admin query auth must not amputate unsubscribe/report
  // capability URLs.
  assert.match(source, /\/unsubscribe/);
  assert.match(source, /\/api\/public\/unsubscribe/);
  assert.match(source, /\/api\/public\/report\//);
});

test('admin OAuth start is authenticated without carrying the admin bearer in a query string', async () => {
  const client = await read('public/admin.js');
  const server = await read('server.mjs');
  assert.doesNotMatch(client, /oauth\/google\/start\?slot=[AB]&token=/);
  assert.match(server, /googleAuthUrl\(config\.google, state\)/);
  assert.match(server, /oauthStates\.set\(state, \{ slot, created: Date\.now\(\) \}\)/);
});
