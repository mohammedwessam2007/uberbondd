// Live proof that the PostgresStore class (src/store.mjs) — not just the
// migration SQL — behaves correctly against a real PostgreSQL server. This
// closes a gap disclosed across multiple prior waves: every other test in
// this repo exercises JsonStore, and tests/postgres-schema.test.mjs proves
// only the migration SQL's constraints via PGlite. Concurrency-critical
// behavior (pg_advisory_xact_lock, SELECT ... FOR UPDATE SKIP LOCKED,
// ON CONFLICT) cannot be proven by either of those.
//
// Gated on LIVE_POSTGRES_TEST_URL so this never runs, never hangs, and
// never fails in an environment without a real Postgres server -- it is
// intentionally NOT part of `npm run check` / test:deterministic. Run it
// explicitly with `npm run test:postgres-live` against a throwaway
// database, never production.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PostgresStore, ConflictError } from '../src/store.mjs';

const LIVE_URL = process.env.LIVE_POSTGRES_TEST_URL || '';

if (!LIVE_URL) {
  test('SKIPPED: set LIVE_POSTGRES_TEST_URL to a throwaway database to run the live PostgresStore proof suite', () => {
    console.log('LIVE_POSTGRES_TEST_URL not set -- live PostgresStore tests skipped (this is expected in most environments).');
  });
} else {
  let store;
  const uid = () => crypto.randomUUID();

  test.before(async () => {
    store = new PostgresStore({ databaseUrl: LIVE_URL, ssl: false });
    await store.init(); // real migrate() against a real server
    // This suite must own a clean slate: leftover rows from a prior run
    // against the same throwaway database (e.g. an interrupted run) would
    // otherwise leak into later assertions -- as found live, an older
    // leftover 'retry' job got claimed ahead of a freshly-inserted one in
    // the concurrency test below before this cleanup was added.
    await store.pool.query(`TRUNCATE TABLE jobs, prospects, outbound_reservations, audit_log, campaigns RESTART IDENTITY CASCADE`);
    await store.add('campaigns', { id: 'camp', approved: true, autoSend: false, createdAt: new Date().toISOString() });
  });

  test.after(async () => { await store.close(); });

  test('migrate() is idempotent against a real server (safe to run twice)', async () => {
    await assert.doesNotReject(store.migrate());
  });

  test('add() + get() round-trip a real row through a real jsonb column', async () => {
    const id = uid();
    await store.add('prospects', { id, campaignId: 'camp', domain: 'Example.com', status: 'new', createdAt: new Date().toISOString() });
    const fetched = await store.get('prospects', id);
    assert.equal(fetched.id, id);
    assert.equal(fetched.domain, 'example.com'); // normalizeRecord lowercases domain
  });

  test('add() with a duplicate id is rejected as a real ConflictError (Postgres 23505)', async () => {
    const id = uid();
    await store.add('prospects', { id, campaignId: 'camp', domain: 'dup.example', status: 'new', createdAt: new Date().toISOString() });
    await assert.rejects(
      store.add('prospects', { id, campaignId: 'camp', domain: 'dup.example', status: 'new', createdAt: new Date().toISOString() }),
      ConflictError
    );
  });

  test('upsert() updates an existing row via a real ON CONFLICT clause', async () => {
    const id = uid();
    await store.upsert('prospects', { id, campaignId: 'camp', domain: 'up.example', status: 'new', createdAt: new Date().toISOString() });
    await store.upsert('prospects', { id, campaignId: 'camp', domain: 'up.example', status: 'ready', createdAt: new Date().toISOString() });
    const fetched = await store.get('prospects', id);
    assert.equal(fetched.status, 'ready');
  });

  test('patch() updates via a real row lock; patching a missing id returns null, never throws', async () => {
    const id = uid();
    await store.add('prospects', { id, campaignId: 'camp', domain: 'patch.example', status: 'new', createdAt: new Date().toISOString() });
    const patched = await store.patch('prospects', id, { status: 'claimed' });
    assert.equal(patched.status, 'claimed');
    const missing = await store.patch('prospects', uid(), { status: 'claimed' });
    assert.equal(missing, null);
  });

  test('list() honors real filters, orderBy, and limit against indexed columns', async () => {
    const campaignId = `camp-${uid()}`;
    await store.add('campaigns', { id: campaignId, approved: true, autoSend: false, createdAt: new Date().toISOString() });
    for (let i = 0; i < 3; i += 1) {
      await store.add('prospects', { id: uid(), campaignId, domain: `list${i}.example`, status: 'new', createdAt: new Date(Date.now() + i * 1000).toISOString() });
    }
    const rows = await store.list('prospects', { filters: { campaignId }, orderBy: 'createdAt', direction: 'asc', limit: 2 });
    assert.equal(rows.length, 2);
    assert.ok(rows[0].createdAt <= rows[1].createdAt);
  });

  test('log() writes a real row into audit_log with type and jsonb detail', async () => {
    await store.log('live_proof_check', { note: 'real postgres' });
    const rows = await store.list('auditLog', { filters: {}, orderBy: 'createdAt', direction: 'desc', limit: 50 });
    assert.ok(rows.some(row => row.type === 'live_proof_check' && row.detail?.note === 'real postgres'));
  });

  test('transaction() commits every write atomically on success', async () => {
    const idA = uid(); const idB = uid();
    await store.transaction(async tx => {
      await tx.add('prospects', { id: idA, campaignId: 'camp', domain: 'txa.example', status: 'new', createdAt: new Date().toISOString() });
      await tx.add('prospects', { id: idB, campaignId: 'camp', domain: 'txb.example', status: 'new', createdAt: new Date().toISOString() });
    });
    assert.ok(await store.get('prospects', idA));
    assert.ok(await store.get('prospects', idB));
  });

  test('transaction() performs a real ROLLBACK -- a thrown error leaves zero trace', async () => {
    const idA = uid(); const idB = uid();
    await assert.rejects(store.transaction(async tx => {
      await tx.add('prospects', { id: idA, campaignId: 'camp', domain: 'rba.example', status: 'new', createdAt: new Date().toISOString() });
      throw new Error('deliberate rollback trigger');
    }));
    assert.equal(await store.get('prospects', idA), null);
    assert.equal(await store.get('prospects', idB), null);
  });

  test('reserveOutboundSend() succeeds for a first reservation', async () => {
    const inbox = `A-${uid()}`;
    const result = await store.reserveOutboundSend({ idempotencyKey: uid(), inbox, recipientEmail: 'x@clinic.example', dailyCap: 10, hourlyCap: 10, minGapSeconds: 0 });
    assert.equal(result.ok, true);
  });

  test('reserveOutboundSend() rejects a replayed idempotency key via a real UNIQUE constraint', async () => {
    const inbox = `A-${uid()}`;
    const idempotencyKey = uid();
    const first = await store.reserveOutboundSend({ idempotencyKey, inbox, recipientEmail: 'x@clinic.example', dailyCap: 10, hourlyCap: 10, minGapSeconds: 0 });
    assert.equal(first.ok, true);
    const second = await store.reserveOutboundSend({ idempotencyKey, inbox, recipientEmail: 'x@clinic.example', dailyCap: 10, hourlyCap: 10, minGapSeconds: 0 });
    assert.equal(second.ok, false);
    assert.match(second.reason, /^duplicate-/);
  });

  test('reserveOutboundSend() enforces the daily cap for real', async () => {
    const inbox = `A-${uid()}`;
    const first = await store.reserveOutboundSend({ idempotencyKey: uid(), inbox, recipientEmail: 'x@clinic.example', dailyCap: 1, hourlyCap: 10, minGapSeconds: 0 });
    assert.equal(first.ok, true);
    const second = await store.reserveOutboundSend({ idempotencyKey: uid(), inbox, recipientEmail: 'y@clinic.example', dailyCap: 1, hourlyCap: 10, minGapSeconds: 0 });
    assert.equal(second.ok, false);
    assert.equal(second.reason, 'daily-cap');
  });

  test('concurrent reserveOutboundSend calls against a cap of 1 let exactly one win (real pg_advisory_xact_lock)', async () => {
    const inbox = `A-${uid()}`;
    const attempts = Array.from({ length: 5 }, (_, i) => store.reserveOutboundSend({
      idempotencyKey: uid(), inbox, recipientEmail: `c${i}@clinic.example`, dailyCap: 1, hourlyCap: 10, minGapSeconds: 0
    }));
    const results = await Promise.all(attempts);
    assert.equal(results.filter(r => r.ok).length, 1);
  });

  test('markOutboundReservation() sets dispatchedAt/completedAt on real status transitions', async () => {
    const inbox = `A-${uid()}`;
    const { reservation } = await store.reserveOutboundSend({ idempotencyKey: uid(), inbox, recipientEmail: 'x@clinic.example', dailyCap: 10, hourlyCap: 10, minGapSeconds: 0 });
    const dispatching = await store.markOutboundReservation(reservation.id, 'dispatching');
    assert.ok(dispatching.dispatchedAt);
    const sent = await store.markOutboundReservation(reservation.id, 'sent');
    assert.ok(sent.completedAt);
  });

  test('claimJobs() uses real FOR UPDATE SKIP LOCKED: two concurrent claimants never get the same job', async () => {
    const id = uid();
    await store.transaction(async tx => tx.pool.query(
      `INSERT INTO jobs (id, type, queue, status, priority, attempts, max_attempts, run_at, data, created_at, updated_at)
       VALUES ($1,'test-job','default','queued',0,0,5, now(), $2::jsonb, now(), now())`,
      [id, JSON.stringify({ id, type: 'test-job', queue: 'default', status: 'queued' })]
    ));
    const [claimA, claimB] = await Promise.all([
      store.claimJobs('worker-a', 1),
      store.claimJobs('worker-b', 1)
    ]);
    const claimedIds = [...claimA, ...claimB].map(job => job.id);
    assert.equal(claimedIds.filter(claimedId => claimedId === id).length, 1);
  });

  test('completeJob() and failJob() transition a real job row correctly', async () => {
    const okId = uid(); const failId = uid();
    await store.transaction(async tx => {
      for (const id of [okId, failId]) {
        await tx.pool.query(
          `INSERT INTO jobs (id, type, queue, status, priority, attempts, max_attempts, run_at, data, created_at, updated_at)
           VALUES ($1,'test-job','default','active',0,1,5, now(), $2::jsonb, now(), now())`,
          [id, JSON.stringify({ id, type: 'test-job', queue: 'default', status: 'active' })]
        );
      }
    });
    const completed = await store.completeJob(okId, { ok: true });
    assert.equal(completed.status, 'completed');
    const failed = await store.failJob(failId, new Error('boom'), { maxAttempts: 5 });
    assert.equal(failed.status, 'retry');
  });

  test('recoverStaleJobs() requeues a real stale-locked job', async () => {
    const id = uid();
    await store.transaction(async tx => tx.pool.query(
      `INSERT INTO jobs (id, type, queue, status, priority, attempts, max_attempts, run_at, locked_at, locked_by, heartbeat_at, data, created_at, updated_at)
       VALUES ($1,'test-job','default','active',0,1,5, now(), now() - interval '1 hour', 'stale-worker', now() - interval '1 hour', $2::jsonb, now(), now())`,
      [id, JSON.stringify({ id, type: 'test-job', queue: 'default', status: 'active' })]
    ));
    const result = await store.recoverStaleJobs(60000);
    assert.ok(result.recovered >= 1);
    const row = await store.get('jobs', id);
    assert.equal(row.status, 'queued');
  });

  test('getSettings()/setSetting() round-trip through a real settings table', async () => {
    const key = `live-proof-${uid()}`;
    await store.setSetting(key, { note: 'real postgres setting' });
    const settings = await store.getSettings();
    assert.deepEqual(settings[key], { note: 'real postgres setting' });
  });

  test('queueStats() aggregates real counts by status', async () => {
    const id = uid();
    await store.transaction(async tx => tx.pool.query(
      `INSERT INTO jobs (id, type, queue, status, priority, attempts, max_attempts, run_at, data, created_at, updated_at)
       VALUES ($1,'test-job','default','queued',0,0,5, now(), $2::jsonb, now(), now())`,
      [id, JSON.stringify({ id, type: 'test-job', queue: 'default', status: 'queued' })]
    ));
    const stats = await store.queueStats();
    assert.ok(stats.counts.queued >= 1);
    assert.ok(stats.total >= 1);
  });
}
