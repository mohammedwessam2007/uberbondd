import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildEncryptedSmtpAccount } from '../src/uberfleet.mjs';
import { Store, PostgresStore } from '../src/store.mjs';
import { runWinnrPlacementPhenotypeCanary } from '../src/winnr-placement-phenotype-canary.mjs';
import { validRoutePackage, ALLOW_CONSENT } from './helpers/outbound-route-package.mjs';
import { withDisposablePostgres } from '../scripts/disposable-postgres.mjs';

// Placement canary re-dispatch safety. A mailbox whose outcome is UNCERTAIN, REJECTED, or was never recorded after a
// provider call must not be dispatched again automatically. Every test counts dispatch calls with a fake dispatcher, and
// the PostgreSQL test proves the claim holds across two overlapping calls. No provider, SMTP server or network is touched.

const KEY = 'f'.repeat(64);
const TARGET = 'uberbond.co@gmail.com';
const STATE_KEY = 'winnrPlacementPhenotypeV1';
const NOW = new Date('2026-10-14T10:00:00.000Z');

function smtpAccount({ slot, email }) {
  return buildEncryptedSmtpAccount({
    slot, email, provider: 'smtp-relay', host: 'smtp.example.invalid', username: email, password: 'synthetic-not-a-secret',
    sendingDomainId: 'd1', sendingMailboxId: 'm1', sendingWorkspaceId: 'w1', routeEvidenceRef: 'receipt:route-1',
    routeAuthorized: true, termsCompatible: true, plannedDailyCap: 10, plannedHourlyCap: 3, minGapSeconds: 0
  }, KEY).account;
}

function winnrAccounts() {
  return [1, 2, 3].map(n => {
    const email = `box${n}@example.invalid`;
    return { ...smtpAccount({ slot: `winnr:${email}`, email }), id: `smtp-box${n}` };
  });
}

async function fileStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-placement-redispatch-'));
  const store = new Store(dir);
  await store.init();
  for (const account of winnrAccounts()) await store.add('accounts', account);
  return { store, dir };
}

// Fake dispatcher. outcomes maps an ordinal to a classification object or an Error to throw. Unlisted ordinals are ACCEPTED.
function scriptedDispatch(outcomes, calls) {
  return async ({ account }) => {
    const ordinal = Number(String(account.id).replace('smtp-box', ''));
    calls.push(ordinal);
    const outcome = outcomes[ordinal] ?? { classification: 'ACCEPTED', messageId: `<ok-${ordinal}@example.invalid>` };
    if (outcome instanceof Error) throw outcome;
    return outcome;
  };
}

function canaryArgs(store, dispatchFn, over = {}) {
  return {
    config: { encryptionKey: KEY },
    storeFactory: () => store,
    target: TARGET,
    now: NOW,
    delayFn: async () => {},
    outboundAuthorization: ({ message, account }) => validRoutePackage({ account, message }),
    consentVerifier: ALLOW_CONSENT,
    dispatchFn,
    ...over
  };
}

test('an UNCERTAIN mailbox is not dispatched again on the next call, and the second call makes zero dispatch calls', async () => {
  const { store, dir } = await fileStore();
  const calls = [];
  try {
    const dispatchFn = scriptedDispatch({ 1: { classification: 'UNCERTAIN', reasonCodes: ['smtp-provider-confirmation-required'] } }, calls);
    const first = await runWinnrPlacementPhenotypeCanary(canaryArgs(store, dispatchFn));
    assert.equal(first.ok, false);
    assert.equal(first.status, 'WINNR_PLACEMENT_CANARY_PARTIAL');
    assert.equal(first.automaticRetryAuthorized, false);
    assert.deepEqual(calls, [1]);

    const second = await runWinnrPlacementPhenotypeCanary(canaryArgs(store, dispatchFn));
    assert.equal(second.ok, false);
    assert.equal(second.status, 'WINNR_PLACEMENT_CANARY_PARTIAL');
    assert.equal(second.automaticRetryAuthorized, false);
    assert.equal(calls.length, 1, `second call dispatched ${calls.length - 1} extra time(s): ${JSON.stringify(calls)}`);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('a REJECTED mailbox is not dispatched again on the next call', async () => {
  const { store, dir } = await fileStore();
  const calls = [];
  try {
    const dispatchFn = scriptedDispatch({ 1: { classification: 'REJECTED', reasonCodes: ['smtp-transport-not-ready'] } }, calls);
    const first = await runWinnrPlacementPhenotypeCanary(canaryArgs(store, dispatchFn));
    assert.equal(first.status, 'WINNR_PLACEMENT_CANARY_PARTIAL');
    const second = await runWinnrPlacementPhenotypeCanary(canaryArgs(store, dispatchFn));
    assert.equal(second.status, 'WINNR_PLACEMENT_CANARY_PARTIAL');
    assert.equal(second.automaticRetryAuthorized, false);
    assert.equal(calls.length, 1, `second call dispatched ${calls.length - 1} extra time(s): ${JSON.stringify(calls)}`);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('after an accepted first mailbox, an UNCERTAIN second mailbox is not re-dispatched and the first is not re-sent', async () => {
  const { store, dir } = await fileStore();
  const calls = [];
  try {
    const dispatchFn = scriptedDispatch({ 2: { classification: 'UNCERTAIN' } }, calls);
    const first = await runWinnrPlacementPhenotypeCanary(canaryArgs(store, dispatchFn));
    assert.equal(first.status, 'WINNR_PLACEMENT_CANARY_PARTIAL');
    assert.deepEqual(calls, [1, 2]);

    const second = await runWinnrPlacementPhenotypeCanary(canaryArgs(store, dispatchFn));
    assert.equal(second.status, 'WINNR_PLACEMENT_CANARY_PARTIAL');
    assert.equal(second.automaticRetryAuthorized, false);
    assert.deepEqual(calls, [1, 2], `second call dispatched again: ${JSON.stringify(calls)}`);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('a dispatch that throws is recorded as UNCERTAIN, returned as a refusal state, and never re-dispatched', async () => {
  const { store, dir } = await fileStore();
  const calls = [];
  try {
    const dispatchFn = scriptedDispatch({ 1: new Error('socket reset after DATA') }, calls);
    const first = await runWinnrPlacementPhenotypeCanary(canaryArgs(store, dispatchFn));
    assert.equal(first.status, 'WINNR_PLACEMENT_CANARY_PARTIAL');
    assert.equal(first.results.at(-1).classification, 'UNCERTAIN');
    assert.equal(first.automaticRetryAuthorized, false);

    const second = await runWinnrPlacementPhenotypeCanary(canaryArgs(store, dispatchFn));
    assert.equal(second.status, 'WINNR_PLACEMENT_CANARY_PARTIAL');
    assert.deepEqual(calls, [1], `second call dispatched again: ${JSON.stringify(calls)}`);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('a claim whose send was accepted but whose record write failed blocks the next call instead of replaying the send', async () => {
  const { store, dir } = await fileStore();
  const calls = [];
  try {
    // The post-send record write fails. The provider has already accepted mailbox 1 at this point.
    const realSetSetting = store.setSetting.bind(store);
    store.setSetting = async (key, value) => {
      if (key === STATE_KEY && (value?.results || []).some(row => row.classification === 'ACCEPTED')) {
        throw new Error('record write failed after provider acceptance');
      }
      return realSetSetting(key, value);
    };
    const dispatchFn = scriptedDispatch({}, calls);
    await assert.rejects(() => runWinnrPlacementPhenotypeCanary(canaryArgs(store, dispatchFn)), /record write failed/);
    assert.deepEqual(calls, [1]);

    const second = await runWinnrPlacementPhenotypeCanary(canaryArgs(store, dispatchFn)).catch(error => ({ threw: error.message }));
    assert.equal(second.threw, undefined, `second call must refuse, not throw: ${second.threw}`);
    assert.equal(second.status, 'WINNR_PLACEMENT_CANARY_PARTIAL');
    assert.equal(second.automaticRetryAuthorized, false);
    assert.deepEqual(calls, [1], `mailbox 1 was dispatched again after an unrecorded claim: ${JSON.stringify(calls)}`);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('a completed run is reported as already completed on the next call with zero dispatch calls', async () => {
  const { store, dir } = await fileStore();
  const calls = [];
  try {
    const dispatchFn = scriptedDispatch({}, calls);
    const first = await runWinnrPlacementPhenotypeCanary(canaryArgs(store, dispatchFn));
    assert.equal(first.ok, true);
    assert.equal(first.status, 'WINNR_PLACEMENT_CANARY_SENT');
    assert.deepEqual(calls, [1, 2, 3]);

    const second = await runWinnrPlacementPhenotypeCanary(canaryArgs(store, dispatchFn));
    assert.equal(second.ok, true);
    assert.equal(second.status, 'WINNR_PLACEMENT_CANARY_ALREADY_COMPLETED');
    assert.deepEqual(calls, [1, 2, 3]);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('two overlapping calls on PostgreSQL dispatch the first mailbox at most once', () => withDisposablePostgres(async url => {
  const seed = new PostgresStore({ databaseUrl: url, ssl: false });
  await seed.init();
  try {
    for (const account of winnrAccounts()) await seed.upsert('accounts', account);
    const calls = [];
    // A slow send widens the window in which a second call could start the same mailbox.
    const dispatchFn = async ({ account }) => {
      const ordinal = Number(String(account.id).replace('smtp-box', ''));
      calls.push(ordinal);
      await new Promise(resolve => setTimeout(resolve, 300));
      return { classification: 'ACCEPTED', messageId: `<pg-${ordinal}@example.invalid>` };
    };
    const pgArgs = () => canaryArgs(null, dispatchFn, { storeFactory: () => new PostgresStore({ databaseUrl: url, ssl: false }) });
    await Promise.all([
      runWinnrPlacementPhenotypeCanary(pgArgs()),
      runWinnrPlacementPhenotypeCanary(pgArgs())
    ]);
    assert.equal(calls.filter(ordinal => ordinal === 1).length, 1, `mailbox 1 dispatched ${calls.filter(o => o === 1).length} times: ${JSON.stringify(calls)}`);
    assert.equal(new Set(calls).size, calls.length, `an ordinal was dispatched twice: ${JSON.stringify(calls)}`);
  } finally {
    await seed.close();
  }
}));
