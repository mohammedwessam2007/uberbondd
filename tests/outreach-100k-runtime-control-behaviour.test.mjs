import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  OUTREACH_100K_RUNTIME_VERSION,
  buildLiveOutreach100kSummary,
  prepareOutreach100kRuntime,
  runOutreach100kBatch
} from '../src/outreach-100k-runtime-control.mjs';

// The existing wiring suite reads this module as text and regex-matches it, so
// it never executes a line. A logic defect in a module wired into both
// server.mjs and worker.mjs would pass every check this repository has. These
// tests call it.

const tempFile = async (contents) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-100k-'));
  const file = path.join(dir, 'bundle.json');
  await fs.writeFile(file, contents);
  return file;
};

const fakeStore = (reservations = [], settings = {}) => ({
  list: async () => reservations,
  getSettings: async () => settings
});

test('a store missing its interface closes the summary rather than throwing', async () => {
  for (const store of [null, undefined, {}, { list: () => [] }]) {
    const summary = await buildLiveOutreach100kSummary({ store });
    assert.equal(summary.workerOnline, false);
    assert.equal(summary.schedulerActive, false);
    // The safe direction: paused and dry-run when nothing is known.
    assert.equal(summary.outbound.enabled, false);
    assert.equal(summary.outbound.dryRun, true);
    assert.equal(summary.outbound.globalPaused, true);
  }
});

test('uncertain reservations are counted and never treated as sent', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const store = fakeStore([
    { status: 'uncertain' },
    { status: 'uncertain' },
    { status: 'sent', sentAt: `${today}T10:00:00.000Z` },
    { status: 'sent', sentAt: '2020-01-01T10:00:00.000Z' }
  ]);
  const summary = await buildLiveOutreach100kSummary({ store, cfg: {} });
  assert.equal(summary.outbound.uncertain, 2);
  // Only today's confirmed send counts; the 2020 one is not today's.
  assert.equal(summary.providerConfirmedToday, 1);
});

test('the scheduler is active only on an explicit autopilot true', async () => {
  const store = fakeStore();
  for (const autopilot of [undefined, false, 'true', 1, null]) {
    const summary = await buildLiveOutreach100kSummary({ store, cfg: { autopilot } });
    assert.equal(summary.schedulerActive, false, `autopilot=${String(autopilot)} must not activate the scheduler`);
  }
  assert.equal((await buildLiveOutreach100kSummary({ store, cfg: { autopilot: true } })).schedulerActive, true);
});

test('outbound enabled and paused read strict booleans, not truthiness', async () => {
  const summary = await buildLiveOutreach100kSummary({
    store: fakeStore([], { outboundPaused: 'yes' }),
    cfg: { outbound: { enabled: 'yes', dryRun: 'no' } }
  });
  // A string is not true. Reading these loosely would enable live sending on
  // a config typo.
  assert.equal(summary.outbound.enabled, false);
  assert.equal(summary.outbound.dryRun, false);
  assert.equal(summary.outbound.globalPaused, false);
});

test('a missing bundle refuses with a zero-effect ledger instead of throwing', async () => {
  const result = await prepareOutreach100kRuntime({ bundlePath: '/nonexistent/uberbond/bundle.json' });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('runtime-bundle-file-required'));
  assert.equal(result.providerCalls, 0);
  assert.equal(result.messagesSent, 0);
  assert.equal(result.version, OUTREACH_100K_RUNTIME_VERSION);
});

test('a bundle that is not a JSON object is refused', async () => {
  const notJson = await tempFile('this is not json');
  assert.ok((await prepareOutreach100kRuntime({ bundlePath: notJson })).reasonCodes.includes('runtime-bundle-valid-json-required'));

  const array = await tempFile('[1,2,3]');
  assert.ok((await prepareOutreach100kRuntime({ bundlePath: array })).reasonCodes.includes('runtime-bundle-object-required'));
});

test('an empty bundle file is refused before it is parsed', async () => {
  const empty = await tempFile('');
  const result = await prepareOutreach100kRuntime({ bundlePath: empty });
  assert.ok(result.reasonCodes.includes('runtime-bundle-bounded-regular-file-required'));
});

test('a bundle with no campaign id cannot start a campaign', async () => {
  const bundle = await tempFile(JSON.stringify({ mailboxes: [], policy: {} }));
  const result = await prepareOutreach100kRuntime({ bundlePath: bundle });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('100k-campaign-id-required'));
});

test('a batch without a durable outbound store sends nothing', async () => {
  for (const store of [null, {}, { list: async () => [] }]) {
    const result = await runOutreach100kBatch({ store });
    assert.equal(result.ok, false);
    assert.ok(result.reasonCodes.includes('durable-outbound-store-required'));
    assert.equal(result.messagesSent, 0);
    assert.equal(result.providerCalls, 0);
  }
});

test('a batch on an unprepared runtime refuses before reaching a transport', async () => {
  let transportBuilt = false;
  const result = await runOutreach100kBatch({
    store: { reserveOutboundSend: async () => ({ ok: true }) },
    bundlePath: '/nonexistent/uberbond/bundle.json',
    transportFactory: () => { transportBuilt = true; return {}; }
  });
  assert.equal(result.ok, false);
  // The point: nothing that could touch a provider was constructed.
  assert.equal(transportBuilt, false);
  assert.equal(result.providerCalls, 0);
  assert.equal(result.messagesSent, 0);
});
