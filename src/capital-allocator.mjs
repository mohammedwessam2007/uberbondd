// Proof-gated capital allocation planning.
//
// This module can rank a caller-supplied set of measured opportunities, but it
// never moves money, purchases a provider, changes a budget, or authorizes an
// experiment. Without enough cleared-payment evidence it returns
// DO_NOT_ALLOCATE rather than optimizing imagined returns.

import crypto from 'node:crypto';

export const CAPITAL_ALLOCATOR_POLICY_VERSION = 'capital-allocator-1.0.0';
import { ZERO_EXTERNAL_EFFECTS as CAPITAL_ALLOCATOR_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export { CAPITAL_ALLOCATOR_EXTERNAL_EFFECTS };

function atDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function text(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function cents(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function failed(reasonCodes, timestamp) {
  return {
    ok: false,
    policyVersion: CAPITAL_ALLOCATOR_POLICY_VERSION,
    status: 'DO_NOT_ALLOCATE',
    timestamp,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    externalEffectLedger: { ...CAPITAL_ALLOCATOR_EXTERNAL_EFFECTS }
  };
}

export function planCapitalAllocation({
  candidates = [],
  availableBudgetCents,
  reserveCents = 0,
  maxAllocationCents,
  minimumVerifiedPayments = 3,
  date = new Date()
} = {}) {
  const reference = atDate(date);
  const timestamp = reference.toISOString();
  if (!Array.isArray(candidates)) return failed(['candidates-array-required'], timestamp);
  const available = cents(availableBudgetCents);
  const reserve = cents(reserveCents);
  const cap = cents(maxAllocationCents);
  if (available == null || reserve == null || available < reserve) return {
    ok: true, policyVersion: CAPITAL_ALLOCATOR_POLICY_VERSION, status: 'DO_NOT_ALLOCATE', timestamp,
    reasonCodes: ['available-budget-or-reserve-unknown'], candidates: [],
    authorization: 'OWNER_REQUIRED', externalEffectLedger: { ...CAPITAL_ALLOCATOR_EXTERNAL_EFFECTS }
  };
  const remaining = Math.max(0, available - reserve);
  const eligible = candidates.filter(candidate => {
    const proof = Number(candidate?.verifiedPaymentCount);
    const margin = cents(candidate?.knownContributionMarginCents);
    const cost = cents(candidate?.buildCostCents);
    return text(candidate?.modelId) && Number.isInteger(proof) && proof >= Math.max(1, minimumVerifiedPayments) && margin != null && margin > 0 && cost != null && cost > 0;
  }).slice(0, 100).map(candidate => {
    const margin = cents(candidate.knownContributionMarginCents);
    const cost = cents(candidate.buildCostCents);
    return { modelId: text(candidate.modelId), verifiedPaymentCount: Number(candidate.verifiedPaymentCount), knownContributionMarginCents: margin, buildCostCents: cost, efficiency: Math.round((margin / cost) * 10000) / 10000 };
  }).sort((a, b) => b.efficiency - a.efficiency || a.modelId.localeCompare(b.modelId));
  if (!eligible.length) return {
    ok: true, policyVersion: CAPITAL_ALLOCATOR_POLICY_VERSION, status: 'DO_NOT_ALLOCATE', timestamp,
    reasonCodes: ['no-candidate-meets-payment-and-margin-proof'], candidates: [], remainingBudgetCents: remaining,
    authorization: 'OWNER_REQUIRED', externalEffectLedger: { ...CAPITAL_ALLOCATOR_EXTERNAL_EFFECTS }
  };
  const proposed = eligible.map(candidate => ({ ...candidate, proposedAllocationCents: Math.min(candidate.buildCostCents, cap ?? remaining), approval: 'OWNER_REQUIRED', execution: 'NOT_RUN' }));
  return {
    ok: true,
    policyVersion: CAPITAL_ALLOCATOR_POLICY_VERSION,
    planId: `capital_${digest({ timestamp, proposed }).slice(0, 24)}`,
    status: 'PLAN_ONLY_OWNER_REVIEW',
    timestamp,
    availableBudgetCents: available,
    reserveCents: reserve,
    remainingBudgetCents: remaining,
    candidates: proposed,
    allocation: { automatic: false, approved: false, actualSpendCents: 0, authorization: 'OWNER_REQUIRED' },
    externalEffectLedger: { ...CAPITAL_ALLOCATOR_EXTERNAL_EFFECTS }
  };
}

export async function logCapitalAllocation(store, result) {
  if (!store || typeof store.log !== 'function' || !result?.ok) return null;
  return store.log('capital_allocation_plan', {
    policyVersion: result.policyVersion,
    planId: result.planId || null,
    status: result.status,
    reasonCodes: result.reasonCodes || [],
    remainingBudgetCents: result.remainingBudgetCents ?? null,
    candidateCount: Array.isArray(result.candidates) ? result.candidates.length : 0,
    allocation: result.allocation || null,
    timestamp: result.timestamp,
    externalEffectLedger: result.externalEffectLedger
  });
}
