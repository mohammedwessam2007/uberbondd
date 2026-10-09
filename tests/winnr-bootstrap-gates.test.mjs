import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runWinnrRuntimeBootstrap } from '../src/winnr-runtime-bootstrap.mjs';
import { runWinnrSealedBootstrapController } from '../src/winnr-sealed-bootstrap.mjs';
import { JsonStore } from '../src/store.mjs';

// Both bootstraps are reachable from server.mjs and import mailbox credentials,
// so their refusal gates have to hold before anything touches the network. Every
// case here runs with fetch replaced by a tripwire and must report zero messages.

const KEY = 'a'.repeat(64);

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'winnr-bootstrap-gates-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'config'), { recursive: true });
  const config = { root, dataDir: path.join(root, 'data'), storeBackend: 'json', encryptionKey: KEY, providers: {} };
  return { root, config };
}

function forbidNetwork(t) {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('network-forbidden-in-test'); };
  t.after(() => { globalThis.fetch = original; });
  return () => calls;
}

function sealFor(publicKeyPem, plaintext, fingerprint) {
  const dataKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', dataKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    version: '1',
    algorithm: 'RSA-OAEP-3072-SHA256+A256GCM',
    publicKeyFingerprint: fingerprint,
    wrappedKeyB64: crypto.publicEncrypt({ key: publicKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, dataKey).toString('base64'),
    ivB64: iv.toString('base64'),
    tagB64: cipher.getAuthTag().toString('base64'),
    ciphertextB64: ciphertext.toString('base64'),
    payloadDigest: 'sha256:' + crypto.createHash('sha256').update(plaintext).digest('hex')
  };
}

async function settings(config) {
  const store = new JsonStore(config.dataDir);
  await store.init();
  try { return (await store.getSettings())?.winnrSealedBootstrapV1 ?? null; }
  finally { await store.close().catch(() => {}); }
}

test('runtime bootstrap refuses missing inputs before any provider or mailbox contact', async t => {
  const networkCalls = forbidNetwork(t);
  const out = await runWinnrRuntimeBootstrap({});
  assert.equal(out.ok, false);
  assert.equal(out.status, 'WINNR_RUNTIME_BOOTSTRAP_REFUSED');
  assert.deepEqual(out.reasonCodes, ['config-required', 'credential-export-required', 'token-encryption-key-required', 'owner-controlled-canary-target-required']);
  assert.equal(out.messagesSent, 0);
  assert.equal(networkCalls(), 0);
});

test('runtime bootstrap refuses an unauthorized Winnr account even with credentials in hand', async t => {
  const networkCalls = forbidNetwork(t);
  const { config } = await fixture(t);
  const out = await runWinnrRuntimeBootstrap({ config, csvText: 'email,password\nx@example.com,secret', canaryTarget: 'owner@example.com' });
  assert.equal(out.status, 'WINNR_RUNTIME_BOOTSTRAP_REFUSED');
  assert.ok(out.reasonCodes.includes('winnr-api-token-required'));
  assert.ok(out.reasonCodes.includes('provider-account-authorization-required'));
  assert.equal(out.messagesSent, 0);
  assert.equal(networkCalls(), 0);
  assert.equal(JSON.stringify(out).includes('secret'), false, 'a refusal must not echo credential material');
});

test('sealed bootstrap requires the runtime encryption key', async () => {
  const out = await runWinnrSealedBootstrapController({ config: { encryptionKey: 'short' } });
  assert.equal(out.status, 'WINNR_SEALED_BOOTSTRAP_REFUSED');
  assert.deepEqual(out.reasonCodes, ['token-encryption-key-required']);
});

test('sealed bootstrap publishes one stable public key and keeps the private key encrypted', async t => {
  const { config } = await fixture(t);
  const first = await runWinnrSealedBootstrapController({ config });
  assert.equal(first.status, 'WINNR_SEALED_BOOTSTRAP_KEY_READY');
  assert.equal(first.plaintextPrivateKeyLogged, false);
  const second = await runWinnrSealedBootstrapController({ config });
  assert.equal(second.publicKeyFingerprint, first.publicKeyFingerprint, 'a restart must not rotate the key an owner may already have sealed to');
  const state = await settings(config);
  assert.equal(JSON.stringify(state).includes('PRIVATE KEY'), false);
  assert.equal(state.consumedAt, null);
});

test('an envelope sealed to a different key is refused and does not consume the bootstrap', async t => {
  const networkCalls = forbidNetwork(t);
  const { root, config } = await fixture(t);
  const ready = await runWinnrSealedBootstrapController({ config });
  const publicKeyPem = Buffer.from(ready.publicKeyB64, 'base64').toString('utf8');
  const envelope = sealFor(publicKeyPem, Buffer.from('email,password\n'), 'sha256:' + '0'.repeat(64));
  await fs.writeFile(path.join(root, 'config', 'winnr-bootstrap-sealed.json'), JSON.stringify(envelope));
  const out = await runWinnrSealedBootstrapController({ config });
  assert.equal(out.status, 'WINNR_SEALED_BOOTSTRAP_FAILED');
  assert.deepEqual(out.reasonCodes, ['sealed-envelope-key-fingerprint-mismatch']);
  assert.equal((await settings(config)).consumedAt, null);
  assert.equal(networkCalls(), 0);
});

test('a correctly sealed export still stops at the provider gate and is kept for retry, not consumed', async t => {
  const networkCalls = forbidNetwork(t);
  const { root, config } = await fixture(t);
  const ready = await runWinnrSealedBootstrapController({ config });
  const publicKeyPem = Buffer.from(ready.publicKeyB64, 'base64').toString('utf8');
  const envelope = sealFor(publicKeyPem, Buffer.from('email,password\nx@example.com,secret\n'), ready.publicKeyFingerprint);
  await fs.writeFile(path.join(root, 'config', 'winnr-bootstrap-sealed.json'), JSON.stringify(envelope));
  const out = await runWinnrSealedBootstrapController({ config });
  assert.equal(out.ok, false);
  assert.equal(out.status, 'WINNR_RUNTIME_BOOTSTRAP_REFUSED');
  assert.equal(out.messagesSent, 0);
  assert.equal(out.payloadDigest, envelope.payloadDigest);
  const state = await settings(config);
  assert.equal(state.consumedAt, null, 'only a fully verified transport run may consume the sealed export');
  assert.equal(state.lastPartialResult.status, 'WINNR_RUNTIME_BOOTSTRAP_REFUSED');
  assert.ok(state.privateKeyCiphertext, 'the key survives so the owner does not have to reseal');
  assert.equal(networkCalls(), 0);
});

test('a consumed bootstrap is never reopened', async t => {
  const { config } = await fixture(t);
  const store = new JsonStore(config.dataDir);
  await store.init();
  await store.setSetting('winnrSealedBootstrapV1', { consumedAt: '2026-10-02T00:00:00.000Z', payloadDigest: 'sha256:x', result: { ok: true } });
  await store.close();
  const out = await runWinnrSealedBootstrapController({ config });
  assert.equal(out.status, 'WINNR_SEALED_BOOTSTRAP_ALREADY_CONSUMED');
  assert.equal(out.consumedAt, '2026-10-02T00:00:00.000Z');
});
