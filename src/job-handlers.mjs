import { recoverStaleOutboundReservations } from './reservation-recovery.mjs';

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
    })
  };
}
