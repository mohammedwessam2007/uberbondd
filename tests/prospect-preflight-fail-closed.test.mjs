import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The shared auth() treats "no ADMIN_TOKEN configured" as open. These read
// routes reveal who has been contacted and who is suppressed, so they must stay
// closed in that configuration instead of inheriting it.
let handler; let dataDir;
test.before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'uberbond-preflight-open-'));
  delete process.env.ADMIN_TOKEN;
  Object.assign(process.env, { PROCESS_ROLE: 'web', STORE_BACKEND: 'json', DATA_DIR: dataDir, APP_BASE_URL: 'http://127.0.0.1:9999', NODE_ENV: 'test' });
  ({ requestHandler: handler } = await import('../server.mjs'));
});
test.after(async () => { if (dataDir) await rm(dataDir, { recursive: true, force: true }); });
async function call(url, { method = 'GET', body } = {}) {
  const res = { status: null, body: '' };
  res.writeHead = s => { res.status = s; }; res.end = b => { res.body = b || ''; };
  await handler({ method, url, headers: {}, async *[Symbol.asyncIterator]() { if (body !== undefined) yield Buffer.from(body); } }, res);
  return { status: res.status, json: (() => { try { return JSON.parse(res.body); } catch { return null; } })() };
}

test('with no admin token configured the contact-history read, the preflight and the fleet plan all refuse and report nothing clean', async () => {
  const history = await call('/api/prospect-preflight/contact-history?email=hello%40agency.example');
  assert.equal(history.status, 503);
  assert.equal(history.json.status, 'CHECK_FAILED');
  assert.notEqual(history.json.status, 'CLEAN');
  const preflight = await call('/api/prospect-preflight', { method: 'POST', body: '{}' });
  assert.equal(preflight.status, 503);
  assert.notEqual(preflight.json.state, 'READY_FOR_AUTHORIZATION');
  assert.equal((await call('/api/outbound/fleet/expansion-plan', { method: 'POST', body: '{}' })).status, 503);
});
