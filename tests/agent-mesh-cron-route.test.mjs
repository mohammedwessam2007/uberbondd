import test from 'node:test';
import assert from 'node:assert/strict';
import { VERCEL_AGENT_MESH_CRON_SCHEDULE } from '../src/agent-mesh-cron-boundary.mjs';
import { createHandler } from '../api/agent-mesh-cron.mjs';

const SECRET = 'test-cron-secret';
const SHA = 'a'.repeat(40);
function response() {
  return {
    statusCode: null, body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return body; }
  };
}
function request(overrides = {}) {
  return {
    method: 'GET',
    headers: {
      authorization: `Bearer ${SECRET}`,
      'x-vercel-cron-schedule': VERCEL_AGENT_MESH_CRON_SCHEDULE
    },
    ...overrides
  };
}
function deps(overrides = {}) {
  let created = 0;
  let closed = 0;
  const canaryCalls = [];
  const store = { async close() { closed += 1; } };
  return {
    state: { get created() { return created; }, get closed() { return closed; }, canaryCalls },
    deps: {
      env: { CRON_SECRET: SECRET, VERCEL_GIT_COMMIT_SHA: SHA },
      startupConfig: { STORE_BACKEND: 'postgres' },
      validateStartupConfig() {},
      createStore() { created += 1; return store; },
      now: () => new Date('2026-08-29T12:17:00.000Z'),
      async runCanary(input) {
        canaryCalls.push(input);
        return { ok: true, status: 'IDLE', cycleId: 'cycle-1', cycleReceiptState: 'TERMINAL', reasonCodes: ['zero-external-io-canary'] };
      },
      ...overrides
    }
  };
}

test('authorized cron opens store, runs zero-I/O canary once, and always closes store', async () => {
  const fixture = deps();
  const res = response();
  await createHandler(fixture.deps)(request(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(fixture.state.created, 1);
  assert.equal(fixture.state.closed, 1);
  assert.equal(fixture.state.canaryCalls.length, 1);
  assert.equal(fixture.state.canaryCalls[0].sourceCommit, SHA);
  assert.match(fixture.state.canaryCalls[0].schedulerOccurrenceKey, /^vercel-cron:agent-mesh:2026-08-29:/);
  assert.equal(res.body.permittedMode, 'ZERO_EXTERNAL_IO_CANARY');
  assert.equal(res.body.externalEffectLedger.providerCalls, 0);
});

test('missing secret refuses before store creation', async () => {
  const fixture = deps({ env: { VERCEL_GIT_COMMIT_SHA: SHA } });
  const res = response();
  await createHandler(fixture.deps)(request(), res);
  assert.equal(res.statusCode, 503);
  assert.equal(fixture.state.created, 0);
  assert.ok(res.body.reasonCodes.includes('cron-secret-not-configured'));
});

test('bad bearer refuses before store creation', async () => {
  const fixture = deps();
  const res = response();
  await createHandler(fixture.deps)(request({ headers: { authorization: 'Bearer wrong', 'x-vercel-cron-schedule': VERCEL_AGENT_MESH_CRON_SCHEDULE } }), res);
  assert.equal(res.statusCode, 401);
  assert.equal(fixture.state.created, 0);
});

test('wrong schedule refuses before store creation', async () => {
  const fixture = deps();
  const res = response();
  await createHandler(fixture.deps)(request({ headers: { authorization: `Bearer ${SECRET}`, 'x-vercel-cron-schedule': '0 0 * * *' } }), res);
  assert.equal(res.statusCode, 403);
  assert.equal(fixture.state.created, 0);
});

test('non-GET refuses before store creation', async () => {
  const fixture = deps();
  const res = response();
  await createHandler(fixture.deps)(request({ method: 'POST' }), res);
  assert.equal(res.statusCode, 405);
  assert.equal(fixture.state.created, 0);
});

test('missing exact Vercel source SHA refuses before store creation', async () => {
  const fixture = deps({ env: { CRON_SECRET: SECRET, VERCEL_GIT_COMMIT_SHA: 'local' } });
  const res = response();
  await createHandler(fixture.deps)(request(), res);
  assert.equal(res.statusCode, 503);
  assert.equal(fixture.state.created, 0);
  assert.ok(res.body.reasonCodes.includes('vercel-source-commit-not-configured'));
});

test('store config failure is redacted and refuses before store creation', async () => {
  const fixture = deps({ validateStartupConfig() { throw new Error('DATABASE_URL=postgres://super-secret'); } });
  const res = response();
  await createHandler(fixture.deps)(request(), res);
  assert.equal(res.statusCode, 503);
  assert.equal(fixture.state.created, 0);
  assert.equal(JSON.stringify(res.body).includes('super-secret'), false);
});

test('canary runtime failure closes store and never echoes thrown payload', async () => {
  const fixture = deps({ async runCanary() { throw new Error('sk-secret raw prompt private'); } });
  const res = response();
  await createHandler(fixture.deps)(request(), res);
  assert.equal(res.statusCode, 500);
  assert.equal(fixture.state.created, 1);
  assert.equal(fixture.state.closed, 1);
  assert.equal(JSON.stringify(res.body).includes('sk-secret'), false);
  assert.ok(res.body.reasonCodes.includes('zero-io-canary-runtime-failed'));
});

test('blocked canary returns conflict-style status and redacted zero-effects body', async () => {
  const fixture = deps({ async runCanary() { return { ok: false, status: 'BLOCKED', reasonCodes: ['scheduler-occurrence-identity-conflict'], secret: SECRET }; } });
  const res = response();
  await createHandler(fixture.deps)(request(), res);
  assert.equal(res.statusCode, 409);
  assert.ok(res.body.reasonCodes.includes('scheduler-occurrence-identity-conflict'));
  assert.equal(JSON.stringify(res.body).includes(SECRET), false);
  assert.equal(res.body.externalEffectLedger.messages, 0);
});
