import { createCanonCycleHandlers } from './autonomous-cycle.mjs';

/**
 * `queue`/`cfg`/`canonAdapters`/`canonProvider` are optional so existing callers (and any test that
 * only exercises the pre-Canon handlers) keep working unchanged. When `queue` is supplied, the
 * Canon job types (`canon.cycle.*`) are registered alongside the pre-Canon handlers -- registration
 * is unconditional (a manual/API-triggered enqueue always works), but nothing here *schedules* a
 * cycle: that stays gated behind `cfg.acquisition.workersActive` in scheduler.mjs, default false.
 * `canonAdapters`/`canonProvider` default to `{}`/`null` -- every opportunity-hunter adapter is
 * disabled and no live send provider is required for the worker to start.
 */
export function createJobHandlers({ store, pipeline, revenue, discoveryRunner, queue, cfg, canonAdapters = {}, canonProvider = null }) {
  const handlers = {
    'research.batch': async payload => pipeline.runBatch(payload.limit, payload || {}),
    'replies.poll': async () => ({ accountsProcessed: await pipeline.pollReplies() || 0 }),
    'outbound.process': async payload => pipeline.processOutboundQueue(payload?.limit),
    'followups.process': async () => ({ processed: await pipeline.processFollowups() || 0 }),
    'monitoring.process': async () => ({ processed: await revenue.processMonitoring() || 0 }),
    'discovery.run': async payload => discoveryRunner.run(payload || {}),
    'artifacts.cleanup': async () => ({ deleted: typeof store?.deleteExpiredArtifacts === 'function' ? await store.deleteExpiredArtifacts() : 0 })
  };
  if (queue && cfg) {
    Object.assign(handlers, createCanonCycleHandlers({ store, cfg, queue, adapters: canonAdapters, provider: canonProvider }));
  }
  return handlers;
}
