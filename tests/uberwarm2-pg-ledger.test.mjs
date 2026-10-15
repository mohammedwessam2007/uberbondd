import test from 'node:test';
import assert from 'node:assert/strict';
import { createUberWarm2PgLedger } from '../src/uberwarm2-pg-ledger.mjs';

function reservation(id = 'a'.repeat(64)) {
  return {
    reservationKey: 'uberwarm2-seed:' + id, probeId: 'p1', batchDigest: 'sha256:test',
    senderEmail: 'tara@example.com', seedEmail: 'seed@gmail.com',
    quotaWindow: '2026-10-12', senderDailyLimit: 2,
    globalDailyLimit: 100, seedDailyLimit: 1, rollingWindowHours: 24,
    effectClass: 'OWNER_CONTROLLED_PLACEMENT_PROBE'
  };
}
function fakePg() {
  const seen = new Set(), states = new Map(), queries = [];
  // The database clock's UTC day. The reservation quotaWindow must name it.
  const dbClockDay = '2026-10-12';
  let txActive = false;
  const client = {
    async query(sql, args = []) {
      queries.push({sql, args});
      if (sql.startsWith('BEGIN')) { txActive = true; return {rows: []}; }
      if (sql === 'COMMIT' || sql === 'ROLLBACK') { txActive = false; return {rows: []}; }
      if (sql.includes('pg_advisory_xact_lock')) { assert.equal(txActive, true); return {rows: []}; }
      if (sql.includes('SELECT reservation_key FROM')) {
        return {rows: seen.has(args[0]) ? [{reservation_key: args[0]}] : []};
      }
      if (sql.includes("clock_timestamp() AT TIME ZONE 'UTC'")) {
        return {rows: [{quota_day: dbClockDay}]};
      }
      if (sql.includes('COUNT(*) FILTER')) {
        const sender = args[1];
        const senderTotal = [...states.values()].filter(x => x.sender === sender).length;
        const seedTotal = [...states.values()].filter(x => x.seed === args[2]).length;
        // Every claim in this fake was made on the same quota day, inside the rolling window.
        return {rows: [{
          total: seen.size, sender_total: senderTotal, seed_total: seedTotal,
          rolling_total: seen.size, rolling_sender_total: senderTotal, rolling_seed_total: seedTotal
        }]};
      }
      if (sql.startsWith('INSERT INTO uberwarm2_seed_probe_claims')) {
        assert.equal(txActive, true);
        seen.add(args[0]); states.set(args[0], { sender: args[3], seed: args[4], status: 'RESERVED' });
        return {rows: []};
      }
      if (sql.includes('UPDATE uberwarm2_seed_probe_claims')) {
        const state = states.get(args[0]);
        if (!state || state.status !== 'RESERVED') return {rows: []};
        state.status = args[1]; state.receipt = JSON.parse(args[2]);
        return {rows: [{reservation_key: args[0]}]};
      }
      if (sql.includes('SELECT reservation_key, submitted_state')) {
        const state = states.get(args[0]);
        return {rows: state ? [{
          reservation_key: args[0], submitted_state: state.status,
          receipt_json: state.receipt || null, created_at: new Date('2026-10-12'), finalized_at: null
        }] : []};
      }
      throw Error('unexpected query: ' + sql);
    },
    release() {}
  };
  return {
    queries, states,
    pool: { async connect() { return client; }, async query(...args) { return client.query(...args); } }
  };
}
test('postgres ledger refuses absent provider pool and invalid reservation', async () => {
  const noPool = createUberWarm2PgLedger();
  assert.equal((await noPool.claimOnceAndEnforceCaps(reservation())).ok, false);
  const pg = fakePg();
  const ledger = createUberWarm2PgLedger({pool: pg.pool});
  assert.equal((await ledger.claimOnceAndEnforceCaps({...reservation(), senderDailyLimit: 999})).ok, false);
  assert.equal(pg.queries.length, 0);
});
test('postgres ledger reserves under transaction-scoped lock and refuses replay', async () => {
  const pg = fakePg(), ledger = createUberWarm2PgLedger({pool: pg.pool});
  const once = await ledger.claimOnceAndEnforceCaps(reservation());
  assert.equal(once.ok, true);
  assert.equal(once.capsEnforced, true);
  assert.ok(pg.queries.some(x => x.sql.includes('pg_advisory_xact_lock')));
  const again = await ledger.claimOnceAndEnforceCaps(reservation());
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'durable-one-shot-claim-already-present');
});
test('postgres ledger enforces two probes per sender per day', async () => {
  const pg = fakePg(), ledger = createUberWarm2PgLedger({pool: pg.pool});
  assert.equal((await ledger.claimOnceAndEnforceCaps(reservation('1'.repeat(64)))).ok, true);
  assert.equal((await ledger.claimOnceAndEnforceCaps({...reservation('2'.repeat(64)), seedEmail: 'seed2@gmail.com'})).ok, true);
  const rejected = await ledger.claimOnceAndEnforceCaps({...reservation('3'.repeat(64)), seedEmail: 'seed3@gmail.com'});
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, 'sender-daily-limit');
  assert.equal(pg.states.size, 2);
});
test('postgres ledger finalizes exactly once and observes a durable receipt', async () => {
  const pg = fakePg(), ledger = createUberWarm2PgLedger({pool: pg.pool}), r = reservation();
  await ledger.claimOnceAndEnforceCaps(r);
  const receipt = {
    reservationKey:r.reservationKey, status:'SMTP_ACCEPTED_PLACEMENT_UNKNOWN',
    providerMessageId:'test-msg', verifiedPlacements:0
  };
  const done = await ledger.finalize({reservationKey:r.reservationKey,receipt});
  assert.equal(done.ok, true);
  const duplicate = await ledger.finalize({reservationKey:r.reservationKey,receipt});
  assert.equal(duplicate.ok, false);
  const observed = await ledger.observe({reservationKey:r.reservationKey});
  assert.equal(observed.status, 'SMTP_ACCEPTED_PLACEMENT_UNKNOWN');
  assert.equal(observed.receipt.providerMessageId, 'test-msg');
});

test('postgres ledger refuses recipient seed overload even across different senders', async () => {
  const pg = fakePg(), ledger = createUberWarm2PgLedger({pool: pg.pool});
  assert.equal((await ledger.claimOnceAndEnforceCaps(reservation('4'.repeat(64)))).ok, true);
  const result = await ledger.claimOnceAndEnforceCaps({
    ...reservation('5'.repeat(64)), senderEmail: 'nadia@example.com'
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'seed-daily-limit');
  assert.equal(pg.states.size, 1);
});
