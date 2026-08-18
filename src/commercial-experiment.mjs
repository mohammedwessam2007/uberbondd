// Bounded commercial-experiment compiler.
//
// This is the experiment contract between the economic spine and future
// distribution/outcome systems. It prepares a measurable probe but never
// authorizes a send, spend, deployment, checkout mutation, or revenue claim.
// It deliberately reuses the already-prepared spine decision instead of
// creating a second opportunity or offer model.
import crypto from 'node:crypto';
import { nextPromotionStage, PROMOTION_LADDER_STAGES } from './opportunity-registry.mjs';

export const COMMERCIAL_EXPERIMENT_POLICY_VERSION = 'commercial-experiment-1.0.0';

export const COMMERCIAL_EXPERIMENT_STAGES = Object.freeze([
  'DISCOVER', 'SCREEN', 'PROBE', 'VALIDATE', 'EXPAND', 'SCALE', 'HARVEST', 'KILL'
]);

const ZERO_EXTERNAL_EFFECTS = Object.freeze({
  providerCalls: 0,
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
});

function referenceDate(value) {
  const candidate = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(candidate.getTime()) ? new Date() : candidate;
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function failed(reasonCodes, timestamp, extra = {}) {
  return {
    ok: false,
    policyVersion: COMMERCIAL_EXPERIMENT_POLICY_VERSION,
    status: 'DENIED',
    timestamp,
    reasonCodes: unique(reasonCodes),
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS },
    ...extra
  };
}

function normalizedChannelIds(channels) {
  if (!Array.isArray(channels)) return [];
  return unique(channels.map(channel => {
    if (typeof channel === 'string') return channel.trim();
    return channel && typeof channel === 'object' ? String(channel.id || '').trim() : '';
  })).slice(0, 20);
}

function budgetState(budgetCents) {
  if (budgetCents == null || budgetCents === '') {
    return { status: 'UNKNOWN', amountCents: null, authorization: 'OWNER_REQUIRED' };
  }
  const amount = Number(budgetCents);
  if (!Number.isInteger(amount) || amount < 0) {
    return { status: 'INVALID', amountCents: null, authorization: 'OWNER_REQUIRED' };
  }
  return {
    status: 'OWNER_PROVIDED_NOT_AUTHORIZED',
    amountCents: amount,
    authorization: 'OWNER_REQUIRED'
  };
}

// Pure and deterministic for a supplied reference date. A PREPARED spine
// decision is still only a preparation result; it is not a payment or a live
// distribution authorization.
export function compileCommercialExperiment({
  spineDecision,
  channels = [],
  budgetCents = null,
  maxOwnerMinutes = null,
  date = new Date(),
  experimentId = null
} = {}) {
  const at = referenceDate(date);
  const timestamp = at.toISOString();

  if (!spineDecision || typeof spineDecision !== 'object' || spineDecision.ok !== true) {
    return failed(['economic-spine-decision-required'], timestamp);
  }

  const budget = budgetState(budgetCents);
  const reasonCodes = [];
  if (budget.status === 'INVALID') reasonCodes.push('invalid-budget');
  if (spineDecision.status !== 'PREPARED') reasonCodes.push('economic-spine-not-prepared');
  if (!spineDecision.signal?.signalId) reasonCodes.push('signal-lineage-required');
  if (!spineDecision.opportunity?.id) reasonCodes.push('opportunity-lineage-required');
  if (!spineDecision.offer?.product) reasonCodes.push('offer-lineage-required');

  const id = experimentId || `exp_${digest({
    policyVersion: COMMERCIAL_EXPERIMENT_POLICY_VERSION,
    spineDecisionId: spineDecision.decisionId || null,
    signalId: spineDecision.signal?.signalId || null,
    opportunityId: spineDecision.opportunity?.id || null,
    timestamp
  }).slice(0, 24)}`;
  const currentStage = spineDecision.opportunity?.score?.promotionStage;
  const promotion = PROMOTION_LADDER_STAGES.includes(currentStage)
    ? nextPromotionStage(currentStage, { gatePassed: false })
    : { ok: false, reason: 'unknown-stage' };
  const ownerMinutes = maxOwnerMinutes == null ? null : Number(maxOwnerMinutes);
  if (maxOwnerMinutes != null && (!Number.isFinite(ownerMinutes) || ownerMinutes < 0)) {
    reasonCodes.push('invalid-owner-minute-ceiling');
  }

  const ready = reasonCodes.length === 0;
  return {
    ok: true,
    policyVersion: COMMERCIAL_EXPERIMENT_POLICY_VERSION,
    experimentId: id,
    status: ready ? 'READY_FOR_OWNER_REVIEW' : 'REVIEW_REQUIRED',
    stage: 'PROBE',
    mode: 'LOCAL_PREPARATION_ONLY',
    timestamp,
    hypothesis: spineDecision.experiment?.hypothesis || 'No hypothesis was supplied by the economic spine.',
    lineage: {
      signalId: spineDecision.signal.signalId,
      opportunityId: spineDecision.opportunity.id,
      offerProduct: spineDecision.offer.product,
      spineDecisionId: spineDecision.decisionId || null
    },
    channelIds: normalizedChannelIds(channels),
    primaryMetric: 'CLEARED_PAYMENT',
    secondaryMetrics: [
      'ACCEPTED_DELIVERY',
      'SECOND_PAYMENT_OR_RENEWAL',
      'POSITIVE_CONTRIBUTION_MARGIN',
      'CONTRIBUTION_PROFIT_PER_FOUNDER_MINUTE'
    ],
    killConditions: [
      'signal becomes stale or contradicted',
      'required evidence falls below policy threshold',
      'payment is not cleared',
      'delivery is not accepted',
      'measured contribution margin is unknown or negative'
    ],
    budget,
    ownerMinuteCeiling: Number.isFinite(ownerMinutes) ? ownerMinutes : null,
    promotion: {
      current: currentStage || null,
      next: promotion.ok ? promotion.stage : null,
      advanced: false,
      gatePassed: false
    },
    blockers: unique(reasonCodes),
    authorization: {
      externalActions: 'OWNER_REQUIRED',
      providerCalls: 'DISABLED',
      messages: 'DISABLED',
      spend: 'DISABLED',
      deploy: 'DISABLED',
      paymentClaim: 'EXTERNAL_PROOF_REQUIRED'
    },
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

export async function logCommercialExperiment(store, experiment) {
  if (!store || typeof store.log !== 'function' || !experiment?.ok) return null;
  return store.log('commercial_experiment', {
    experimentId: experiment.experimentId,
    status: experiment.status,
    stage: experiment.stage,
    lineage: experiment.lineage,
    channelIds: experiment.channelIds,
    primaryMetric: experiment.primaryMetric,
    blockers: experiment.blockers,
    budget: experiment.budget,
    policyVersion: experiment.policyVersion,
    timestamp: experiment.timestamp,
    externalEffectLedger: experiment.externalEffectLedger
  });
}

export const COMMERCIAL_EXPERIMENT_EXTERNAL_EFFECTS = ZERO_EXTERNAL_EFFECTS;
