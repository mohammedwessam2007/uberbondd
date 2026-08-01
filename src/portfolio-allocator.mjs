// Canon/V3 integration -- mission item 7 ("portfolio allocator") and premerge audit P2-002
// (portfolio optimization).
//
// Adapted from V3's opportunity-factory.mjs portfolioScore/allocatePortfolio. V3 accepted any
// lane's input metrics at face value, so a single lucky (or synthetic) payment could redirect real
// acquisition capacity toward a lane with almost no evidence behind it. This version requires a
// minimum sample size and a declared evidence window before a lane is even eligible for the
// "proven" (exploitation) allocation pool; anything short of that is treated as unproven and can
// only draw from the exploration share, regardless of how favorable its raw metrics look.
import { clamp } from './utils.mjs';

const DEFAULT_MINIMUM_PAID_SAMPLES = 3;

export function portfolioScore(lane = {}) {
  const margin = clamp(lane.collectedContributionMarginPct, 0, 100) / 100;
  const conversion = clamp(lane.paidConversionRatePct, 0, 100) / 100;
  const recurring = clamp(lane.recurringExpansionRatePct, 0, 100) / 100;
  const reliability = clamp(lane.deliveryReliabilityPct, 0, 100) / 100;
  const ownerEfficiency = 1 - clamp(lane.ownerMinutesPerCustomerMonth, 0, 600) / 600;
  const urgency = clamp(lane.buyerUrgencyScore, 0, 10) / 10;
  const evidence = clamp(lane.evidenceConfidenceScore, 0, 10) / 10;
  const risk = clamp(lane.riskScore, 0, 10) / 10;
  const raw = margin * 0.28 + conversion * 0.20 + recurring * 0.14 + reliability * 0.12 + ownerEfficiency * 0.10 + urgency * 0.08 + evidence * 0.08 - risk * 0.20;
  return Number((clamp(raw, 0, 1) * 100).toFixed(2));
}

/** A lane only counts as "proven" (eligible for the exploitation pool) once it has real
 * collected-margin provenance behind at least `minimumPaidSamples` distinct paid customers within
 * a declared `evidenceWindowDays`. A lane with fewer samples -- however good its raw metrics --
 * is demoted to the exploration pool, so a single early win can never redirect real capacity away
 * from lanes with actual proof (P2-002 acceptance test: a one-payment tiny sample cannot absorb
 * the portfolio). */
export function isLaneProven(lane = {}, { minimumPaidSamples = DEFAULT_MINIMUM_PAID_SAMPLES } = {}) {
  const paidCustomers = Number(lane.paidCustomers || 0);
  const evidenceWindowDays = Number(lane.evidenceWindowDays || 0);
  return paidCustomers >= minimumPaidSamples && evidenceWindowDays > 0 && Boolean(lane.collectedMarginProvenance);
}

export function allocatePortfolio(lanes = [], { explorationShare = 0.2, minimumPaidSamples = DEFAULT_MINIMUM_PAID_SAMPLES } = {}) {
  const scored = lanes
    .filter(lane => lane.killState !== 'killed')
    .map(lane => ({ ...lane, portfolioScore: portfolioScore(lane), proven: isLaneProven(lane, { minimumPaidSamples }) }));
  if (!scored.length) return [];

  const proven = scored.filter(lane => lane.proven);
  const exploratory = scored.filter(lane => !lane.proven);

  const allocate = (rows, budgetPct) => {
    if (!rows.length) return [];
    const total = rows.reduce((sum, row) => sum + Math.max(1, row.portfolioScore), 0);
    return rows.map(row => ({ ...row, allocationPct: Number((budgetPct * Math.max(1, row.portfolioScore) / total * 100).toFixed(2)) }));
  };

  if (!proven.length) return allocate(exploratory, 1);
  return [...allocate(proven, 1 - explorationShare), ...allocate(exploratory, explorationShare)];
}

/** Architecture-only, per the premerge audit's merge doctrine ("safe to preserve with adaptation:
 * capacity planning as architecture-only") -- this computes a monthly-capacity target, it does
 * NOT activate anything. ACQUISITION_WORKERS_ACTIVE plus an exact campaignActivationApprovals row
 * (campaign-activation.mjs) remain the only path to real send volume. */
export function buildMonthlyCapacityPlan({ monthlyTarget = 30000, sendingDays = 30, mailboxes = [], utilization = 0.7 } = {}) {
  const dailyTarget = Math.ceil(monthlyTarget / sendingDays);
  const rows = mailboxes.map(mailbox => ({ ...mailbox, effectiveDailyCap: Math.floor(Number(mailbox.dailyCap || 0) * utilization) }));
  const capacity = rows.reduce((sum, row) => sum + row.effectiveDailyCap, 0);
  return {
    monthlyTarget, dailyTarget, effectiveDailyCapacity: capacity, projectedMonthlyCapacity: capacity * sendingDays,
    gapPerDay: Math.max(0, dailyTarget - capacity), sufficient: capacity >= dailyTarget, mailboxes: rows
  };
}
