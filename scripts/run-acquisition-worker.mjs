import fs from 'node:fs/promises';
import { config } from '../src/config.mjs';
import { createStore } from '../src/store.mjs';
import { Pipeline } from '../src/pipeline.mjs';
import { RevenueEngine } from '../src/revenue.mjs';
import { DurableQueue } from '../src/queue.mjs';
import { DiscoveryRunner } from '../src/discovery-runner.mjs';
import { createJobHandlers } from '../src/job-handlers.mjs';
import {
  runScheduledWorker,
  safeWorkerLogger,
  scheduledWorkerPlan,
  scheduledWorkerPreflight
} from '../src/scheduled-workers.mjs';

const mode = String(process.env.WORKER_MODE || process.argv[2] || '').trim().toLowerCase();
const summaryPath = 'worker-summary.json';
const log = safeWorkerLogger(console);

async function saveSummary(summary) {
  await fs.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(summary));
}

let store;
try {
  const scheduledWorkersInactive = process.env.GITHUB_EVENT_NAME === 'schedule'
    && process.env.ACQUISITION_WORKERS_ACTIVE !== 'true';
  if (scheduledWorkersInactive) {
    await saveSummary({
      mode: mode || 'missing',
      status: 'inactive',
      blockedReason: 'workers-not-activated',
      liveOutboundEnabled: false
    });
  } else {
    scheduledWorkerPlan(mode, { batchSize: process.env.WORKER_BATCH_SIZE });
    const preflight = scheduledWorkerPreflight(config, mode);
    if (!preflight.ok) {
      await saveSummary({
        mode,
        status: 'blocked',
        blockedReason: preflight.blockedReason,
        liveOutboundEnabled: false
      });
    } else {
      store = createStore(config);
      await store.init();
      const queue = new DurableQueue(store, config, log);
      let revenue;
      const pipeline = new Pipeline(store, config, {
        onProspectComplete: prospect => revenue?.onProspectComplete(prospect)
      });
      const enqueueResearch = payload => queue.enqueue('research.batch', payload, {
        maxAttempts: 3,
        dedupeKey: payload.dedupeKey || `research:${payload.reason || 'scheduled'}:${String(process.env.GITHUB_RUN_ID || 'local')}`
      });
      revenue = new RevenueEngine(store, config, pipeline, { enqueueResearch });
      const discoveryRunner = new DiscoveryRunner(store, config, { enqueueResearch });
      const handlers = createJobHandlers({ store, pipeline, revenue, discoveryRunner });
      const result = await runScheduledWorker({
        mode,
        batchSize: process.env.WORKER_BATCH_SIZE,
        runKey: process.env.GITHUB_RUN_ID || process.env.WORKER_RUN_KEY,
        queue,
        handlers,
        store
      });
      await saveSummary({ ...result, status: result.jobStatus });
    }
  }
} catch (error) {
  await saveSummary({
    mode: mode || 'missing',
    status: 'failed',
    code: String(error?.code || error?.name || 'scheduled-worker-failed').replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, 80),
    liveOutboundEnabled: false
  }).catch(() => {});
  log.error('scheduled worker failed', error);
  process.exitCode = 1;
} finally {
  if (store) await store.close().catch(error => log.error('scheduled worker store close failed', error));
}
