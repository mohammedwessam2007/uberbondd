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
import {
  loadCommercialOutcomeReceipts,
  summarizeCommercialLearning,
  logCommercialLearning
} from './commercial-learning.mjs';
import {
  compileTaskBlueprint,
  compileTrigger,
  generateTaskInstances,
  evaluateTaskResult,
  logTaskUniverseReceipt
} from './task-universe.mjs';
import {
  compileUpgradeProposal,
  compileEngineeringMissionPacket,
  evaluateUpgradeGate,
  logSelfUpgradeReceipt
} from './self-upgrade.mjs';
import {
  buildPrometheusControlTower,
  logPrometheusControlTower
} from './prometheus-control-tower.mjs';

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
    },
    // Reads only the existing commercial_outcome audit receipts unless the
    // caller supplies a bounded receipt list. It summarizes proof; it never
    // creates revenue, advances promotion, allocates spend, or calls a provider.
    'prometheus.learning.summarize': async payload => {
      const input = payload && typeof payload === 'object' ? payload : {};
      const outcomes = Array.isArray(input.outcomes)
        ? input.outcomes
        : await loadCommercialOutcomeReceipts(store, { limit: input.maxOutcomes });
      const summary = summarizeCommercialLearning({ ...input, outcomes });
      if (summary.ok) await logCommercialLearning(store, summary);
      return summary;
    },
    // Shared Task Universe preparation. These handlers return contracts and
    // receipts only; they do not enqueue, send, spend, deploy, or mutate a
    // second task store.
    'prometheus.task.generate': async payload => {
      const input = payload && typeof payload === 'object' ? payload : {};
      const blueprint = input.blueprint?.status === 'COMPILED' ? input.blueprint : compileTaskBlueprint({ ...(input.blueprint || {}), date: input.date });
      const trigger = input.trigger?.ok ? input.trigger : compileTrigger({ ...(input.trigger || {}), date: input.date });
      const generated = generateTaskInstances({ ...input, blueprint, trigger });
      if (generated.ok) await logTaskUniverseReceipt(store, 'task_generation', generated.generationReceipt);
      return generated;
    },
    'prometheus.task.evaluate': async payload => {
      const input = payload && typeof payload === 'object' ? payload : {};
      const evaluated = evaluateTaskResult(input);
      if (evaluated.ok) await logTaskUniverseReceipt(store, 'task_evaluation', evaluated.receipt);
      return evaluated;
    },
    // Self-upgrade preparation only. These handlers create reviewable
    // proposals and bounded engineering packets; they never run an agent,
    // mutate a repository, promote, deploy, send, or spend.
    'prometheus.upgrade.propose': async payload => {
      const input = payload && typeof payload === 'object' ? payload : {};
      const proposal = compileUpgradeProposal(input);
      if (proposal.ok) await logSelfUpgradeReceipt(store, 'upgrade_proposal', proposal);
      return proposal;
    },
    'prometheus.engineering.packet': async payload => {
      const input = payload && typeof payload === 'object' ? payload : {};
      const packet = compileEngineeringMissionPacket(input);
      if (packet.ok) await logSelfUpgradeReceipt(store, 'engineering_mission_packet', packet);
      return packet;
    },
    'prometheus.upgrade.evaluate': async payload => {
      const input = payload && typeof payload === 'object' ? payload : {};
      const gate = evaluateUpgradeGate(input);
      if (gate.ok) await logSelfUpgradeReceipt(store, 'upgrade_gate_evaluation', gate);
      return gate;
    },
    // Founder-facing aggregation only. It composes canonical summaries and
    // records a bounded local receipt; it never sends or allocates money.
    'prometheus.control-tower.report': async payload => {
      const input = payload && typeof payload === 'object' ? payload : {};
      const report = await buildPrometheusControlTower({ ...input, store, cfg, revenueEngine: revenue });
      if (report.ok) await logPrometheusControlTower(store, report);
      return report;
    }
  };
}
