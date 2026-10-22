import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { unzipSingle, toMillis, parseKlinesCsv, parseFundingCsv, fetchVerifiedMonth, monthsBetween, binanceVisionUrl } from '../src/quant-data-vault.mjs';
import { runBacktest, performance, deflatedSharpe, normalCdf, normalInv, monthlyFolds, walkForward } from '../src/quant-backtest.mjs';
import { alignSeries, fundingCarry, fundingCarryCredit, COST_PROFILES } from '../src/quant-strategies.mjs';
import { runExperiment, riskFreeOver } from '../src/quant-research-protocol.mjs';
import { recordPaperDecision, markPaperDecision, verifyPaperChain, paperSummary } from '../src/quant-paper-ledger.mjs';
import { appendRealityEntry, summarizeReality, checkMoneyClaim, verifyRealityChain, evidenceProblems } from '../src/revenue-reality-ledger.mjs';
import { canonicalPaymentTruthDigest } from '../src/lead-path-sprint-fulfillment.mjs';

// Minimal single-member deflate zip, built the way the archive publishes them.
function makeZip(name, content) {
  const data = zlib.deflateRawSync(Buffer.from(content));
  const nameBuf = Buffer.from(name);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt16LE(nameBuf.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(data.length, 20); central.writeUInt16LE(nameBuf.length, 28); central.writeUInt32LE(0, 42);
  const centralOffset = local.length + nameBuf.length + data.length;
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([local, nameBuf, data, central, nameBuf, eocd]);
}

test('vault: unzip, microsecond normalisation, header tolerance and checksum refusal', async () => {
  const csv = '1735689600000000,100,101,99,100.5,10,1735693199999999,1000,5\n';
  const zip = makeZip('X.csv', csv);
  assert.equal(unzipSingle(zip).data.toString(), csv);
  assert.equal(toMillis(1735689600000000), 1735689600000);
  assert.equal(toMillis(1735689600000), 1735689600000);
  assert.equal(parseKlinesCsv(`open_time,open,high,low,close,volume,close_time,quote_volume,count\n${csv}`)[0].openTime, 1735689600000);
  assert.deepEqual(parseFundingCsv('calc_time,funding_interval_hours,last_funding_rate\n1735689600000,8,0.0001\n'), [{ time: 1735689600000, intervalHours: 8, rate: 0.0001 }]);
  assert.match(binanceVisionUrl({ market: 'um', kind: 'fundingRate', symbol: 'BTCUSDT', month: '2025-01' }), /futures\/um\/monthly\/fundingRate\/BTCUSDT\/BTCUSDT-fundingRate-2025-01\.zip$/);
  assert.deepEqual(monthsBetween('2025-11', '2026-02'), ['2025-11', '2025-12', '2026-01', '2026-02']);
  const good = crypto.createHash('sha256').update(zip).digest('hex');
  const fetchWith = checksum => async url => url.endsWith('.CHECKSUM') ? new Response(`${checksum}  X.zip\n`) : new Response(zip);
  const ok = await fetchVerifiedMonth({ market: 'spot', kind: 'klines', symbol: 'BTCUSDT', month: '2025-01', fetchImpl: fetchWith(good) });
  assert.equal(ok.ok, true);
  assert.equal(ok.provenance.verified, true);
  const tampered = await fetchVerifiedMonth({ market: 'spot', kind: 'klines', symbol: 'BTCUSDT', month: '2025-01', fetchImpl: fetchWith('0'.repeat(64)) });
  assert.equal(tampered.status, 'CHECKSUM_MISMATCH');
});

test('backtest: a position decided at bar t earns only bar t+1, and costs are charged on turnover', () => {
  const returns = [0, 0.10, -0.50, 0.20];
  // Decide long only at the close of bar 0: earns bar 1 (+10%), then flat.
  const run = runBacktest({ length: 4, legs: [{ name: 'a', returns, costBps: 100 }], decide: t => ({ a: t === 0 ? 1 : 0 }) });
  assert.equal(run.returns.length, 4);
  assert.ok(Math.abs(run.returns[0] - -0.01) < 1e-12, 'entry pays 100bp');
  assert.ok(Math.abs(run.returns[1] - (0.10 - 0.01)) < 1e-12, 'earns bar 1, pays exit');
  assert.equal(run.returns[2], 0, 'the -50% bar is not earned: no lookahead and no lingering position');
  assert.equal(run.trades, 2);
});

test('backtest: carry is credited only to the position held when it settles', () => {
  const series = { fundingAt: [null, 0.001, null], fundingAnnualAt: [null, 1.095, null] };
  const credit = fundingCarryCredit(series);
  assert.equal(credit(1, { spot: 1, perp: -1 }), 0.001, 'short perpetual receives positive funding');
  assert.equal(credit(1, { spot: 0, perp: 0 }) + 0, 0);
  assert.equal(credit(2, { perp: -1 }), 0);
});

test('statistics: normal functions, performance and deflation by the number of variants', () => {
  assert.ok(Math.abs(normalCdf(1.96) - 0.975) < 1e-3);
  assert.ok(Math.abs(normalInv(0.975) - 1.96) < 1e-3);
  const returns = Array.from({ length: 2000 }, (_, i) => 0.0005 + 0.01 * Math.sin(i * 1.7));
  const perf = performance(returns, { periodsPerYear: 365 });
  assert.ok(perf.sharpe > 0 && perf.maxDrawdown > 0 && perf.maxDrawdown < 1);
  const single = deflatedSharpe({ returns, trialSharpes: [perf.sharpePerPeriod] });
  const many = deflatedSharpe({ returns, trialSharpes: Array.from({ length: 200 }, (_, i) => perf.sharpePerPeriod * (i / 100 - 1)) });
  assert.ok(many.dsr < single.dsr, 'trying 200 variants must lower confidence in the best one');
  assert.ok(many.expectedMaxSharpeUnderNull > 0);
});

test('walk-forward never lets test data choose parameters', () => {
  const timestamps = Array.from({ length: 24 * 31 * 6 }, (_, i) => Date.UTC(2025, 0, 1) + i * 3_600_000);
  const folds = monthlyFolds({ timestamps, trainMonths: 2, testMonths: 1 });
  assert.ok(folds.length >= 3);
  for (const fold of folds) assert.ok(fold.trainEnd <= fold.testStart);
  const seen = [];
  walkForward({ folds, grid: [{ k: 1 }, { k: 2 }], runWith: (params, start, end) => { seen.push({ params, start, end }); return { returns: Array.from({ length: end - start }, () => (params.k === 1 ? 0.001 : -0.001)) }; } });
  // Selection runs (two per fold) only ever cover training spans.
  for (const [index, fold] of folds.entries()) {
    const selection = seen.slice(index * 3, index * 3 + 2);
    for (const run of selection) assert.ok(run.end <= fold.testStart);
  }
});

test('protocol: a statistically real edge that loses to T-bills is not promoted', () => {
  const hours = 24 * 30 * 30;
  const timestamps = Array.from({ length: hours }, (_, i) => Date.UTC(2023, 0, 1) + i * 3_600_000);
  const asset = timestamps.map((_, i) => 0.000002 + 0.0001 * Math.sin(i));     // ~1.75%/yr, very steady: statistically real, economically below T-bills
  const family = { name: 'TINY_EDGE', hypothesis: 'test', grid: [{}], build: () => ({ legs: [{ name: 'a', returns: asset, costBps: 0 }], decide: () => ({ a: 1 }) }) };
  const riskFreeByMonth = Object.fromEntries([...new Set(timestamps.map(ms => new Date(ms).toISOString().slice(0, 7)))].map(month => [month, 0.04]));
  assert.ok(Math.abs(riskFreeOver(riskFreeByMonth, timestamps, 0, timestamps.length) - 0.04) < 1e-12);
  const receipt = runExperiment({ family, timestamps, holdoutFrom: '2025-01', riskFreeByMonth });
  assert.notEqual(receipt.label, 'SURVIVES_RESEARCH__PAPER_TRADE_NEXT');
  assert.ok(receipt.failures.some(text => /risk-free/.test(text)), receipt.failures.join('; '));
  // Measured in excess of T-bills the steady edge is not significant at all.
  assert.ok(receipt.deflatedSharpe.probability < 0.95, String(receipt.deflatedSharpe.probability));
  assert.ok(receipt.failures.some(text => /in excess of T-bills/.test(text)), receipt.failures.join('; '));
  assert.equal(receipt.moneyClaim, 'NONE');
  assert.match(receipt.receiptSha256, /^[a-f0-9]{64}$/);
});

test('strategies: funding carry enters and exits with hysteresis on annualised trailing funding', () => {
  const hour = 3_600_000;
  const bars = Array.from({ length: 20 }, (_, i) => ({ openTime: i * hour, close: 100 }));
  const series = alignSeries({
    spot: bars, perp: bars,
    funding: [{ time: 1 * hour, intervalHours: 8, rate: 0.0003 }, { time: 9 * hour + 4, intervalHours: 8, rate: 0.0003 }, { time: 17 * hour, intervalHours: 4, rate: 0.00002 }]
  });
  // Settlement at 1h lands on the bar that ends at 1h (bar 0); at 9h on bar 8; at 17h on bar 16.
  assert.equal(series.fundingAt[0], 0.0003);
  assert.equal(series.fundingAt[8], 0.0003);
  assert.equal(series.fundingAt[1], null);
  assert.ok(Math.abs(series.fundingAnnualAt[16] - 0.00002 * 6 * 365) < 1e-12, '4-hour funding annualises with its own interval');
  const decide = fundingCarry(series, { events: 1, enterAnnual: 0.2, exitAnnual: 0.1 });
  assert.deepEqual(decide(0), { spot: 1, perp: -1 });   // 0.0003 * 3 * 365 = 32.85% > 20%, known at close of bar 0 (= settlement time)
  assert.deepEqual(decide(8), { spot: 1, perp: -1 });
  assert.deepEqual(decide(16), { spot: 0, perp: 0 });   // 4.38% < 10% exit
  assert.ok(COST_PROFILES.optimistic_maker_bound.spot < COST_PROFILES.retail_taker.spot);
});

test('paper ledger: decisions must precede marks and the chain detects rewrites', () => {
  let chain = recordPaperDecision([], { strategy: 'S', params: {}, positions: { BTC: 1 }, quotes: { BTC: { price: 100, source: 'okx', observedAt: '2026-10-21T00:00:00Z' } }, decidedAt: '2026-10-21T00:00:00Z', dataThrough: '2026-10-20T23:00:00Z' });
  assert.throws(() => markPaperDecision(chain, { strategy: 'S', quotes: { BTC: { price: 110 } }, markedAt: '2026-10-20T00:00:00Z' }), /after its decision/);
  assert.throws(() => recordPaperDecision([], { strategy: 'S', positions: { BTC: 1 }, quotes: { BTC: { price: 1 } }, decidedAt: '2026-10-21T00:00:00Z', dataThrough: '2026-10-22T00:00:00Z' }), /newer/);
  chain = markPaperDecision(chain, { strategy: 'S', quotes: { BTC: { price: 110 } }, markedAt: '2026-10-22T00:00:00Z', costBps: { BTC: 10 } });
  assert.ok(Math.abs(paperSummary(chain).strategies.S.netReturn - (0.10 - 0.002)) < 1e-12);
  assert.equal(verifyPaperChain(chain).ok, true);
  const forged = structuredClone(chain); forged[1].netReturnOnCapital = 0.5;
  assert.equal(verifyPaperChain(forged).ok, false);
});

test('review regressions: paper ledger refuses backdating and replacing an unmarked loser', () => {
  const quote = (price, at) => ({ BTC: { price, source: 'okx', observedAt: at } });
  let chain = recordPaperDecision([], { strategy: 'S', positions: { BTC: 1 }, quotes: quote(100, '2026-10-21T00:00:00Z'), decidedAt: '2026-10-21T00:00:00Z' });
  assert.throws(() => recordPaperDecision(chain, { strategy: 'S', positions: { BTC: 1 }, quotes: quote(80, '2026-10-22T00:00:00Z'), decidedAt: '2026-10-22T00:00:00Z' }), /unmarked/);
  assert.throws(() => recordPaperDecision([], { strategy: 'T', positions: { BTC: 1 }, quotes: quote(80, '2026-10-23T00:00:00Z'), decidedAt: '2026-10-22T00:00:00Z' }), /observed at or before/);
  chain = markPaperDecision(chain, { strategy: 'S', quotes: { BTC: { price: 120 } }, markedAt: '2026-10-23T00:00:00Z' });
  assert.throws(() => recordPaperDecision(chain, { strategy: 'S', positions: { BTC: 1 }, quotes: quote(50, '2026-01-01T00:00:00Z'), decidedAt: '2026-01-01T00:00:00Z' }), /before the last record/);
  const forged = structuredClone(chain);
  forged[1].markedAt = '2026-10-20T00:00:00Z';
  assert.equal(verifyPaperChain(forged).ok, false);
  assert.deepEqual(paperSummary(recordPaperDecision(chain, { strategy: 'S', positions: { BTC: 1 }, quotes: quote(120, '2026-10-24T00:00:00Z'), decidedAt: '2026-10-24T00:00:00Z' })).openDecisions, [{ strategy: 'S', decidedAt: '2026-10-24T00:00:00Z' }]);
});

test('review regressions: stress gate replays walk-forward choices; DSR deflates with two variants', () => {
  const two = deflatedSharpe({ returns: Array.from({ length: 1000 }, (_, i) => 0.001 + 0.01 * Math.sin(i)), trialSharpes: [0.01, 0.03] });
  assert.ok(two.expectedMaxSharpeUnderNull > 0, 'two distinct variants must raise the hurdle');
  // Regime: up, down, up. A long-only holdout choice looks great on every fold;
  // the real walk-forward (which picks flat after a down year) does not.
  const hours = 24 * 30 * 48;
  const timestamps = Array.from({ length: hours }, (_, i) => Date.UTC(2021, 0, 1) + i * 3_600_000);
  const asset = timestamps.map(ms => { const y = new Date(ms).getUTCFullYear(); return y === 2022 ? -0.00004 : 0.00004; });
  const family = { name: 'REGIME', hypothesis: 'test', grid: [{ on: 0 }, { on: 1 }], build: ({ on }) => ({ legs: [{ name: 'a', returns: asset, costBps: 1 }], decide: () => ({ a: on }) }) };
  const stressBuild = ({ on }) => ({ legs: [{ name: 'a', returns: asset, costBps: 2 }], decide: () => ({ a: on }) });
  const receipt = runExperiment({ family, timestamps, holdoutFrom: '2024-07', stressBuild });
  const replayed = receipt.walkForward.folds.map(fold => fold.params.on);
  assert.ok(replayed.includes(0) && replayed.includes(1), JSON.stringify(replayed));
  assert.notEqual(receipt.outOfSampleUnderStressCosts.totalReturn, receipt.holdoutUnderStressCosts?.totalReturn);
  assert.ok(Math.abs(receipt.outOfSampleUnderStressCosts.totalReturn - receipt.outOfSample.totalReturn) < 0.05, 'stress walk-forward tracks the real walk-forward, not the holdout choice');
});

test('review regressions: blocked crypto leg blocks the mechanism; NaN limits and bad probabilities are refused', async () => {
  const { classifyRail } = await import('../src/money-entry-rails.mjs');
  const { allocateCapital } = await import('../src/capital-allocation-intelligence.mjs');
  assert.equal(classifyRail('Polymarket USDC winnings withdrawn to PayPal').verdict, 'RAIL_BLOCKED');
  assert.equal(classifyRail('Sell USDT signals; buyers pay by bank transfer').verdict, 'RAIL_BLOCKED');
  assert.equal(classifyRail('Apify payouts to PayPal. No FX, crypto or offshore leg.').verdict, 'RAIL_PLAUSIBLE');
  const candidate = { id: 'A', monthlyContributionUsd: { p10: 10, p50: 20, p90: 30 }, probabilityMechanismWorks: 0.5, capitalRequiredUsd: 0, worstCredibleLossUsd: 100, founderHoursPerMonth: 500, correlationGroup: 'g' };
  assert.equal(allocateCapital({ candidates: [candidate], levels: [100], founderHoursPerMonth: NaN }).status, 'INVALID_OPTIONS');
  assert.equal(allocateCapital({ candidates: [candidate], levels: [100], maxLossFraction: NaN }).status, 'INVALID_OPTIONS');
  assert.equal(allocateCapital({ candidates: [{ ...candidate, monthlyContributionUsd: { p10: -10_000, p50: 1, p90: 2 }, probabilityMechanismWorks: -0.5 }], levels: [0] }).status, 'INVALID_CANDIDATES');
});

test('reality ledger: five tiers, each with its own evidence, never summed together', () => {
  const at = '2026-10-21T00:00:00Z';
  let r = appendRealityEntry([], { tier: 'SIMULATED', mechanismId: 'CARRY', amountCents: 50_000, evidence: { experimentReceiptSha256: 'a'.repeat(64) }, at });
  assert.equal(r.ok, true);
  let ledger = r.ledger;
  // Realized trading without founder capital authorization is refused.
  const refused = appendRealityEntry(ledger, { tier: 'REALIZED_TRADING', mechanismId: 'CARRY', amountCents: 100, evidence: { venue: 'x', fillIds: ['f1'], feesCents: 1 }, at });
  assert.equal(refused.ok, false);
  assert.ok(refused.problems.some(text => /founderCapitalAuthorizationRef/.test(text)));
  assert.ok(evidenceProblems('COLLECTED_RECEIPTS', { providerEventRef: 'order_created:sandbox-1', counterparty: 'x' }).length > 0, 'sandbox events are not receipts');
  // Cleared contribution profit needs intact canonical payment truth.
  const truth = { ok: true, status: 'PROVIDER_CLEARED_PAYMENT_PROVEN', stages: { CLEARED_PAYMENT: { status: 'PROVEN' }, PAYMENT_RETAINED: { status: 'PROVEN' } }, economics: { netProviderClearedRevenueCents: 10_000, reversedRevenueCents: 0 }, verifiedProviderEventRefs: ['order_created:12345'], contradictions: [] };
  truth.truthDigest = canonicalPaymentTruthDigest(truth);
  r = appendRealityEntry(ledger, { tier: 'CLEARED_CONTRIBUTION_PROFIT', mechanismId: 'API', amountCents: 10_000, evidence: { paymentTruth: truth, attributableCostsCents: 2_500 }, at });
  assert.equal(r.ok, true);
  ledger = r.ledger;
  const tampered = structuredClone(truth); tampered.stages.PAYMENT_RETAINED.status = 'REVERSED';
  assert.equal(appendRealityEntry(ledger, { tier: 'CLEARED_CONTRIBUTION_PROFIT', mechanismId: 'API', amountCents: 1, evidence: { paymentTruth: tampered, attributableCostsCents: 0 }, at }).ok, false);
  // Review regressions: inflated, duplicated, failed and sandbox payment evidence is refused.
  assert.equal(appendRealityEntry(ledger, { tier: 'CLEARED_CONTRIBUTION_PROFIT', mechanismId: 'API2', amountCents: 10_000, evidence: { paymentTruth: truth, attributableCostsCents: 0 }, at }).ok, false, 'one payment counts once');
  const failed = { ...structuredClone(truth), ok: false, contradictions: ['refund observed'], verifiedProviderEventRefs: ['order_created:999'], economics: { netProviderClearedRevenueCents: 10_000, reversedRevenueCents: 45_000 } };
  failed.truthDigest = canonicalPaymentTruthDigest(failed);
  assert.deepEqual(appendRealityEntry([], { tier: 'CLEARED_CONTRIBUTION_PROFIT', mechanismId: 'X', amountCents: 10_000_000, evidence: { paymentTruth: failed, attributableCostsCents: 0 }, at }).problems.length >= 4, true);
  const inflated = { ...structuredClone(truth), verifiedProviderEventRefs: ['order_created:777'] };
  inflated.truthDigest = canonicalPaymentTruthDigest(inflated);
  assert.ok(appendRealityEntry([], { tier: 'CLEARED_CONTRIBUTION_PROFIT', mechanismId: 'X', amountCents: 10_000_000, evidence: { paymentTruth: inflated, attributableCostsCents: 0 }, at }).problems.some(text => /net provider-cleared/.test(text)));
  for (const ref of ['sandbox.paypal.com/txn/1', 'paypal-sandbox/WH-1']) assert.ok(evidenceProblems('COLLECTED_RECEIPTS', { providerEventRef: ref, counterparty: 'x' }).length > 0, ref);
  const summary = summarizeReality(ledger);
  assert.equal(summary.byTier.SIMULATED.amountCents, 50_000);
  assert.equal(summary.clearedContributionProfitCents, 7_500);
  assert.match(summary.crossTierTotal, /NOT_DEFINED/);
  assert.equal(checkMoneyClaim(ledger, { mechanismId: 'CARRY' }).claimHolds, false, 'a backtest is not cleared profit');
  assert.equal(checkMoneyClaim(ledger, { mechanismId: 'CARRY', claimedTier: 'SIMULATED' }).claimHolds, true);
  assert.equal(checkMoneyClaim(ledger, { mechanismId: 'API' }).claimHolds, true);
  const forged = structuredClone(ledger); forged[0].amountCents = 9_999_999;
  assert.equal(verifyRealityChain(forged).ok, false);
});

test('capital allocation: ruin firewall, correlation groups, founder hours and idle capital', async () => {
  const { allocateCapital, riskAdjustedMonthly } = await import('../src/capital-allocation-intelligence.mjs');
  const c = (id, p10, p50, p90, capital, loss, hours, group, probability = 1) => ({ id, monthlyContributionUsd: { p10, p50, p90 }, probabilityMechanismWorks: probability, capitalRequiredUsd: capital, worstCredibleLossUsd: loss, founderHoursPerMonth: hours, correlationGroup: group });
  const candidates = [
    c('api', 0, 100, 400, 0, 0, 6, 'software'),
    c('leads', 50, 150, 300, 0, 0, 8, 'software'),          // same group as api: cannot both be picked
    c('arb', 20, 60, 200, 1_000, 900, 2, 'trading'),       // loss too large for a $1,000 level at 25%
    c('tenders', 10, 80, 250, 100, 20, 5, 'procurement'),
    c('lottery', -100, -50, 5_000, 0, 0, 1, 'speculative')  // fat upside, negative pessimistic value
  ];
  assert.ok(riskAdjustedMonthly(candidates[4]) > 0, 'the optimistic tail alone would score it positive');
  const result = allocateCapital({ candidates, founderHoursPerMonth: 15, maxLossFraction: 0.25, riskFreeAnnual: 0.04 });
  assert.equal(result.ok, true);
  assert.deepEqual(result.frontierReserve, ['lottery'], 'negative-median bets are preserved, never funded');
  assert.ok(result.scenarios.every(s => !s.portfolio.some(p => p.id === 'lottery')));
  const at0 = result.scenarios.find(s => s.capitalLevelUsd === 0);
  assert.deepEqual(at0.portfolio.map(p => p.id), ['leads'], 'one software engine only, and tenders needs $100');
  const at1k = result.scenarios.find(s => s.capitalLevelUsd === 1_000);
  assert.ok(!at1k.portfolio.some(p => p.id === 'arb'), 'a $900 worst case breaches a $250 loss budget');
  assert.ok(at1k.bottlenecks.some(b => b.id === 'arb' && (b.blockedBy === 'RUIN_FIREWALL' || b.blockedBy === 'CAPITAL')));
  const at5k = result.scenarios.find(s => s.capitalLevelUsd === 5_000);
  assert.ok(at5k.portfolio.some(p => p.id === 'arb'));
  assert.ok(at5k.founderHoursUsed <= 15);
  assert.ok(at5k.idleCapitalMonthlyAtRiskFreeUsd > 0);
  assert.match(result.spendingAuthority, /not authorizations/);
  assert.equal(allocateCapital({ candidates: [{ id: 'bad' }] }).ok, false);
});

test('money entry rails: Egypt-blocked rails cannot carry a mechanism', async () => {
  const { classifyRail, RAILS, RAIL_STATUSES } = await import('../src/money-entry-rails.mjs');
  assert.ok(RAILS.every(rail => RAIL_STATUSES.includes(rail.status)));
  assert.equal(classifyRail('Stripe checkout').verdict, 'RAIL_BLOCKED');
  assert.equal(classifyRail('USDC via x402 micropayments').verdict, 'RAIL_BLOCKED');
  assert.equal(classifyRail('Apify Store pay-per-event, payout by wire').verdict, 'RAIL_PLAUSIBLE');
  assert.equal(classifyRail('Stripe or Contra').best, 'CONTRA_INDEPENDENT', 'the best usable rail named decides');
  // Generic Egypt support is not the founder's account: his PayPal is permanently deactivated.
  assert.equal(classifyRail('Stripe or PayPal').verdict, 'RAIL_BLOCKED');
  assert.equal(RAILS.find(rail => rail.id === 'PAYPAL_EGYPT').founderAccountState, 'PERMANENTLY_DEACTIVATED');
  assert.equal(classifyRail('fixed-price contract paid by invoice').best, 'INTERNATIONAL_BANK_WIRE', '"contract" is not Contra');
  assert.equal(classifyRail('Payoneer').verdict, 'RAIL_UNVERIFIED');
  assert.equal(classifyRail('customers pay somehow').verdict, 'RAIL_UNSPECIFIED');
  assert.ok(!RAILS.some(rail => rail.status === 'VERIFIED_WORKING'), 'nothing is verified until a real payout lands');
  // Found by the tournament: a rail named only to exclude it must not block or carry the mechanism.
  assert.equal(classifyRail('An EGP bank account for T-bills and an FRA-licensed EGX broker. No FX, crypto or offshore leg.').best, 'DOMESTIC_EGYPT_BANK_OR_BROKER');
  assert.equal(classifyRail('We avoid Stripe entirely; customers pay by PayPal').best, 'PAYPAL_EGYPT');
  assert.equal(classifyRail('settled in USDC on-chain').verdict, 'RAIL_BLOCKED');
});
