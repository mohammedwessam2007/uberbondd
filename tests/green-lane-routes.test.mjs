import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ADMIN_TOKEN = 'a-strong-admin-token-value-000000000000';
let handler; let dataDir;
test.before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'uberbond-green-lane-'));
  Object.assign(process.env, { PROCESS_ROLE: 'web', STORE_BACKEND: 'json', DATA_DIR: dataDir, APP_BASE_URL: 'http://127.0.0.1:9999', ADMIN_TOKEN, NODE_ENV: 'test' });
  delete process.env.COMPANIES_HOUSE_API_KEY;
  ({ requestHandler: handler } = await import('../server.mjs'));
});
test.after(async () => { if (dataDir) await rm(dataDir, { recursive: true, force: true }); });
function response() { const res = { status: null, headers: {}, body: '' }; res.writeHead = (s, h) => { res.status = s; res.headers = h || {}; }; res.end = b => { res.body = b || ''; }; return res; }
async function call(url, { method = 'GET', token, body } = {}) {
  const res = response();
  await handler({ method, url, headers: token ? { authorization: `Bearer ${token}` } : {}, async *[Symbol.asyncIterator]() { if (body !== undefined) yield Buffer.from(body); } }, res);
  return res;
}
const json = res => { try { return JSON.parse(res.body); } catch { return null; } };

test('green-lane status is refused without admin credentials', async () => {
  assert.equal((await call('/api/outreach/green-lane/status')).status, 401);
  assert.equal((await call('/api/outreach/green-lane/status', { token: 'wrong-token-value-0000000000000000' })).status, 401);
});

test('green-lane status: committed policy evidence is empty so every permissive rule needs a refresh; cold dispatch closed; credential presence only; zero authority and zero cost', async () => {
  const res = await call('/api/outreach/green-lane/status', { token: ADMIN_TOKEN });
  assert.equal(res.status, 200);
  const r = json(res);
  assert.equal(r.version, 'uberbond.green-lane-status.v1');
  assert.equal(r.coldDispatch, 'INTENTIONALLY_CLOSED');
  assert.equal(r.sendAuthority, false);
  assert.equal(r.externalEffectAuthority, 'NONE');
  assert.equal(r.externalEffects, 0);
  assert.equal(r.newRecurringCostUsd, 0);
  assert.equal(r.registries.companiesHouse.zeroCost, true);
  assert.equal(r.registries.companiesHouse.credentialConfigured, false);
  assert.ok(r.registries.adapters.includes('GB'));
  assert.equal(r.governanceGate.refused, true, 'the provider governance gate still refuses PUBLIC_BUSINESS_CONTACT on smtp-relay');
  const matrix = r.jurisdictionMatrix;
  assert.ok(matrix, 'matrix present');
  assert.ok(!res.body.includes(ADMIN_TOKEN), 'no secret in output');
});

test('candidates route in GREEN_LANE_ONLY mode returns the green-lane shape, never fabricates green supply, and is read-only', async () => {
  const dflt = json(await call('/api/prospect-preflight/candidates', { token: ADMIN_TOKEN }));
  assert.equal(dflt.mode, 'DEFAULT');
  const green = json(await call('/api/prospect-preflight/candidates?mode=GREEN_LANE_ONLY', { token: ADMIN_TOKEN }));
  assert.equal(green.mode, 'GREEN_LANE_ONLY');
  assert.equal(green.offers, undefined);
  for (const lane of Object.values(green.greenLane)) { assert.equal(lane.fabricatedGreenProspects, 0); assert.deepEqual(lane.ranked, []); }
  assert.equal(green.sendAuthority, false);
  assert.equal(green.providerCalls, 0);
});

test('economics route adds routeEconomics with unattributed/UNKNOWN truth and no invented route split', async () => {
  const r = json(await call('/api/outreach/economics', { token: ADMIN_TOKEN }));
  assert.ok(r.routeEconomics);
  assert.equal(r.routeEconomics.sendAuthority, false);
  assert.equal(r.routeEconomics.attribution.status, 'NO_ROUTE_ATTRIBUTION_RECORDED');
  assert.deepEqual(r.routeEconomics.byRouteClass, {});
});
