// Evidence-gated commercial outcome lineage.
//
// This module is intentionally not a revenue store and does not classify
// payment events itself. Payment truth remains in payments.mjs/RevenueEngine.
// A cleared-payment outcome is accepted only when the caller supplies the
// existing payment classifier's cleared decision plus provider event proof.

import crypto from 'node:crypto';
import { PAYMENT_TRUTH_POLICY_VERSION } from './payments.mjs';

export const COMMERCIAL_OUTCOME_POLICY_VERSION = 'commercial-outcome-1.0.0';

export const COMMERCIAL_OUTCOME_TYPES = Object.freeze([
  'SIGNAL_CAPTURED', 'OPPORTUNITY_SCORED', 'OFFER_PREPARED', 'CHECKOUT_STARTED',
  'PAYMENT_CLEARED', 'RENEWAL_CLEARED', 'DELIVERY_ACCEPTED', 'REFUND',
  'DISPUTE', 'CHURN', 'FAILURE'
]);

const CLEARED_CLASSIFICATIONS = new Set(['CLEARED_ONE_TIME_PAYMENT', 'CLEARED_SUBSCRIPTION_PAYMENT']);
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

function failure(reasonCodes, timestamp) {
  return {
    ok: false,
    policyVersion: COMMERCIAL_OUTCOME_POLICY_VERSION,
    status: 'REJECTED',
    timestamp,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

function validCurrency(value) {
  return /^[A-Z]{3}$/.test(String(value || ''));
}

function paymentProof({ outcome, paymentDecision, outcomeType }) {
  if (!paymentDecision || paymentDecision.policyVersion !== PAYMENT_TRUTH_POLICY_VERSION) {
    return { ok: false, reason: 'payment-truth-decision-required' };
  }
  if (!CLEARED_CLASSIFICATIONS.has(paymentDecision.classification) || paymentDecision.shouldRecordRevenue !== true) {
    return { ok: false, reason: 'cleared-payment-classification-required' };
  }
  if (outcomeType === 'PAYMENT_CLEARED' && paymentDecision.classification !== 'CLEARED_ONE_TIME_PAYMENT') {
    return { ok: false, reason: 'one-time-payment-classification-required' };
  }
  if (outcomeType === 'RENEWAL_CLEARED' && paymentDecision.classification !== 'CLEARED_SUBSCRIPTION_PAYMENT') {
    return { ok: false, reason: 'subscription-payment-classification-required' };
  }
  const amountCents = Number(outcome.amountCents ?? paymentDecision.amountCents);
  const currency = String(outcome.currency || paymentDecision.currency || '').toUpperCase();
  const providerEventId = String(outcome.providerEventId || paymentDecision.providerEventId || '').trim();
  if (!Number.isInteger(amountCents) || amountCents <= 0 || !validCurrency(currency)) {
    return { ok: false, reason: 'cleared-payment-amount-and-currency-required' };
  }
  if (!providerEventId) return { ok: false, reason: 'provider-event-proof-required' };
  return {
    ok: true,
    truthLevel: 'CLEARED_PAYMENT',
    amountCents,
    currency,
    providerEventId,
    paymentClassification: paymentDecision.classification
  };
}

function refundProof({ outcome, paymentDecision }) {
  if (!paymentDecision || paymentDecision.policyVersion !== PAYMENT_TRUTH_POLICY_VERSION) {
    return { ok: false, reason: 'payment-truth-decision-required' };
  }
  if (paymentDecision.classification !== 'REFUND_OR_DISPUTE' || paymentDecision.shouldRecordRevenue !== true) {
    return { ok: false, reason: 'refund-or-dispute-classification-required' };
  }
  const amountCents = Number(outcome.amountCents ?? paymentDecision.amountCents);
  const currency = String(outcome.currency || paymentDecision.currency || '').toUpperCase();
  const providerEventId = String(outcome.providerEventId || paymentDecision.providerEventId || '').trim();
  if (!Number.isInteger(amountCents) || amountCents <= 0 || !validCurrency(currency)) {
    return { ok: false, reason: 'refund-amount-and-currency-required' };
  }
  if (!providerEventId) return { ok: false, reason: 'provider-event-proof-required' };
  return {
    ok: true,
    truthLevel: 'REFUND_OR_DISPUTE',
    amountCents,
    currency,
    providerEventId,
    paymentClassification: paymentDecision.classification
  };
}

// Pure normalization. The returned receipt is safe to persist in auditLog;
// it deliberately excludes raw webhook payloads, customer contact data, and
// unauthorised claims of revenue.
export function normalizeCommercialOutcome({ outcome = {}, paymentDecision = null, date = new Date() } = {}) {
  const at = referenceDate(date);
  const timestamp = at.toISOString();
  if (!outcome || typeof outcome !== 'object') return failure(['outcome-required'], timestamp);
  const eventId = String(outcome.eventId || '').trim();
  const outcomeType = String(outcome.outcomeType || '').trim().toUpperCase();
  const opportunityId = String(outcome.opportunityId || '').trim();
  if (!eventId) return failure(['outcome-event-id-required'], timestamp);
  if (!COMMERCIAL_OUTCOME_TYPES.includes(outcomeType)) return failure([`unknown-outcome-type:${outcomeType}`], timestamp);
  if (!opportunityId) return failure(['opportunity-lineage-required'], timestamp);
  const occurredAt = new Date(outcome.occurredAt || timestamp);
  if (Number.isNaN(occurredAt.getTime())) return failure(['invalid-outcome-time'], timestamp);

  const paymentOutcome = ['PAYMENT_CLEARED', 'RENEWAL_CLEARED'].includes(outcomeType);
  const refundOrDispute = ['REFUND', 'DISPUTE'].includes(outcomeType);
  if (paymentOutcome) {
    const proof = paymentProof({ outcome, paymentDecision, outcomeType });
    if (!proof.ok) return failure([proof.reason], timestamp);
    const contributionMarginCents = outcome.contributionMarginCents == null ? null : Number(outcome.contributionMarginCents);
    const ownerMinutes = outcome.ownerMinutes == null ? null : Number(outcome.ownerMinutes);
    if (contributionMarginCents != null && !Number.isFinite(contributionMarginCents)) return failure(['invalid-contribution-margin'], timestamp);
    if (ownerMinutes != null && (!Number.isFinite(ownerMinutes) || ownerMinutes < 0)) return failure(['invalid-owner-minutes'], timestamp);
    return {
      ok: true,
      policyVersion: COMMERCIAL_OUTCOME_POLICY_VERSION,
      outcomeId: `out_${digest({ policyVersion: COMMERCIAL_OUTCOME_POLICY_VERSION, eventId }).slice(0, 24)}`,
      status: 'RECORDED_CLEARED_PAYMENT',
      truthLevel: proof.truthLevel,
      outcomeType,
      eventId,
      occurredAt: occurredAt.toISOString(),
      lineage: {
        signalId: String(outcome.signalId || '').trim() || null,
        opportunityId,
        experimentId: String(outcome.experimentId || '').trim() || null,
        channelId: String(outcome.channelId || '').trim() || null
      },
      paymentProof: {
        providerEventId: proof.providerEventId,
        paymentClassification: proof.paymentClassification,
        amountCents: proof.amountCents,
        currency: proof.currency,
        paymentPolicyVersion: PAYMENT_TRUTH_POLICY_VERSION
      },
      contributionMarginCents,
      ownerMinutes,
      externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
    };
  }

  if (refundOrDispute) {
    const proof = refundProof({ outcome, paymentDecision });
    if (!proof.ok) return failure([proof.reason], timestamp);
    return {
      ok: true,
      policyVersion: COMMERCIAL_OUTCOME_POLICY_VERSION,
      outcomeId: `out_${digest({ policyVersion: COMMERCIAL_OUTCOME_POLICY_VERSION, eventId }).slice(0, 24)}`,
      status: 'RECORDED_REFUND_OR_DISPUTE',
      truthLevel: proof.truthLevel,
      outcomeType,
      eventId,
      occurredAt: occurredAt.toISOString(),
      lineage: {
        signalId: String(outcome.signalId || '').trim() || null,
        opportunityId,
        experimentId: String(outcome.experimentId || '').trim() || null,
        channelId: String(outcome.channelId || '').trim() || null
      },
      paymentProof: {
        providerEventId: proof.providerEventId,
        paymentClassification: proof.paymentClassification,
        amountCents: proof.amountCents,
        currency: proof.currency,
        paymentPolicyVersion: PAYMENT_TRUTH_POLICY_VERSION
      },
      economicImpactCents: -proof.amountCents,
      externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
    };
  }

  if (outcome.amountCents != null || outcome.currency != null || outcome.providerEventId != null) {
    return failure(['revenue-proof-required'], timestamp);
  }

  return {
    ok: true,
    policyVersion: COMMERCIAL_OUTCOME_POLICY_VERSION,
    outcomeId: `out_${digest({ policyVersion: COMMERCIAL_OUTCOME_POLICY_VERSION, eventId }).slice(0, 24)}`,
    status: 'RECORDED_NON_REVENUE_OUTCOME',
    truthLevel: refundOrDispute ? 'EXTERNAL_PROOF_REQUIRED' : 'OBSERVED_OUTCOME',
    outcomeType,
    eventId,
    occurredAt: occurredAt.toISOString(),
    lineage: {
      signalId: String(outcome.signalId || '').trim() || null,
      opportunityId,
      experimentId: String(outcome.experimentId || '').trim() || null,
      channelId: String(outcome.channelId || '').trim() || null
    },
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

export async function logCommercialOutcome(store, result) {
  if (!store || typeof store.log !== 'function' || !result?.ok) return null;
  return store.log('commercial_outcome', {
    outcomeId: result.outcomeId,
    status: result.status,
    truthLevel: result.truthLevel,
    outcomeType: result.outcomeType,
    eventId: result.eventId,
    occurredAt: result.occurredAt,
    lineage: result.lineage,
    paymentProof: result.paymentProof || null,
    contributionMarginCents: result.contributionMarginCents ?? null,
    ownerMinutes: result.ownerMinutes ?? null,
    policyVersion: result.policyVersion,
    externalEffectLedger: result.externalEffectLedger
  });
}

export const COMMERCIAL_OUTCOME_EXTERNAL_EFFECTS = ZERO_EXTERNAL_EFFECTS;
