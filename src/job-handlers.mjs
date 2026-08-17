import { recoverStaleOutboundReservations } from './reservation-recovery.mjs';
import {
  preparePrometheusEconomicSpine,
  logPrometheusEconomicSpineDecision
} from './prometheus-economic-spine.mjs';
import { ingestMarketSignals } from './market-signal-registry.mjs';
import {
  compileCommercialExperiment,
  logCommercialExperiment
} from './commercial-experiment.mjs';
import {
  allocateDistribution,
  logDistributionAllocation
} from './distribution-channel.mjs';
import {
  normalizeCommercialOutcome,
  logCommercialOutcome
} from './commercial-outcome.mjs';

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
    // Bounded signal ingestion. Adapters supply candidates; this handler
    // performs no network access and persists only when explicitly requested.
    'prometheus.signals.ingest': async payload => {
      const input = payload && typeof payload === 'object' ? payload : {};
      return ingestMarketSignals({ ...input, store });
    },
    // Local-only composition task. It requires a caller-supplied signal,
    // candidate, and canonical prospect; it has no provider boundary.
    'prometheus.opportunity.prepare': async payload => {
      const input = payload && typeof payload === 'object' ? payload : {};
      const decision = preparePrometheusEconomicSpine({ ...input, cfg });
      if (decision.ok) await logPrometheusEconomicSpineDecision(store, decision);
      return decision;
    },
    // Compiles a probe contract only. It never creates a live campaign or
    // authorizes any distribution action.
    'prometheus.experiment.prepare': async payload => {
      const input = payload && typeof payload === 'object' ? payload : {};
      const experiment = compileCommercialExperiment(input);
      if (experiment.ok) await logCommercialExperiment(store, experiment);
      return experiment;
    },
    // Ranks only channels with verified cleared-payment outcomes. The result
    // is still preparation-only and always keeps external actions disabled.
    'prometheus.distribution.allocate': async payload => {
      const input = payload && typeof payload === 'object' ? payload : {};
      const allocation = allocateDistribution(input);
      if (allocation.ok) await logDistributionAllocation(store, allocation);
      return allocation;
    },
    // Normalizes a caller-supplied outcome and accepts payment claims only
    // with the existing payment-truth decision and provider event proof.
    'prometheus.outcome.record': async payload => {
      const input = payload && typeof payload === 'object' ? payload : {};
      const outcome = normalizeCommercialOutcome(input);
      if (outcome.ok) await logCommercialOutcome(store, outcome);
      return outcome;
    }
  };
}
