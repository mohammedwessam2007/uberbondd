import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { DiscoveryRunner } from '../src/discovery-runner.mjs';

// The second of exactly two production-reachable modules that no gate exercised.
//
// Every refusal below happens before `discoverBusinesses` is reached, so this
// suite proves the guards without making a single external request. The success
// path deliberately is not tested here: it calls a real Overpass endpoint, and a
// test that reaches the public internet to prove a guard is a worse trade than
// leaving the guard proven and the happy path to the discovery suite.
//
// What matters about this module is not that it discovers. It is that it refuses
// four specific ways, and records the refusal instead of swallowing it.

async function harness({ campaign, discovery = {} } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-discovery-runner-'));
  const store = new Store(dir);
  await store.init();
  if (campaign) await store.add('campaigns', campaign);
  const config = {
    discovery: {
      campaignId: 'camp', bbox: '51.5,-0.2,51.6,-0.1', categories: ['dentist'],
      country: 'United Kingdom', city: 'London', dailyCap: 10, dryRun: false,
      ...discovery
    }
  };
  return { store, runner: new DiscoveryRunner(store, config) };
}

const approved = { id: 'camp', approved: true };
const runs = store => store.list('discoveryRuns');

test('an unknown campaign refuses, and the refusal is recorded', async () => {
  const { store, runner } = await harness({ campaign: approved, discovery: { campaignId: 'does-not-exist' } });
  await assert.rejects(() => runner.run({}), /valid discovery campaign is required/);

  const [record] = await runs(store);
  assert.equal(record.status, 'error', 'a refused run is recorded, not silently dropped');
  assert.equal(record.importedCount, 0);
  assert.match(record.error, /valid discovery campaign is required/);
});

test('an unapproved campaign refuses before any discovery happens', async () => {
  const { store, runner } = await harness({ campaign: { id: 'camp', approved: false } });
  await assert.rejects(() => runner.run({}), /campaign must be approved/);

  const [record] = await runs(store);
  assert.equal(record.status, 'error');
  assert.equal(record.discoveredCount, 0, 'nothing was discovered, so nothing may be counted');
  assert.equal(record.importedCount, 0);
});

// Approval is per-campaign and must not be inferable from anything else on the
// run: not a bbox, not a category list, not the caller asking nicely.
test('no option can substitute for campaign approval', async () => {
  for (const options of [
    { scheduled: true },
    { limit: 1 },
    { dryRun: true },
    { bbox: '51.5,-0.2,51.6,-0.1', categories: ['dentist'], country: 'United Kingdom' }
  ]) {
    const { runner } = await harness({ campaign: { id: 'camp', approved: false } });
    await assert.rejects(() => runner.run(options), /campaign must be approved/,
      `options ${JSON.stringify(options)} must not bypass approval`);
  }
});

test('a missing bounding box refuses rather than discovering everything', async () => {
  const { store, runner } = await harness({ campaign: approved, discovery: { bbox: '' } });
  await assert.rejects(() => runner.run({ bbox: '' }), /bounding box is required/);
  const [record] = await runs(store);
  assert.equal(record.status, 'error');
});

// The cap is a real reservation against the day's imports, not a suggestion.
test('an exhausted daily cap refuses the run', async () => {
  const { store, runner } = await harness({ campaign: approved, discovery: { dailyCap: 5 } });
  const today = new Date().toISOString().slice(0, 10);
  await store.add('discoveryRuns', {
    id: 'disc_already_used', runDate: today, status: 'completed', importedCount: 5
  });

  await assert.rejects(() => runner.run({}), /Daily discovery import cap reached/);
  const errored = (await runs(store)).filter(run => run.status === 'error');
  assert.equal(errored.length, 1);
  assert.equal(errored[0].importedCount, 0);
});

test('an errored run does not consume the next run\'s capacity', async () => {
  const { store, runner } = await harness({ campaign: { id: 'camp', approved: false }, discovery: { dailyCap: 5 } });
  await assert.rejects(() => runner.run({}), /campaign must be approved/);

  const today = new Date().toISOString().slice(0, 10);
  const remaining = await store.reserveDiscoveryCapacity(today, 5, 5, 'a-later-run');
  assert.equal(remaining, 5,
    'a run that never imported anything must not have burned the day\'s quota');
});

// A dry run is not effect-free, and the distinction is worth stating: it still
// reaches Overpass, it just does not import. Anyone reading `dryRun` as "makes
// no request" would be wrong. What it does guarantee is that no prospect is
// persisted, which is asserted here by refusing before the request is made.
test('a dry run still requires an approved campaign and a bounding box', async () => {
  const unapproved = await harness({ campaign: { id: 'camp', approved: false } });
  await assert.rejects(() => unapproved.runner.run({ dryRun: true }), /campaign must be approved/);

  const noBbox = await harness({ campaign: approved, discovery: { bbox: '' } });
  await assert.rejects(() => noBbox.runner.run({ dryRun: true, bbox: '' }), /bounding box is required/);
});

test('every refusal is a permanent error, not a retryable one', async () => {
  const cases = [
    [{ campaign: approved, discovery: { campaignId: 'missing' } }, {}],
    [{ campaign: { id: 'camp', approved: false } }, {}],
    [{ campaign: approved, discovery: { bbox: '' } }, { bbox: '' }]
  ];
  for (const [setup, options] of cases) {
    const { runner } = await harness(setup);
    const error = await runner.run(options).then(() => null, caught => caught);
    assert.ok(error, 'the run must reject');
    assert.equal(error.retryable, false,
      'a refusal that retrying cannot fix must say so, or a scheduler will retry it forever');
  }
});

test('the failure is logged as well as recorded on the run', async () => {
  const { store, runner } = await harness({ campaign: { id: 'camp', approved: false } });
  await assert.rejects(() => runner.run({}));
  const failures = (await store.list('auditLog')).filter(row => row.type === 'discovery_failed');
  assert.equal(failures.length, 1, 'an operator reading the audit log must see the failure');
  assert.match(JSON.stringify(failures[0].detail), /campaign must be approved/);
});
