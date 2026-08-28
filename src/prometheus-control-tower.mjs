// Truthful morning/control-tower aggregation.
//
// This is a read-and-summarize layer over existing command-center, audit,
// payment-truth, learning, and capability records. It deliberately reports
// UNKNOWN when a source is absent and never converts preparation events into
// revenue, agent execution, customer success, or deployment proof.

import { buildFounderCommandCenter } from './founder-command-center.mjs';
import {
  loadCommercialOutcomeReceipts,
  summarizeCommercialLearning
} from './commercial-learning.mjs';
import { capabilityGraphSummary } from './capability-graph.mjs';

export const PROMETHEUS_CONTROL_TOWER_POLICY_VERSION = 'prometheus-control-tower-1.0.0';

import { ZERO_EXTERNAL_EFFECTS as PROMETHEUS_CONTROL_TOWER_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export { PROMETHEUS_CONTROL_TOWER_EXTERNAL_EFFECTS };

const MAX_AUDIT = 500;

function referenceDate(value) {
  const candidate = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(candidate.getTime()) ? new Date() : candidate;
}

function boundedLimit(value, fallback = MAX_AUDIT) {
  return Number.isInteger(value) ? Math.max(0, Math.min(MAX_AUDIT, value)) : fallback;
}

function countEvents(rows, type) {
  return rows.filter(row => row?.type === type).length;
}

function eventStatus(count, label) {
  return count > 0 ? `LOCAL_${label}_OBSERVED` : `NO_${label}_OBSERVED`;
}

function ownerActions(commandCenter) {
  return Array.isArray(commandCenter?.ownerActionQueue)
    ? commandCenter.ownerActionQueue.slice(0, 3)
    : [];
}

// Build one bounded founder-facing report. It composes canonical summaries;
// it does not create a second revenue, opportunity, or task ledger.
export async function buildPrometheusControlTower({
  store,
  cfg = {},
  revenueEngine = null,
  date = new Date(),
  auditLimit = MAX_AUDIT,
  verification = null
} = {}) {
  const reference = referenceDate(date);
  const timestamp = reference.toISOString();
  if (!store || typeof store.list !== 'function') {
    return {
      ok: false,
      policyVersion: PROMETHEUS_CONTROL_TOWER_POLICY_VERSION,
      timestamp,
      reason: 'malformed-input-store',
      externalEffectLedger: { ...PROMETHEUS_CONTROL_TOWER_EXTERNAL_EFFECTS }
    };
  }

  const limit = boundedLimit(auditLimit);
  const [commandCenter, auditRows, outcomes] = await Promise.all([
    buildFounderCommandCenter({ store, cfg, revenueEngine, date: reference, auditLimit: limit }),
    store.list('auditLog', { orderBy: 'createdAt', direction: 'desc', limit }),
    loadCommercialOutcomeReceipts(store, { limit })
  ]);
  if (!commandCenter.ok) {
    return {
      ok: false,
      policyVersion: PROMETHEUS_CONTROL_TOWER_POLICY_VERSION,
      timestamp,
      reason: 'command-center-unavailable',
      detail: commandCenter.reason || 'unknown',
      externalEffectLedger: { ...PROMETHEUS_CONTROL_TOWER_EXTERNAL_EFFECTS }
    };
  }

  const learning = summarizeCommercialLearning({ outcomes, date: reference, maxOutcomes: limit });
  const counts = {
    signals: countEvents(auditRows, 'market_signal'),
    opportunities: countEvents(auditRows, 'prometheus_economic_spine'),
    experiments: countEvents(auditRows, 'commercial_experiment'),
    distributions: countEvents(auditRows, 'distribution_allocation'),
    taskGenerations: countEvents(auditRows, 'task_generation'),
    taskEvaluations: countEvents(auditRows, 'task_evaluation'),
    upgradeProposals: countEvents(auditRows, 'upgrade_proposal'),
    engineeringPackets: countEvents(auditRows, 'engineering_mission_packet'),
    upgradeEvaluations: countEvents(auditRows, 'upgrade_gate_evaluation')
  };
  const verifiedPayments = learning.ok ? learning.metrics.clearedPaymentCount : 0;
  const verifiedRevenue = learning.ok ? learning.metrics.grossClearedRevenueCents : null;
  const ownerQueue = ownerActions(commandCenter);
  const capability = capabilityGraphSummary();

  return {
    ok: true,
    policyVersion: PROMETHEUS_CONTROL_TOWER_POLICY_VERSION,
    timestamp,
    truthMode: 'LOCAL_FACTS_ONLY',
    money: {
      status: verifiedPayments > 0 ? 'VERIFIED_LOCAL_PAYMENT_RECEIPTS' : 'NO_VERIFIED_CLEARED_PAYMENTS',
      clearedPaymentCount: verifiedPayments,
      clearedRevenueCents: verifiedRevenue,
      clearedRevenueDisplay: commandCenter.paymentTruth.cleared ?? 'UNKNOWN',
      netCashImpactCents: learning.ok ? learning.metrics.netCashImpactCents : null,
      contributionProfitPerOwnerMinuteCents: learning.ok ? learning.metrics.contributionProfitPerOwnerMinuteCents : null,
      recurringRevenue: commandCenter.paymentTruth.activeMrr ?? 'UNKNOWN',
      refundsOrDisputes: learning.ok ? learning.metrics.refundOrDisputeCount : 'UNKNOWN'
    },
    businesses: {
      status: eventStatus(counts.experiments, 'COMMERCIAL_EXPERIMENTS'),
      experimentsPrepared: counts.experiments,
      opportunitiesPrepared: counts.opportunities,
      promotedBusinesses: 'UNKNOWN',
      killedBusinesses: 'UNKNOWN',
      customers: 'UNKNOWN',
      acceptedDeliveries: 'UNKNOWN',
      note: 'Preparation receipts are not customer, payment, delivery, or promotion proof.'
    },
    distribution: {
      status: eventStatus(counts.distributions, 'DISTRIBUTION_ALLOCATIONS'),
      allocationsPrepared: counts.distributions,
      outbound: commandCenter.outbound,
      externalExecution: 'DISABLED_OR_OWNER_REQUIRED',
      spendCents: 0
    },
    intelligence: {
      status: eventStatus(counts.signals, 'MARKET_SIGNALS'),
      marketSignalsObserved: counts.signals,
      opportunityPacketsPrepared: counts.opportunities,
      sourceAdaptersLive: 'UNKNOWN',
      'public-source-provenance': 'CALLER_SUPPLIED_OR_AUDIT_REFERENCED_ONLY'
    },
    product: {
      capabilityGraph: capability,
      verification: verification || { status: 'NOT_SUPPLIED' },
      upgradeProposals: counts.upgradeProposals,
      engineeringPackets: counts.engineeringPackets,
      upgradeEvaluations: counts.upgradeEvaluations,
      deployment: 'NOT_RUN'
    },
    aiWorkforce: {
      taskGenerations: counts.taskGenerations,
      taskEvaluations: counts.taskEvaluations,
      agentRuns: 0,
      agentReceipts: 0,
      executionProof: 'NOT_PROVEN_IN_THIS_REPORT',
      modelCost: 'UNKNOWN'
    },
    capital: {
      spendCents: 0,
      availableCash: 'UNKNOWN',
      reserve: 'UNKNOWN',
      allocationDecision: 'NOT_AUTHORIZED',
      note: 'No autonomous spending or capital allocation is enabled by this report.'
    },
    founder: {
      actionsRequired: ownerQueue.length,
      ownerActionQueue: ownerQueue,
      maximumBindingActions: 3,
      note: ownerQueue.length ? 'These are the current safe review/configuration actions.' : 'No binding action surfaced by the composed summaries.'
    },
    sourceCounts: counts,
    externalEffectLedger: { ...PROMETHEUS_CONTROL_TOWER_EXTERNAL_EFFECTS }
  };
}

export async function logPrometheusControlTower(store, report) {
  if (!store || typeof store.log !== 'function' || !report?.ok) return null;
  return store.log('prometheus_control_tower', {
    policyVersion: report.policyVersion,
    timestamp: report.timestamp,
    truthMode: report.truthMode,
    money: report.money,
    businesses: report.businesses,
    distribution: report.distribution,
    intelligence: report.intelligence,
    product: report.product,
    aiWorkforce: report.aiWorkforce,
    capital: report.capital,
    founder: report.founder,
    sourceCounts: report.sourceCounts,
    externalEffectLedger: report.externalEffectLedger
  });
}
