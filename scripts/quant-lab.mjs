#!/usr/bin/env node
// Machiavelli quant lab: load verified public data, run the pre-registered
// experiments, write one receipt. Research and paper only; no orders.
//   node scripts/quant-lab.mjs --from 2021-01 --to 2026-09 --holdout 2025-10 --assets BTC,ETH,SOL,XRP --out artifacts/quant-lab/<file>.json
import crypto from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadVerifiedSeries } from '../src/quant-data-vault.mjs';
import { alignSeries, buyAndHold, timeSeriesMomentum, fundingCarry, fundingCarryCredit, fundingRotation, rotationCredit, COST_PROFILES, HYPOTHESES } from '../src/quant-strategies.mjs';
import { runExperiment } from '../src/quant-research-protocol.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : fallback; };
const from = flag('from', '2021-01');
const to = flag('to', '2026-09');
const holdoutFrom = flag('holdout', '2025-10');
const assets = flag('assets', 'BTC,ETH,SOL,XRP').split(',');
const out = flag('out', `artifacts/quant-lab/experiments-${to}.json`);
const cacheDir = 'data/quant-vault';

// Risk-free hurdle: US Treasury average interest rate on marketable bills, monthly.
const treasuryUrl = `https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates?filter=security_desc:eq:Treasury%20Bills,record_date:gte:${from}-01&sort=record_date&page[size]=500&fields=record_date,avg_interest_rate_amt`;
const treasuryBody = await (await fetch(treasuryUrl, { signal: AbortSignal.timeout(30_000) })).text();
const riskFreeByMonth = Object.fromEntries(JSON.parse(treasuryBody).data.map(row => [row.record_date.slice(0, 7), Number(row.avg_interest_rate_amt) / 100]));
const riskFreeProvenance = { url: treasuryUrl, sha256: crypto.createHash('sha256').update(treasuryBody).digest('hex'), months: Object.keys(riskFreeByMonth).length };

const manifests = [];
const universe = {};
for (const asset of assets) {
  const symbol = `${asset}USDT`;
  const [spot, perp, funding] = await Promise.all([
    loadVerifiedSeries({ market: 'spot', kind: 'klines', symbol, from, to, cacheDir }),
    loadVerifiedSeries({ market: 'um', kind: 'klines', symbol, from, to, cacheDir }),
    loadVerifiedSeries({ market: 'um', kind: 'fundingRate', symbol, from, to, cacheDir })
  ]);
  for (const result of [spot, perp, funding]) {
    if (!result.ok) { console.error(`${symbol}: ${result.status} at ${result.month}`); process.exit(1); }
    manifests.push(result.manifest);
  }
  universe[asset] = alignSeries({ spot: spot.rows, perp: perp.rows, funding: funding.rows });
  console.error(`${symbol}: ${universe[asset].timestamps.length} aligned hourly bars, ${universe[asset].gaps} gaps`);
}

// Rotation needs one shared clock: keep only hours every asset has.
const common = assets.map(asset => new Set(universe[asset].timestamps)).reduce((a, b) => new Set([...a].filter(ms => b.has(ms))));
const shared = {};
for (const asset of assets) {
  const s = universe[asset];
  const keep = s.timestamps.map(ms => common.has(ms));
  const pick = arr => arr.filter((_, i) => keep[i]);
  const ret = closes => closes.map((c, i) => i ? c / closes[i - 1] - 1 : 0);
  const spotClose = pick(s.spotClose), perpClose = pick(s.perpClose);
  shared[asset] = { timestamps: pick(s.timestamps), spotClose, perpClose, spotRet: ret(spotClose), perpRet: ret(perpClose), fundingAt: pick(s.fundingAt), fundingAnnualAt: pick(s.fundingAnnualAt) };
}
const timestamps = shared[assets[0]].timestamps;

const experiments = [];
for (const profileName of ['retail_taker']) {
  const costs = COST_PROFILES[profileName];
  const stress = COST_PROFILES.stress;
  for (const asset of assets) {
    const s = shared[asset];
    const spotLeg = profile => ({ name: 'spot', returns: s.spotRet, costBps: profile.spot });
    const perpLeg = profile => ({ name: 'perp', returns: s.perpRet, costBps: profile.perp });
    const baseline = runExperiment({
      family: { name: `BUY_AND_HOLD:${asset}`, hypothesis: HYPOTHESES.BUY_AND_HOLD, grid: [{}], build: () => ({ legs: [spotLeg(costs)], decide: buyAndHold(), capitalPerUnit: 1 }) },
      timestamps, holdoutFrom, riskFreeByMonth
    });
    experiments.push(baseline);
    const baselineReturns = timestamps.map((_, t) => s.spotRet[t]);
    experiments.push(runExperiment({
      family: { name: `TIME_SERIES_MOMENTUM:${asset}`, hypothesis: HYPOTHESES.TIME_SERIES_MOMENTUM, grid: [168, 720, 2160].map(lookback => ({ lookback })), build: p => ({ legs: [spotLeg(costs)], decide: timeSeriesMomentum(s, p), capitalPerUnit: 1 }) },
      stressBuild: p => ({ legs: [spotLeg(stress)], decide: timeSeriesMomentum(s, p), capitalPerUnit: 1 }),
      timestamps, holdoutFrom, baselineReturns, riskFreeByMonth
    }));
    const carryGrid = [3, 9, 21].flatMap(events => [0.05, 0.1, 0.2].map(enterAnnual => ({ events, enterAnnual, exitAnnual: enterAnnual / 2 })));
    const carrySpec = (p, profile) => ({ legs: [spotLeg(profile), perpLeg(profile)], decide: fundingCarry(s, p), carry: fundingCarryCredit(s), capitalPerUnit: 1.5 });
    experiments.push(runExperiment({
      family: { name: `FUNDING_CARRY:${asset}`, hypothesis: HYPOTHESES.FUNDING_CARRY, grid: carryGrid, build: p => carrySpec(p, costs) },
      stressBuild: p => carrySpec(p, stress), timestamps, holdoutFrom, riskFreeByMonth
    }));
    experiments.push(runExperiment({
      family: { name: `FUNDING_CARRY_OPTIMISTIC_BOUND:${asset}`, hypothesis: `${HYPOTHESES.FUNDING_CARRY} Upper-bound test with unattainable maker-only costs: failure here rejects the family for retail.`, grid: carryGrid, build: p => carrySpec(p, COST_PROFILES.optimistic_maker_bound) },
      timestamps, holdoutFrom, riskFreeByMonth
    }));
  }
  const rotationGrid = [3, 9, 21].flatMap(events => [0.05, 0.1, 0.2].flatMap(enterAnnual => [0.05, 0.15].map(switchMarginAnnual => ({ events, enterAnnual, exitAnnual: enterAnnual / 2, switchMarginAnnual }))));
  const rotationSpec = (p, profile) => ({
    legs: assets.flatMap(asset => [{ name: `${asset}:spot`, returns: shared[asset].spotRet, costBps: profile.spot }, { name: `${asset}:perp`, returns: shared[asset].perpRet, costBps: profile.perp }]),
    decide: fundingRotation(shared, p), carry: rotationCredit(shared), capitalPerUnit: 1.5
  });
  experiments.push(runExperiment({
    family: { name: `FUNDING_ROTATION:${assets.join('+')}`, hypothesis: HYPOTHESES.FUNDING_ROTATION, grid: rotationGrid, build: p => rotationSpec(p, costs) },
    stressBuild: p => rotationSpec(p, stress), timestamps, holdoutFrom, riskFreeByMonth
  }));
}

const receipt = {
  schema: 'uberbond.quant-lab-experiments.v1',
  runAt: new Date().toISOString(),
  data: { source: 'data.binance.vision public archive', verification: 'publisher SHA-256 recomputed per monthly file', assets, from, to, holdoutFrom, sharedHourlyBars: timestamps.length, manifests: manifests.map(({ market, kind, symbol, files, manifestSha256 }) => ({ market, kind, symbol, files: files.length, manifestSha256 })) },
  riskFree: riskFreeProvenance,
  costProfiles: COST_PROFILES,
  capitalAssumption: 'Carry and rotation: 1.5 units of capital per unit notional (1 spot + 0.5 perpetual margin at 2x). Returns are on deployed capital, before tax.',
  experiments: experiments.map(({ family, label, failures, outOfSample, outOfSampleUnderStressCosts, deflatedSharpe, holdout, riskFree, holdoutUnderStressCosts, baselineOutOfSample, variantsTried, walkForward, hypothesis, verdictRules, receiptSha256 }) => ({ family, label, failures, hypothesis, variantsTried, outOfSample, outOfSampleUnderStressCosts, deflatedSharpe, holdout, riskFree, holdoutUnderStressCosts, baselineOutOfSample, walkForward, verdictRules, receiptSha256 })),
  evidenceClass: 'SIMULATED_BACKTEST',
  moneyClaim: 'NONE',
  realMoneyAuthority: 'NONE'
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(receipt, null, 2)}\n`);
for (const e of receipt.experiments) console.log(`${e.label.padEnd(36)} ${e.family.padEnd(32)} oosSharpe=${e.outOfSample.sharpe} oosCAGR=${e.outOfSample.cagr} DSR=${e.deflatedSharpe.probability} holdoutRet=${e.holdout.totalReturn} maxDD=${e.outOfSample.maxDrawdown} rf=${e.riskFree?.outOfSampleAnnual}`);
