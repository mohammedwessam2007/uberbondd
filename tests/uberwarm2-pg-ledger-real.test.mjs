// Real PostgreSQL proof for the UberWarm2 durable seed-probe ledger.
//
// Every case runs against a private embedded PostgreSQL started by
// withDisposablePostgres, and the pending one-shot migration from
// docs/migrations-pending/ is applied inside that disposable fixture only.
// Concurrency cases release many claims at once from separate pooled
// connections, so the one-shot and cap decisions are made by real transaction
// interleaving against a real row -- not by a serial fake. No provider, SMTP,
// DNS or mailbox is contacted, no production database or credential is used,
// and every address is synthetic.
//
// The file exercises the existing src/uberwarm2-pg-ledger.mjs implementation.
// It does not reimplement or shadow it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { withDisposablePostgres } from '../scripts/disposable-postgres.mjs';
import { createUberWarm2PgLedger } from '../src/uberwarm2-pg-ledger.mjs';

const MIGRATION = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', 'docs', 'migrations-pending', '20261012_uberwarm2_seed_one_shot.sql'
);
const SETTLE_MS = 60000;

function settleWithin(promise, label, ms = SETTLE_MS) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} did not settle within ${ms} ms`)), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

function makePool(url, max = 10) {
  const pool = new Pool({ connectionString: url, max });
  // A backend that loses its connection emits 'error' on the pool; without a
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

// The database clock decides the UTC day; tests read it so they stay correct
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

// Writes a prior claim straight into the table so a test can place a row in an
// earlier UTC day bucket while keeping it inside (or outside) the 24-hour
// rolling window the ledger actually queries.
async function seedPriorClaim(pool, { key, sender, seed, day, ageHours }) {
  await pool.query(
    `INSERT INTO uberwarm2_seed_probe_claims
       (reservation_key, probe_id, batch_digest, sender_email, seed_email, quota_day, created_at)
     VALUES ($1,$2,$3,$4,$5,$6::date, clock_timestamp() - ($7 * interval '1 hour'))`,
    [key, `probe-prior-${key.slice(-12)}`, 'sha256:prior', sender, seed, day, ageHours]
  );
}

test('a duplicate reservation key is claimed exactly once under concurrency', () => withDisposablePostgres(async url => {
  const { pool, ledger } = await openLedger(url, 12);
  try {
    const day = await databaseDay(pool);
    const same = reservation(1, { day, seed: 'dup-seed@gmail.com' });
    const claims = Array.from({ length: 12 }, () => ledger.claimOnceAndEnforceCaps(same));
    const tally = await settleWithin(settleAll(claims), 'duplicate claims');
    assert.equal(tally.uncertain, 0);
    assert.equal(tally.accepted, 1);
    assert.equal(tally.refused, 11);
    assert.ok(tally.reasons.every(r => r === 'durable-one-shot-claim-already-present'), tally.reasons.join(','));
    const rows = await pool.query(
      'SELECT COUNT(*)::int AS n FROM uberwarm2_seed_probe_claims WHERE reservation_key=$1', [same.reservationKey]
    );
    assert.equal(rows.rows[0].n, 1);
  } finally {
    await closePool(pool);
  }
}));

test('one sender may claim at most two probes per UTC day under concurrency', () => withDisposablePostgres(async url => {
  const { pool, ledger } = await openLedger(url, 16);
  try {
    const day = await databaseDay(pool);
    const claims = Array.from({ length: 24 }, (_, i) =>
      ledger.claimOnceAndEnforceCaps(reservation(i + 1, { day, seed: `sender-cap-${i}@gmail.com` })));
    const tally = await settleWithin(settleAll(claims), 'concurrent sender claims');
    assert.equal(tally.uncertain, 0);
    assert.equal(tally.accepted, 2);
    assert.ok(tally.reasons.every(r => r === 'sender-daily-limit'), tally.reasons.join(','));
    const rows = await pool.query(
      "SELECT COUNT(*)::int AS n FROM uberwarm2_seed_probe_claims WHERE sender_email=$1", ['tara@example.com']
    );
    assert.equal(rows.rows[0].n, 2);
  } finally {
    await closePool(pool);
  }
}));

test('one recipient seed accepts exactly one probe per UTC day under concurrency', () => withDisposablePostgres(async url => {
  const { pool, ledger } = await openLedger(url, 16);
  try {
    const day = await databaseDay(pool);
    const claims = Array.from({ length: 24 }, (_, i) =>
      ledger.claimOnceAndEnforceCaps(reservation(i + 1, { day, sender: `sender-${i}@example.com` })));
    const tally = await settleWithin(settleAll(claims), 'concurrent seed claims');
    assert.equal(tally.uncertain, 0);
    assert.equal(tally.accepted, 1);
    assert.ok(tally.reasons.every(r => r === 'seed-daily-limit'), tally.reasons.join(','));
    const rows = await pool.query(
      "SELECT COUNT(*)::int AS n FROM uberwarm2_seed_probe_claims WHERE seed_email=$1", ['owned-seed@gmail.com']
    );
    assert.equal(rows.rows[0].n, 1);
  } finally {
    await closePool(pool);
  }
}));

test('finalization happens once and the durable receipt survives a fresh pool', () => withDisposablePostgres(async url => {
  const pool = makePool(url, 4);
  try {
    await pool.query(await fs.readFile(MIGRATION, 'utf8'));
    const ledger = createUberWarm2PgLedger({ pool });
    const day = await databaseDay(pool);
    const r = reservation(1, { day, seed: 'observe-seed@gmail.com' });
    assert.equal((await ledger.claimOnceAndEnforceCaps(r)).ok, true);
    const receipt = {
      reservationKey: r.reservationKey, status: 'SMTP_ACCEPTED_PLACEMENT_UNKNOWN',
      providerMessageId: 'synthetic-message-id', verifiedPlacements: 0
    };
    // Two finalizers race on separate pooled connections; exactly one may win.
    const raced = await settleWithin(
      Promise.all([
        ledger.finalize({ reservationKey: r.reservationKey, receipt }),
        ledger.finalize({ reservationKey: r.reservationKey, receipt })
      ]),
      'racing finalizers'
    );
    assert.equal(raced.filter(x => x.ok).length, 1);
    const third = await ledger.finalize({ reservationKey: r.reservationKey, receipt });
    assert.equal(third.ok, false);
    assert.equal(third.status, 'UBERWARM2_CLAIM_MISSING_OR_ALREADY_FINALIZED');

    // A completely separate pool must observe the same durable row.
    const fresh = makePool(url, 2);
    try {
      const observer = createUberWarm2PgLedger({ pool: fresh });
      const seen = await observer.observe({ reservationKey: r.reservationKey });
      assert.equal(seen.ok, true);
      assert.equal(seen.status, 'SMTP_ACCEPTED_PLACEMENT_UNKNOWN');
      assert.equal(seen.receipt.providerMessageId, 'synthetic-message-id');
      assert.equal(seen.externalEffectAuthority, 'NONE');
      assert.ok(seen.finalizedAt, 'a fresh pool must see the persisted finalization time');
      const raw = await fresh.query(
        'SELECT submitted_state, finalized_at FROM uberwarm2_seed_probe_claims WHERE reservation_key=$1', [r.reservationKey]
      );
      assert.equal(raw.rows[0].submitted_state, 'SMTP_ACCEPTED_PLACEMENT_UNKNOWN');
      assert.ok(raw.rows[0].finalized_at, 'finalized_at must be durable');
    } finally {
      await closePool(fresh);
    }
  } finally {
    await closePool(pool);
  }
}));

test('a reservation whose quota window is not the database UTC day is denied', () => withDisposablePostgres(async url => {
  const { pool, ledger } = await openLedger(url, 4);
  try {
    const today = await databaseDay(pool);
    const yesterday = shiftDay(today, -1);
    const tomorrow = shiftDay(today, 1);
    const earlier = await ledger.claimOnceAndEnforceCaps(reservation(1, { day: yesterday, seed: 'a@gmail.com' }));
    assert.equal(earlier.ok, false);
    assert.equal(earlier.reason, 'quota-window-mismatch');
    const later = await ledger.claimOnceAndEnforceCaps(reservation(2, { day: tomorrow, seed: 'b@gmail.com' }));
    assert.equal(later.ok, false);
    assert.equal(later.reason, 'quota-window-mismatch');
    const rows = await pool.query('SELECT COUNT(*)::int AS n FROM uberwarm2_seed_probe_claims');
    assert.equal(rows.rows[0].n, 0);
  } finally {
    await closePool(pool);
  }
}));

test('rolling caps count an earlier UTC day bucket but not claims older than 24h', () => withDisposablePostgres(async url => {
  const { pool, ledger } = await openLedger(url, 16);
  try {
    const today = await databaseDay(pool);
    const yesterday = shiftDay(today, -1);
    const twoDaysAgo = shiftDay(today, -2);

    // Sender A: two claims recorded in yesterday's bucket, still inside 24h.
    await seedPriorClaim(pool, { key: keyFor(101), sender: 'a@example.com', seed: 'a1@gmail.com', day: yesterday, ageHours: 2 });
    await seedPriorClaim(pool, { key: keyFor(102), sender: 'a@example.com', seed: 'a2@gmail.com', day: yesterday, ageHours: 1 });
    // Sender B: two claims older than the 24h window, so they must not count.
    await seedPriorClaim(pool, { key: keyFor(103), sender: 'b@example.com', seed: 'b1@gmail.com', day: twoDaysAgo, ageHours: 26 });
    await seedPriorClaim(pool, { key: keyFor(104), sender: 'b@example.com', seed: 'b2@gmail.com', day: twoDaysAgo, ageHours: 25 });
    // Seed C: one claim in yesterday's bucket, inside 24h.
    await seedPriorClaim(pool, { key: keyFor(105), sender: 'c@example.com', seed: 'c@gmail.com', day: yesterday, ageHours: 3 });

    // Six concurrent claims today for sender A: the rolling window refuses all
    // of them even though none is in today's day bucket.
    const senderA = Array.from({ length: 6 }, (_, i) =>
      ledger.claimOnceAndEnforceCaps(reservation(200 + i, { day: today, sender: 'a@example.com', seed: `a-new-${i}@gmail.com` })));
    const aTally = await settleWithin(settleAll(senderA), 'rolling sender claims');
    assert.equal(aTally.uncertain, 0);
    assert.equal(aTally.accepted, 0);
    assert.ok(aTally.reasons.every(r => r === 'sender-rolling-limit'), aTally.reasons.join(','));

    // Sender B's stale claims are outside the rolling window, so two today
    // succeed and the third is stopped by the daily cap, not the rolling one.
    assert.equal((await ledger.claimOnceAndEnforceCaps(reservation(300, { day: today, sender: 'b@example.com', seed: 'b-new-1@gmail.com' }))).ok, true);
    assert.equal((await ledger.claimOnceAndEnforceCaps(reservation(301, { day: today, sender: 'b@example.com', seed: 'b-new-2@gmail.com' }))).ok, true);
    const blocked = await ledger.claimOnceAndEnforceCaps(reservation(302, { day: today, sender: 'b@example.com', seed: 'b-new-3@gmail.com' }));
    assert.equal(blocked.ok, false);
    assert.equal(blocked.reason, 'sender-daily-limit');

    // Seed C's in-window claim blocks a fresh sender from reusing that seed on
    // today's bucket as well.
    const seedBlocked = await ledger.claimOnceAndEnforceCaps(reservation(400, { day: today, sender: 'd@example.com', seed: 'c@gmail.com' }));
    assert.equal(seedBlocked.ok, false);
    assert.equal(seedBlocked.reason, 'seed-rolling-limit');

    const aRows = await pool.query(
      "SELECT COUNT(*)::int AS n FROM uberwarm2_seed_probe_claims WHERE sender_email=$1", ['a@example.com']
    );
    assert.equal(aRows.rows[0].n, 2);
  } finally {
    await closePool(pool);
  }
}));
