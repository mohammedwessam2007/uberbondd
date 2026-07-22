import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { Store, ConflictError, PostgresStore } from '../src/store.mjs';

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-store-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

// PGlite is an embedded, in-process Postgres — this exercises the real
// PostgresStore class (including its FOR UPDATE SKIP LOCKED SQL) without ever
// connecting to a real database, so these tests never touch Neon.
async function tempPostgresStore() {
  const db = new PGlite();
  const migrations = (await fs.readdir(new URL('../migrations/', import.meta.url))).filter(name => name.endsWith('.sql')).sort();
  for (const migration of migrations) await db.exec(await fs.readFile(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
  const client = { query: (...args) => db.query(...args), release() {} };
  const pool = { query: (...args) => db.query(...args), connect: async () => client };
  return { db, store: new PostgresStore({ pool }) };
}

function minutesAgoIso(minutes) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

test('JSON repository is asynchronous and transaction rollback is atomic', async () => {
  const store = await tempStore();
  await assert.rejects(
    store.transaction(async tx => {
      await tx.add('campaigns', { id: 'camp_1', name: 'One', approved: true, autoSend: false, createdAt: new Date().toISOString() });
      throw new Error('rollback');
    }),
    /rollback/
  );
  assert.equal(await store.count('campaigns'), 0);
});

test('JSON repository enforces domain, suppression, reply, payment and slot uniqueness', async () => {
  const store = await tempStore();
  await store.add('prospects', { id: 'p1', domain: 'example.com', website: 'https://example.com', status: 'queued' });
  await assert.rejects(store.add('prospects', { id: 'p2', domain: 'example.com', website: 'https://example.com/x', status: 'queued' }), ConflictError);
  await store.add('suppressions', { id: 's1', value: 'no@example.com' });
  await assert.rejects(store.add('suppressions', { id: 's2', value: 'NO@example.com' }), ConflictError);
  await store.add('replies', { id: 'r1', gmailId: 'gmail-1' });
  await assert.rejects(store.add('replies', { id: 'r2', gmailId: 'gmail-1' }), ConflictError);
  await store.add('accounts', { id: 'a1', slot: 'A' });
  await assert.rejects(store.add('accounts', { id: 'a2', slot: 'A' }), ConflictError);
  await store.add('orders', { id: 'o1', providerEventId: 'evt-1' });
  await assert.rejects(store.add('orders', { id: 'o2', providerEventId: 'evt-1' }), ConflictError);
  await store.add('offers', { id: 'offer-1', prospectId: 'p1', type: 'diagnostic', currency: 'usd', status: 'draft' });
  await assert.rejects(store.add('offers', { id: 'offer-2', prospectId: 'p1', type: 'diagnostic', currency: 'USD', status: 'draft' }), ConflictError);
  assert.equal((await store.get('offers', 'offer-1')).currency, 'USD');
  await store.add('deliveries', { id: 'delivery-1', orderId: 'o1', prospectId: 'p1', status: 'delivery-queued' });
  await assert.rejects(store.add('deliveries', { id: 'delivery-2', orderId: 'o1', prospectId: 'p1', status: 'delivery-queued' }), ConflictError);
});

test('JSON repository transaction can create circular lead/prospect pair safely', async () => {
  const store = await tempStore();
  await store.add('campaigns', { id: 'camp', approved: true, autoSend: false });
  await store.transaction(async tx => {
    await tx.add('leads', { id: 'lead', prospectId: 'pros', status: 'queued' });
    await tx.add('prospects', { id: 'pros', domain: 'pair.test', website: 'https://pair.test', campaignId: 'camp', leadId: 'lead', status: 'queued' });
  });
  assert.equal((await store.get('leads', 'lead')).prospectId, 'pros');
  assert.equal((await store.get('prospects', 'pros')).leadId, 'lead');
});

test('targeted prospect claiming does not consume an unrelated queued prospect', async () => {
  const store = await tempStore();
  await store.add('prospects', { id: 'old', domain: 'old.test', website: 'https://old.test', status: 'queued', createdAt: '2026-01-01T00:00:00.000Z' });
  await store.add('prospects', { id: 'target', domain: 'target.test', website: 'https://target.test', status: 'queued', createdAt: '2026-02-01T00:00:00.000Z' });
  const claimed = await store.claimProspect('target');
  assert.equal(claimed.id, 'target');
  assert.equal((await store.get('prospects', 'target')).status, 'claimed');
  assert.equal((await store.get('prospects', 'old')).status, 'queued');
});

test('prospect claiming respects deferred crawl timestamps', async () => {
  const store = await tempStore();
  await store.add('prospects', { id: 'future', domain: 'future.test', website: 'https://future.test', status: 'retry', nextCrawlAt: '2999-01-01T00:00:00.000Z' });
  await store.add('prospects', { id: 'due', domain: 'due.test', website: 'https://due.test', status: 'retry', nextCrawlAt: '2020-01-01T00:00:00.000Z' });
  const claimed = await store.claimProspects(10);
  assert.deepEqual(claimed.map(item => item.id), ['due']);
  assert.equal(await store.claimProspect('future'), null);
  assert.equal((await store.get('prospects', 'future')).status, 'retry');
});

test('stale outbound reservation recovery leaves a recently-dispatching reservation untouched (JSON store)', async () => {
  const store = await tempStore();
  await store.add('prospects', { id: 'p-recent', domain: 'recent.test', website: 'https://recent.test', status: 'sent', contact: { email: 'recent@recent.test' } });
  await store.add('outboundReservations', {
    id: 'or-recent', idempotencyKey: 'key-recent', prospectId: 'p-recent', inbox: 'A',
    recipientEmail: 'recent@recent.test', status: 'dispatching', kind: 'initial', followup: 0,
    dispatchedAt: minutesAgoIso(2), reservedAt: minutesAgoIso(3)
  });
  const result = await store.recoverStaleOutboundReservations();
  assert.equal(result.recovered, 0);
  assert.equal((await store.get('outboundReservations', 'or-recent')).status, 'dispatching');
});

test('stale outbound reservation recovery moves an older dispatching reservation to uncertain with a recorded reason and re-enters normal uncertain-handling (JSON store)', async () => {
  const store = await tempStore();
  await store.add('prospects', { id: 'p-stale', domain: 'stale.test', website: 'https://stale.test', status: 'sent', contact: { email: 'stale@stale.test' } });
  await store.add('outboundReservations', {
    id: 'or-stale', idempotencyKey: 'key-stale', prospectId: 'p-stale', inbox: 'A',
    recipientEmail: 'stale@stale.test', status: 'dispatching', kind: 'initial', followup: 0,
    dispatchedAt: minutesAgoIso(15), reservedAt: minutesAgoIso(16)
  });
  const result = await store.recoverStaleOutboundReservations();
  assert.equal(result.recovered, 1);
  assert.equal(result.attempted, 1);
  const reservation = await store.get('outboundReservations', 'or-stale');
  assert.equal(reservation.status, 'uncertain');
  assert.equal(reservation.recoveryReason, 'stale_dispatch_recovered');
  assert.ok(reservation.completedAt);
  const prospect = await store.get('prospects', 'p-stale');
  assert.equal(prospect.status, 'send-uncertain');
  assert.equal(prospect.nextFollowupAt, null);
  assert.equal(prospect.sendSafety.reason, 'stale-dispatch-recovered');
});

test('stale outbound reservation recovery does not retry-send: it never touches sent, failed, uncertain, suppressed, or reserved reservations (JSON store)', async () => {
  const store = await tempStore();
  const untouched = [
    { id: 'or-sent', status: 'sent' },
    { id: 'or-failed', status: 'failed' },
    { id: 'or-uncertain', status: 'uncertain' },
    { id: 'or-suppressed', status: 'suppressed' },
    { id: 'or-reserved', status: 'reserved' }
  ];
  for (const fixture of untouched) {
    await store.add('outboundReservations', {
      id: fixture.id, idempotencyKey: `key-${fixture.id}`, inbox: 'A',
      recipientEmail: `${fixture.id}@untouched.test`, status: fixture.status, kind: 'initial', followup: 0,
      reservedAt: minutesAgoIso(30),
      ...(fixture.status === 'dispatching' ? { dispatchedAt: minutesAgoIso(30) } : {})
    });
  }
  const result = await store.recoverStaleOutboundReservations();
  assert.equal(result.recovered, 0);
  assert.equal(result.attempted, 0);
  for (const fixture of untouched) {
    assert.equal((await store.get('outboundReservations', fixture.id)).status, fixture.status);
  }
});

test('stale outbound reservation recovery re-checks suppression before resurrecting a prospect (JSON store)', async () => {
  const store = await tempStore();
  await store.add('prospects', { id: 'p-suppressed', domain: 'suppressed-during-crash.test', website: 'https://suppressed-during-crash.test', status: 'sent', contact: { email: 'stopme@suppressed-during-crash.test' } });
  await store.add('suppressions', { id: 'sup-1', value: 'stopme@suppressed-during-crash.test' });
  await store.add('outboundReservations', {
    id: 'or-suppressed-mid-crash', idempotencyKey: 'key-suppressed-mid-crash', prospectId: 'p-suppressed', inbox: 'A',
    recipientEmail: 'stopme@suppressed-during-crash.test', status: 'dispatching', kind: 'initial', followup: 0,
    dispatchedAt: minutesAgoIso(20), reservedAt: minutesAgoIso(21)
  });
  const result = await store.recoverStaleOutboundReservations();
  assert.equal(result.recovered, 1);
  assert.equal((await store.get('outboundReservations', 'or-suppressed-mid-crash')).status, 'uncertain');
  const prospect = await store.get('prospects', 'p-suppressed');
  // Suppressed during the crash window: must not come back as a plain send-uncertain prospect.
  assert.notEqual(prospect.status, 'send-uncertain');
  assert.equal(prospect.sendSafety.terminalStopReason, 'suppressed');
});

test('two concurrent stale outbound reservation recovery calls never recover the same reservation twice (JSON store)', async () => {
  const store = await tempStore();
  await store.add('prospects', { id: 'p-race', domain: 'race.test', website: 'https://race.test', status: 'sent', contact: { email: 'race@race.test' } });
  await store.add('outboundReservations', {
    id: 'or-race', idempotencyKey: 'key-race', prospectId: 'p-race', inbox: 'A',
    recipientEmail: 'race@race.test', status: 'dispatching', kind: 'initial', followup: 0,
    dispatchedAt: minutesAgoIso(20), reservedAt: minutesAgoIso(21)
  });
  const [first, second] = await Promise.all([
    store.recoverStaleOutboundReservations(),
    store.recoverStaleOutboundReservations()
  ]);
  assert.equal(first.recovered + second.recovered, 1);
  assert.equal((await store.get('outboundReservations', 'or-race')).status, 'uncertain');
});

test('stale outbound reservation recovery mirrors JSON behavior on PostgreSQL without connecting to a real database', async () => {
  const { db, store } = await tempPostgresStore();
  try {
    await store.add('prospects', { id: 'pg-stale', domain: 'pg-stale.test', website: 'https://pg-stale.test', status: 'sent', contact: { email: 'pg-stale@pg-stale.test' } });
    await store.add('outboundReservations', {
      id: 'pg-or-recent', idempotencyKey: 'pg-key-recent', inbox: 'A',
      recipientEmail: 'pg-recent@pg-stale.test', status: 'dispatching', kind: 'initial', followup: 0,
      dispatchedAt: minutesAgoIso(2), reservedAt: minutesAgoIso(3)
    });
    await store.add('outboundReservations', {
      id: 'pg-or-stale', idempotencyKey: 'pg-key-stale', prospectId: 'pg-stale', inbox: 'A',
      recipientEmail: 'pg-stale@pg-stale.test', status: 'dispatching', kind: 'initial', followup: 0,
      dispatchedAt: minutesAgoIso(15), reservedAt: minutesAgoIso(16)
    });
    const result = await store.recoverStaleOutboundReservations();
    assert.equal(result.recovered, 1);
    assert.equal((await store.get('outboundReservations', 'pg-or-recent')).status, 'dispatching');
    const recovered = await store.get('outboundReservations', 'pg-or-stale');
    assert.equal(recovered.status, 'uncertain');
    assert.equal(recovered.recoveryReason, 'stale_dispatch_recovered');
    const prospect = await store.get('prospects', 'pg-stale');
    assert.equal(prospect.status, 'send-uncertain');
  } finally { await db.close(); }
});

test('PostgreSQL stale outbound reservation recovery cannot recover the same reservation twice, matching the JSON backend', async () => {
  const { db, store } = await tempPostgresStore();
  try {
    await store.add('outboundReservations', {
      id: 'pg-or-race', idempotencyKey: 'pg-key-race', inbox: 'A',
      recipientEmail: 'pg-race@pg-race.test', status: 'dispatching', kind: 'initial', followup: 0,
      dispatchedAt: minutesAgoIso(20), reservedAt: minutesAgoIso(21)
    });
    // PGlite is a single embedded connection, so it cannot faithfully stand in for
    // two separately-connected Postgres workers racing via Promise.all (a nested
    // BEGIN on the same session just continues the outer transaction rather than
    // opening an isolated one). What actually makes concurrent double-recovery
    // impossible against a real multi-connection Postgres is finalizeOutboundDispatch's
    // own SELECT ... FOR UPDATE + "status must still be dispatching" precondition, so
    // this proves that mechanism directly: once a pass finalizes the row, a second
    // pass — which is exactly what a second worker arriving after the first commits
    // would see — must find nothing left to recover.
    const first = await store.recoverStaleOutboundReservations();
    assert.equal(first.recovered, 1);
    assert.equal((await store.get('outboundReservations', 'pg-or-race')).status, 'uncertain');
    const second = await store.recoverStaleOutboundReservations();
    assert.equal(second.recovered, 0);
  } finally { await db.close(); }
});

test('P0-06: generic add/upsert/patch reject autonomyCycleRuns on the PostgreSQL backend', async () => {
  const { db, store } = await tempPostgresStore();
  try {
    await assert.rejects(
      store.add('autonomyCycleRuns', { id: 'pg-x', runKey: 'pg-k', status: 'active', leaseOwner: 'w', leaseExpiresAt: new Date().toISOString() }),
      { code: 'PROTECTED_COLLECTION' }
    );
    await assert.rejects(
      store.upsert('autonomyCycleRuns', { id: 'pg-x', runKey: 'pg-k', status: 'active', leaseOwner: 'w', leaseExpiresAt: new Date().toISOString() }),
      { code: 'PROTECTED_COLLECTION' }
    );
    const created = await store.createAutonomyCycleRun('pg-run-a', 'worker-1', 60000);
    assert.equal(created.ok, true);
    await assert.rejects(
      store.patch('autonomyCycleRuns', created.run.id, { leaseExpiresAt: new Date(0).toISOString() }),
      { code: 'PROTECTED_COLLECTION' }
    );
    const unchanged = await store.get('autonomyCycleRuns', created.run.id);
    assert.equal(unchanged.leaseExpiresAt, created.run.leaseExpiresAt);
    // Dedicated CAS method still works after the guard is in place.
    const patched = await store.patchAutonomyCycleRun(created.run.id, { owner: created.run.leaseOwner, epoch: created.run.leaseEpoch, version: created.run.version }, { stagesPatch: { discover: 'done' } });
    assert.equal(patched.ok, true);
  } finally { await db.close(); }
});
