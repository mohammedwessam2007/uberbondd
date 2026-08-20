import crypto from 'node:crypto';

export const AI_COMPUTE_BUDGET_POLICY_VERSION = 'ai-compute-budget-1.0.0';

const MAX_CENTS = 10_000_000;
const MAX_TOKENS = 100_000_000;
const MAX_PROVIDERS = 32;
const MAX_RESERVATIONS = 10_000;

function text(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function timestamp(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function int(value, min, max, fallback = null) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : fallback;
}

function uniqueStrings(values, max = MAX_PROVIDERS) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(value => text(value, 80).toLowerCase()).filter(Boolean))].slice(0, max);
}

function fail(reasonCodes, status = 'REJECTED', extra = {}) {
  return {
    ok: false,
    policyVersion: AI_COMPUTE_BUDGET_POLICY_VERSION,
    status,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    ...extra
  };
}

export function createComputeBudget({
  totalCostCents = 0,
  totalTokens = 0,
  allowedProviders = [],
  allowPaidCompute = false,
  reserveFloorCents = 0,
  date = new Date()
} = {}) {
  const maxCostCents = int(totalCostCents, 0, MAX_CENTS);
  const maxTokens = int(totalTokens, 0, MAX_TOKENS);
  const floor = int(reserveFloorCents, 0, MAX_CENTS, 0);
  const providers = uniqueStrings(allowedProviders);
  const reasons = [];
  if (maxCostCents == null) reasons.push('valid-total-cost-cents-required');
  if (maxTokens == null) reasons.push('valid-total-token-budget-required');
  if (floor > (maxCostCents ?? 0)) reasons.push('reserve-floor-exceeds-budget');
  if (allowPaidCompute && !providers.length) reasons.push('paid-compute-provider-allowlist-required');
  if (!allowPaidCompute && (maxCostCents ?? 0) > 0) reasons.push('paid-compute-explicit-authorization-required');
  if (reasons.length) return fail(reasons);

  const identity = {
    maxCostCents,
    maxTokens,
    providers,
    allowPaidCompute: Boolean(allowPaidCompute),
    reserveFloorCents: floor
  };

  return {
    ok: true,
    policyVersion: AI_COMPUTE_BUDGET_POLICY_VERSION,
    budgetId: `compute_${hash(identity).slice(0, 24)}`,
    status: 'ACTIVE',
    createdAt: timestamp(date),
    maxCostCents,
    maxTokens,
    reserveFloorCents: floor,
    allowedProviders: providers,
    allowPaidCompute: Boolean(allowPaidCompute),
    reservedCostCents: 0,
    committedCostCents: 0,
    reservedTokens: 0,
    committedTokens: 0,
    reservations: {},
    // Business-world effects remain a separate authority domain.
    businessEffectAuthority: 'NONE'
  };
}

function cloneBudget(budget) {
  return {
    ...budget,
    allowedProviders: [...(budget.allowedProviders || [])],
    reservations: { ...(budget.reservations || {}) }
  };
}

function validateBudget(budget) {
  return Boolean(budget?.ok && budget.policyVersion === AI_COMPUTE_BUDGET_POLICY_VERSION && budget.budgetId);
}

export function reserveCompute({
  budget,
  taskId,
  provider,
  model = '',
  costCeilingCents = 0,
  tokenCeiling = 0,
  date = new Date()
} = {}) {
  if (!validateBudget(budget)) return fail(['valid-compute-budget-required']);
  if (budget.status !== 'ACTIVE') return fail(['compute-budget-not-active']);
  const id = text(taskId, 120);
  const normalizedProvider = text(provider, 80).toLowerCase();
  const normalizedModel = text(model, 120);
  const cost = int(costCeilingCents, 0, MAX_CENTS);
  const tokens = int(tokenCeiling, 0, MAX_TOKENS);
  const reasons = [];
  if (!id) reasons.push('task-id-required');
  if (!normalizedProvider) reasons.push('provider-required');
  if (cost == null) reasons.push('valid-cost-ceiling-required');
  if (tokens == null) reasons.push('valid-token-ceiling-required');
  if (budget.reservations?.[id]) reasons.push('task-compute-already-reserved');
  if (Object.keys(budget.reservations || {}).length >= MAX_RESERVATIONS) reasons.push('reservation-count-limit-reached');
  if (cost > 0 && !budget.allowPaidCompute) reasons.push('paid-compute-not-authorized');
  if (budget.allowPaidCompute && !budget.allowedProviders.includes(normalizedProvider)) reasons.push('provider-not-allowlisted');

  const availableCost = budget.maxCostCents - budget.committedCostCents - budget.reservedCostCents - budget.reserveFloorCents;
  const availableTokens = budget.maxTokens - budget.committedTokens - budget.reservedTokens;
  if ((cost ?? 0) > availableCost) reasons.push('compute-cost-budget-exceeded');
  if ((tokens ?? 0) > availableTokens) reasons.push('compute-token-budget-exceeded');
  if (reasons.length) return fail(reasons, 'BLOCKED');

  const next = cloneBudget(budget);
  const reservation = {
    reservationId: `compute_res_${hash({ budgetId: budget.budgetId, id, normalizedProvider, normalizedModel, cost, tokens }).slice(0, 24)}`,
    taskId: id,
    provider: normalizedProvider,
    model: normalizedModel || null,
    costCeilingCents: cost,
    tokenCeiling: tokens,
    status: 'RESERVED',
    reservedAt: timestamp(date)
  };
  next.reservations[id] = reservation;
  next.reservedCostCents += cost;
  next.reservedTokens += tokens;
  return { ok: true, policyVersion: AI_COMPUTE_BUDGET_POLICY_VERSION, status: 'RESERVED', budget: next, reservation };
}

export function commitCompute({
  budget,
  taskId,
  actualCostCents = 0,
  actualTokens = 0,
  date = new Date()
} = {}) {
  if (!validateBudget(budget)) return fail(['valid-compute-budget-required']);
  const id = text(taskId, 120);
  const reservation = budget.reservations?.[id];
  if (!reservation || reservation.status !== 'RESERVED') return fail(['active-compute-reservation-required']);
  const cost = int(actualCostCents, 0, reservation.costCeilingCents);
  const tokens = int(actualTokens, 0, reservation.tokenCeiling);
  const reasons = [];
  if (cost == null) reasons.push('actual-cost-exceeds-reservation');
  if (tokens == null) reasons.push('actual-tokens-exceed-reservation');
  if (reasons.length) return fail(reasons, 'BLOCKED');

  const next = cloneBudget(budget);
  next.reservedCostCents -= reservation.costCeilingCents;
  next.reservedTokens -= reservation.tokenCeiling;
  next.committedCostCents += cost;
  next.committedTokens += tokens;
  next.reservations[id] = {
    ...reservation,
    status: 'COMMITTED',
    actualCostCents: cost,
    actualTokens: tokens,
    committedAt: timestamp(date)
  };
  return { ok: true, policyVersion: AI_COMPUTE_BUDGET_POLICY_VERSION, status: 'COMMITTED', budget: next, reservation: next.reservations[id] };
}

export function releaseCompute({ budget, taskId, reason = 'unused', date = new Date() } = {}) {
  if (!validateBudget(budget)) return fail(['valid-compute-budget-required']);
  const id = text(taskId, 120);
  const reservation = budget.reservations?.[id];
  if (!reservation || reservation.status !== 'RESERVED') return fail(['active-compute-reservation-required']);
  const next = cloneBudget(budget);
  next.reservedCostCents -= reservation.costCeilingCents;
  next.reservedTokens -= reservation.tokenCeiling;
  next.reservations[id] = {
    ...reservation,
    status: 'RELEASED',
    releaseReason: text(reason, 240) || 'unused',
    releasedAt: timestamp(date)
  };
  return { ok: true, policyVersion: AI_COMPUTE_BUDGET_POLICY_VERSION, status: 'RELEASED', budget: next, reservation: next.reservations[id] };
}

export function computeBudgetSummary(budget) {
  if (!validateBudget(budget)) return fail(['valid-compute-budget-required']);
  return {
    ok: true,
    policyVersion: AI_COMPUTE_BUDGET_POLICY_VERSION,
    budgetId: budget.budgetId,
    status: budget.status,
    maxCostCents: budget.maxCostCents,
    committedCostCents: budget.committedCostCents,
    reservedCostCents: budget.reservedCostCents,
    availableCostCents: Math.max(0, budget.maxCostCents - budget.committedCostCents - budget.reservedCostCents - budget.reserveFloorCents),
    maxTokens: budget.maxTokens,
    committedTokens: budget.committedTokens,
    reservedTokens: budget.reservedTokens,
    availableTokens: Math.max(0, budget.maxTokens - budget.committedTokens - budget.reservedTokens),
    activeReservations: Object.values(budget.reservations || {}).filter(item => item.status === 'RESERVED').length,
    committedReservations: Object.values(budget.reservations || {}).filter(item => item.status === 'COMMITTED').length,
    businessEffectAuthority: 'NONE'
  };
}
