import { recoverStaleOutboundReservations } from './reservation-recovery.mjs';
import { capabilityGraphSummary } from './capability-graph.mjs';
import { queryCommercialMemory, detectContradictions } from './commercial-memory.mjs';

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
    // Read-only visibility snapshot of what this branch can actually do
    // right now -- no adapters exist yet to refresh (see
    // docs/PROMETHEUS_SOURCE_ADAPTERS.md), so there is nothing else
    // genuinely scheduled to "recompute" upstream of this yet.
    'prometheus.capability_gap.recompute': async () => {
      const summary = capabilityGraphSummary();
      await store.log('capability_graph_snapshot', summary);
      return summary;
    },
    // Read-only: scans existing commercial memory for hypotheses with both
    // positive and negative real outcomes on record and logs a receipt if
    // any are found. Never resolves a contradiction automatically.
    'prometheus.commercial_memory.contradiction_scan': async () => {
      const records = await queryCommercialMemory(store, { limit: 500 });
      const contradictions = detectContradictions(records);
      if (contradictions.length) {
        await store.log('commercial_memory_contradictions_found', { count: contradictions.length, hypotheses: contradictions.map(c => c.hypothesis) });
      }
      return { scanned: records.length, contradictions: contradictions.length };
    }
  };
}
