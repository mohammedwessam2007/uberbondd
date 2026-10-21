// Capital Allocation Intelligence.
//
// Given candidate profit engines with pessimistic/median/optimistic monthly
// contribution, capital required, founder hours, worst credible loss and a
// correlation group, choose for each capital level the portfolio that
// maximises risk-adjusted monthly contribution per founder hour, subject to:
//   - capital used <= the level (levels are analysis scenarios, not budgets);
//   - total worst credible loss <= a fixed fraction of the level (ruin firewall);
//   - founder hours <= the founder's stated monthly allowance;
//   - at most one engine per correlation group, so correlated bets are not
//     presented as diversification;
//   - idle capital earns only the stated risk-free alternative.
// Inputs are estimates and are labelled as such. Output is a ranking of
// options for the founder to choose among, never an allocation decision.

export const CAPITAL_ALLOCATION_VERSION = 'uberbond.capital-allocation-intelligence-1.0.0';
export const CAPITAL_LEVELS = Object.freeze([0, 100, 500, 1_000, 5_000, 25_000]);

/** Pessimism-weighted monthly contribution: the low case counts most. */
export function riskAdjustedMonthly(candidate, { probabilityWeight = true } = {}) {
  const { p10, p50, p90 } = candidate.monthlyContributionUsd;
  const blended = 0.5 * p10 + 0.35 * p50 + 0.15 * p90;
  return probabilityWeight ? blended * (candidate.probabilityMechanismWorks ?? 1) : blended;
}

function validate(candidate) {
  const problems = [];
  const m = candidate.monthlyContributionUsd ?? {};
  if (!candidate.id) problems.push('id');
  if (![m.p10, m.p50, m.p90].every(Number.isFinite) || !(m.p10 <= m.p50 && m.p50 <= m.p90)) problems.push('monthlyContributionUsd p10<=p50<=p90');
  if (!(candidate.capitalRequiredUsd >= 0)) problems.push('capitalRequiredUsd');
  if (!(candidate.worstCredibleLossUsd >= 0)) problems.push('worstCredibleLossUsd');
  if (!(candidate.founderHoursPerMonth >= 0)) problems.push('founderHoursPerMonth');
  if (!candidate.correlationGroup) problems.push('correlationGroup');
  if (candidate.authorizationRequired && !Array.isArray(candidate.authorizationRequired)) problems.push('authorizationRequired must be a list');
  return problems;
}

/**
 * candidates: [{ id, monthlyContributionUsd:{p10,p50,p90}, probabilityMechanismWorks, capitalRequiredUsd,
 *   worstCredibleLossUsd, founderHoursPerMonth, correlationGroup, monthsToFirstCash, authorizationRequired:[] }]
 */
export function allocateCapital({ candidates, levels = CAPITAL_LEVELS, founderHoursPerMonth = 20, maxLossFraction = 0.25, riskFreeAnnual = 0, minimumLossBudgetUsd = 0 }) {
  const invalid = candidates.map(candidate => ({ id: candidate.id, problems: validate(candidate) })).filter(item => item.problems.length);
  if (invalid.length) return { ok: false, status: 'INVALID_CANDIDATES', invalid };
  // A mechanism whose median outcome loses money never receives capital, however
  // large its optimistic tail. Those are preserved separately as frontier bets
  // so high-upside ideas are kept without crowding out testable ones.
  const scored = candidates.map(candidate => ({ ...candidate, riskAdjustedMonthlyUsd: riskAdjustedMonthly(candidate) })).filter(candidate => candidate.riskAdjustedMonthlyUsd > 0 && candidate.monthlyContributionUsd.p50 > 0);
  const frontierReserve = candidates.filter(candidate => !scored.some(item => item.id === candidate.id) && candidate.monthlyContributionUsd.p90 > 0).map(candidate => candidate.id);
  const rejectedNonPositive = candidates.filter(candidate => !scored.some(item => item.id === candidate.id) && !frontierReserve.includes(candidate.id)).map(candidate => candidate.id);
  const pool = scored.sort((a, b) => b.riskAdjustedMonthlyUsd / Math.max(1 / 60, b.founderHoursPerMonth) - a.riskAdjustedMonthlyUsd / Math.max(1 / 60, a.founderHoursPerMonth)).slice(0, 18);

  const scenarios = levels.map(level => {
    const lossBudget = Math.max(level * maxLossFraction, minimumLossBudgetUsd);
    let best = { value: 0, hours: 0, ratio: 0, picks: [] };
    const ratioFor = (value, hours) => value / Math.max(1 / 60, hours);
    // Exhaustive over the pool (<= 2^18 subsets) with early pruning on hard constraints.
    const search = (index, picks, capital, loss, hours, groups, value) => {
      if (picks.length && (ratioFor(value, hours) > best.ratio + 1e-9 || (Math.abs(ratioFor(value, hours) - best.ratio) <= 1e-9 && value > best.value))) best = { value, hours, ratio: ratioFor(value, hours), picks: [...picks] };
      for (let i = index; i < pool.length; i += 1) {
        const c = pool[i];
        if (groups.has(c.correlationGroup)) continue;
        if (capital + c.capitalRequiredUsd > level || loss + c.worstCredibleLossUsd > lossBudget || hours + c.founderHoursPerMonth > founderHoursPerMonth) continue;
        picks.push(c); groups.add(c.correlationGroup);
        search(i + 1, picks, capital + c.capitalRequiredUsd, loss + c.worstCredibleLossUsd, hours + c.founderHoursPerMonth, groups, value + c.riskAdjustedMonthlyUsd);
        picks.pop(); groups.delete(c.correlationGroup);
      }
    };
    search(0, [], 0, 0, 0, new Set(), 0);
    const capitalUsed = best.picks.reduce((sum, c) => sum + c.capitalRequiredUsd, 0);
    const hoursUsed = best.picks.reduce((sum, c) => sum + c.founderHoursPerMonth, 0);
    const idleMonthlyUsd = (level - capitalUsed) * riskFreeAnnual / 12;
    // Bottlenecks: the best excluded engines and the constraint that excluded each.
    const bottlenecks = pool.filter(c => !best.picks.includes(c)).slice(0, 4).map(c => ({
      id: c.id,
      blockedBy: c.capitalRequiredUsd + capitalUsed > level ? 'CAPITAL' : c.worstCredibleLossUsd > lossBudget ? 'RUIN_FIREWALL' : hoursUsed + c.founderHoursPerMonth > founderHoursPerMonth ? 'FOUNDER_HOURS' : best.picks.some(p => p.correlationGroup === c.correlationGroup) ? 'CORRELATED_WITH_PICK' : 'LOWER_VALUE'
    }));
    return {
      capitalLevelUsd: level,
      portfolio: best.picks.map(c => ({ id: c.id, riskAdjustedMonthlyUsd: Math.round(c.riskAdjustedMonthlyUsd), capitalRequiredUsd: c.capitalRequiredUsd, worstCredibleLossUsd: c.worstCredibleLossUsd, founderHoursPerMonth: c.founderHoursPerMonth, monthsToFirstCash: c.monthsToFirstCash ?? null, authorizationRequired: c.authorizationRequired ?? [] })),
      riskAdjustedMonthlyUsd: Math.round(best.value),
      idleCapitalUsd: level - capitalUsed,
      idleCapitalMonthlyAtRiskFreeUsd: Math.round(idleMonthlyUsd * 100) / 100,
      founderHoursUsed: hoursUsed,
      riskAdjustedUsdPerFounderHour: best.picks.length ? Math.round(best.ratio * 100) / 100 : null,
      worstCaseLossUsd: best.picks.reduce((sum, c) => sum + c.worstCredibleLossUsd, 0),
      lossBudgetUsd: lossBudget,
      bottlenecks
    };
  });
  return {
    ok: true,
    version: CAPITAL_ALLOCATION_VERSION,
    assumptions: { founderHoursPerMonth, maxLossFraction, riskFreeAnnual, weighting: '0.5*p10 + 0.35*p50 + 0.15*p90, times probability the mechanism works' },
    rejectedNonPositive,
    frontierReserve,
    scenarios,
    evidenceClass: 'ESTIMATED_PRIOR_NOT_REVENUE',
    spendingAuthority: 'NONE: capital levels are analysis scenarios, not authorizations'
  };
}
