export function createJobHandlers({ store, pipeline, revenue, discoveryRunner }) {
  return {
    'research.batch': async payload => pipeline.runBatch(payload.limit, payload || {}),
    'drafts.process': async payload => pipeline.processDraftQueue(payload?.limit),
    'replies.poll': async payload => ({ repliesIngested: await pipeline.pollReplies(payload || {}) || 0 }),
    'outbound.process': async payload => pipeline.processOutboundQueue(payload?.limit, payload || {}),
    'followups.process': async payload => ({ processed: await pipeline.processFollowups(payload?.limit) || 0 }),
    'payments.reconcile': async payload => revenue.reconcilePendingPayments(payload?.limit),
    'monitoring.process': async () => ({ processed: await revenue.processMonitoring() || 0 }),
    'discovery.run': async payload => discoveryRunner.run(payload || {}),
    'stale.recover': async payload => {
      const jobs = await store.recoverStaleJobs();
      const prospects = await pipeline.recoverStaleProspects();
      const artifacts = payload?.includeArtifacts && typeof store?.deleteExpiredArtifacts === 'function'
        ? await store.deleteExpiredArtifacts()
        : 0;
      return { jobs, prospects, artifacts };
    },
    'artifacts.cleanup': async () => ({ deleted: typeof store?.deleteExpiredArtifacts === 'function' ? await store.deleteExpiredArtifacts() : 0 })
  };
}
