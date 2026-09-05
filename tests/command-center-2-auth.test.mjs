import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../api/command-center.mjs';

function responseRecorder() {
  return {
    statusCode: null,
    headers: null,
    body: null,
    writeHead(status, headers) { this.statusCode = status; this.headers = headers; },
    end(body) { this.body = body; }
  };
}

const safeBuild = async () => ({ schemaVersion: 'test', truthState: 'OBSERVED', generatedAt: new Date(0).toISOString() });
const safeNormalize = async value => value;

test('command center fails closed when ADMIN_TOKEN is absent', async () => {
  const handler = createHandler({ env: {}, buildUberBondCommandCenterStatus: safeBuild, normalizeUberBondCommandCenterStatus: safeNormalize });
  const res = responseRecorder();
  await handler({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(JSON.parse(res.body).reasonCodes, ['command-center-admin-auth-not-configured']);
});

test('command center rejects missing and incorrect bearer credentials', async () => {
  const handler = createHandler({ env: { ADMIN_TOKEN: 'correct' }, buildUberBondCommandCenterStatus: safeBuild, normalizeUberBondCommandCenterStatus: safeNormalize });
  for (const authorization of [undefined, 'Bearer wrong', 'correct', 'bearer correct']) {
    const res = responseRecorder();
    await handler({ method: 'GET', headers: { authorization } }, res);
    assert.equal(res.statusCode, 401);
    assert.deepEqual(JSON.parse(res.body).reasonCodes, ['unauthorized']);
  }
});

test('authenticated command-center response remains no-store and framing-denied', async () => {
  const handler = createHandler({ env: { ADMIN_TOKEN: 'correct' }, buildUberBondCommandCenterStatus: safeBuild, normalizeUberBondCommandCenterStatus: safeNormalize, now: () => new Date(0) });
  const res = responseRecorder();
  await handler({ method: 'GET', headers: { authorization: 'Bearer correct' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(res.headers['x-frame-options'], 'DENY');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['referrer-policy'], 'no-referrer');
});
