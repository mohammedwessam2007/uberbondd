import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PostgresStore } from '../src/store.mjs';

const DATABASE_URL = process.env.OMNIA_V9_TEST_DATABASE_URL || '';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const uid = () => crypto.randomUUID();

if (!DATABASE_URL) {
  test('night runtime PostgreSQL recovery race proof requires OMNIA_V9_TEST_DATABASE_URL', {
    skip: 'OMNIA_V9_TEST_DATABASE_URL is not set; real PostgreSQL concurrency proof did not run'
  }, () => {});
} else {
  let storeA;
  let storeB;

  test.before(async () => {
    storeA = new PostgresStore({ databaseUrl: DATABASE_URL, ssl: false });
    await storeA.init();
    storeB = new PostgresStore({ databaseUrl: DATABASE_URL, ssl: false });
    await storeB.init();
  });

  test.after(async () => {
    await storeB.close();
    await storeA.close();
  });

  async function insertActiveJob({ id, type, attempts, maxAttempts, recoveryPolicy, workerId = 'worker-a' }) {
    const stale = new Date(Date.now() - 10_000).toISOString();
    const data = {
      id,
      type,
      queue: type,
      status: 'active',
      attempts,
      maxAttempts,
      recoveryPolicy,
      lockedBy: workerId,
      lockedAt: stale,
      heartbeatAt: stale,
      startedAt: stale,
      createdAt: stale,
      updatedAt: stale
    };
    await storeA.pool.query(
      `INSERT INTO jobs (
        id, type, queue, status, priority, attempts, max_attempts,
        run_at, locked_at, locked_by, heartbeat_at, started_at,
        data, created_at, updated_at
      ) VALUES (
        $1, $2, $2, 'active', 0, $3, $4,
        now(), $5::timestamptz, $6, $5::timestamptz, $5::timestamptz,
        $7::jsonb, $5::timestamptz, $5::timestamptz
      )`,
      [id, type, attempts, maxAttempts, stale, workerId, JSON.stringify(data)]
    );
  }

  test('heartbeat committed while stale recovery waits on the row lock preserves the live lease', async () => {
    const id = uid();
    const type = `night-heartbeat-race-${id}`;
    await insertActiveJob({ id, type, attempts: 1, maxAttempts: 3, recoveryPolicy: 'replay-safe' });

    let recoveryPromise;
    await storeA.transaction(async tx => {
      await tx.pool.query('SELECT id FROM jobs WHERE id=$1 FOR UPDATE', [id]);
      recoveryPromise = storeB.recoverStaleJobs(1_000);
      await sleep(75);
      await tx.pool.query(
        `UPDATE jobs
         SET heartbeat_at=now(), updated_at=now(),
             data=data || jsonb_build_object('heartbeatAt', now()::text, 'updatedAt', now()::text)
         WHERE id=$1 AND status='active' AND locked_by='worker-a'`,
        [id]
      );
    });

    const recovery = await recoveryPromise;
    const row = await storeA.get('jobs', id);
    assert.equal(recovery.recovered, 0, 'recovery must re-check a heartbeat refreshed before the competing row lock is released');
    assert.equal(recovery.deadLettered, 0);
    assert.equal(row.status, 'active');
    assert.equal(row.lockedBy, 'worker-a');
    assert.ok(Date.parse(row.heartbeatAt) > Date.now() - 1_000, 'the fresh heartbeat must survive the recovery race');
  });

  test('a stale reconcile job with the persisted one-attempt fuse dead-letters and cannot be replacement-claimed', async () => {
    const id = uid();
    const type = `night-reconcile-crash-${id}`;
    await insertActiveJob({ id, type, attempts: 1, maxAttempts: 1, recoveryPolicy: 'reconcile' });

    const recovery = await storeB.recoverStaleJobs(1_000);
    assert.equal(recovery.deadLettered, 1);

    const row = await storeA.get('jobs', id);
    assert.equal(row.status, 'dead-letter');
    assert.equal(row.lockedBy, null);
    assert.equal(row.heartbeatAt, null);

    const claimed = await storeB.claimJobsByType(type, '', 'replacement-worker', 1, 1_000);
    assert.equal(claimed.some(job => job.id === id), false, 'uncertain reconcile work must not become claimable again after crash recovery');
  });

  test('a stale replay-safe job retains automatic recovery and exactly one replacement claim', async () => {
    const id = uid();
    const type = `night-replay-safe-${id}`;
    await insertActiveJob({ id, type, attempts: 1, maxAttempts: 3, recoveryPolicy: 'replay-safe' });

    const recovery = await storeA.recoverStaleJobs(1_000);
    assert.equal(recovery.recovered, 1);
    assert.equal(recovery.deadLettered, 0);

    const [claimA, claimB] = await Promise.all([
      storeA.claimJobsByType(type, '', 'replacement-a', 1, 1_000),
      storeB.claimJobsByType(type, '', 'replacement-b', 1, 1_000)
    ]);
    const winners = [...claimA, ...claimB].filter(job => job.id === id);
    assert.equal(winners.length, 1, 'FOR UPDATE SKIP LOCKED must allow exactly one replacement worker to reclaim replay-safe work');
    assert.ok(['replacement-a', 'replacement-b'].includes(winners[0].lockedBy));
  });
}