// Real, separate-connection PostgreSQL concurrency evidence for the P2.2 autonomy-cycle singleton
// and compare-and-swap mechanism -- not PGlite (single-process, in-memory) and not a mock. Uses
// the same embedded-postgres tooling as scripts/postgres-smoke.mjs: a genuine local Postgres
// server, with two independently-pooled PostgresStore instances racing against it exactly as two
// separate worker processes would. This directly answers the independent verification's CON-01..18
// gap ("no real PostgreSQL separate-connection race harness").
//
// Not wired into `npm run test:deterministic` (same as the existing postgres-smoke/postgres-app-
// smoke scripts) because starting a real Postgres server is slow (multi-second) relative to the
// rest of the deterministic suite. Run directly: node --test tests/p2-2-postgres-race.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import { PostgresStore } from '../src/store.mjs';
import { runAutonomyCycle } from '../src/autonomy-cycle.mjs';

let postgres;
let root;
let storeA;
let storeB;

before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-p22-pg-race-'));
  await fs.chmod(root, 0o777);
  const databaseDir = path.join(root, 'db');
  await fs.mkdir(databaseDir, { recursive: true });
  await fs.chmod(databaseDir, 0o777);
  const port = 25000 + Math.floor(Math.random() * 3000);
  postgres = new EmbeddedPostgres({
    databaseDir, user: 'postgres', password: 'password', port, persistent: false,
    createPostgresUser: true, onLog: () => {}, onError: message => process.stderr.write(`[embedded-postgres] ${String(message)}\n`)
  });
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase('uberbond_p22_race');
  const databaseUrl = `postgresql://postgres:password@127.0.0.1:${port}/uberbond_p22_race`;
  storeA = new PostgresStore({ databaseUrl, ssl: false });
  storeB = new PostgresStore({ databaseUrl, ssl: false });
  await storeA.init();
});

after(async () => {
  await storeA?.close().catch(() => {});
  await storeB?.close().catch(() => {});
  await postgres?.stop().catch(() => {});
  await fs.rm(root, { recursive: true, force: true }).catch(() => {});
});

function baseCfg(overrides = {}) {
  return {
    encryptionKey: 'key',
    inbound: {
      provider: 'test', enabled: false, gmailReadEnabled: false,
      limits: {
        maxPagesPerCycle: 5, maxMessagesPerPage: 25, maxMessageBytes: 2 * 1024 * 1024,
        maxMimeDepth: 10, maxMimePartCount: 200, maxDecodedBodyBytes: 262144,
        maxStageRuntimeMs: 5000, maxCycleRuntimeMs: 30000, maxStageRetries: 3,
        maxOwnerExceptionsPerCycle: 25, maxSummaryBytes: 8192, leaseTtlMs: 60000,
        ...overrides.limits
      }
    }
  };
}

test('CON-01/F-04 (real Postgres, two separate connections): concurrent createAutonomyCycleRun collapses to exactly one active row', async () => {
  const [a, b] = await Promise.all([
    storeA.createAutonomyCycleRun('pg-race-run-a', 'worker-a', 60000),
    storeB.createAutonomyCycleRun('pg-race-run-b', 'worker-b', 60000)
  ]);
  const results = [a, b];
  const succeeded = results.filter(r => r.ok);
  const rejected = results.filter(r => !r.ok);
  assert.equal(succeeded.length, 1, 'exactly one connection should have won the singleton row');
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason, 'cycle-already-active');
  const active = await storeA.pool.query("SELECT count(*)::int AS count FROM autonomy_cycle_runs WHERE status='active'");
  assert.equal(active.rows[0].count, 1);
  await storeA.patchAutonomyCycleRun(succeeded[0].run.id, succeeded[0].run.version, { status: 'completed', finalizedAt: new Date().toISOString() });
});

test('CON: real Postgres compare-and-swap rejects a stale version under genuine concurrent connections', async () => {
  const created = await storeA.createAutonomyCycleRun('pg-cas-run', 'worker-a', 60000);
  assert.equal(created.ok, true);
  const [first, second] = await Promise.all([
    storeA.patchAutonomyCycleRun(created.run.id, 0, { stagesPatch: { 'poll-inbound': { status: 'done', result: { from: 'A' }, attempts: 0, completedAt: new Date().toISOString() } } }),
    storeB.patchAutonomyCycleRun(created.run.id, 0, { stagesPatch: { 'poll-inbound': { status: 'done', result: { from: 'B' }, attempts: 0, completedAt: new Date().toISOString() } } })
  ]);
  const outcomes = [first, second];
  const succeeded = outcomes.filter(r => r.ok);
  const rejected = outcomes.filter(r => !r.ok);
  assert.equal(succeeded.length, 1, 'exactly one concurrent patch at the same starting version should win');
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason, 'version-conflict');
  const row = await storeA.pool.query('SELECT data FROM autonomy_cycle_runs WHERE id=$1', [created.run.id]);
  assert.equal(row.rows[0].data.version, 1, 'version must have advanced exactly once, not twice');
  await storeA.patchAutonomyCycleRun(created.run.id, 1, { status: 'completed', finalizedAt: new Date().toISOString() });
});

test('CON: real Postgres stale-lease reclaim race also collapses to exactly one winner', async () => {
  const created = await storeA.createAutonomyCycleRun('pg-reclaim-run', 'dead-worker', 1000);
  assert.equal(created.ok, true);
  await new Promise(resolve => setTimeout(resolve, 1300));
  const [first, second] = await Promise.all([
    storeA.reclaimStaleAutonomyCycleRun('worker-a', 60000),
    storeB.reclaimStaleAutonomyCycleRun('worker-b', 60000)
  ]);
  const outcomes = [first, second];
  const succeeded = outcomes.filter(r => r.ok);
  assert.equal(succeeded.length, 1, 'exactly one connection should reclaim the stale lease');
  await storeA.patchAutonomyCycleRun(succeeded[0].run.id, succeeded[0].run.version, { status: 'aborted', finalizedAt: new Date().toISOString() });
});

test('end-to-end: runAutonomyCycle completes against a real PostgreSQL backend, not just JSON/PGlite', async () => {
  const result = await runAutonomyCycle({ store: storeA, cfg: baseCfg(), runKey: 'pg-e2e-run', leaseOwner: 'worker-a' });
  assert.equal(result.ok, true);
  assert.equal(result.run.status, 'completed');
  assert.equal(result.digest.counts.messagesFetched, 0);
});
