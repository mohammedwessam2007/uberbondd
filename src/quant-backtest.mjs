// Quant backtest engine for the Machiavelli research lab.
//
// Built to make false edges die early, not to make curves look good:
//   - no lookahead by construction: a position decided with data through the
//     close of bar t only earns the return of bar t+1;
//   - every unit of turnover pays explicit fee + half-spread + slippage bps;
//   - carry (funding) is credited only to the position held when it settles;
//   - parameters are chosen walk-forward on training windows only;
//   - the Deflated Sharpe Ratio discounts the best result for how many
//     variants were tried (Bailey & López de Prado, 2014);
//   - the final months are a sealed holdout scored exactly once, with the
//     selection rule fixed before it is opened.
// A backtest result is SIMULATED evidence. It is never revenue.

export const QUANT_BACKTEST_VERSION = 'uberbond.quant-backtest-1.0.0';
const EULER_GAMMA = 0.5772156649015329;

export function normalCdf(x) {
  // Abramowitz-Stegun 7.1.26 via erf; accurate to ~1e-7.
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return 0.5 * (1 + sign * erf);
}

export function normalInv(p) {
  // Acklam's rational approximation.
  if (!(p > 0 && p < 1)) throw new Error('normalInv domain is (0,1)');
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const low = 0.02425;
  if (p < low) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - low) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  const q = p - 0.5; const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

function moments(xs) {
  const n = xs.length;
  if (n < 3) return { n, mean: 0, sd: 0, skew: 0, kurt: 3 };
  const mean = xs.reduce((s, x) => s + x, 0) / n;
  let m2 = 0, m3 = 0, m4 = 0;
  for (const x of xs) { const d = x - mean; m2 += d * d; m3 += d * d * d; m4 += d * d * d * d; }
  m2 /= n; m3 /= n; m4 /= n;
  const sd = Math.sqrt(m2);
  return { n, mean, sd, skew: sd ? m3 / sd ** 3 : 0, kurt: sd ? m4 / sd ** 4 : 3 };
}

/** Per-period risk-free return equivalent to an annual rate. */
export const riskFreePerPeriod = (annual, periodsPerYear) => (Number.isFinite(annual) && annual > -1 ? (1 + annual) ** (1 / periodsPerYear) - 1 : 0);

/**
 * Per-period performance of a return series (returns on deployed capital).
 * Sharpe and Sortino are in excess of riskFreeAnnual (default 0), the return
 * idle capital could have earned in T-bills instead.
 */
export function performance(returns, { periodsPerYear = 8760, riskFreeAnnual = 0 } = {}) {
  const { n, mean: rawMean, sd, skew, kurt } = moments(returns);
  const mean = rawMean - (n ? riskFreePerPeriod(riskFreeAnnual, periodsPerYear) : 0);
  let equity = 1, peak = 1, maxDrawdown = 0, downside = 0;
  for (const r of returns) {
    equity *= 1 + r;
    if (equity > peak) peak = equity;
    maxDrawdown = Math.max(maxDrawdown, 1 - equity / peak);
    if (r < 0) downside += r * r;
  }
  const years = n / periodsPerYear;
  const downsideDev = Math.sqrt(downside / Math.max(1, n));
  const cagr = years > 0 && equity > 0 ? equity ** (1 / years) - 1 : -1;
  return {
    periods: n,
    totalReturn: equity - 1,
    cagr,
    annualVol: sd * Math.sqrt(periodsPerYear),
    sharpe: sd ? (mean / sd) * Math.sqrt(periodsPerYear) : 0,
    sharpePerPeriod: sd ? mean / sd : 0,
    sortino: downsideDev ? (mean / downsideDev) * Math.sqrt(periodsPerYear) : 0,
    maxDrawdown,
    calmar: maxDrawdown ? cagr / maxDrawdown : null,
    skew, kurt
  };
}

/**
 * Deflated Sharpe Ratio: probability that the observed per-period Sharpe is
 * above zero after accounting for the best-of-N selection among `trials`
 * per-period Sharpe ratios, sample length and non-normal returns.
 */
export function deflatedSharpe({ returns, trialSharpes, riskFreePerPeriod: rfPeriod = 0 }) {
  const { n, mean, sd, skew, kurt } = moments(returns);
  const sr = sd ? (mean - rfPeriod) / sd : 0;
  const trials = trialSharpes.filter(Number.isFinite);
  const N = Math.max(1, trials.length);
  // Unbiased (n-1) variance of the trial Sharpes; any two distinct trials deflate.
  const trialMean = trials.reduce((sum, x) => sum + x, 0) / N;
  const varSr = trials.length >= 2 ? trials.reduce((sum, x) => sum + (x - trialMean) ** 2, 0) / (trials.length - 1) : 0;
  const sr0 = N > 1 && varSr > 0
    ? Math.sqrt(varSr) * ((1 - EULER_GAMMA) * normalInv(1 - 1 / N) + EULER_GAMMA * normalInv(1 - 1 / (N * Math.E)))
    : 0;
  const denominator = Math.sqrt(Math.max(1e-12, 1 - skew * sr + ((kurt - 1) / 4) * sr * sr));
  const z = ((sr - sr0) * Math.sqrt(Math.max(1, n - 1))) / denominator;
  return { dsr: normalCdf(z), sharpePerPeriod: sr, expectedMaxSharpeUnderNull: sr0, trials: N };
}

/**
 * Run a strategy over aligned bars.
 * legs: { name: string, returns: number[] (bar t return, index-aligned), costBps: number per unit turnover }
 * carry(t, positionsHeldIntoBarT) -> fraction of notional credited at bar t (e.g. funding)
 * decide(t) -> { [legName]: position } using information through the close of bar t only.
 * capitalPerUnit: capital required per unit of gross position (margin + buffer).
 */
export function runBacktest({ length, legs, decide, carry = () => 0, capitalPerUnit = 1, start = 0, end = length }) {
  const names = legs.map(leg => leg.name);
  let held = Object.fromEntries(names.map(name => [name, 0]));
  const returns = [];
  let turnover = 0, trades = 0, exposed = 0, carryTotal = 0, costTotal = 0;
  for (let t = start; t < end; t += 1) {
    // 1. Earn bar t on the positions decided at the close of bar t-1.
    let pnl = 0;
    if (t > start) {
      for (const leg of legs) pnl += held[leg.name] * (leg.returns[t] ?? 0);
      const c = carry(t, held);
      pnl += c; carryTotal += c;
    }
    // 2. Decide at the close of bar t; pay costs on the change.
    const next = decide(t) ?? {};
    let cost = 0, changed = false;
    for (const leg of legs) {
      const target = Number(next[leg.name] ?? 0);
      const delta = Math.abs(target - held[leg.name]);
      if (delta > 1e-12) { changed = true; turnover += delta; cost += delta * leg.costBps / 10_000; }
      held[leg.name] = target;
    }
    if (changed) trades += 1;
    costTotal += cost;
    pnl -= cost;
    const gross = names.reduce((sum, name) => sum + Math.abs(held[name]), 0);
    if (gross > 0) exposed += 1;
    // Capital is sized to the largest gross position the strategy can hold.
    returns.push(pnl / capitalPerUnit);
  }
  return { returns, turnover, trades, exposureFraction: returns.length ? exposed / returns.length : 0, carryTotal, costTotal };
}

/**
 * Walk-forward: for each fold choose the parameter set with the best
 * training Sharpe, then record only its out-of-sample returns.
 * folds: [{ trainStart, trainEnd, testStart, testEnd }] in bar indices.
 */
export function walkForward({ folds, grid, runWith, periodsPerYear = 8760 }) {
  const oos = [];
  const choices = [];
  const trialSharpes = [];
  for (const fold of folds) {
    let best = null;
    for (const params of grid) {
      const train = runWith(params, fold.trainStart, fold.trainEnd);
      const perf = performance(train.returns, { periodsPerYear });
      trialSharpes.push(perf.sharpePerPeriod);
      if (!best || perf.sharpe > best.perf.sharpe) best = { params, perf };
    }
    const test = runWith(best.params, fold.testStart, fold.testEnd);
    oos.push(...test.returns);
    choices.push({ fold, params: best.params, trainSharpe: Number(best.perf.sharpe.toFixed(3)), testSharpe: Number(performance(test.returns, { periodsPerYear }).sharpe.toFixed(3)) });
  }
  return { oosReturns: oos, choices, trialSharpes };
}

export function monthlyFolds({ timestamps, trainMonths = 12, testMonths = 3, stopBefore }) {
  const monthIndex = [];
  let previous = null;
  timestamps.forEach((ms, index) => {
    const key = new Date(ms).toISOString().slice(0, 7);
    if (key !== previous) { monthIndex.push({ key, index }); previous = key; }
  });
  const boundary = month => (monthIndex[month]?.index ?? timestamps.length);
  const usable = stopBefore ? monthIndex.findIndex(item => item.key >= stopBefore) : monthIndex.length;
  const limit = usable < 0 ? monthIndex.length : usable;
  const folds = [];
  for (let m = trainMonths; m + testMonths <= limit; m += testMonths) {
    folds.push({ trainStart: boundary(m - trainMonths), trainEnd: boundary(m), testStart: boundary(m), testEnd: boundary(m + testMonths), testFrom: monthIndex[m].key, testTo: monthIndex[m + testMonths - 1].key });
  }
  return folds;
}
