import test from 'node:test';
import assert from 'node:assert/strict';
import { PostgresStore } from '../src/store.mjs';
import { runSafeDatabaseHygiene } from '../src/database-hygiene-repository.mjs';
import { createHandler, DATABASE_MAINTENANCE_SCHEDULE } from '../api/database-maintenance.mjs';

const REAL_URL = process.env.OMNIA_V9_TEST_DATABASE_URL || '';

// This module deletes rows from the production database on a weekly cron, and
// until now nothing executed it.
//
// It was one of exactly two production-reachable modules that no gate exercised,
// found by taking the closure of everything the gates import and subtracting it
// from the production-reachable set. The other consequence of that gap has
// already been paid once: the browser crawler shipped a ReferenceError on every
// call because its only real gate was written off as blocked.
//
// A DELETE on a schedule is the worst thing to leave in that set. Not because
// the code was wrong -- it survived every attack below unchanged -- but because
// nothing would have noticed if it stopped being right.
//
// These need a real database. What is under test is which rows a WHERE clause
// selects, whether a CHECK constraint holds, and what PostgreSQL does with an
// invalid timestamp. No fake answers any of those.
if (!REAL_URL) {
  // A real skip, not a passing placeholder: a green test named SKIPPED is
  // indistinguishable from a proof, to a reader and to the mutation harness.
  test('the database hygiene deletion proof needs OMNIA_V9_TEST_DATABASE_URL',
    { skip: 'OMNIA_V9_TEST_DATABASE_URL not set -- real database hygiene proof not run' }, () => {});
} else {
  let store;

  test.before(async () => {
    store = new PostgresStore({ databaseUrl: REAL_URL, ssl: false });
    await store.init();
  });

  test.after(async () => {
    await store.pool.query('DELETE FROM public_evidence_cache');
    await store.pool.query('DELETE FROM staged_content_repository');
    await store.close();
  });

  const staged = (id, status, ageDays) =>
    `('${id}','ref-${id}','asset','aud','offer','profile','{}'::jsonb,'hash','[]'::jsonb,'policy','${status}',now(),now()+interval '10 days',now()-interval '${ageDays} days')`;

  async function seed() {
    await store.pool.query('DELETE FROM public_evidence_cache');
    await store.pool.query('DELETE FROM staged_content_repository');
    await store.pool.query(`INSERT INTO public_evidence_cache
      (cache_key,target_ref,field,source_id,source_policy_ref,content_hash,evidence_ref,observed_at,expires_at,updated_at) VALUES
      ('stale-expired','t','f','s','p','h','e',now()-interval '40 days',now()-interval '30 days',now()-interval '30 days'),
      ('unexpired','t','f','s','p','h','e',now(),now()+interval '30 days',now()),
      ('expired-but-touched-today','t','f','s','p','h','e',now()-interval '40 days',now()-interval '30 days',now())`);
    await store.pool.query(`INSERT INTO staged_content_repository
      (content_id,content_ref,asset_type,audience_ref,offer_ref,profile_ref,payload,payload_hash,source_evidence_refs,policy_ref,status,available_at,expires_at,updated_at) VALUES
      ${[staged('consumed-old', 'CONSUMED', 30), staged('failed-old', 'FAILED', 30),
         staged('ready-old', 'READY', 30), staged('claimed-old', 'CLAIMED', 30),
         staged('consumed-recent', 'CONSUMED', 1)].join(',')}`);
  }

  const keys = async (table, column) =>
    (await store.pool.query(`SELECT ${column} AS k FROM ${table} ORDER BY 1`)).rows.map(row => row.k);
  const cacheKeys = () => keys('public_evidence_cache', 'cache_key');
  const stagedKeys = () => keys('staged_content_repository', 'content_id');

  test('a real run deletes only genuinely disposable rows', async () => {
    await seed();
    const result = await runSafeDatabaseHygiene(store.pool, {
      now: new Date(), cacheRetentionDays: 7, stagedRetentionDays: 14, batchSize: 500
    });
    assert.equal(result.ok, true);
    assert.equal(result.status, 'BOUNDED_HYGIENE_COMPLETE');
    assert.equal(result.vacuumAction, 'NONE_AUTOVACUUM_EXPECTED', 'never VACUUM FULL from a serverless cron');

    const cache = await cacheKeys();
    assert.ok(cache.includes('unexpired'), 'an unexpired cache row must survive');
    assert.ok(cache.includes('expired-but-touched-today'),
      'the updated_at guard must protect a row that expired but was written recently');
    assert.equal(cache.includes('stale-expired'), false, 'a genuinely stale expired row is disposable');

    const content = await stagedKeys();
    assert.ok(content.includes('ready-old'), 'READY content is not terminal and must survive');
    assert.ok(content.includes('claimed-old'), 'CLAIMED content is in flight and must survive');
    assert.ok(content.includes('consumed-recent'), 'terminal content inside the retention window must survive');
    assert.equal(content.includes('consumed-old'), false);
    assert.equal(content.includes('failed-old'), false);
  });

  // The retention values are clamped, but the interesting question is what
  // happens when clamping cannot produce a number at all. `Math.max(1, NaN)` is
  // NaN, which makes an Invalid Date, which PostgreSQL rejects. The run fails
  // and deletes nothing, which is the right direction to fail in -- pinned here
  // so a later refactor cannot quietly turn it into a date that selects rows.
  test('a retention value that is not a number deletes nothing', async () => {
    for (const value of [NaN, 'all', undefined === null ? 0 : 'every']) {
      await seed();
      let threw = null;
      try {
        await runSafeDatabaseHygiene(store.pool, {
          now: new Date(), cacheRetentionDays: value, stagedRetentionDays: value, batchSize: 500
        });
      } catch (error) { threw = error; }
      assert.ok(threw, `a retention of ${String(value)} must fail rather than guess`);
      assert.equal((await cacheKeys()).length, 3, 'a failed run must delete nothing');
    }
  });

  test('a zero or negative retention still cannot reach unexpired rows', async () => {
    for (const value of [0, -9999]) {
      await seed();
      await runSafeDatabaseHygiene(store.pool, {
        now: new Date(), cacheRetentionDays: value, stagedRetentionDays: value, batchSize: 500
      });
      const cache = await cacheKeys();
      assert.ok(cache.includes('unexpired'),
        `retention ${value} must not reach a row whose expires_at is in the future`);
      const content = await stagedKeys();
      assert.ok(content.includes('ready-old') && content.includes('claimed-old'),
        `retention ${value} must not reach non-terminal content`);
    }
  });

  test('the batch size is bounded in both directions', async () => {
    await seed();
    const huge = await runSafeDatabaseHygiene(store.pool, {
      now: new Date(), cacheRetentionDays: 7, stagedRetentionDays: 14, batchSize: 10 ** 9
    });
    assert.equal(huge.ok, true, 'an absurd batch size is clamped, not rejected and not obeyed');

    await seed();
    const negative = await runSafeDatabaseHygiene(store.pool, {
      now: new Date(), cacheRetentionDays: 7, stagedRetentionDays: 14, batchSize: -5
    });
    assert.equal(negative.ok, true);
    assert.equal(negative.deleted.stagedContent, 1, 'a negative batch clamps to one row, not zero and not all');
  });

  // The rule this cron exists under: financial, acceptance, security, refund and
  // renewal evidence is never auto-deleted. The executing path satisfies that by
  // naming only two disposable tables, so the test asserts the naming AND the
  // outcome -- a source check alone would pass a module that built a table name
  // at runtime.
  test('money, acceptance and audit evidence are never touched', async () => {
    await store.pool.query(`INSERT INTO audit_log(id,type,detail,created_at,data)
      VALUES ('hygiene-proof-receipt','payment_classification','{"amountCents":4900}'::jsonb,now()-interval '400 days','{"amountCents":4900,"currency":"USD"}'::jsonb)
      ON CONFLICT DO NOTHING`);
    const before = (await store.pool.query('SELECT count(*)::int AS c FROM audit_log')).rows[0].c;

    await runSafeDatabaseHygiene(store.pool, {
      now: new Date(), cacheRetentionDays: 1, stagedRetentionDays: 1, batchSize: 5000
    });

    const after = (await store.pool.query('SELECT count(*)::int AS c FROM audit_log')).rows[0].c;
    assert.equal(after, before, 'a 400-day-old payment classification receipt must survive any retention');
    const survived = await store.pool.query(
      "SELECT 1 FROM audit_log WHERE id='hygiene-proof-receipt'");
    assert.equal(survived.rowCount, 1);
    await store.pool.query("DELETE FROM audit_log WHERE id='hygiene-proof-receipt'");
  });

  // The route, not just the repository. A weekly cron that deletes rows must be
  // unreachable without both cron admission and an explicit enablement flag.
  const response = () => {
    const res = { status: null, body: null };
    res.writeHead = status => { res.status = status; };
    res.end = body => { res.body = JSON.parse(body); };
    return res;
  };
  const request = (over = {}) => ({
    method: 'GET',
    ...over,
    headers: {
      authorization: 'Bearer hygiene-proof-cron-secret',
      'x-vercel-cron-schedule': DATABASE_MAINTENANCE_SCHEDULE,
      ...(over.headers || {})
    }
  });
  const env = extra => ({
    CRON_SECRET: 'hygiene-proof-cron-secret',
    DATABASE_URL: REAL_URL,
    ...extra
  });

  test('the cron deletes nothing unless maintenance is explicitly enabled', async () => {
    for (const [label, value] of [['absent', undefined], ['false', 'false'], ['1', '1'], ['yes', 'yes']]) {
      await seed();
      const res = response();
      await createHandler({ env: env(value === undefined ? {} : { MAINTENANCE_ENABLED: value }), getPool: () => store.pool })(request(), res);
      assert.equal(res.body.status, 'MAINTENANCE_DISABLED', `MAINTENANCE_ENABLED=${label} must not enable deletion`);
      assert.equal(res.body.externalEffectLedger.productionMutations, 0);
      assert.equal((await cacheKeys()).length, 3, `MAINTENANCE_ENABLED=${label} deleted rows`);
    }
  });

  test('an explicitly enabled cron does delete, and reports what it deleted', async () => {
    await seed();
    const res = response();
    await createHandler({ env: env({ MAINTENANCE_ENABLED: 'true' }), getPool: () => store.pool })(request(), res);
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'BOUNDED_HYGIENE_COMPLETE');
    assert.equal(res.body.externalEffectLedger.productionMutations, 3,
      'the ledger must count what was actually deleted, not zero');
    assert.equal(res.body.businessEffectAuthority, 'INTERNAL_MAINTENANCE_ONLY');
  });

  test('an unauthorized caller deletes nothing even with maintenance enabled', async () => {
    for (const [label, over, expected] of [
      ['a wrong secret', { headers: { authorization: 'Bearer wrong' } }, 401],
      // 403 rather than 401, and the distinction is the boundary's, not an
      // accident: a bad secret is unauthenticated, a bad schedule is an
      // authenticated caller asking for something this route does not serve.
      ['a missing schedule header', { headers: { 'x-vercel-cron-schedule': '' } }, 403],
      ['a POST', { method: 'POST' }, 405]
    ]) {
      await seed();
      const res = response();
      await createHandler({ env: env({ MAINTENANCE_ENABLED: 'true' }), getPool: () => store.pool })(request(over), res);
      assert.equal(res.status, expected, label);
      assert.equal(res.body.businessEffectAuthority, 'NONE');
      assert.equal((await cacheKeys()).length, 3, `${label} deleted rows`);
    }
  });
}
