import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Route-level tests for two production provider routes in server-core.mjs. The
// provider clients capture globalThis.fetch when server-core loads, so the fetch
// stub is installed before the dynamic import. No request leaves this process.

const adminToken = 'fixture-admin-token-for-uberwarm-routes';
const maildosoPat = 'fixture-maildoso-pat-not-real';
const winnrToken = 'wnr_fixture_uberwarm_routes_not_real';
const futureIso = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();
const pastIso = () => new Date(Date.now() - 60 * 60 * 1000).toISOString();

const fetchCalls = [];
let dir, handler, restoreFetch;

test.before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'uberwarm-routes-'));
  Object.assign(process.env, {
    PROCESS_ROLE: 'web', STORE_BACKEND: 'json', DATA_DIR: dir, NODE_ENV: 'test',
    ADMIN_TOKEN: adminToken, APP_BASE_URL: 'https://uberbond.example',
    OUTBOUND_ENABLED: 'false', OUTBOUND_DRY_RUN: 'true',
    OUTREACH_APPROVAL_SECRET: 'fixture-approval-secret-'.repeat(3),
    OUTREACH_APPROVER_ID: 'fixture-owner',
    MAILDOSO_PAT: maildosoPat,
    WINNR_API_TOKEN: winnrToken,
    WINNR_ACCOUNT_AUTHORIZED: 'true',
    WINNR_TERMS_COMPATIBLE: 'true',
    WINNR_TERMS_EVIDENCE_REF: 'fixture-terms-evidence'
  });
  const realFetch = globalThis.fetch;
  restoreFetch = () => { globalThis.fetch = realFetch; };
  globalThis.fetch = async (url, init = {}) => {
    fetchCalls.push({ url: String(url), method: String(init.method || 'GET') });
    return new Response(JSON.stringify({ ok: true, fixture: true }), {
      status: 200, headers: { 'content-type': 'application/json' }
    });
  };
  ({ requestHandler: handler } = await import('../server-core.mjs'));
});

test.after(async () => {
  if (restoreFetch) restoreFetch();
  if (dir) await rm(dir, { recursive: true, force: true });
});

function callsTo(host) {
  return fetchCalls.filter(call => {
    try { return new URL(call.url).host === host; } catch { return false; }
  });
}

async function postRoute(path, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  const res = {
    status: null, body: '', headers: {},
    writeHead(status, headers = {}) { this.status = status; Object.assign(this.headers, headers); },
    setHeader(name, value) { this.headers[name] = value; },
    end(value = '') { this.body = String(value); }
  };
  await handler({
    method: 'POST', url: path,
    headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
    async *[Symbol.asyncIterator]() { yield body; }
  }, res);
  return { status: res.status, data: JSON.parse(res.body || 'null') };
}

const maildosoPath = '/api/providers/maildoso/mutate/createAccounts';
const maildosoApproval = (overrides = {}) => ({
  authorized: true,
  receiptId: 'fixture-receipt-maildoso-create-accounts',
  authorizedBy: 'fixture-owner',
  scopes: ['createAccounts'],
  expiresAt: futureIso(),
  spendLimitCents: 1000,
  ...overrides
});
const maildosoBody = { accounts: [{ username: 'fixture-user', name: 'Fixture User' }] };

test('Maildoso billable createAccounts is refused with spend-estimate-required when estimatedCostCents is absent', async () => {
  fetchCalls.length = 0;
  const result = await postRoute(maildosoPath, { body: maildosoBody, approval: maildosoApproval() });
  assert.equal(result.status, 400, JSON.stringify(result.data));
  assert.equal(result.data.status, 'UBERMAILDOSO_MUTATION_REFUSED');
  assert.ok(result.data.reasonCodes.includes('spend-estimate-required'), JSON.stringify(result.data));
  assert.equal(callsTo('api.maildoso.com').length, 0, 'refused billable mutation must make zero provider calls');
});

test('Maildoso billable createAccounts forwards a present estimatedCostCents to the spend ceiling', async () => {
  fetchCalls.length = 0;
  const allowed = await postRoute(maildosoPath, {
    body: maildosoBody, approval: maildosoApproval(), estimatedCostCents: 500
  });
  assert.equal(allowed.status, 200, JSON.stringify(allowed.data));
  assert.equal(allowed.data.status, 'UBERMAILDOSO_MUTATION_CONFIRMED');
  assert.equal(callsTo('api.maildoso.com').length, 1, 'an approved billable mutation makes exactly one provider call');

  // The forwarded estimate must reach the ceiling check: an estimate above the
  // approved limit is refused before any provider call.
  fetchCalls.length = 0;
  const overLimit = await postRoute(maildosoPath, {
    body: maildosoBody, approval: maildosoApproval(), estimatedCostCents: 1500
  });
  assert.equal(overLimit.status, 400, JSON.stringify(overLimit.data));
  assert.ok(overLimit.data.reasonCodes.includes('spend-limit-exceeded'), JSON.stringify(overLimit.data));
  assert.equal(callsTo('api.maildoso.com').length, 0);
});

test('Maildoso estimatedCostCents must be a non-negative integer when supplied', async () => {
  for (const bad of [-1, 1.5, '500', { cents: 500 }]) {
    fetchCalls.length = 0;
    const result = await postRoute(maildosoPath, {
      body: maildosoBody, approval: maildosoApproval(), estimatedCostCents: bad
    });
    assert.equal(result.status, 400, `${JSON.stringify(bad)}: ${JSON.stringify(result.data)}`);
    assert.ok(result.data.reasonCodes.includes('estimated-cost-cents-must-be-non-negative-integer'), JSON.stringify(result.data));
    assert.equal(callsTo('api.maildoso.com').length, 0, `${JSON.stringify(bad)} must make zero provider calls`);
  }
});

const winnrExportPath = '/api/providers/winnr/export';
const winnrExportBody = (extra = {}) => ({
  confirmCredentialExport: true, format: 'default', domains: ['fixture-domain.example'], ...extra
});
// An export is zero-spend, so a valid owner approval states spendLimitCents: 0.
const winnrApproval = (overrides = {}) => ({
  granted: true, grantedBy: 'fixture-owner', scope: 'exportMailboxes', expiresAt: futureIso(), spendLimitCents: 0, ...overrides
});

test('Winnr mailbox export makes zero provider calls without a valid owner approval', async () => {
  const refusals = [
    { label: 'no approval supplied', body: winnrExportBody(), status: 'OWNER_APPROVAL_REQUIRED' },
    { label: 'approval not granted', body: winnrExportBody({ ownerApproval: winnrApproval({ granted: false }) }), status: 'OWNER_APPROVAL_REQUIRED' },
    { label: 'approval expired', body: winnrExportBody({ ownerApproval: winnrApproval({ expiresAt: pastIso() }) }), status: 'OWNER_APPROVAL_EXPIRED' },
    { label: 'approval for another capability', body: winnrExportBody({ ownerApproval: winnrApproval({ scope: 'provisionDomains' }) }), status: 'OWNER_APPROVAL_SCOPE_MISMATCH' },
    // Status name not pinned: the provider wrapper refuses this case without a stated spend limit.
    { label: 'approval without a spend limit', body: winnrExportBody({ ownerApproval: winnrApproval({ spendLimitCents: undefined }) }), status: null }
  ];
  for (const { label, body, status } of refusals) {
    fetchCalls.length = 0;
    const result = await postRoute(winnrExportPath, body);
    assert.equal(result.status, 400, `${label}: ${JSON.stringify(result.data)}`);
    if (status) assert.equal(result.data.status, status, `${label}: ${JSON.stringify(result.data)}`);
    assert.notEqual(result.data.ok, true, `${label}: ${JSON.stringify(result.data)}`);
    assert.equal(callsTo('api.winnr.app').length, 0, `${label}: refusal must happen before any Winnr call`);
  }
});

test('Winnr mailbox export makes one provider call with a valid owner approval', async () => {
  fetchCalls.length = 0;
  const result = await postRoute(winnrExportPath, winnrExportBody({ ownerApproval: winnrApproval() }));
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.ok, true);
  const winnrCalls = callsTo('api.winnr.app');
  assert.equal(winnrCalls.length, 1, 'an approved export makes exactly one Winnr call');
  assert.equal(winnrCalls[0].method, 'POST');
  assert.match(new URL(winnrCalls[0].url).pathname, /\/export$/);
});
