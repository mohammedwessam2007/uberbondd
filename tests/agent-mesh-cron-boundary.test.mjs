import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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

// The occurrence key has day granularity, which is correct only while the
// schedule fires at most once a day. Edit vercel.json to `*/5 * * * *` and 288
// firings would share one key: 287 silently classified as duplicate deliveries,
// no error anywhere, and a mesh that appears to run daily while being asked to
// run every five minutes.
//
// Silence is the problem, not the granularity.
test('a schedule finer than the occurrence identity is refused, not folded', () => {
  for (const schedule of ['*/5 * * * *', '0 * * * *', '17 */2 * * *', '0,30 12 * * *', '17 12-18 * * *', '* * * * *']) {
    const result = deriveVercelDailyOccurrence({
      scheduleHeader: schedule, expectedSchedule: schedule, date: new Date('2026-08-29T00:05:00Z')
    });
    assert.equal(result.ok, false, `${schedule} produced a day-granularity key`);
    assert.ok(result.reasonCodes.includes('cron-schedule-finer-than-occurrence-identity'), schedule);
  }
});

test('a once-a-day schedule still derives an occurrence (positive control)', () => {
  for (const schedule of ['17 12 * * *', '0 0 * * *', '59 23 * * *']) {
    const result = deriveVercelDailyOccurrence({
      scheduleHeader: schedule, expectedSchedule: schedule, date: new Date('2026-08-29T12:17:00Z')
    });
    assert.equal(result.ok, true, `${schedule} was refused`);
    assert.match(result.occurrenceKey, /^vercel-cron:agent-mesh:2026-08-29:[0-9a-f]{16}$/);
  }
});

// vercel.json and VERCEL_AGENT_MESH_CRON_SCHEDULE are two copies of one fact.
// If they drift, the boundary refuses every real invocation with
// `vercel-cron-schedule-mismatch` -- a 403 in the logs that reads exactly like
// an unauthorized probe being correctly rejected, while the mesh never runs.
// That failure is silent in the only place it matters.
test('the deployed cron schedule matches the schedule the boundary expects', async () => {
  const vercelConfig = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const crons = Array.isArray(vercelConfig.crons) ? vercelConfig.crons : [];
  const meshCron = crons.find(entry => String(entry?.path || '').includes('agent-mesh-cron'));
  assert.ok(meshCron, 'vercel.json must declare the agent-mesh cron for the boundary to have anything to authorize');
  assert.equal(meshCron.schedule, VERCEL_AGENT_MESH_CRON_SCHEDULE,
    'vercel.json and the boundary constant have drifted; every real cron invocation would 403');
  assert.ok(vercelConfig.functions?.['api/agent-mesh-cron.mjs'],
    'the cron route needs a function entry or it will not be deployed with a usable duration');
});
