import { config, validateStartupConfig } from './src/config.mjs';
import { createStore } from './src/store.mjs';
import { Pipeline } from './src/pipeline.mjs';
import { RevenueEngine } from './src/revenue.mjs';
import { DurableQueue } from './src/queue.mjs';
import { DiscoveryRunner } from './src/discovery-runner.mjs';
import { createMissionAwareJobHandlers } from './src/founder-outcome-job-handlers.mjs';
import { startScheduler } from './src/scheduler.mjs';
import { resolveOmniaV9Mode } from './src/omnia-v9/integrations/config.mjs';
import { resolveOutboundFinalAdmissionHook } from './src/omnia-v9/integrations/outbound-admission.mjs';
import { closeSharedBrowserRuntimes } from './src/browser-runtime-pool.mjs';
import { routeProspectCompletion } from './src/first-cash-prospect-completion.mjs';
import { buildLiveOutreach100kSummary, runOutreach100kBatch } from './src/outreach-100k-runtime-control.mjs';

validateStartupConfig(config);
if (config.nodeEnv === 'production' && config.processRole !== 'worker') {
  throw new Error('worker.mjs requires PROCESS_ROLE=worker in production');
}

const store = createStore(config);
await store.init();
if (typeof store.deleteExpiredArtifacts === 'function') await store.deleteExpiredArtifacts().catch(error => console.error('Artifact cleanup failed', error));
const queue = new DurableQueue(store, config, console);
let revenue;
// OMNIA_V9_MODE defaults to 'off' (resolveOmniaV9Mode never escalates without an
// explicit env value from this allowlist). The resolved hook only ever feeds the
// non-authoritative shadow observer (src/omnia-v9/final-admission-shadow.mjs) --
// it cannot block or alter a send. The AUTHORITATIVE outbound-consequence-gate.mjs
// is deliberately NOT wired here -- see docs/INSTANTLY_RECONCILIATION.md Sub-wave B.
const omniaV9Mode = resolveOmniaV9Mode(process.env);
console.log(`OMNIA V9 outbound integration mode: ${omniaV9Mode}`);
const pipeline = new Pipeline(store, config, {
  // One completion router owns the generic-vs-paid boundary. Public/generic
  // research delegates to RevenueEngine exactly as before. A persisted paid
  // first-cash sprint is instead advanced through deterministic QA to
  // DELIVERY_READY and never enters generic report auto-email delivery.
  onProspectComplete: prospect => routeProspectCompletion({ store, revenue, prospect }),
  outboundFinalAdmissionShadow: resolveOutboundFinalAdmissionHook({ mode: omniaV9Mode, store })
});
const enqueueJob = (type, payload, options = {}) => queue.enqueue(type, payload, type === 'outreach.100k.process'
  ? { ...options, maxAttempts: 1, recoveryPolicy: 'reconcile' }
  : options);
const enqueueResearch = payload => enqueueJob('research.batch', payload, {
  maxAttempts: 3,
  dedupeKey: payload.leadId ? `research:lead:${payload.leadId}` : `research:${payload.reason || 'manual'}:${Math.floor(Date.now() / 30000)}`
});
revenue = new RevenueEngine(store, config, pipeline, { enqueueResearch });
const discoveryRunner = new DiscoveryRunner(store, config);
const handlers = createMissionAwareJobHandlers({ store, cfg: config, pipeline, revenue, discoveryRunner, enqueueJob });
handlers['outreach.100k.process'] = async payload => {
  const liveSummary = await buildLiveOutreach100kSummary({ store, cfg: config });
  const input = payload && typeof payload === 'object' ? payload : {};
  // Certificate IDs are observation receipts and may legitimately change as
  // provider-confirmed counts and observation time advance. The immutable
  // founder binding is the exact recipient-set digest; every batch recompiles
  // a fresh green certificate from current evidence before any effect.
  return runOutreach100kBatch({
    store,
    cfg: config,
    enqueueJob,
    payload: { ...input, founderCertificateId: input.certificateId || input.founderCertificateId || null, certificateId: '', liveSummary }
  });
};
const stopScheduler = startScheduler(queue, config, console);
const autoResumeOnBoot = String(process.env.WORKER_AUTO_RESUME_ON_BOOT || '').toLowerCase() === 'true';
if (autoResumeOnBoot) {
  const pauseState = await queue.pausedState();
  if (pauseState.paused) await queue.setPaused(false, 'startup-recovery');
  const [jobs, prospects] = await Promise.all([store.list('jobs'), store.list('prospects')]);
  let target = prospects.find(item => item.id === 'pros_3e2eb90c-c6c0-48de-8850-9a55865490bb');
  const targetJobExists = jobs.some(item =>
    item.type === 'research.batch' &&
    ['queued', 'retry', 'active'].includes(item.status) &&
    item.payload?.prospectId === target?.id
  );
  let recoveryJobId = '';
  const snapshotRetryNeeded = target?.status === 'error'
    && String(target.error || '') === 'No usable pages crawled: page-snapshot-timeout'
    && !target.boundedSnapshotRetryAt;
  if ((target?.status === 'crawling' || snapshotRetryNeeded) && !targetJobExists) {
    target = await store.patch('prospects', target.id, {
      status: 'retry',
      error: snapshotRetryNeeded
        ? 'Retrying once after widening the bounded DOM snapshot budget'
        : 'Recovered orphaned crawling prospect before a clean research retry',
      ...(snapshotRetryNeeded
        ? { boundedSnapshotRetryAt: new Date().toISOString() }
        : { recoveredAt: new Date().toISOString() })
    });
    const recoveryJob = await enqueueResearch({
      limit: 1, reason: 'prospect-recovery', prospectId: target.id
    });
    recoveryJobId = recoveryJob.id;
  }
  const jobCounts = Object.fromEntries([...new Set(jobs.map(item => item.status))].map(status => [
    status, jobs.filter(item => item.status === status).length
  ]));
  const activeResearch = jobs.filter(item => item.status === 'active' && item.type === 'research.batch').length;
  const researchJobs = jobs.filter(item => item.type === 'research.batch').map(item => ({
    id: item.id, status: item.status, attempts: item.attempts,
    lastError: String(item.lastError || '').slice(0, 240)
  }));
  console.log(`UberBond startup recovery snapshot: paused=${Boolean((await queue.pausedState()).paused)} activeResearch=${activeResearch} jobCounts=${JSON.stringify(jobCounts)} targetStatus=${target?.status || 'missing'} targetError=${String(target?.error || '').slice(0, 240)} recoveryJobId=${recoveryJobId || 'none'} researchJobs=${JSON.stringify(researchJobs)}`);
}
const workerPromise = queue.startWorker(handlers, { concurrency: config.queue.concurrency });

console.log(`UberBond worker ${queue.workerId} started using ${config.storeBackend}`);

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; worker is draining active jobs.`);
  stopScheduler();
  await queue.stopWorker().catch(error => console.error('Worker stop failed', error));
  await closeSharedBrowserRuntimes().catch(error => console.error('Browser runtime stop failed', error));
  await store.close();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

await workerPromise;
