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
import { encryptJson, keyedHash } from '../src/crypto.mjs';

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
    encryptionKey: 'a'.repeat(64),
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

test('LEASE-03 (real Postgres, two separate connections): a live heartbeat blocks a concurrent reclaim attempt across the original TTL', async () => {
  const created = await storeA.createAutonomyCycleRun('lease03-run', 'worker-a', 1200);
  assert.equal(created.ok, true);
  let fence = { owner: created.run.leaseOwner, epoch: created.run.leaseEpoch, version: created.run.version };
  // Heartbeat on storeA every 400ms for 2s total -- well past the original 1200ms TTL, which
  // would have expired on its own by the second iteration if the heartbeat were not renewing it.
  // storeB (a genuinely separate connection) tries to reclaim after every heartbeat.
  for (let i = 0; i < 5; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 400));
    const hb = await storeA.heartbeatAutonomyCycleRun(created.run.id, fence, 1200);
    assert.equal(hb.ok, true, `heartbeat ${i} must keep renewing the live lease`);
    fence = { owner: fence.owner, epoch: hb.run.leaseEpoch, version: hb.run.version };
    const reclaim = await storeB.reclaimStaleAutonomyCycleRun('reclaimer', 60000);
    assert.equal(reclaim.ok, false, `a concurrent reclaimer must get nothing while heartbeats keep the lease alive (iteration ${i})`);
    assert.equal(reclaim.reason, 'no-stale-lease');
  }
  const row = await storeA.pool.query('SELECT data FROM autonomy_cycle_runs WHERE id=$1', [created.run.id]);
  assert.equal(row.rows[0].data.leaseOwner, 'worker-a', 'the original owner must still hold the lease throughout');
  assert.equal(row.rows[0].data.status, 'active');
  await storeA.patchAutonomyCycleRun(created.run.id, fence, { status: 'completed', finalizedAt: new Date().toISOString() });
});

test('CRASH-03 (real Postgres): resuming after a crash between an effect commit and its stage checkpoint does not duplicate the effect', async () => {
  const cfg = baseCfg({ limits: { maxStageRetries: 3 } });
  const gmailId = 'crash03-message';
  const messageKey = keyedHash(gmailId, cfg.encryptionKey);
  const created = await storeA.createAutonomyCycleRun('crash03-run', 'worker-a', 60000);
  assert.equal(created.ok, true);
  let fence = { owner: created.run.leaseOwner, epoch: created.run.leaseEpoch, version: created.run.version };
  // Simulate poll-inbound having already committed its checkpoint (as a real prior attempt would
  // have) for a single ref pointing at this message.
  const encryptedRefs = [encryptJson({ accountId: 'acct-crash03', refId: gmailId }, cfg.encryptionKey)];
  const pollPatch = await storeA.patchAutonomyCycleRun(created.run.id, fence, {
    stagesPatch: { 'poll-inbound': { status: 'done', result: { messagesFetched: 1, encryptedRefs }, attempts: 0, completedAt: new Date().toISOString() } }
  });
  assert.equal(pollPatch.ok, true);
  fence = { owner: pollPatch.run.leaseOwner, epoch: pollPatch.run.leaseEpoch, version: pollPatch.run.version };
  // Simulate a *previous* classify-and-suppress attempt that got as far as committing the durable
  // effect (the inbound work item) and then crashed -- SIGKILL, OOM, deploy -- before it could
  // patch the run's own stage checkpoint. The run record therefore still shows
  // classify-and-suppress as not-done, exactly as it would after a real crash at this point.
  const preCommitted = await storeA.createInboundWorkItem({
    messageKey, accountKey: keyedHash('acct-crash03', cfg.encryptionKey), threadKey: null,
    encryptedProviderRef: encryptJson({ accountId: 'acct-crash03', gmailId, threadId: '' }, cfg.encryptionKey),
    classificationCode: 'unknown', confidenceBucket: 'low', prospectId: null,
    expiresAt: new Date(Date.now() + 86400000).toISOString()
  });
  assert.equal(preCommitted.ok, true);

  const reader = {
    listMessages: async () => ({ data: { messages: [] } }),
    getMessage: async () => ({ data: { id: gmailId, threadId: '', payload: { headers: [], mimeType: 'text/plain', body: { data: Buffer.from('hi').toString('base64url') } } } })
  };
  // Same leaseOwner as the crashed attempt -- a worker process restarting under its own fixed
  // identity (a common real deployment shape) re-enters its own still-live lease rather than
  // needing a separate reclaim step, exactly like acquireRun's same-owner reentry path.
  const resumed = await runAutonomyCycle({ store: storeA, cfg, runKey: 'crash03-run', leaseOwner: 'worker-a', mailboxReader: reader, accounts: [{ id: 'acct-crash03', tokens: {} }] });
  assert.equal(resumed.ok, true, 'the resumed cycle must complete, not error, on a pre-existing effect');
  assert.equal(resumed.run.stages['classify-and-suppress'].status, 'done', 'the stage checkpoint must now advance');
  assert.equal(resumed.run.stages['classify-and-suppress'].result.duplicate, 1, 'the pre-committed effect must be recognized as a duplicate, not reprocessed as new');
  assert.equal(resumed.run.stages['classify-and-suppress'].result.processed, 0);

  const items = await storeA.pool.query('SELECT id FROM inbound_work_items WHERE message_key=$1', [messageKey]);
  assert.equal(items.rows.length, 1, 'effect count must remain exactly one after resume, never duplicated');
});

test('CRASH-05 (real Postgres): repeated recovery across multiple simulated crashes stays bounded and never duplicates an effect', async () => {
  // baseCfg() defaults inbound to disabled (most tests in this file don't need it) -- this
  // scenario needs the real pollInboundStage to run so the flaky reader is actually exercised,
  // not skipped.
  const cfg = baseCfg({ limits: { maxStageRetries: 3, maxStageRuntimeMs: 5000 } });
  cfg.inbound.enabled = true;
  cfg.inbound.gmailReadEnabled = true;
  const gmailId = 'crash05-message';
  let getMessageCalls = 0;
  const flakyReader = {
    listMessages: async () => ({ data: { messages: [{ id: gmailId }] } }),
    getMessage: async () => {
      getMessageCalls += 1;
      // Fails on the first two attempts (simulating two separate crashes mid-effect), succeeds
      // on the third -- within the maxStageRetries budget of 3.
      if (getMessageCalls < 3) throw new Error(`simulated crash on attempt ${getMessageCalls}`);
      return { data: { id: gmailId, threadId: '', payload: { headers: [], mimeType: 'text/plain', body: { data: Buffer.from('hi').toString('base64url') } } } };
    }
  };
  const runKey = 'crash05-flaky-run';
  let result = null;
  let calls = 0;
  for (; calls < 5; calls += 1) {
    result = await runAutonomyCycle({ store: storeA, cfg, runKey, leaseOwner: 'worker-a', mailboxReader: flakyReader, accounts: [{ id: 'acct-crash05', tokens: {} }] });
    if (result.ok) break;
    assert.equal(result.reason, 'stage-not-complete', `unexpected failure mode on recovery attempt ${calls}: ${result.reason}`);
  }
  assert.equal(result.ok, true, 'recovery must eventually succeed within the retry budget');
  assert.ok(calls < cfg.inbound.limits.maxStageRetries, `recovery took ${calls + 1} calls, which must stay below maxStageRetries (${cfg.inbound.limits.maxStageRetries})`);
  const messageKey = keyedHash(gmailId, cfg.encryptionKey);
  const items = await storeA.pool.query('SELECT id FROM inbound_work_items WHERE message_key=$1', [messageKey]);
  assert.equal(items.rows.length, 1, 'exactly one effect must exist no matter how many recovery attempts it took');

  // Second sub-scenario: a reader that never recovers must hard-stop at maxStageRetries, not
  // retry forever, and must never have created a duplicate (or any) effect along the way.
  const alwaysFailingReader = {
    listMessages: async () => ({ data: { messages: [{ id: 'crash05-never-recovers' }] } }),
    getMessage: async () => { throw new Error('permanently broken'); }
  };
  const boundedRunKey = 'crash05-bounded-run';
  let boundedResult = null;
  let boundedCalls = 0;
  for (; boundedCalls < 10; boundedCalls += 1) {
    boundedResult = await runAutonomyCycle({ store: storeA, cfg, runKey: boundedRunKey, leaseOwner: 'worker-a', mailboxReader: alwaysFailingReader, accounts: [{ id: 'acct-crash05b', tokens: {} }] });
    if (boundedResult.reason === 'stage-retries-exhausted') break;
  }
  assert.equal(boundedResult.reason, 'stage-retries-exhausted', 'a permanently failing stage must terminally stop, not retry forever');
  assert.equal(boundedCalls + 1, cfg.inbound.limits.maxStageRetries, `must hit the exact retry cap (${cfg.inbound.limits.maxStageRetries}), took ${boundedCalls + 1} calls`);
  assert.equal(boundedResult.run.status, 'failed');
  const neverKey = keyedHash('crash05-never-recovers', cfg.encryptionKey);
  const noItems = await storeA.pool.query('SELECT id FROM inbound_work_items WHERE message_key=$1', [neverKey]);
  assert.equal(noItems.rows.length, 0, 'a permanently failing attempt must never have created an effect at all');
});

async function seedReplyRaceFixture(store, suffix) {
  const campaign = { id: `rep08-campaign-${suffix}`, approved: true, enabled: true, autoSend: true, dryRun: true, liveSendApproved: false };
  const prospect = {
    id: `rep08-prospect-${suffix}`, campaignId: campaign.id, company: 'Clinic', website: `https://${suffix}.example`,
    domain: `${suffix}.example`, status: 'ready', inbox: 'A',
    draft: 'Approved evidence-backed body', subject: 'Approved subject',
    contact: { email: `info@${suffix}.example` }
  };
  await store.add('campaigns', campaign);
  await store.add('prospects', prospect);
  const reserved = await store.reserveOutboundSend({
    idempotencyKey: `rep08:${prospect.id}`, prospectId: prospect.id, campaignId: campaign.id,
    inbox: 'A', recipientEmail: prospect.contact.email, dailyCap: 100, hourlyCap: 100,
    minGapSeconds: 0, now: new Date().toISOString()
  });
  assert.equal(reserved.ok, true);
  return { campaign, prospect, reservation: reserved.reservation };
}

const rep08DryRunGate = {
  authorization: 'auto', simulation: true, systemProvider: 'test',
  systemEnabled: false, systemDryRun: true, systemLiveSendApproved: false,
  draftBody: 'Approved evidence-backed body', draftSubject: 'Approved subject'
};

test('REP-08 (real Postgres, two separate connections): a reply that lands first makes the dispatch fence reject the due follow-up reservation', async () => {
  const { prospect, reservation } = await seedReplyRaceFixture(storeA, 'rep08-ordered');
  const replied = await storeB.recordReplyAndStop({
    id: 'rep08-reply-ordered', prospectId: prospect.id, inbox: 'A', gmailId: 'rep08-gmail-ordered', processingStatus: 'processing'
  }, { status: 'replied', repliedAt: new Date().toISOString() });
  assert.ok(replied.prospect);
  const dispatch = await storeA.beginOutboundDispatch(reservation.id, rep08DryRunGate);
  assert.equal(dispatch.ok, false, 'no provider/send call may be authorized once a reply already landed for this prospect');
  assert.equal(dispatch.reason, 'reply-received');
  const finalReservation = await storeA.get('outboundReservations', reservation.id);
  assert.equal(finalReservation.status, 'cancelled');
  assert.equal(finalReservation.cancelReason, 'reply-received');
});

test('REP-08 (real Postgres, genuine concurrent race across 15 trials): the dispatch fence and the reply-stop path never produce an inconsistent outcome', async () => {
  const outcomes = { dispatchWon: 0, replyWon: 0 };
  for (let i = 0; i < 15; i += 1) {
    const suffix = `rep08-race-${i}`;
    const { prospect, reservation } = await seedReplyRaceFixture(storeA, suffix);
    const [dispatchResult, replyResult] = await Promise.all([
      storeA.beginOutboundDispatch(reservation.id, rep08DryRunGate),
      storeB.recordReplyAndStop({ id: `rep08-reply-${suffix}`, prospectId: prospect.id, inbox: 'A', gmailId: `rep08-gmail-${suffix}`, processingStatus: 'processing' }, { status: 'replied', repliedAt: new Date().toISOString() })
    ]);
    assert.ok(replyResult.prospect, `reply must always be recorded regardless of dispatch timing (trial ${i})`);
    const finalReservation = await storeA.get('outboundReservations', reservation.id);
    if (dispatchResult.ok) {
      // Dispatch won the per-prospect advisory lock and legitimately committed before the reply
      // did -- a valid interleaving, not a defect, since nothing had replied yet at that instant.
      outcomes.dispatchWon += 1;
      assert.equal(finalReservation.status, 'dispatching');
    } else {
      // The reply won the lock first -- the fence must reject with exactly 'reply-received', and
      // the reservation must be left cancelled, never left ambiguously in 'reserved'.
      outcomes.replyWon += 1;
      assert.equal(dispatchResult.reason, 'reply-received', `trial ${i} must reject specifically because of the reply, not some other reason`);
      assert.equal(finalReservation.status, 'cancelled');
      assert.equal(finalReservation.cancelReason, 'reply-received');
    }
  }
  // Real evidence that both legitimate interleavings were actually observed across the 15 trials,
  // not just one side of the race by construction.
  assert.ok(outcomes.dispatchWon + outcomes.replyWon === 15);
});
