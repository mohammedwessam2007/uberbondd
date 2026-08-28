import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VERCEL_AGENT_MESH_CRON_SCHEDULE,
  authorizeVercelCronRequest,
  deriveVercelDailyOccurrence,
  publicCronResult
} from '../src/agent-mesh-cron-boundary.mjs';

const SECRET = 'test-only-cron-secret-not-production';
const AUTH = `Bearer ${SECRET}`;

test('authorized Vercel cron request requires GET, secret, bearer and exact schedule', () => {
  const result = authorizeVercelCronRequest({
    method: 'GET',
    authorizationHeader: AUTH,
    cronSecret: SECRET,
    scheduleHeader: VERCEL_AGENT_MESH_CRON_SCHEDULE
  });
  assert.equal(result.ok, true);
  assert.equal(result.httpStatus, 200);
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.equal(result.externalEffectLedger.providerCalls, 0);
});

test('missing cron secret fails closed before any execution authority exists', () => {
  const result = authorizeVercelCronRequest({
    method: 'GET',
    authorizationHeader: AUTH,
    cronSecret: '',
    scheduleHeader: VERCEL_AGENT_MESH_CRON_SCHEDULE
  });
  assert.equal(result.ok, false);
  assert.equal(result.httpStatus, 503);
  assert.ok(result.reasonCodes.includes('cron-secret-not-configured'));
});

test('wrong or absent authorization fails closed', () => {
  for (const authorizationHeader of ['', 'Bearer nope', ['Bearer one', 'Bearer two']]) {
    const result = authorizeVercelCronRequest({
      method: 'GET', authorizationHeader, cronSecret: SECRET,
      scheduleHeader: VERCEL_AGENT_MESH_CRON_SCHEDULE
    });
    assert.equal(result.ok, false);
    assert.equal(result.httpStatus, 401);
  }
});

test('non-GET invocation cannot trigger the cron boundary', () => {
  const result = authorizeVercelCronRequest({
    method: 'POST', authorizationHeader: AUTH, cronSecret: SECRET,
    scheduleHeader: VERCEL_AGENT_MESH_CRON_SCHEDULE
  });
  assert.equal(result.ok, false);
  assert.equal(result.httpStatus, 405);
});

test('missing or foreign schedule header fails closed even with the right secret', () => {
  for (const scheduleHeader of ['', '0 0 * * *']) {
    const result = authorizeVercelCronRequest({
      method: 'GET', authorizationHeader: AUTH, cronSecret: SECRET, scheduleHeader
    });
    assert.equal(result.ok, false);
    assert.equal(result.httpStatus, 403);
  }
});

test('same UTC day and declared schedule produce retry-stable occurrence identity', () => {
  const a = deriveVercelDailyOccurrence({
    scheduleHeader: VERCEL_AGENT_MESH_CRON_SCHEDULE,
    date: '2026-08-29T11:18:00.000Z'
  });
  const b = deriveVercelDailyOccurrence({
    scheduleHeader: VERCEL_AGENT_MESH_CRON_SCHEDULE,
    date: '2026-08-29T13:10:00.000Z'
  });
  assert.equal(a.ok, true);
  assert.equal(a.occurrenceKey, b.occurrenceKey);
  assert.match(a.occurrenceKey, /^vercel-cron:agent-mesh:2026-08-29:/);
});

test('next UTC day gets a distinct occurrence identity', () => {
  const a = deriveVercelDailyOccurrence({ scheduleHeader: VERCEL_AGENT_MESH_CRON_SCHEDULE, date: '2026-08-29T12:17:00Z' });
  const b = deriveVercelDailyOccurrence({ scheduleHeader: VERCEL_AGENT_MESH_CRON_SCHEDULE, date: '2026-08-30T12:17:00Z' });
  assert.notEqual(a.occurrenceKey, b.occurrenceKey);
});

test('malformed date and ambiguous schedule identity refuse execution', () => {
  assert.equal(deriveVercelDailyOccurrence({ scheduleHeader: '', date: new Date() }).ok, false);
  assert.equal(deriveVercelDailyOccurrence({ scheduleHeader: VERCEL_AGENT_MESH_CRON_SCHEDULE, date: 'not-a-date' }).ok, false);
});

test('occurrence identity does not include source commit so source drift conflicts inside durable cycle identity', () => {
  const a = deriveVercelDailyOccurrence({ scheduleHeader: VERCEL_AGENT_MESH_CRON_SCHEDULE, date: '2026-08-29T12:17:00Z' });
  assert.equal(a.identityRule, 'DECLARED_SCHEDULE_PLUS_UTC_DAY_SOURCE_BOUND_SEPARATELY');
  assert.equal(a.occurrenceKey.includes('sha'), false);
});

test('public result cannot echo secrets or raw provider/model payloads', () => {
  const result = publicCronResult({
    ok: true,
    status: 'IDLE',
    occurrenceKey: 'occurrence-1',
    cycleId: 'cycle-1',
    authorization: AUTH,
    cronSecret: SECRET,
    rawPayload: { prompt: 'do not leak' },
    modelOutput: 'do not leak',
    workersConfigured: 0,
    workersWithheld: 0
  });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(SECRET), false);
  assert.equal(serialized.includes('do not leak'), false);
  assert.equal(result.externalEffectLedger.messages, 0);
  assert.equal(result.businessEffectAuthority, 'NONE');
});
