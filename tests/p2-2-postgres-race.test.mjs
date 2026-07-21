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
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import EmbeddedPostgres from 'embedded-postgres';
import { PostgresStore } from '../src/store.mjs';
import { runAutonomyCycle } from '../src/autonomy-cycle.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const crashWorkerScript = path.join(here, '../scripts/p2-2-crash-worker.mjs');

let postgres;
let root;
let storeA;
let storeB;
let databaseUrl;

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
  databaseUrl = `postgresql://postgres:password@127.0.0.1:${port}/uberbond_p22_race`;
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
  const winner = succeeded[0].run;
  await storeA.patchAutonomyCycleRun(winner.id, { owner: winner.leaseOwner, epoch: winner.leaseEpoch, version: winner.version }, { status: 'completed', finalizedAt: new Date().toISOString() });
});

test('CON: real Postgres compare-and-swap rejects a stale version under genuine concurrent connections', async () => {
  const created = await storeA.createAutonomyCycleRun('pg-cas-run', 'worker-a', 60000);
  assert.equal(created.ok, true);
  const fence = { owner: created.run.leaseOwner, epoch: created.run.leaseEpoch, version: created.run.version };
  const [first, second] = await Promise.all([
    storeA.patchAutonomyCycleRun(created.run.id, fence, { stagesPatch: { 'poll-inbound': { status: 'done', result: { from: 'A' }, attempts: 0, completedAt: new Date().toISOString() } } }),
    storeB.patchAutonomyCycleRun(created.run.id, fence, { stagesPatch: { 'poll-inbound': { status: 'done', result: { from: 'B' }, attempts: 0, completedAt: new Date().toISOString() } } })
  ]);
  const outcomes = [first, second];
  const succeeded = outcomes.filter(r => r.ok);
  const rejected = outcomes.filter(r => !r.ok);
  assert.equal(succeeded.length, 1, 'exactly one concurrent patch at the same starting version should win');
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason, 'version-conflict');
  const row = await storeA.pool.query('SELECT data FROM autonomy_cycle_runs WHERE id=$1', [created.run.id]);
  assert.equal(row.rows[0].data.version, 1, 'version must have advanced exactly once, not twice');
  const winner = succeeded[0].run;
  await storeA.patchAutonomyCycleRun(created.run.id, { owner: winner.leaseOwner, epoch: winner.leaseEpoch, version: winner.version }, { status: 'completed', finalizedAt: new Date().toISOString() });
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
  const winner = succeeded[0].run;
  await storeA.patchAutonomyCycleRun(winner.id, { owner: winner.leaseOwner, epoch: winner.leaseEpoch, version: winner.version }, { status: 'aborted', finalizedAt: new Date().toISOString() });
});

test('end-to-end: runAutonomyCycle completes against a real PostgreSQL backend, not just JSON/PGlite', async () => {
  const result = await runAutonomyCycle({ store: storeA, cfg: baseCfg(), runKey: 'pg-e2e-run', leaseOwner: 'worker-a' });
  assert.equal(result.ok, true);
  assert.equal(result.run.status, 'completed');
  assert.equal(result.digest.counts.messagesFetched, 0);
});

test('CRS: a real SIGKILL mid-stage leaves the run resumable, not corrupted or duplicated', async () => {
  const runKey = 'sigkill-run';
  const child = spawn(process.execPath, [crashWorkerScript], {
    env: { ...process.env, DATABASE_URL: databaseUrl, P22_RUN_KEY: runKey, P22_LEASE_OWNER: 'crash-worker' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let sawStart = false;
  child.stdout.on('data', chunk => { if (String(chunk).includes('starting cycle')) sawStart = true; });
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));

  // Give the worker time to create the run and get stuck inside the hanging poll-inbound stage,
  // then kill it exactly like a real crash -- no graceful shutdown, no chance to finish a patch.
  await new Promise(resolve => setTimeout(resolve, 800));
  assert.equal(sawStart, true, 'worker should have started before being killed');
  child.kill('SIGKILL');
  const { signal } = await exited;
  assert.equal(signal, 'SIGKILL');

  // Immediately after the kill, the run must still show 'active' with poll-inbound not done --
  // proving the process actually died mid-stage rather than finishing first.
  const midCrash = await storeA.pool.query('SELECT data FROM autonomy_cycle_runs WHERE run_key=$1', [runKey]);
  assert.equal(midCrash.rows[0].data.status, 'active');
  assert.equal(midCrash.rows[0].data.stages['poll-inbound']?.status, undefined);

  // The killed worker's 5-second lease has not expired yet -- a second process must not be able
  // to just walk in immediately; it has to wait for (or the test simulates) lease expiry.
  const tooSoon = await storeA.reclaimStaleAutonomyCycleRun('recovery-worker', 60000);
  assert.equal(tooSoon.ok, false);
  assert.equal(tooSoon.reason, 'no-stale-lease');

  await new Promise(resolve => setTimeout(resolve, 4500));

  const cfg = baseCfg();
  const resumed = await runAutonomyCycle({ store: storeA, cfg, runKey: 'irrelevant-key-after-crash', leaseOwner: 'recovery-worker' });
  assert.equal(resumed.ok, true);
  assert.equal(resumed.run.runKey, runKey, 'must have resumed the actual crashed run, not started a fresh one');
  assert.equal(resumed.run.status, 'completed');
  // The resuming process re-evaluates config fresh rather than trusting anything the crashed
  // process intended -- this test's baseCfg() has inbound disabled, so the retried stage
  // correctly comes back 'skipped', proving the stage was genuinely retried from scratch and not
  // left over from (or corrupted by) the killed process's in-flight attempt.
  assert.equal(resumed.run.stages['poll-inbound'].status, 'skipped');
});
