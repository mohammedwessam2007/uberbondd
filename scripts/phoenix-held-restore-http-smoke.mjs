import assert from 'node:assert/strict';

// Runs inside the single protected, outbound-disabled environment after the
// held app has booted on loopback. No customer/provider network calls.
assert.equal(process.env.PHOENIX_HELD_RESTORE_PROBE, '1', 'explicit held probe required');
assert.equal(process.env.PROCESS_ROLE, 'web', 'worker start forbidden');
assert.equal(process.env.OUTBOUND_EMERGENCY_STOP, 'true', 'kill switch required');
const port = Number(process.env.PORT);
assert.ok(Number.isSafeInteger(port) && port > 0 && port < 65536, 'local port required');
const token = String(process.env.ADMIN_TOKEN || '');
assert.ok(token.length >= 32, 'protected admin token required');
const base = 'http://127.0.0.1:' + port;
const req = async (path, opts = {}) => {
  const response = await fetch(base + path, { ...opts, signal: AbortSignal.timeout(10000) });
  let body;
  try { body = await response.json(); } catch { body = {}; }
  return { status: response.status, body };
};
const health = await req('/api/health');
assert.equal(health.status, 200, 'actual app health must answer');
assert.equal(health.body.storeBackend, 'postgres', 'PostgreSQL backend required');
assert.equal(health.body.processRole, 'web', 'app must be web-only');
assert.equal(health.body.autopilot, false, 'scheduler must be held');
const denied = await req('/api/summary');
assert.equal(denied.status, 401, 'summary without admin must be denied');
const summary = await req('/api/summary', { headers: { authorization: 'Bearer ' + token } });
assert.equal(summary.status, 200, 'authenticated app summary must answer');
assert.equal(summary.body.storeBackend, 'postgres', 'auth summary backend mismatch');
const blocked = await req('/api/admin/ubermail/status');
assert.equal(blocked.status, 403, 'non-approved administrative GET must be blocked');
const write = await req('/api/health', { method: 'POST' });
assert.equal(write.status, 403, 'even health POST must be denied');
console.log('PHOENIX_HELD_APP_HTTP_PROOF ' + JSON.stringify({
  ok: true, actualAppHealth: true, authenticatedSummary: true,
  unauthenticatedSummaryDenied: true, privilegedRoutesDenied: true,
  writeRoutesDenied: true, processRole: 'web', dataWrittenByProbe: 0,
  providerCallsByProbe: 0, prospectSendsByProbe: 0,
  externalReceiverProof: false, ongoingReplicationProven: false,
  productionCutover: false
}));
