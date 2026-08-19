import { recoverStaleOutboundReservations } from './reservation-recovery.mjs';
import { capabilityGraphSummary } from './capability-graph.mjs';
import { queryCommercialMemory, detectContradictions } from './commercial-memory.mjs';
import {
  preparePrometheusEconomicSpine,
  logPrometheusEconomicSpineDecision
} from './prometheus-economic-spine.mjs';
import { ingestMarketSignals } from './market-signal-registry.mjs';
import {
  compileAllCommercialOpportunities,
  compileCommercialOpportunity,
  logCommercialOpportunityCatalog
} from './commercial-opportunity-catalog.mjs';
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
  compileUpgradeProposal as compileSelfUpgradeProposal,
  compileEngineeringMissionPacket as compileSelfUpgradeEngineeringPacket,
  evaluateUpgradeGate,
  logSelfUpgradeReceipt
} from './self-upgrade.mjs';
import {
  buildPrometheusControlTower,
  logPrometheusControlTower
} from './prometheus-control-tower.mjs';
import {
  compileAgentTask,
  compileDisputePacket,
  resolveDisputeRound,
  logAgentRelayReceipt
} from './agent-relay.mjs';
import {
  extractMechanismAtoms,
  recombineMechanismAtoms,
  redTeamMechanismCandidate,
  logMechanismLabReceipt
} from './mechanism-lab.mjs';
import {
  evaluateBusinessModelFitness,
  compilePortfolioReview,
  logBusinessFitnessReceipt
} from './business-model-fitness.mjs';
import {
  compileAdapterManifest,
  evaluateAdapterAccess,
  prepareAdapterDryRun,
  logAdapterContractReceipt
} from './adapter-contracts.mjs';
import { planCapitalAllocation, logCapitalAllocation } from './capital-allocator.mjs';
import {
  registerSendingDomain, logSendingDomainEvent, recordDomainDnsVerification,
  loadSendingDomain, listSendingDomains
} from './sending-domain-registry.mjs';
import {
  registerSendingMailbox, logSendingMailboxEvent, recordMailboxWarmupStatus,
  recordMailboxPause, loadSendingMailbox, listSendingMailboxesForDomain
} from './sending-mailbox-registry.mjs';
import { verifySendingDomainDns } from './dns-verification.mjs';
import { resolveProviderAdapter } from './provider-adapter-contract.mjs';
import { requestMailboxWarmupStart, reconcileMailboxWarmupStatus } from './warmup-orchestrator.mjs';
import { evaluateCircuitBreaker } from './domain-mailbox-circuit-breaker.mjs';
import { evaluateDomainMailboxGate } from './domain-mailbox-gate.mjs';
import { evaluateLiveActivation } from './live-activation-gate.mjs';
import { buildDomainReadinessCard, buildDomainReadinessDashboard } from './domain-mailbox-control-center.mjs';

// NOTE (Wave 0 parallel-spine reconciliation -- see
// docs/PROMETHEUS_PARALLEL_SPINE_RECONCILIATION.md): two concurrent
// sessions independently built overlapping economic-spine modules on this
// branch. That duplication has been resolved: for each of the 7
// overlapping pairs, exactly one implementation is now canonical (the
// other side's module was deleted, or its unique logic was folded into the
// canonical side). This file imports only canonical modules, plus
// `src/commercial-memory.mjs` and `src/genome-extraction.mjs`, which were
// kept because they have no equivalent on the other side. The
// `compileUpgradeProposal`/`compileEngineeringMissionPacket` aliases below
// exist only because job-type names in this file predate the
// reconciliation, not because of a remaining naming clash with a deleted
// module -- `src/self-upgrade.mjs` is the sole surviving implementation of
// both.

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
    },
    // Bounded signal ingestion. Adapters supply candidates; this handler
    // performs no network access and persists only when explicitly requested.
    'prometheus.signals.ingest': async payload => {
      const input = payload && typeof payload === 'object' ? payload : {};
      return ingestMarketSignals({ ...input, store });
    },
    // Local-only catalog preparation. It compiles the three evidence-labeled
    // commercial lanes without providers, sends, spend, deployment, or live
    // payment claims. The stored receipt is an internal research artifact.
    'prometheus.commercial.catalog': async payload => {
      const input = payload && typeof payload === 'object' ? payload : {};
      const result = compileAllCommercialOpportunities({ date: input.date });
      if (result.ok) await logCommercialOpportunityCatalog(store, result);
      return result;
    },
    // Compile one named commercial lane for a bounded local experiment packet.
    'prometheus.commercial.opportunity.prepare': async payload => {
      const input = payload && typeof payload === 'object' ? payload : {};
      return compileCommercialOpportunity({
        opportunityId: input.opportunityId,
        date: input.date
      });
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
      const proposal = compileSelfUpgradeProposal(input);
      if (proposal.ok) await logSelfUpgradeReceipt(store, 'upgrade_proposal', proposal);
      return proposal;
    },
    'prometheus.engineering.packet': async payload => {
      const input = payload && typeof payload === 'object' ? payload : {};
      const packet = compileSelfUpgradeEngineeringPacket(input);
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
    },
    'prometheus.agent.task': async payload => {
      const input = payload && typeof payload === 'object' ? payload : {};
      const task = compileAgentTask(input);
      if (task.ok) await logAgentRelayReceipt(store, 'agent_task', task);
      return task;
    },
    'prometheus.agent.dispute': async payload => {
      const input = payload && typeof payload === 'object' ? payload : {};
      const dispute = compileDisputePacket(input);
      if (dispute.ok) await logAgentRelayReceipt(store, 'agent_dispute', dispute);
      return dispute;
    },
    'prometheus.agent.dispute.resolve': async payload => {
      const input = payload && typeof payload === 'object' ? payload : {};
      const resolution = resolveDisputeRound(input);
      if (resolution.ok) await logAgentRelayReceipt(store, 'agent_dispute_resolution', resolution);
      return resolution;
    },
    'prometheus.mechanism.extract': async payload => {
      const input = payload && typeof payload === 'object' ? payload : {};
      const result = extractMechanismAtoms(input);
      if (result.ok) await logMechanismLabReceipt(store, 'mechanism_extraction', result);
      return result;
    },
    'prometheus.mechanism.recombine': async payload => {
      const input = payload && typeof payload === 'object' ? payload : {};
      const result = recombineMechanismAtoms(input);
      if (result.ok) await logMechanismLabReceipt(store, 'mechanism_recombination', result);
      return result;
    },
    'prometheus.mechanism.red-team': async payload => {
      const input = payload && typeof payload === 'object' ? payload : {};
      const result = redTeamMechanismCandidate(input);
      if (result.ok) await logMechanismLabReceipt(store, 'mechanism_red_team', result);
      return result;
    },
    'prometheus.fitness.evaluate': async payload => {
      const input = payload && typeof payload === 'object' ? payload : {};
      const result = evaluateBusinessModelFitness(input);
      if (result.ok) await logBusinessFitnessReceipt(store, 'business_model_fitness', result);
      return result;
    },
    'prometheus.fitness.portfolio': async payload => {
      const input = payload && typeof payload === 'object' ? payload : {};
      const result = compilePortfolioReview(input);
      if (result.ok) await logBusinessFitnessReceipt(store, 'business_model_portfolio_review', result);
      return result;
    },
    'prometheus.adapter.manifest': async payload => {
      const input = payload && typeof payload === 'object' ? payload : {};
      const result = compileAdapterManifest(input);
      if (result.ok) await logAdapterContractReceipt(store, 'adapter_manifest', result);
      return result;
    },
    'prometheus.adapter.access': async payload => {
      const input = payload && typeof payload === 'object' ? payload : {};
      const result = evaluateAdapterAccess(input);
      if (result.ok) await logAdapterContractReceipt(store, 'adapter_access_evaluation', result);
      return result;
    },
    'prometheus.adapter.dry-run': async payload => {
      const input = payload && typeof payload === 'object' ? payload : {};
      const result = prepareAdapterDryRun(input);
      if (result.ok) await logAdapterContractReceipt(store, 'adapter_dry_run', result);
      return result;
    },
    'prometheus.capital.plan': async payload => {
      const input = payload && typeof payload === 'object' ? payload : {};
      const result = planCapitalAllocation(input);
      if (result.ok) await logCapitalAllocation(store, result);
      return result;
    },
    // Domain and Mailbox Readiness OS (see
    // docs/UBERBOND_DOMAIN_MAILBOX_READINESS.md). Every handler here is a
    // thin wrapper: registration/verification handlers persist a receipt on
    // success, decision handlers (gate/activation/circuit-breaker) are
    // read-only or persist only the pause/state-change they decide. None of
    // these ever send an outbound message, contact a third party, or spend
    // money -- warm-up starts only through a real provider adapter response,
    // and the unconfigured fixture adapter (the only one wired up tonight,
    // since no provider credential is configured) always reports
    // PROVIDER_AUTH_REQUIRED.
    'domainMailbox.domain.register': async payload => {
      const input = payload && typeof payload === 'object' ? payload : {};
      const result = registerSendingDomain({ ...input, store });
      if (result.ok) await logSendingDomainEvent(store, result.event);
      return result;
    },
    'domainMailbox.mailbox.register': async payload => {
      const input = payload && typeof payload === 'object' ? payload : {};
      const result = registerSendingMailbox({ ...input, store });
      if (result.ok) await logSendingMailboxEvent(store, result.event);
      return result;
    },
    'domainMailbox.dns.verify': async payload => {
      const input = payload && typeof payload === 'object' ? payload : {};
      const dnsResult = await verifySendingDomainDns(input);
      if (dnsResult.ok && input.domainId) {
        const receipt = recordDomainDnsVerification({ store, domainId: input.domainId, dnsResult, date: input.date });
        if (receipt.ok) await logSendingDomainEvent(store, receipt.event);
      }
      return dnsResult;
    },
    'domainMailbox.warmup.request': async payload => {
      const input = payload && typeof payload === 'object' ? payload : {};
      const domainState = input.domainId ? await loadSendingDomain(store, input.domainId) : null;
      const mailboxState = input.mailboxId ? await loadSendingMailbox(store, input.mailboxId) : null;
      const resolution = resolveProviderAdapter(cfg, input.provider);
      const result = await requestMailboxWarmupStart({ domainState, mailboxState, providerAdapter: resolution.adapter, date: input.date });
      if (mailboxState) {
        const receipt = recordMailboxWarmupStatus({ store, mailboxId: mailboxState.mailboxId, warmupStatus: result.state, warmupStartTime: result.warmupStartTime, date: input.date });
        if (receipt.ok) await logSendingMailboxEvent(store, receipt.event);
      }
      return result;
    },
    'domainMailbox.warmup.reconcile': async payload => {
      const input = payload && typeof payload === 'object' ? payload : {};
      const mailboxState = input.mailboxId ? await loadSendingMailbox(store, input.mailboxId) : null;
      const resolution = resolveProviderAdapter(cfg, input.provider);
      const result = await reconcileMailboxWarmupStatus({ mailboxState, providerAdapter: resolution.adapter, minWarmupDays: cfg.domainMailbox?.minWarmupDays, date: input.date });
      if (mailboxState) {
        const receipt = recordMailboxWarmupStatus({ store, mailboxId: mailboxState.mailboxId, warmupStatus: result.state, currentDailyCap: result.reportedDailyCap ?? result.plannedDailyCap, date: input.date });
        if (receipt.ok) await logSendingMailboxEvent(store, receipt.event);
      }
      return result;
    },
    'domainMailbox.circuit_breaker.evaluate': async payload => {
      const input = payload && typeof payload === 'object' ? payload : {};
      const domainState = input.domainId ? await loadSendingDomain(store, input.domainId) : null;
      const mailboxState = input.mailboxId ? await loadSendingMailbox(store, input.mailboxId) : null;
      const result = evaluateCircuitBreaker({ ...input, domainState, mailboxState, thresholds: cfg.domainMailbox });
      if (result.shouldPause && mailboxState) {
        const receipt = recordMailboxPause({ store, mailboxId: mailboxState.mailboxId, reasonCodes: result.triggers.map(t => t.reasonCode), ownerRequired: result.ownerRequired, date: input.date });
        if (receipt.ok) await logSendingMailboxEvent(store, receipt.event);
      }
      return result;
    },
    'domainMailbox.gate.evaluate': async payload => {
      const input = payload && typeof payload === 'object' ? payload : {};
      const domainState = input.domainId ? await loadSendingDomain(store, input.domainId) : null;
      const mailboxState = input.mailboxId ? await loadSendingMailbox(store, input.mailboxId) : null;
      return evaluateDomainMailboxGate({ ...input, domainState, mailboxState });
    },
    'domainMailbox.activation.evaluate': async payload => {
      const input = payload && typeof payload === 'object' ? payload : {};
      const domainState = input.domainId ? await loadSendingDomain(store, input.domainId) : null;
      const mailboxState = input.mailboxId ? await loadSendingMailbox(store, input.mailboxId) : null;
      const resolution = resolveProviderAdapter(cfg, input.provider);
      return evaluateLiveActivation({
        domainState, mailboxState, providerAdapterResolution: resolution,
        ownerAuthorization: input.ownerAuthorization, minWarmupDays: cfg.domainMailbox?.minWarmupDays, date: input.date
      });
    },
    // Read-only dashboard build. Never mutates state.
    'domainMailbox.dashboard.build': async () => {
      const domains = await listSendingDomains(store, { minWarmupDays: cfg.domainMailbox?.minWarmupDays });
      const cards = await Promise.all(domains.map(async domainState => {
        const mailboxes = await listSendingMailboxesForDomain(store, domainState.domainId);
        return buildDomainReadinessCard({ domainState, mailboxState: mailboxes[0] || null });
      }));
      return buildDomainReadinessDashboard(cards);
    }
  };
}
