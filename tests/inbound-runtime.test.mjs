// P0-08 hostile tests: the real inbound-only runtime composition, not individually mocked pieces.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store.mjs';
import { createInboundOnlyRuntime } from '../src/inbound-runtime.mjs';
import { sealInboundTokens } from '../src/gmail-inbound.mjs';
import { runAutonomyCycle } from '../src/autonomy-cycle.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const inboundRuntimeSource = await fs.readFile(path.join(here, '../src/inbound-runtime.mjs'), 'utf8');
const entryPointSource = await fs.readFile(path.join(here, '../scripts/run-autonomy-cycle.mjs'), 'utf8');

const KEY = Buffer.alloc(32, 5).toString('hex');

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-inbound-runtime-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

function baseCfg(overrides = {}) {
  return {
    encryptionKey: KEY,
    inbound: {
      provider: 'gmail', enabled: true, gmailReadEnabled: true, allowNetwork: true,
      limits: {
        maxPagesPerCycle: 5, maxMessagesPerPage: 25, maxMessageBytes: 2 * 1024 * 1024,
        maxResponseBytes: 5 * 1024 * 1024, maxMimeDepth: 10, maxMimePartCount: 200, maxDecodedBodyBytes: 262144,
        maxStageRuntimeMs: 5000, maxCycleRuntimeMs: 30000, maxStageRetries: 3,
        maxOwnerExceptionsPerCycle: 25, maxSummaryBytes: 8192, leaseTtlMs: 60000
      },
      ...overrides.inbound
    },
    inboundGoogle: { clientId: 'client-id', clientSecret: 'client-secret', redirectUri: 'https://example.com/cb', ...overrides.inboundGoogle }
  };
}

function jsonHeaders(extra = {}) {
  const map = new Map(Object.entries(extra));
  return { get: name => (map.has(name.toLowerCase()) ? map.get(name.toLowerCase()) : null) };
}
function jsonResponse(body) {
  const text = JSON.stringify(body);
  return { ok: true, status: 200, headers: jsonHeaders({ 'content-length': String(Buffer.byteLength(text)) }), text: async () => text };
}

async function approvedAccount(store) {
  const created = await store.createInboundAccount({
    provider: 'gmail', accountIdentity: 'owner@example.com', approvalStatus: 'approved', active: true,
    encryptedTokens: sealInboundTokens({ access_token: 'live-token', refresh_token: 'refresh-abc', expires_at: Date.now() + 3600000 }, KEY)
  });
  assert.equal(created.ok, true);
  return created.account;
}

test('CAP: inbound-runtime.mjs never imports the mixed/send-capable gmail.mjs or any outbound module', () => {
  const forbidden = ["'./gmail.mjs'", '"./gmail.mjs"', "'./pipeline.mjs'", '"./pipeline.mjs"', "'./revenue.mjs'", '"./revenue.mjs"', "'./job-handlers.mjs'", '"./job-handlers.mjs"', "'./queue.mjs'", '"./queue.mjs"', "'./scheduler.mjs'", '"./scheduler.mjs"'];
  for (const needle of forbidden) assert.ok(!inboundRuntimeSource.includes(needle), `must not import ${needle}`);
  const importLines = inboundRuntimeSource.split('\n').filter(line => /^\s*import\b/.test(line));
  const allowed = ["'./gmail-inbound.mjs'"];
  for (const line of importLines) assert.ok(allowed.some(ok => line.includes(ok)), `unexpected import: ${line.trim()}`);
});

test('CAP: inbound-runtime.mjs exports no send-capable method or symbol', () => {
  for (const forbidden of ['sendEmail', 'sendMessage', '.draft(', '.reply(', '.forward(', '.modify(', '.trash(', '.label(', 'outbound.process', 'followups.process']) {
    assert.ok(!inboundRuntimeSource.includes(forbidden), `must not contain ${forbidden}`);
  }
});

test('CAP: scripts/run-autonomy-cycle.mjs still has no schedule and imports only the reviewed inbound-runtime factory', () => {
  assert.ok(!entryPointSource.includes('cron'));
  assert.ok(!entryPointSource.includes('setInterval'));
  assert.ok(entryPointSource.includes("from '../src/inbound-runtime.mjs'"));
});

test('GM-01: disabled by default -- factory refuses to compose when either inbound flag is false', async () => {
  const store = await tempStore();
  await approvedAccount(store);
  for (const inboundOverrides of [{ enabled: false }, { gmailReadEnabled: false }, { enabled: false, gmailReadEnabled: false }]) {
    const result = await createInboundOnlyRuntime(baseCfg({ inbound: inboundOverrides }), { store });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'inbound-disabled');
    assert.equal(result.reader, null);
  }
});

test('GM-02: missing inbound credentials block the runtime with a bounded reason, not a crash', async () => {
  const store = await tempStore();
  await approvedAccount(store);
  for (const missing of [{ clientId: '' }, { clientSecret: '' }, { redirectUri: '' }]) {
    const result = await createInboundOnlyRuntime(baseCfg({ inboundGoogle: missing }), { store });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'missing-inbound-credentials');
  }
});

test('GM-03: without any approved+active account, the factory fails closed with a bounded owner-visible result', async () => {
  const store = await tempStore();
  // An account exists but is still pending -- must not be treated as approved.
  await store.createInboundAccount({ provider: 'gmail', accountIdentity: 'pending@example.com', encryptedTokens: sealInboundTokens({ access_token: 'x', refresh_token: 'y', expires_at: Date.now() + 1000 }, KEY) });
  const result = await createInboundOnlyRuntime(baseCfg(), { store });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no-approved-accounts');
  assert.equal(result.reader, null);
  assert.deepEqual(result.accounts, []);
});

test('GM-04: fake-HTTP integration test executes the REAL composition path end to end', async () => {
  const store = await tempStore();
  await approvedAccount(store);
  const fakeFetch = async url => {
    if (String(url).includes('oauth2.googleapis.com')) return jsonResponse({ access_token: 'still-fresh', expires_in: 3600 });
    if (String(url).includes('/messages?')) return jsonResponse({ messages: [{ id: 'm1' }] });
    if (String(url).includes('/messages/m1')) {
      return jsonResponse({ id: 'm1', threadId: 'thread-1', payload: { headers: [{ name: 'from', value: 'lead@example.com' }, { name: 'subject', value: 'question' }], mimeType: 'text/plain', body: {} } });
    }
    throw new Error(`unexpected fake fetch url: ${url}`);
  };
  const cfg = baseCfg();
  const bootstrap = await createInboundOnlyRuntime(cfg, { store, fetch: fakeFetch });
  assert.equal(bootstrap.ok, true);
  assert.equal(bootstrap.accounts.length, 1);
  const result = await runAutonomyCycle({ store, cfg, runKey: 'rt-run-1', leaseOwner: 'worker-1', mailboxReader: bootstrap.reader, accounts: bootstrap.accounts });
  assert.equal(result.ok, true);
  assert.equal(result.digest.counts.messagesFetched, 1);
  assert.equal(result.digest.counts.processed, 1);
});

test('GM-18: the composed runtime still fails closed under NODE_ENV=test even with allowNetwork:true', async () => {
  const store = await tempStore();
  await approvedAccount(store);
  const bootstrap = await createInboundOnlyRuntime(baseCfg(), { store, fetch: async () => { throw new Error('must never be called -- requireInboundNetwork should reject first'); } });
  assert.equal(bootstrap.ok, true);
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  try {
    await assert.rejects(() => bootstrap.reader.getProfile(bootstrap.accounts[0], KEY), error => {
      assert.equal(error.code, 'gmail-inbound-network-disabled');
      return true;
    });
  } finally {
    process.env.NODE_ENV = previous;
  }
});
