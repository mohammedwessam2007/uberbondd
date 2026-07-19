import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PostgresStore } from '../src/store.mjs';
import { DurableQueue } from '../src/queue.mjs';

const assert = (value, message) => { if (!value) throw new Error(message); };
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-queue-pg-'));
await fs.chmod(root, 0o777);
const databaseDir = path.join(root, 'db');
await fs.mkdir(databaseDir, { recursive: true });
await fs.chmod(databaseDir, 0o777);
const port = 29000 + Math.floor(Math.random() * 1000);
const postgres = new EmbeddedPostgres({ databaseDir, user: 'postgres', password: 'password', port, persistent: false, createPostgresUser: true, onLog: () => {}, onError: () => {} });
let storeA;
let storeB;
try {
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase('uberbond_queue');
  const databaseUrl = `postgresql://postgres:password@127.0.0.1:${port}/uberbond_queue`;
  storeA = new PostgresStore({ databaseUrl, ssl: false });
  storeB = new PostgresStore({ databaseUrl, ssl: false });
  await storeA.init();
  await storeB.init();
  const cfg = { version: 'smoke', queue: { concurrency: 10, maxAttempts: 2, retryBaseMs: 1000, retryMaxMs: 1000, lockTimeoutMs: 1000, jobHeartbeatMs: 1000, workerHeartbeatMs: 1000, workerStaleMs: 5000, maxRuntimeMs: 10000, pollMs: 10 } };
  const queueA = new DurableQueue(storeA, cfg, { error() {} });
  const queueB = new DurableQueue(storeB, cfg, { error() {} });

  const first = await queueA.enqueue('work', { n: 1 }, { dedupeKey: 'dedupe-one' });
  const duplicate = await queueB.enqueue('work', { n: 99 }, { dedupeKey: 'dedupe-one' });
  assert(first.id === duplicate.id, 'PostgreSQL dedupe failed');
  for (let i = 0; i < 19; i += 1) await queueA.enqueue('work', { n: i + 2 }, { dedupeKey: `work-${i}` });

  const executions = new Map();
  const handler = async (_payload, job) => {
    executions.set(job.id, (executions.get(job.id) || 0) + 1);
    await new Promise(resolve => setTimeout(resolve, 10));
    return { worker: job.lockedBy };
  };
  await Promise.all([
    queueA.runOnce({ work: handler }, { concurrency: 10 }),
    queueB.runOnce({ work: handler }, { concurrency: 10 })
  ]);
  assert(executions.size === 20, `Expected 20 unique executions, got ${executions.size}`);
  assert([...executions.values()].every(count => count === 1), 'A job executed more than once');
  const stats = await queueA.stats();
  assert(stats.counts.completed === 20, `Expected 20 completed jobs, got ${JSON.stringify(stats)}`);

  const retry = await queueA.enqueue('fail', {}, { maxAttempts: 2 });
  await queueA.runOnce({ fail: async () => { throw new Error('first failure'); } }, { concurrency: 1 });
  let state = await storeA.get('jobs', retry.id);
  assert(state.status === 'retry', `Expected retry state, got ${state.status}`);
  await storeA.patch('jobs', retry.id, { runAt: new Date(Date.now() - 1000).toISOString() });
  await queueB.runOnce({ fail: async () => { throw new Error('second failure'); } }, { concurrency: 1 });
  state = await storeA.get('jobs', retry.id);
  assert(state.status === 'dead-letter', `Expected dead-letter, got ${state.status}`);

  const abandoned = await queueA.enqueue('abandoned', {});
  const claimed = await storeA.claimJobs('crashed-worker', 1, 1000);
  assert(claimed[0]?.id === abandoned.id, 'Could not claim abandoned job');
  await storeA.pool.query("UPDATE jobs SET locked_at=now()-interval '10 seconds', heartbeat_at=now()-interval '10 seconds', data=data||jsonb_build_object('lockedAt',(now()-interval '10 seconds')::text,'heartbeatAt',(now()-interval '10 seconds')::text) WHERE id=$1", [abandoned.id]);
  const recovered = await storeB.recoverStaleJobs(1000);
  assert(recovered.recovered === 1, `Expected one recovered job, got ${JSON.stringify(recovered)}`);
  const reclaimed = await storeB.claimJobs('replacement-worker', 1, 1000);
  assert(reclaimed[0]?.id === abandoned.id, 'Replacement worker did not reclaim abandoned job');
  await storeB.completeJob(abandoned.id, { recovered: true }, { workerId: 'replacement-worker', lockedAt: reclaimed[0].lockedAt });

  await queueA.recordWorkerHeartbeat({ state: 'running' });
  assert((await queueB.liveWorkers()).some(worker => worker.id === queueA.workerId), 'Worker heartbeat not visible across processes');

  console.log(JSON.stringify({ ok: true, exactlyOnceExecutions: executions.size, completed: stats.counts.completed, deadLetter: state.status, staleRecovered: recovered.recovered, workerVisible: true }, null, 2));
} finally {
  await storeA?.close().catch(() => {});
  await storeB?.close().catch(() => {});
  await postgres.stop().catch(() => {});
}
process.exit(0);
