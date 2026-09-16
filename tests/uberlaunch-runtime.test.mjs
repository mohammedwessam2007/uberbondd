import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  compileUberLaunchPreflight,
  createFilePressLedger,
  executeUberLaunchPress,
  readUberLaunchPacket,
  validateFounderPress
} from '../src/uberlaunch-runtime.mjs';
import { createHandler } from '../api/uberlaunch.mjs';

const NOW = new Date('2026-09-15T00:00:00.000Z');
const COMMIT = 'a'.repeat(40);

function packet(overrides = {}) {
  return {
    observedAt: NOW.toISOString(),
    sourceCommit: COMMIT,
    idempotencyKey: 'launch-1',
    sourceReadiness: { state: 'VERIFIED_SOURCE_READY', evidenceRef: 'src-proof' },
    discovery: { state: 'READY', sourceClass: 'PUBLIC_BUSINESS_DATA', qualifiedProspectCount: 25, evidenceRef: 'disc-proof' },
    substrate: { mode: 'SELF_HOSTED', controlPlane: 'OWNED', substrateId: 'UBERCLOUD', observedHealthy: true, evidenceRef: 'runtime-proof' },
    launchInputs: {
      genome: { state: 'VERIFIED_SOURCE_READY', evidenceRef: 'genome-proof' },
      domainState: { domainId: 'uberbond.cloud', state: 'READY_FOR_LIMITED_OUTREACH', outreachState: 'AUTHORIZED', evidenceFreshness: 'FRESH' },
      mailboxState: { mailboxId: 'mbx-1', authenticationStatus: 'AUTHENTICATED', warmupStatus: 'WARMUP_COMPLETE', paused: false, currentDailyCap: 5 },
      egress: { state: 'READY', observedColdDailyCap: 5, evidenceRef: 'egress-proof' },
      transport: { state: 'READY', authenticated: true, evidenceRef: 'transport-proof' },
      campaignAuthorization: { authorized: true, receiptId: 'campaign-auth', expiresAt: '2026-09-15T01:00:00.000Z' },
      recipient: { safeForOutreach: true, email: 'buyer@example.com', verificationEvidenceRef: 'verify-proof' },
      legal: { status: 'PASSED', evidenceId: 'legal-proof', policyVersion: 'v1' },
      suppression: { suppressed: false, unsubscribed: false },
      recipientProvider: { state: 'READY', observedDailyBudget: 5, evidenceRef: 'budget-proof' }
    },
    dispatchAuthorization: {
      authorized: true,
      receiptId: 'dispatch-auth',
      authorizedBy: 'FOUNDER',
      recipientEmail: 'buyer@example.com',
      campaignId: 'canary-1',
      expiresAt: '2026-09-15T00:10:00.000Z'
    },
    message: {
      to: 'buyer@example.com',
      from: 'founder@uberbond.cloud',
      campaignId: 'canary-1',
      subject: 'Evidence canary',
      body: 'Bounded synthetic test.'
    },
    ...overrides
  };
}

function jsonResponse() {
  return {
    statusCode: null,
    body: null,
    headers: null,
    writeHead(code, headers) { this.statusCode = code; this.headers = headers; },
    end(value) { this.body = value ? JSON.parse(value) : null; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
}

async function tempDir() { return mkdtemp(path.join(os.tmpdir(), 'uberlaunch-')); }

function memoryLedger() {
  const seen = new Map();
  return {
    async acquire(key) {
      if (seen.has(key)) return { acquired: false, file: key, prior: seen.get(key) };
      seen.set(key, { state: 'RESERVED' });
      return { acquired: true, file: key };
    },
    async record(file, result) { seen.set(file, { state: 'FINALIZED', result }); }
  };
}

test('fresh environment packet is accepted and commit-bound', async () => {
  const out = await readUberLaunchPacket({ UBERLAUNCH_PACKET_JSON: JSON.stringify(packet()), UBERBOND_SOURCE_COMMIT: COMMIT }, NOW);
  assert.equal(out.ok, true);
  assert.equal(out.source, 'ENV_FALLBACK');
  assert.equal(out.packet.sourceCommit, COMMIT);
});

test('stale packet and source mismatch fail closed', async () => {
  const stale = packet({ observedAt: '2026-09-14T23:50:00.000Z' });
  const a = await readUberLaunchPacket({ UBERLAUNCH_PACKET_JSON: JSON.stringify(stale), UBERBOND_SOURCE_COMMIT: COMMIT }, NOW);
  assert.equal(a.ok, false);
  assert.ok(a.reasonCodes.includes('uberlaunch-runtime-packet-stale'));
  const b = await readUberLaunchPacket({ UBERLAUNCH_PACKET_JSON: JSON.stringify(packet()), UBERBOND_SOURCE_COMMIT: 'b'.repeat(40) }, NOW);
  assert.equal(b.ok, false);
  assert.ok(b.reasonCodes.includes('uberlaunch-runtime-source-commit-mismatch'));
});

test('self-hosted absolute packet file is preferred over env fallback', async t => {
  const dir = await tempDir();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'launch.json');
  await writeFile(file, JSON.stringify(packet({ idempotencyKey: 'file-key' })), 'utf8');
  const out = await readUberLaunchPacket({ UBERLAUNCH_PACKET_PATH: file, UBERLAUNCH_PACKET_JSON: '{}', UBERBOND_SOURCE_COMMIT: COMMIT }, NOW);
  assert.equal(out.ok, true);
  assert.equal(out.source, 'SELF_HOSTED_RUNTIME_FILE');
  assert.equal(out.packet.idempotencyKey, 'file-key');
});

test('relative runtime packet paths are refused', async () => {
  const out = await readUberLaunchPacket({ UBERLAUNCH_PACKET_PATH: 'relative/launch.json' }, NOW);
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('uberlaunch-runtime-packet-path-must-be-absolute'));
});

test('preflight becomes founder-press-ready without creating external authority', async () => {
  const read = await readUberLaunchPacket({ UBERLAUNCH_PACKET_JSON: JSON.stringify(packet()), UBERBOND_SOURCE_COMMIT: COMMIT }, NOW);
  const out = compileUberLaunchPreflight({ packetRead: read, adminSecret: 'secret', now: NOW });
  assert.equal(out.state, 'READY_FOR_FOUNDER_PRESS');
  assert.equal(out.pressable, true);
  assert.match(out.nonce, /^[a-f0-9]{64}$/);
  assert.match(out.truthBoundary, /creates no effect authority/);
});

test('invalid founder nonce refuses before any transport call', async () => {
  const read = await readUberLaunchPacket({ UBERLAUNCH_PACKET_JSON: JSON.stringify(packet()), UBERBOND_SOURCE_COMMIT: COMMIT }, NOW);
  let calls = 0;
  const result = await executeUberLaunchPress({
    packetRead: read,
    adminSecret: 'secret',
    suppliedNonce: 'bad',
    ledger: memoryLedger(),
    transportAdapter: { send: async () => { calls += 1; return { confirmed: true, providerReceiptId: 'x' }; } },
    now: NOW
  });
  assert.equal(result.ok, false);
  assert.equal(calls, 0);
  assert.ok(result.reasonCodes.includes('press-nonce-invalid'));
});

test('exact founder nonce validates only inside its short expiry', async () => {
  const read = await readUberLaunchPacket({ UBERLAUNCH_PACKET_JSON: JSON.stringify(packet()), UBERBOND_SOURCE_COMMIT: COMMIT }, NOW);
  const preflight = compileUberLaunchPreflight({ packetRead: read, adminSecret: 'secret', now: NOW });
  assert.equal(validateFounderPress({ preflight, suppliedNonce: preflight.nonce, adminSecret: 'secret', now: NOW }).ok, true);
  const late = new Date(Date.parse(preflight.expiresAt) + 1);
  assert.equal(validateFounderPress({ preflight, suppliedNonce: preflight.nonce, adminSecret: 'secret', now: late }).ok, false);
});

test('durable file ledger atomically blocks duplicate press and does not persist plaintext idempotency key', async t => {
  const dir = await tempDir();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const ledger = createFilePressLedger({ directory: dir });
  const first = await ledger.acquire('super-secret-idempotency-key');
  const second = await ledger.acquire('super-secret-idempotency-key');
  assert.equal(first.acquired, true);
  assert.equal(second.acquired, false);
  const raw = await readFile(first.file, 'utf8');
  assert.doesNotMatch(raw, /super-secret-idempotency-key/);
});

test('green press dispatches once and duplicate cannot dispatch again', async () => {
  const read = await readUberLaunchPacket({ UBERLAUNCH_PACKET_JSON: JSON.stringify(packet()), UBERBOND_SOURCE_COMMIT: COMMIT }, NOW);
  const preflight = compileUberLaunchPreflight({ packetRead: read, adminSecret: 'secret', now: NOW });
  const ledger = memoryLedger();
  let calls = 0;
  const transport = { send: async () => { calls += 1; return { confirmed: true, providerReceiptId: 'provider-1' }; } };
  const first = await executeUberLaunchPress({ packetRead: read, adminSecret: 'secret', suppliedNonce: preflight.nonce, ledger, transportAdapter: transport, now: NOW });
  const second = await executeUberLaunchPress({ packetRead: read, adminSecret: 'secret', suppliedNonce: preflight.nonce, ledger, transportAdapter: transport, now: NOW });
  assert.equal(first.ok, true);
  assert.equal(first.state, 'PROVIDER_CONFIRMED_SEND');
  assert.equal(second.state, 'DUPLICATE_PRESS_REFUSED');
  assert.equal(calls, 1);
});

test('uncertain provider outcome is reserved and cannot be retried by pressing again', async () => {
  const read = await readUberLaunchPacket({ UBERLAUNCH_PACKET_JSON: JSON.stringify(packet()), UBERBOND_SOURCE_COMMIT: COMMIT }, NOW);
  const preflight = compileUberLaunchPreflight({ packetRead: read, adminSecret: 'secret', now: NOW });
  const ledger = memoryLedger();
  let calls = 0;
  const transport = { send: async () => { calls += 1; return { confirmed: false }; } };
  const first = await executeUberLaunchPress({ packetRead: read, adminSecret: 'secret', suppliedNonce: preflight.nonce, ledger, transportAdapter: transport, now: NOW });
  const second = await executeUberLaunchPress({ packetRead: read, adminSecret: 'secret', suppliedNonce: preflight.nonce, ledger, transportAdapter: transport, now: NOW });
  assert.equal(first.state, 'DISPATCH_OUTCOME_UNCERTAIN');
  assert.equal(first.automaticRetryAuthorized, false);
  assert.equal(second.state, 'DUPLICATE_PRESS_REFUSED');
  assert.equal(calls, 1);
});

test('API refuses absent admin auth and wrong bearer without reading launch packet', async () => {
  let reads = 0;
  const noSecret = createHandler({ env: {}, readUberLaunchPacket: async () => { reads += 1; return {}; } });
  const r1 = jsonResponse();
  await noSecret({ method: 'GET', headers: {} }, r1);
  assert.equal(r1.statusCode, 503);
  const wrong = createHandler({ env: { ADMIN_TOKEN: 'secret' }, readUberLaunchPacket: async () => { reads += 1; return {}; } });
  const r2 = jsonResponse();
  await wrong({ method: 'GET', headers: { authorization: 'Bearer nope' } }, r2);
  assert.equal(r2.statusCode, 401);
  assert.equal(reads, 0);
});

test('API GET is evidence-only and POST requires explicit press confirmation', async () => {
  const fakeRead = { ok: true, packet: packet(), reasonCodes: [] };
  const handler = createHandler({
    env: { ADMIN_TOKEN: 'secret' },
    now: () => NOW,
    readUberLaunchPacket: async () => fakeRead,
    compileUberLaunchPreflight: () => ({ state: 'READY_FOR_FOUNDER_PRESS', pressable: true, nonce: 'n', qualifiedProspectCount: 25 }),
    executeUberLaunchPress: async () => { throw new Error('must-not-run'); }
  });
  const get = jsonResponse();
  await handler({ method: 'GET', headers: { authorization: 'Bearer secret' } }, get);
  assert.equal(get.statusCode, 200);
  assert.equal(get.body.effectAuthority, 'NONE_UNTIL_FOUNDER_PRESS');
  const post = jsonResponse();
  await handler({ method: 'POST', headers: { authorization: 'Bearer secret' }, body: { confirm: 'nope' } }, post);
  assert.equal(post.statusCode, 400);
  assert.equal(post.body.state, 'BIG_BUTTON_REFUSED');
});

test('API green POST passes nonce to governed press executor and never needs a managed SaaS sender', async () => {
  let executed = null;
  const handler = createHandler({
    env: { ADMIN_TOKEN: 'secret', UBERLAUNCH_PRESS_LEDGER_DIR: '/tmp/ignored-by-injected-ledger' },
    now: () => NOW,
    readUberLaunchPacket: async () => ({ ok: true, packet: packet(), reasonCodes: [] }),
    compileUberLaunchPreflight: () => ({ state: 'READY_FOR_FOUNDER_PRESS', pressable: true, nonce: 'nonce-1' }),
    ledger: memoryLedger(),
    transportAdapter: { provider: 'SELF_HOSTED_POSTAL', send: async () => ({ confirmed: true, providerReceiptId: 'x' }) },
    executeUberLaunchPress: async input => { executed = input; return { ok: true, state: 'PROVIDER_CONFIRMED_SEND', providerReceiptId: 'receipt-1' }; }
  });
  const res = jsonResponse();
  await handler({ method: 'POST', headers: { authorization: 'Bearer secret' }, body: { confirm: 'PRESS_UBERLAUNCH', nonce: 'nonce-1' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.providerReceiptId, 'receipt-1');
  assert.equal(executed.suppliedNonce, 'nonce-1');
  assert.equal(executed.transportAdapter.provider, 'SELF_HOSTED_POSTAL');
});

test('launch UI keeps token memory-only, starts disabled, and disables automatic retry on uncertain browser result', async () => {
  const html = await readFile(new URL('../public/uberlaunch.html', import.meta.url), 'utf8');
  const js = await readFile(new URL('../public/uberlaunch.js', import.meta.url), 'utf8');
  assert.match(html, /id="launch"[^>]*disabled/);
  assert.match(html, /PRESS UBERLAUNCH/);
  assert.doesNotMatch(js, /localStorage|sessionStorage|indexedDB/i);
  assert.match(js, /Do not retry automatically/i);
  assert.match(js, /credential=''/);
});
