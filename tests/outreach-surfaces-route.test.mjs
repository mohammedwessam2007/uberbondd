import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ADMIN_TOKEN = 'a-strong-admin-token-value-000000000000';
let handler; let dataDir;
test.before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'uberbond-surfaces-'));
  Object.assign(process.env, { PROCESS_ROLE: 'web', STORE_BACKEND: 'json', DATA_DIR: dataDir, APP_BASE_URL: 'http://127.0.0.1:9999', ADMIN_TOKEN, NODE_ENV: 'test' });
  ({ requestHandler: handler } = await import('../server.mjs'));
});
test.after(async () => { if (dataDir) await rm(dataDir, { recursive: true, force: true }); });
async function call(url, { method = 'GET', token, body } = {}) {
  const res = { status: null, body: '' };
  res.writeHead = s => { res.status = s; }; res.end = b => { res.body = b || ''; };
  await handler({ method, url, headers: token ? { authorization: `Bearer ${token}` } : {}, async *[Symbol.asyncIterator]() { if (body !== undefined) yield Buffer.from(body); } }, res);
  return { status: res.status, json: (() => { try { return JSON.parse(res.body); } catch { return null; } })() };
}

test('candidate handoff is admin-only, read-only, bounded, and returns the four canonical offers', async () => {
  assert.equal((await call('/api/prospect-preflight/candidates')).status, 401);
  const r = await call('/api/prospect-preflight/candidates?perOffer=2', { token: ADMIN_TOKEN });
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.json.offers).sort(), ['AI_AGENT_RELEASE_GATE', 'BILINGUAL_BOOKING_LEAK_AUDIT', 'CLIENT_ROI_PROOF_SPRINT', 'LEAD_TO_BOOKING_LEAK_AUDIT']);
  assert.equal(r.json.sendAuthority, false);
  assert.equal(r.json.providerCalls, 0);
  assert.equal((await call('/api/prospect-preflight/candidates?perOffer=not-a-number', { token: ADMIN_TOKEN })).status, 200);
});

test('fleet expansion plan is admin-only, plan-only, performs nothing, and reads observed state from the store, not from the request', async () => {
  const body = JSON.stringify({ target: { mailboxes: 50, ownedDomains: Array.from({ length: 30 }, (_, i) => `s${i}.example`), truthfulMailboxNames: ['mohamed'] } });
  assert.equal((await call('/api/outbound/fleet/expansion-plan', { method: 'POST', body })).status, 401);
  const r = await call('/api/outbound/fleet/expansion-plan', { method: 'POST', token: ADMIN_TOKEN, body });
  assert.equal(r.status, 200);
  assert.equal(r.json.externalMutationsPerformed, 0);
  assert.equal(r.json.spend, 0);
  assert.equal(r.json.sendAuthority, false);
  assert.equal(r.json.observedState.mailboxCount, 0, 'an empty store observes zero mailboxes however large the requested target');
  assert.ok(r.json.blockers.includes('provider-entitlement-unobserved'));
  // A forged "observed" block in the request body is ignored.
  const forged = await call('/api/outbound/fleet/expansion-plan', { method: 'POST', token: ADMIN_TOKEN, body: JSON.stringify({ observed: { mailboxes: [{ address: 'x@y.example', smtpVerified: true, rampStage: 3 }], entitlement: { plan: 'STARTUP_50', mailboxLimit: 50 } }, target: { mailboxes: 50 } }) });
  assert.equal(forged.json.observedState.mailboxCount, 0);
  assert.equal(forged.json.capacity.currentEvidenceCapacityPerDay, 0);
  assert.equal(forged.json.authorizedExternalMutations.length, 0);
});
