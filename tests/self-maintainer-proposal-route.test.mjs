import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { config } from '../api/self-maintainer-proposal.mjs';

function responseCapture() {
  return {
    statusCode: null,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return payload; }
  };
}

test('self-maintainer proposal production route executes and fails closed on non-POST requests', async () => {
  const res = responseCapture();
  await handler({ method: 'GET', headers: {} }, res);

  assert.equal(config.maxDuration, 60);
  assert.equal(res.statusCode, 405);
  assert.equal(res.payload?.ok, false);
  assert.equal(res.payload?.status, 'REFUSED');
  assert.ok(res.payload?.reasonCodes?.includes('post-required'));
  assert.equal(res.payload?.businessEffectAuthority, 'NONE');
  assert.deepEqual(res.payload?.externalEffectLedger, {
    providerCalls: 0,
    messages: 0,
    purchases: 0,
    deployments: 0,
    credentialChanges: 0,
    dnsChanges: 0,
    productionMutations: 0,
    spendCents: 0
  });
});
