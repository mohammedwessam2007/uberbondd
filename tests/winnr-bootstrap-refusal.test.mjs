import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../src/store.mjs';
import { runWinnrRuntimeBootstrap } from '../src/winnr-runtime-bootstrap.mjs';
import { runWinnrSealedBootstrapController } from '../src/winnr-sealed-bootstrap.mjs';

test('credential-free runtime bootstrap refuses before provider contact or message effects', async () => {
  const out = await runWinnrRuntimeBootstrap();
  assert.equal(out.ok, false);
  assert.equal(out.status, 'WINNR_RUNTIME_BOOTSTRAP_REFUSED');
  assert.equal(out.messagesSent, 0);
  assert.ok(out.reasonCodes.includes('credential-export-required'));
});

test('sealed bootstrap requires encryption custody before opening a store', async () => {
  const out = await runWinnrSealedBootstrapController();
  assert.equal(out.status, 'WINNR_SEALED_BOOTSTRAP_REFUSED');
});

test('consumed sealed bootstrap is replay-safe in a real disposable JSON store', async t => {
  const root = await mkdtemp(join(tmpdir(), 'winnr-consumed-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const config = { root, dataDir: root, storeBackend: 'json', encryptionKey: 'a'.repeat(64) };
  const store = createStore(config);
  await store.init();
  await store.setSetting('winnrSealedBootstrapV1', { consumedAt: '2026-10-02T15:10:31.844Z', payloadDigest: 'test-only', result: { messagesSent: 2 } });
  await store.close();
  for (let i = 0; i < 2; i++) {
    const out = await runWinnrSealedBootstrapController({ config });
    assert.equal(out.status, 'WINNR_SEALED_BOOTSTRAP_ALREADY_CONSUMED');
    assert.equal(out.consumedAt, '2026-10-02T15:10:31.844Z');
  }
  const readback = createStore(config);
  await readback.init();
  assert.deepEqual(await readback.list('messages'), []);
  assert.deepEqual(await readback.list('accounts'), []);
  await readback.close();
});
