import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { powerhouseRecord, POWERHOUSE_SLOTS as SLOTS, POWERHOUSE_ARTIFACT_REF as ARTIFACT } from './fixtures/outreach/powerhouse.fixture.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ADMIN_TOKEN = 'a-strong-admin-token-value-000000000000';
let handler; let dataDir;
// The route verifies the artifact against the real repository. The committed
// sample artifact exists in the tree; the mutation war's sandbox has no
// artifacts/ directory, so a placeholder is created there and removed after.
const artifactPath = new URL(`../${ARTIFACT}`, import.meta.url);
let createdArtifact = false;
test.before(async () => {
  if (!existsSync(artifactPath)) {
    mkdirSync(new URL('../artifacts/outreach/', import.meta.url), { recursive: true });
    writeFileSync(artifactPath, 'test placeholder for the sandbox\n');
    createdArtifact = true;
  }
  dataDir = await mkdtemp(join(tmpdir(), 'uberbond-preflight-'));
  Object.assign(process.env, { PROCESS_ROLE: 'web', STORE_BACKEND: 'json', DATA_DIR: dataDir, APP_BASE_URL: 'http://127.0.0.1:9999', ADMIN_TOKEN, NODE_ENV: 'test' });
  ({ requestHandler: handler } = await import('../server.mjs'));
});
test.after(async () => {
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
  if (createdArtifact) rmSync(artifactPath, { force: true });
});
function response() { const res = { status: null, headers: {}, body: '' }; res.writeHead = (s, h) => { res.status = s; res.headers = h || {}; }; res.end = b => { res.body = b || ''; }; return res; }
async function call(url, { method = 'GET', token, body } = {}) {
  const res = response();
  await handler({ method, url, headers: token ? { authorization: `Bearer ${token}` } : {}, async *[Symbol.asyncIterator]() { if (body !== undefined) yield Buffer.from(body); } }, res);
  return res;
}
const json = res => { try { return JSON.parse(res.body); } catch { return null; } };
const record = () => { const r = powerhouseRecord(); r.recipient.observedAt = new Date(Date.now() - 3600_000).toISOString(); r.clientEvidence.observation.observedAt = r.recipient.observedAt; return r; };
const body = (extra = {}) => JSON.stringify({ record: record(), slots: SLOTS, artifactRef: ARTIFACT, ...extra });

test('refused without admin credentials', async () => {
  assert.equal((await call('/api/prospect-preflight', { method: 'POST', body: body() })).status, 401);
  assert.equal((await call('/api/prospect-preflight', { method: 'POST', token: 'wrong-token-value-0000000000000000', body: body() })).status, 401);
});

test('authenticated: a runtime-clean candidate with no committed policy evidence is BLOCKED_POLICY_REFRESH, zero authority, with a real in-process contact-history receipt', async () => {
  // The committed evidence bundle is empty until a live researcher records it, so
  // the global route's freshness law applies in production exactly as it does here.
  const res = await call('/api/prospect-preflight', { method: 'POST', token: ADMIN_TOKEN, body: body() });
  assert.equal(res.status, 200);
  const r = json(res);
  assert.equal(r.state, 'BLOCKED_POLICY_REFRESH');
  assert.equal(r.contactHistory.status, 'CLEAN');
  assert.equal(r.intake.provenance, 'RUNTIME_RECEIPT');
  assert.equal(r.globalRoute.state, 'POLICY_REFRESH_REQUIRED');
  assert.equal(r.globalRoute.provisionalRouteClass, 'US_CANSPAM_GREEN');
  assert.ok(r.policyRefreshRequired.some(x => x.ruleId === 'recipient:US:can-spam-b2b-email'));
  assert.equal(r.oneButton.activationBlocked, true);
  assert.equal(r.sendAuthority, false);
  assert.equal(r.externalEffects, 0);
  assert.equal(r.effectPackage, undefined, 'no effect package is compiled while the route is not green');
});

test('a real suppression written through the existing API turns the same candidate into DO_NOT_SEND', async () => {
  const created = await call('/api/suppress', { method: 'POST', token: ADMIN_TOKEN, body: JSON.stringify({ value: 'hello@mypowerhouse.group', reason: 'manual' }) });
  assert.equal(created.status, 201);
  const r = json(await call('/api/prospect-preflight', { method: 'POST', token: ADMIN_TOKEN, body: body() }));
  assert.equal(r.state, 'DO_NOT_SEND');
  assert.ok(r.blockerCodes.includes('prior-contact-or-suppression-runtime-ledger-hit'));
});

test('hostile bodies never crash the route or produce authority: non-object record, garbage identity, traversal artifact', async () => {
  for (const extra of [{ record: 'x' }, { record: [] }, { record: null }, { identity: 'x', senderSide: 5, campaign: [] }, { artifactRef: '../../etc/passwd' }]) {
    const res = await call('/api/prospect-preflight', { method: 'POST', token: ADMIN_TOKEN, body: body(extra) });
    assert.equal(res.status, 200, JSON.stringify(Object.keys(extra)));
    const r = json(res);
    assert.equal(r.sendAuthority, false);
    assert.notEqual(r.state, 'READY_FOR_AUTHORIZATION');
  }
  assert.equal((await call('/api/prospect-preflight', { method: 'POST', token: ADMIN_TOKEN, body: 'not json' })).status >= 400, true);
});

test('read-only: nothing was written to the production ledgers by any preflight', async () => {
  for (const path of ['/api/outbound-reservations', '/api/outbound-events', '/api/prospects']) assert.deepEqual(json(await call(path, { token: ADMIN_TOKEN })), [], path);
});

test('no GET form and no public exposure', async () => {
  assert.notEqual((await call('/api/prospect-preflight', { token: ADMIN_TOKEN })).status, 200);
});
