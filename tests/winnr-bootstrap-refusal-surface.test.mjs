import test from 'node:test';
import assert from 'node:assert/strict';
import { runWinnrRuntimeBootstrap } from '../src/winnr-runtime-bootstrap.mjs';
import { runWinnrSealedBootstrapController } from '../src/winnr-sealed-bootstrap.mjs';

test('runtime bootstrap refuses missing authority before store, provider or transport work', async () => {
  const out = await runWinnrRuntimeBootstrap();
  assert.equal(out.ok, false);
  assert.equal(out.status, 'WINNR_RUNTIME_BOOTSTRAP_REFUSED');
  assert.deepEqual(out.reasonCodes, ['config-required', 'credential-export-required', 'token-encryption-key-required', 'owner-controlled-canary-target-required']);
  assert.equal(out.messagesSent, 0);
});

test('sealed bootstrap refuses absent or malformed original key before opening storage', async () => {
  for (const config of [undefined, {}, { encryptionKey: 'invalid-fixture-key' }]) {
    const out = await runWinnrSealedBootstrapController({ config });
    assert.equal(out.ok, false);
    assert.equal(out.status, 'WINNR_SEALED_BOOTSTRAP_REFUSED');
    assert.deepEqual(out.reasonCodes, ['token-encryption-key-required']);
  }
});
