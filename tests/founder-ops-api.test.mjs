import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../api/founder-ops.mjs';

function recorder() {
  return {
    statusCode: null,
    headers: {},
    body: '',
    writeHead(status, headers = {}) { this.statusCode = status; this.headers = { ...headers }; },
    end(body = '') { this.body = String(body); }
  };
}

async function call(handler, { method = 'GET', authorization = null } = {}) {
  const req = { method, headers: authorization ? { authorization } : {} };
  const res = recorder();
  await handler(req, res);
  return { status: res.statusCode, headers: res.headers, body: JSON.parse(res.body || '{}') };
}

const ENV = { ADMIN_TOKEN: 'owner-secret', DATABASE_URL: 'postgres://configured' };
const CONTEXT = { store: { list: async () => [] }, cfg: {}, revenueEngine: null };
const VIEW = {
  ok: true,
  status: 'FOUNDER_OPS_READ_ONLY',
  privacy: { privateVaultDataIncluded: false },
  businessEffectAuthority: 'NONE'
};

test('founder ops is GET-only and fails closed without admin auth configuration', async () => {
  const noAuth = createHandler({ env: { DATABASE_URL: 'x' }, getContext: async () => CONTEXT, buildFounderOpsView: async () => VIEW });
  const missing = await call(noAuth, { authorization: 'Bearer anything' });
  assert.equal(missing.status, 503);
  assert.ok(missing.body.reasonCodes.includes('founder-ops-admin-auth-not-configured'));

  const handler = createHandler({ env: ENV, getContext: async () => CONTEXT, buildFounderOpsView: async () => VIEW });
  const post = await call(handler, { method: 'POST', authorization: 'Bearer owner-secret' });
  assert.equal(post.status, 405);
  assert.ok(post.body.reasonCodes.includes('method-not-allowed'));
});

test('wrong bearer is refused and exact bearer returns only the read-only view', async () => {
  let contextCalls = 0;
  const handler = createHandler({
    env: ENV,
    getContext: async () => { contextCalls += 1; return CONTEXT; },
    buildFounderOpsView: async () => VIEW,
    now: () => new Date('2026-09-08T18:40:00.000Z')
  });

  const wrong = await call(handler, { authorization: 'Bearer wrong' });
  assert.equal(wrong.status, 401);
  assert.equal(contextCalls, 0, 'unauthorized callers must not cause a live-store read');

  const ok = await call(handler, { authorization: 'Bearer owner-secret' });
  assert.equal(ok.status, 200);
  assert.equal(contextCalls, 1);
  assert.equal(ok.body.businessEffectAuthority, 'NONE');
  assert.equal(ok.body.privacy.privateVaultDataIncluded, false);
  assert.equal(JSON.stringify(ok.body).includes('owner-secret'), false);
  assert.match(String(ok.headers['cache-control']), /no-store/);
});

test('live context failure degrades to bounded unavailable truth and never exposes exception detail', async () => {
  const handler = createHandler({
    env: ENV,
    getContext: async () => { throw new Error('postgres://secret-user:secret-pass@host/db'); },
    buildFounderOpsView: async () => VIEW
  });
  const result = await call(handler, { authorization: 'Bearer owner-secret' });
  assert.equal(result.status, 503);
  assert.equal(result.body.status, 'FOUNDER_OPS_UNAVAILABLE');
  assert.ok(result.body.reasonCodes.includes('live-operational-view-failed'));
  assert.equal(JSON.stringify(result.body).includes('secret-pass'), false);
});
