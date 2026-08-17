import { recoverStaleOutboundReservations } from './reservation-recovery.mjs';
import {
  preparePrometheusEconomicSpine,
  logPrometheusEconomicSpineDecision
} from './prometheus-economic-spine.mjs';

export function createJobHandlers({ store, cfg, pipeline, revenue, discoveryRunner }) {
  return {
    'research.batch': async payload => pipeline.runBatch(payload.limit, payload || {}),
    'replies.poll': async () => ({ accountsProcessed: await pipeline.pollReplies() || 0 }),
    'outbound.process': async payload => pipeline.processOutboundQueue(payload?.limit),
    'followups.process': async () => ({ processed: await pipeline.processFollowups() || 0 }),
    'monitoring.process': async () => ({ processed: await revenue.processMonitoring() || 0 }),
    'discovery.run': async payload => discoveryRunner.run(payload || {}),
    'artifacts.cleanup': async () => ({ deleted: typeof store?.deleteExpiredArtifacts === 'function' ? await store.deleteExpiredArtifacts() : 0 }),
    'outbound.reservations.recover': async payload => recoverStaleOutboundReservations({
      store,
      timeoutMs: cfg?.outbound?.reservationRecoveryTimeoutMs,
      limit: cfg?.outbound?.reservationRecoverySweepLimit,
      workspaceId: payload?.workspaceId || '',
      dryRun: Boolean(payload?.dryRun)
    }),
    // Bounded signal ingestion. Adapters supply candidates; this handler\n    // performs no network access and persists only when explicitly requested.\n    'prometheus.signals.ingest': async payload => {\n      const input = payload && typeof payload === 'object' ? payload : {};\n      return ingestMarketSignals({ ...input, store });\n    },\n    // Local-only composition task. It requires a caller-supplied signal,
    // candidate, and canonical prospect; it has no provider boundary.
    'prometheus.opportunity.prepare': async payload => {
      const input = payload && typeof payload === 'object' ? payload : {};
      const decision = preparePrometheusEconomicSpine({ ...input, cfg });
      if (decision.ok) await logPrometheusEconomicSpineDecision(store, decision);
      return decision;
    }
  };
}
