import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AGENT_MESH_CRON_SCHEDULE,
  authorizeAgentMeshCronRequest,
  deriveAgentMeshCronOccurrenceKey,
  publicAgentMeshCronResult
} from '../src/agent-mesh-cron-boundary.mjs';

function headers(secret = 'test-secret', schedule = AGENT_MESH_CRON_SCHEDULE) {
  return {
    authorization: `Bearer ${secret}`,
    'x-vercel-cron-schedule': schedule
  };
}

test('accepts exact authenticated Vercel cron GET in zero-external-I/O mode', () => {
  const result = authorizeAgentMeshCronRequest({
    method: 'GET',
    headers: headers(),
    cronSecret: 'test-secret',
    date: new Date('2026-08-29T12:44:00Z')
  });
  assert.equal(result.ok, true);
  assert.equal(result.statusCode, 200);
  assert.equal(result.executionMode, 'ZERO_EXTERNAL_IO_CANARY');
  assert.equal(result.businessEffectAuthority, 'NONE');
});

test('fails closed when cron secret is missing', () => {
  const result = authorizeAgentMeshCronRequest({ method: 'GET', headers: headers(), cronSecret: '' });
  assert.deepEqual(result, { ok: false, statusCode: 503, reasonCode: 'cron-secret-not-configured' });
});

test('rejects invalid bearer authorization', () => {
  const result = authorizeAgentMeshCronRequest({ method: 'GET', headers: headers('wrong'), cronSecret: 'test-secret' });
  assert.equal(result.ok, false);
  assert.equal(result.statusCode, 401);
});

test('rejects non-GET methods', () => {
  const result = authorizeAgentMeshCronRequest({ method: 'POST', headers: headers(), cronSecret: 'test-secret' });
  assert.equal(result.statusCode, 405);
});

test('requires Vercel cron schedule header', () => {
  const result = authorizeAgentMeshCronRequest({
    method: 'GET',
    headers: { authorization: 'Bearer test-secret' },
    cronSecret: 'test-secret'
  });
  assert.equal(result.statusCode, 400);
});

test('rejects schedule mismatch', () => {
  const result = authorizeAgentMeshCronRequest({
    method: 'GET',
    headers: headers('test-secret', '17 13 * * *'),
    cronSecret: 'test-secret'
  });
  assert.equal(result.statusCode, 409);
});

test('same declared daily slot on same UTC day is retry-stable', () => {
  const first = deriveAgentMeshCronOccurrenceKey({ date: new Date('2026-08-29T12:01:00Z') });
  const retry = deriveAgentMeshCronOccurrenceKey({ date: new Date('2026-08-29T12:58:59Z') });
  assert.equal(first, retry);
});

test('next UTC day yields a distinct occurrence', () => {
  const first = deriveAgentMeshCronOccurrenceKey({ date: new Date('2026-08-29T12:58:59Z') });
  const next = deriveAgentMeshCronOccurrenceKey({ date: new Date('2026-08-30T12:01:00Z') });
  assert.notEqual(first, next);
});

test('public result exposes only bounded receipt truth', () => {
  const result = publicAgentMeshCronResult({
    ok: true,
    status: 'IDLE',
    cycleId: 'meshcycle_123',
    cycleReceiptState: 'TERMINAL',
    duplicateDelivery: false,
    secret: 'must-not-leak',
    rawProviderPayload: { token: 'must-not-leak' },
    externalEffectLedger: { messagesSent: 0, providerCalls: 0 }
  });
  assert.equal(result.secret, undefined);
  assert.equal(result.rawProviderPayload, undefined);
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.equal(result.externalEffectLedger.providerCalls, 0);
});

test('occurrence identity is independent of source commit', () => {
  const key = deriveAgentMeshCronOccurrenceKey({ date: new Date('2026-08-29T12:30:00Z') });
  assert.equal(key, `vercel-cron:${AGENT_MESH_CRON_SCHEDULE}:2026-08-29`);
});
