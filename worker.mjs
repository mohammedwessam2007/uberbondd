import { config, validateStartupConfig } from './src/config.mjs';
import { createStore } from './src/store.mjs';
import { Pipeline } from './src/pipeline.mjs';
import { RevenueEngine } from './src/revenue.mjs';
import { DurableQueue } from './src/queue.mjs';
import { DiscoveryRunner } from './src/discovery-runner.mjs';
import { createJobHandlers } from './src/job-handlers.mjs';
import { startScheduler } from './src/scheduler.mjs';

validateStartupConfig(config);
if (config.nodeEnv === 'production' && config.processRole !== 'worker') {
  throw new Error('worker.mjs requires PROCESS_ROLE=worker in production');
}

const store = createStore(config);
await store.init();
if (typeof store.deleteExpiredArtifacts === 'function') await store.deleteExpiredArtifacts().catch(error => console.error('Artifact cleanup failed', error));
const queue = new DurableQueue(store, config, console);
let revenue;
const pipeline = new Pipeline(store, config, { onProspectComplete: prospect => revenue?.onProspectComplete(prospect) });
const enqueueResearch = payload => queue.enqueue('research.batch', payload, {
  maxAttempts: 3,
  dedupeKey: payload.leadId ? `research:lead:${payload.leadId}` : `research:${payload.reason || 'manual'}:${Math.floor(Date.now() / 30000)}`
});
revenue = new RevenueEngine(store, config, pipeline, { enqueueResearch });
const discoveryRunner = new DiscoveryRunner(store, config);
const handlers = createJobHandlers({ store, pipeline, revenue, discoveryRunner });
const stopScheduler = startScheduler(queue, config, console);
const workerPromise = queue.startWorker(handlers, { concurrency: config.queue.concurrency });

console.log(`UberBond worker ${queue.workerId} started using ${config.storeBackend}`);

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; worker is draining active jobs.`);
  stopScheduler();
  await queue.stopWorker().catch(error => console.error('Worker stop failed', error));
  await store.close();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

await workerPromise;
