import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../api/admin/health-check.mjs';

// The operator's only window into system health, and until now no gate ran it.
//
// Its bearer check is the only thing between the internet and operational
// telemetry: sender pause and bounce state, outbound volume, queue and
// dead-letter depth, database capacity, egress state, and the billing backlog.
// None of that is customer PII, but all of it is a map of the system for anyone
// who can read it.
//
// Found by the same subtraction that found the two unexercised src modules,
// extended to `api/`: routes are the actual production entry points, so a route
// no gate runs is worse than a module no gate runs.

const SECRET = 'an-admin-health-secret-value-0001';

// A sender row carrying an address, so the PII assertion has something to catch.
const INPUTS = {
  senderHealth: [{ paused: false, complaintsToday: 0, hardBouncesToday: 1, failureStreak: 0, email: 'sender@uberbond.example' }],
  hourlyOutbound: [{ count: 12 }],
  jobs: { pending: 3, deadLetter: 0 },
  database: { activeConnections: 2, maxConnections: 10 },
  egress: { healthy: 2, quarantined: 1 },
  billing: {
    awaitingClaim: 2, claimed: 0, uncertain: 0, settled: 1, failed: 0,
    everClaimed: 0, oldestUnsettledAt: new Date(Date.now() - 3600000).toISOString()
  }
};

function response() {
  const res = { status: null, body: null };
  res.writeHead = status => { res.status = status; };
  res.end = body => { res.body = JSON.parse(body); };
  return res;
}

const handler = (env = {}, deps = {}) => createHandler({
  env: { ADMIN_HEALTH_SECRET: SECRET, DATABASE_URL: 'postgres://unused', ...env },
  getPool: () => ({}),
  readSystemHealthInputs: async () => INPUTS,
  ...deps
});

const call = async (over = {}, env = {}, deps = {}) => {
  const res = response();
  await handler(env, deps)({
    method: 'GET',
    ...over,
    headers: { authorization: `Bearer ${SECRET}`, ...(over.headers || {}) }
  }, res);
  return res;
};

test('the correct bearer is admitted', async () => {
  const res = await call();
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

// The object case is the one that mattered. `String(header||'')` accepted
// anything that could describe itself, so an object with a toString returned the
// right bearer and was admitted. Not reachable over HTTP -- headers there are
// only strings or arrays of strings -- so it was never a live bypass, but the
// coercion was doing work nobody asked for.
test('nothing but a real string bearer is admitted', async () => {
  const rejected = [
    ['no header', undefined],
    ['an empty string', ''],
    ['null', null],
    ['the raw secret without the scheme', SECRET],
    ['a lowercase scheme', `bearer ${SECRET}`],
    ['a trailing space', `Bearer ${SECRET} `],
    ['a leading space', ` Bearer ${SECRET}`],
    ['a prefix of the secret', `Bearer ${SECRET.slice(0, 10)}`],
    ['the secret plus a suffix', `Bearer ${SECRET}X`],
    ['several header values', [`Bearer ${SECRET}`, 'Bearer other']],
    ['an object that stringifies to the bearer', { toString: () => `Bearer ${SECRET}` }],
    ['a number', 1234],
    ['basic auth', `Basic ${Buffer.from(SECRET).toString('base64')}`]
  ];
  for (const [label, header] of rejected) {
    const res = await call({ headers: { authorization: header } });
    assert.equal(res.status, 401, `${label} must be refused`);
  }
});

// Node can present a repeated header as an array. One value is unambiguous and
// is accepted, matching how the cron boundary treats it; several are not.
test('a single-element array header is accepted, several values are not', async () => {
  assert.equal((await call({ headers: { authorization: [`Bearer ${SECRET}`] } })).status, 200);
  assert.equal((await call({ headers: { authorization: [`Bearer ${SECRET}`, `Bearer ${SECRET}`] } })).status, 401);
  assert.equal((await call({ headers: { authorization: [1234] } })).status, 401);
});

// The method is uppercased before comparison, deliberately and consistently with
// src/agent-mesh-cron-boundary.mjs. A lowercase `get` is still a read, so
// accepting it is a choice rather than an oversight -- pinned here so it reads
// as one.
test('only a read is served, and the method comparison is case-insensitive by choice', async () => {
  assert.equal((await call({ method: 'GET' })).status, 200);
  assert.equal((await call({ method: 'get' })).status, 200);
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']) {
    const res = await call({ method });
    assert.equal(res.status, 405, `${method} must not be served`);
    assert.equal(res.body.ok, false);
  }
});

// Configuration is checked before the secret, so an unconfigured route cannot be
// used to distinguish "wrong secret" from "this route is armed".
test('an unconfigured runtime refuses without revealing whether the secret was wrong', async () => {
  for (const env of [{ ADMIN_HEALTH_SECRET: '' }, { DATABASE_URL: '' }]) {
    for (const authorization of [`Bearer ${SECRET}`, 'Bearer wrong', undefined]) {
      const res = await call({ headers: { authorization } }, env);
      assert.equal(res.status, 503);
      // The same reason code either way, on purpose: which piece of
      // configuration is missing is not the caller's business.
      assert.deepEqual(res.body.reasonCodes, ['admin-health-runtime-not-configured']);
    }
  }
});

test('the authorized response carries telemetry but no address', async () => {
  const res = await call();
  const dump = JSON.stringify(res.body);
  assert.equal(dump.includes('sender@uberbond.example'), false, 'no sender address');
  assert.equal(dump.includes('@'), false, 'no address-shaped value at all');
  assert.match(dump, /TELEMETRY_IS_OPERATIONAL_OBSERVATION/,
    'the response must say what it is and is not');
  assert.equal(res.body.businessEffectAuthority, 'NONE');
  assert.equal(res.body.matrix.sender.total, 1, 'aggregate counts still come through');
  assert.equal(res.body.matrix.billing.state, 'NO_WORKER');
  assert.equal(res.body.status, 'DEGRADED', 'an unworked billing backlog degrades the report');
});

// A read that fails is not a healthy system, and the failure text is the
// database's, not the caller's business.
test('a failing read is a refusal, never a healthy matrix', async () => {
  const res = await call({}, {}, {
    readSystemHealthInputs: async () => { throw new Error('connection to 10.0.0.5:5432 refused'); }
  });
  assert.equal(res.status, 503);
  assert.equal(res.body.ok, false);
  assert.deepEqual(res.body.reasonCodes, ['health-matrix-query-failed']);
  const dump = JSON.stringify(res.body);
  assert.equal(dump.includes('10.0.0.5'), false, 'no internal host in the response');
  assert.equal(dump.includes('connection to'), false, 'no driver error text in the response');
  assert.equal(res.body.status, 'REFUSED', 'the refusal is still legible without the detail');
});
