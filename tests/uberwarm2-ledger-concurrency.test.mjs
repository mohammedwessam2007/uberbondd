// Hostile proof for the UberWarm2 PostgreSQL seed ledger on a real server.
//
// Every case runs against a disposable PostgreSQL started by
// withDisposablePostgres, with the one-shot migration applied from its
// pending location. The concurrency cases release many claims at once from
// separate pooled connections, so the cap decision is exercised by real
// transaction interleaving rather than by a serial fake. No provider, SMTP,
// DNS or mailbox is contacted. All addresses are synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { withDisposablePostgres } from '../scripts/disposable-postgres.mjs';
import { createUberWarm2PgLedger } from '../src/uberwarm2-pg-ledger.mjs';

const MIGRATION = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'migrations-pending', '20261012_uberwarm2_seed_one_shot.sql'
);
const SETTLE_MS = 60000;

function settleWithin(promise, label, ms = SETTLE_MS) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} did not settle within ${ms} ms`)), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

function makePool(url, max = 20) {
  const pool = new Pool({ connectionString: url, max });
  // A client that loses its connection emits 'error' on the pool. Without a
  // listener that would end the process rather than fail one test.
  pool.on('error', () => {});
  return pool;
}

async function closePool(pool) {
  await settleWithin(pool.end(), 'pool.end()', 5000).catch(() => {});
}

async function openLedger(url, max) {
  const pool = makePool(url, max);
  await pool.query(await fs.readFile(MIGRATION, 'utf8'));
  return { pool, ledger: createUberWarm2PgLedger({ pool }) };
}

// The database clock decides the UTC day. Tests use it so they stay correct
// whenever they run.
async function databaseDay(pool) {
  return (await pool.query("SELECT (now() AT TIME ZONE 'UTC')::date::text AS day")).rows[0].day;
}

function shiftDay(day, offset) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

function keyFor(n) {
  return `uberwarm2-seed:${n.toString(16).padStart(64, '0')}`;
}

function reservation(n, { day, sender = 'tara@example.com', seed = 'owned-seed@gmail.com' }) {
  return {
    reservationKey: keyFor(n), probeId: `probe-${n}`, batchDigest: 'sha256:test',
    senderEmail: sender, seedEmail: seed, quotaWindow: day,
    senderDailyLimit: 2, globalDailyLimit: 100, seedDailyLimit: 1, rollingWindowHours: 24,
    effectClass: 'OWNER_CONTROLLED_PLACEMENT_PROBE'
  };
}

async function settleAll(promises) {
  const results = await Promise.allSettled(promises);
  return {
    accepted: results.filter(r => r.status === 'fulfilled' && r.value?.ok === true).length,
    refused: results.filter(r => r.status === 'fulfilled' && r.value?.ok !== true).length,
    uncertain: results.filter(r => r.status === 'rejected').length,
    reasons: results.filter(r => r.status === 'fulfilled' && r.value?.ok !== true).map(r => r.value.reason)
  };
}

test('40 concurrent claims from one sender never accept more than the sender cap on PostgreSQL', () => withDisposablePostgres(async url => {
  const { pool, ledger } = await openLedger(url, 20);
  try {
    const day = await databaseDay(pool);
    const claims = Array.from({ length: 40 }, (_, i) =>
      ledger.claimOnceAndEnforceCaps(reservation(i + 1, { day, seed: `seed-${i}@gmail.com` })));
    const tally = await settleWithin(settleAll(claims), 'concurrent sender claims');
    const rows = await pool.query(
      'SELECT COUNT(*)::int AS n FROM uberwarm2_seed_probe_claims WHERE sender_email=$1', ['tara@example.com']
    );
    assert.equal(tally.uncertain, 0);
    assert.equal(tally.accepted, 2);
    assert.equal(rows.rows[0].n, 2);
    assert.ok(tally.reasons.every(r => r === 'sender-daily-limit'), tally.reasons.join(','));
  } finally {
    await closePool(pool);
  }
}));

test('40 concurrent claims for one recipient seed accept exactly one on PostgreSQL', () => withDisposablePostgres(async url => {
  const { pool, ledger } = await openLedger(url, 20);
  try {
    const day = await databaseDay(pool);
    const claims = Array.from({ length: 40 }, (_, i) =>
      ledger.claimOnceAndEnforceCaps(reservation(i + 1, { day, sender: `sender-${i}@example.com` })));
    const tally = await settleWithin(settleAll(claims), 'concurrent seed claims');
    const rows = await pool.query(
      'SELECT COUNT(*)::int AS n FROM uberwarm2_seed_probe_claims WHERE seed_email=$1', ['owned-seed@gmail.com']
    );
    assert.equal(tally.uncertain, 0);
    assert.equal(tally.accepted, 1);
    assert.equal(rows.rows[0].n, 1);
  } finally {
    await closePool(pool);
  }
}));

test('120 concurrent claims across distinct senders and seeds never accept more than the global cap', () => withDisposablePostgres(async url => {
  const { pool, ledger } = await openLedger(url, 20);
  try {
    const day = await databaseDay(pool);
    const claims = Array.from({ length: 120 }, (_, i) =>
      ledger.claimOnceAndEnforceCaps(reservation(i + 1, {
        day, sender: `sender-${i}@example.com`, seed: `seed-${i}@gmail.com`
      })));
    const tally = await settleWithin(settleAll(claims), 'concurrent global claims');
    const rows = await pool.query('SELECT COUNT(*)::int AS n FROM uberwarm2_seed_probe_claims');
    assert.equal(tally.uncertain, 0);
    assert.equal(tally.accepted, 100);
    assert.equal(rows.rows[0].n, 100);
    assert.ok(tally.reasons.every(r => r === 'global-daily-limit'), tally.reasons.join(','));
  } finally {
    await closePool(pool);
  }
}));

test('a caller-supplied quota window cannot open a second window for the same sender', () => withDisposablePostgres(async url => {
  const { pool, ledger } = await openLedger(url, 4);
  try {
    const today = await databaseDay(pool);
    const yesterday = shiftDay(today, -1);
    const tomorrow = shiftDay(today, 1);
    const first = await ledger.claimOnceAndEnforceCaps(reservation(1, { day: today, seed: 'a@gmail.com' }));
    assert.equal(first.ok, true);
    // Naming another UTC date must not reserve in that date's bucket.
    const earlier = await ledger.claimOnceAndEnforceCaps(reservation(2, { day: yesterday, seed: 'b@gmail.com' }));
    assert.equal(earlier.ok, false);
    assert.equal(earlier.reason, 'quota-window-mismatch');
    const later = await ledger.claimOnceAndEnforceCaps(reservation(3, { day: tomorrow, seed: 'c@gmail.com' }));
    assert.equal(later.ok, false);
    assert.equal(later.reason, 'quota-window-mismatch');
    const second = await ledger.claimOnceAndEnforceCaps(reservation(4, { day: today, seed: 'd@gmail.com' }));
    assert.equal(second.ok, true);
    // With two today, a third claim named for yesterday still hits today's cap.
    const capped = await ledger.claimOnceAndEnforceCaps(reservation(5, { day: yesterday, seed: 'e@gmail.com' }));
    assert.equal(capped.ok, false);
    assert.equal(capped.reason, 'quota-window-mismatch');
    const rows = await pool.query(
      'SELECT quota_day::text AS day, COUNT(*)::int AS n FROM uberwarm2_seed_probe_claims WHERE sender_email=$1 GROUP BY quota_day',
      ['tara@example.com']
    );
    assert.deepEqual(rows.rows, [{ day: today, n: 2 }]);
  } finally {
    await closePool(pool);
  }
}));
