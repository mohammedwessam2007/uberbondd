// Pre-registered research protocol for the Machiavelli quant lab.
//
// The verdict rules below are fixed before any data is loaded. An experiment
// receipt states the hypothesis, the full parameter grid (so the number of
// variants tried is honest), every walk-forward choice, out-of-sample results
// net of costs, the Deflated Sharpe Ratio, and a sealed holdout scored once
// with parameters chosen only from data before it. Outcome labels are
// research labels. The highest possible label means "worth paper trading",
// not "makes money".

import crypto from 'node:crypto';
import { performance, deflatedSharpe, runBacktest, walkForward, monthlyFolds } from './quant-backtest.mjs';

export const QUANT_RESEARCH_PROTOCOL_VERSION = 'uberbond.quant-research-protocol-1.0.0';

export const VERDICT_RULES = Object.freeze({
  minOosSharpe: 0.5,
  minDeflatedSharpe: 0.95,
  holdoutMustBePositiveNetOfCosts: true,
  stressCostsMustStayPositive: true,
  mustBeatBaselineOrZero: true,
  // A riskless T-bill is the realistic alternative for idle capital. An edge
  // that compounds slower than it is statistically real and economically
  // worthless.
  mustBeatRiskFreeRate: true
});

export const RESEARCH_LABELS = Object.freeze(['REJECTED', 'INCONCLUSIVE', 'SURVIVES_RESEARCH__PAPER_TRADE_NEXT']);

const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const round = (value, places = 4) => value === null || value === undefined || !Number.isFinite(value) ? value : Number(value.toFixed(places));
const summarise = perf => Object.fromEntries(Object.entries(perf).map(([key, value]) => [key, round(value)]));

/**
 * family: { name, hypothesis, grid: params[], build(params) -> { legs, decide, carry, capitalPerUnit } }
 * The build function must return fresh strategy state each call.
 * holdoutFrom: 'YYYY-MM'; bars on or after it are invisible to selection.
 */
const monthOf = ms => new Date(ms).toISOString().slice(0, 7);
/** Mean annual risk-free rate across the months covered by bars [start, end). */
export function riskFreeOver(riskFreeByMonth, timestamps, start, end) {
  if (!riskFreeByMonth) return null;
  const months = [...new Set(timestamps.slice(start, end).map(monthOf))].filter(month => riskFreeByMonth[month] !== undefined);
  return months.length ? months.reduce((sum, month) => sum + riskFreeByMonth[month], 0) / months.length : null;
}

export function runExperiment({ family, timestamps, holdoutFrom, trainMonths = 12, testMonths = 3, periodsPerYear = 8760, baselineReturns = null, stressBuild = null, riskFreeByMonth = null }) {
  const holdoutStart = timestamps.findIndex(ms => new Date(ms).toISOString().slice(0, 7) >= holdoutFrom);
  if (holdoutStart <= 0) throw new Error('holdout must leave a non-empty research window');
  const runWith = (params, start, end, builder = family.build) => {
    const spec = builder(params);
    return runBacktest({ length: timestamps.length, start, end, ...spec });
  };
  const folds = monthlyFolds({ timestamps, trainMonths, testMonths, stopBefore: holdoutFrom });
  if (!folds.length) throw new Error('not enough history for one walk-forward fold');
  const wf = walkForward({ folds, grid: family.grid, runWith, periodsPerYear });
  const oos = performance(wf.oosReturns, { periodsPerYear });
  // Deflation counts the parameter variants tried, each scored on the same
  // pre-holdout research window. Folds are not independent trials.
  const trialSharpes = family.grid.map(params => performance(runWith(params, folds[0].trainStart, holdoutStart).returns, { periodsPerYear }).sharpePerPeriod);
  const dsr = deflatedSharpe({ returns: wf.oosReturns, trialSharpes });
  const riskFreeOos = riskFreeOver(riskFreeByMonth, timestamps, folds[0].testStart, holdoutStart);
  const riskFreeHoldout = riskFreeOver(riskFreeByMonth, timestamps, holdoutStart, timestamps.length);

  // Holdout: parameters chosen on the last training window before it, then opened once.
  const finalTrainStart = timestamps.findIndex(ms => ms >= timestamps[holdoutStart] - trainMonths * 30.44 * 86_400_000);
  let chosen = null;
  for (const params of family.grid) {
    const perf = performance(runWith(params, finalTrainStart, holdoutStart).returns, { periodsPerYear });
    if (!chosen || perf.sharpe > chosen.perf.sharpe) chosen = { params, perf };
  }
  const holdoutRun = runWith(chosen.params, holdoutStart, timestamps.length);
  const holdout = performance(holdoutRun.returns, { periodsPerYear });
  const stressRun = stressBuild ? runWith(chosen.params, holdoutStart, timestamps.length, stressBuild) : null;
  const stress = stressRun ? performance(stressRun.returns, { periodsPerYear }) : null;
  const oosStress = stressBuild ? performance(walkForward({ folds, grid: [chosen.params], runWith: (p, s, e) => runWith(p, s, e, stressBuild), periodsPerYear }).oosReturns, { periodsPerYear }) : null;

  const baselineOos = baselineReturns ? performance(baselineReturns.slice(folds[0].testStart, holdoutStart), { periodsPerYear }) : null;
  const failures = [];
  if (oos.sharpe < VERDICT_RULES.minOosSharpe) failures.push(`out-of-sample Sharpe ${round(oos.sharpe, 2)} < ${VERDICT_RULES.minOosSharpe}`);
  if (dsr.dsr < VERDICT_RULES.minDeflatedSharpe) failures.push(`deflated Sharpe probability ${round(dsr.dsr, 3)} < ${VERDICT_RULES.minDeflatedSharpe} after ${dsr.trials} variants`);
  if (holdout.totalReturn <= 0) failures.push(`sealed holdout net return ${round(holdout.totalReturn * 100, 2)}% <= 0`);
  if (stress && stress.totalReturn <= 0) failures.push(`holdout under doubled costs ${round(stress.totalReturn * 100, 2)}% <= 0`);
  if (oosStress && oosStress.totalReturn <= 0) failures.push(`walk-forward under doubled costs ${round(oosStress.totalReturn * 100, 2)}% <= 0`);
  if (riskFreeOos !== null && oos.cagr <= riskFreeOos) failures.push(`out-of-sample CAGR ${round(oos.cagr * 100, 2)}% does not beat the ${round(riskFreeOos * 100, 2)}% risk-free T-bill rate over the same months`);
  if (riskFreeHoldout !== null && holdout.cagr <= riskFreeHoldout) failures.push(`holdout CAGR ${round(holdout.cagr * 100, 2)}% does not beat the ${round(riskFreeHoldout * 100, 2)}% risk-free rate`);
  if (baselineOos && oos.sharpe <= Math.max(0, baselineOos.sharpe) && oos.totalReturn <= Math.max(0, baselineOos.totalReturn)) failures.push('does not beat the baseline or zero on Sharpe or return');

  const label = failures.length === 0 ? 'SURVIVES_RESEARCH__PAPER_TRADE_NEXT' : oos.sharpe > 0 && holdout.totalReturn > 0 ? 'INCONCLUSIVE' : 'REJECTED';
  const receipt = {
    protocolVersion: QUANT_RESEARCH_PROTOCOL_VERSION,
    family: family.name,
    hypothesis: family.hypothesis,
    verdictRules: VERDICT_RULES,
    grid: family.grid,
    variantsTried: family.grid.length,
    window: { from: new Date(timestamps[0]).toISOString(), holdoutFrom: new Date(timestamps[holdoutStart]).toISOString(), to: new Date(timestamps.at(-1)).toISOString() },
    walkForward: { trainMonths, testMonths, folds: wf.choices.map(choice => ({ test: `${choice.fold.testFrom}..${choice.fold.testTo}`, params: choice.params, trainSharpe: choice.trainSharpe, testSharpe: choice.testSharpe })) },
    outOfSample: summarise(oos),
    outOfSampleUnderStressCosts: oosStress ? summarise(oosStress) : null,
    deflatedSharpe: { probability: round(dsr.dsr), sharpePerPeriod: round(dsr.sharpePerPeriod, 6), expectedMaxSharpeUnderNull: round(dsr.expectedMaxSharpeUnderNull, 6), trials: dsr.trials },
    holdout: { params: chosen.params, ...summarise(holdout), trades: holdoutRun.trades, turnover: round(holdoutRun.turnover, 2), exposureFraction: round(holdoutRun.exposureFraction), carryEarned: round(holdoutRun.carryTotal), costsPaid: round(holdoutRun.costTotal) },
    holdoutUnderStressCosts: stress ? summarise(stress) : null,
    riskFree: { outOfSampleAnnual: round(riskFreeOos), holdoutAnnual: round(riskFreeHoldout) },
    baselineOutOfSample: baselineOos ? summarise(baselineOos) : null,
    label,
    failures,
    evidenceClass: 'SIMULATED_BACKTEST',
    moneyClaim: 'NONE'
  };
  return { ...receipt, receiptSha256: digest(receipt) };
}
