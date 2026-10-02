import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ADMIN_TOKEN = 'a-strong-admin-token-value-000000000000';
let handler; let dataDir;
test.before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'uberbond-economics-'));
  Object.assign(process.env, { PROCESS_ROLE: 'web', STORE_BACKEND: 'json', DATA_DIR: dataDir, APP_BASE_URL: 'http://127.0.0.1:9999', ADMIN_TOKEN, NODE_ENV: 'test' });
  ({ requestHandler: handler } = await import('../server.mjs'));
});
test.after(async () => { if (dataDir) await rm(dataDir, { recursive: true, force: true }); });
async function call(url, token) {
  const res = { status: null, body: '' };
  res.writeHead = s => { res.status = s; }; res.end = b => { res.body = b || ''; };
  await handler({ method: 'GET', url, headers: token ? { authorization: `Bearer ${token}` } : {}, async *[Symbol.asyncIterator]() {} }, res);
  return res;
}

test('economics is admin-only', async () => {
  assert.equal((await call('/api/outreach/economics')).status, 401);
});

test('an empty production ledger reports zero counts, UNKNOWN costs and no cleared revenue, with no authority', async () => {
  const res = await call('/api/outreach/economics', ADMIN_TOKEN);
  assert.equal(res.status, 200);
  const s = JSON.parse(res.body);
  assert.equal(s.counts.providerConfirmedSends, 0);
  assert.equal(s.revenue.status, 'NONE_CLEARED');
  assert.equal(s.contributionStatus, 'UNKNOWN');
  assert.equal(s.unitEconomics.costPerClearedDollarCents.value, null);
  assert.equal(s.sendAuthority, false);
  assert.equal(s.readOnly, true);
});
