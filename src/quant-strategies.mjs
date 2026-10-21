// Pre-registered strategy families for the Machiavelli quant lab.
//
// Each family states its economic hypothesis (why money should flow to the
// position at all) before any number is computed. "The chart went up" is not
// a hypothesis. A family whose edge does not survive costs, walk-forward
// selection, deflation for the number of variants tried, and a sealed
// holdout is recorded as REJECTED with its reasons, and kept.

export const QUANT_STRATEGIES_VERSION = 'uberbond.quant-strategies-1.0.0';

// Conservative retail assumptions, in basis points per unit of turnover.
// Taker fees are the published VIP-0 rates (spot 0.10%, USD-M perpetual
// 0.05%); half-spread and slippage are small-size estimates for BTC/ETH.
// `stress` doubles every component to test that an edge is not a rounding error.
export const COST_PROFILES = Object.freeze({
  retail_taker: { spot: 10 + 1 + 1, perp: 5 + 1 + 1, note: 'VIP-0 taker fee + 1bp half-spread + 1bp slippage per leg' },
  stress: { spot: 24, perp: 14, note: 'every component doubled' },
  // Not achievable in practice: assumes every order fills passively at maker
  // rates with the BNB discount and no adverse selection. Used only as an
  // upper bound: a family that fails here cannot pass anywhere at retail.
  optimistic_maker_bound: { spot: 7.5 + 0.5, perp: 2 + 0.5, note: 'maker fee with BNB discount + 0.5bp; unattainable upper bound' }
});

export const HYPOTHESES = Object.freeze({
  BUY_AND_HOLD: 'Baseline. Exposure to the asset with no timing. Every strategy must beat this or zero after costs to matter.',
  TIME_SERIES_MOMENTUM: 'Trend persistence: assets that rose over the lookback keep rising more often than not; flat otherwise. Crowded, well known; included as a strong conventional baseline.',
  FUNDING_CARRY: 'Perpetual futures pay funding from the crowded side to the other side. When leveraged longs dominate, a delta-neutral position (long spot, short perpetual) collects that payment without price exposure. Money enters from leveraged speculators who pay to hold leverage.',
  FUNDING_ROTATION: 'Funding is not equally rich across assets. Holding the delta-neutral carry only in the asset whose trailing funding is highest, switching with hysteresis so costs do not eat the spread, should collect more carry per unit of capital than any single asset. Same payer as FUNDING_CARRY; the edge claimed is allocation, not prediction.'
});

/** Align spot bars, perp bars and funding events on hourly open times. */
export function alignSeries({ spot, perp = null, funding = [] }) {
  const perpByTime = perp ? new Map(perp.map(bar => [bar.openTime, bar])) : null;
  const rows = spot.filter(bar => !perpByTime || perpByTime.has(bar.openTime));
  const fundingByHour = new Map();
  for (const event of funding) fundingByHour.set(Math.floor(event.time / 3_600_000) * 3_600_000, event);
  const timestamps = rows.map(bar => bar.openTime);
  const spotClose = rows.map(bar => bar.close);
  const perpClose = perpByTime ? rows.map(bar => perpByTime.get(bar.openTime).close) : null;
  const ret = closes => closes.map((close, index) => index ? close / closes[index - 1] - 1 : 0);
  return {
    timestamps,
    spotClose,
    perpClose,
    spotRet: ret(spotClose),
    perpRet: perpClose ? ret(perpClose) : null,
    // Raw rate settled at this bar (what a position is actually paid) and the
    // same rate annualised by its own interval (some perps moved from 8h to 4h).
    fundingAt: timestamps.map(ms => fundingByHour.get(ms)?.rate ?? null),
    fundingAnnualAt: timestamps.map(ms => { const event = fundingByHour.get(ms); return event ? event.rate * (24 / (event.intervalHours || 8)) * 365 : null; }),
    gaps: timestamps.filter((ms, index) => index && ms - timestamps[index - 1] !== 3_600_000).length
  };
}

// ---- strategy factories: each call returns a fresh, stateful decide() ----

export const buyAndHold = () => () => ({ spot: 1 });

export const timeSeriesMomentum = (series, { lookback }) => t => ({ spot: t >= lookback && series.spotClose[t] > series.spotClose[t - lookback] ? 1 : 0 });

/** Trailing mean of the last `events` annualised funding rates settled by the close of bar t. */
function trailingFunding(series, t, events) {
  const values = [];
  for (let index = t; index >= 0 && values.length < events; index -= 1) if (series.fundingAnnualAt[index] !== null) values.push(series.fundingAnnualAt[index]);
  return values.length === events ? values.reduce((sum, value) => sum + value, 0) / events : null;
}

export function fundingCarry(series, { events, enterAnnual, exitAnnual }) {
  let inPosition = false;
  return t => {
    const annual = trailingFunding(series, t, events);
    if (annual !== null) {
      if (!inPosition && annual > enterAnnual) inPosition = true;
      else if (inPosition && annual < exitAnnual) inPosition = false;
    }
    return inPosition ? { spot: 1, perp: -1 } : { spot: 0, perp: 0 };
  };
}

/** Funding credited at bar t to the perp position held into t. Shorts receive positive funding. */
export const fundingCarryCredit = series => (t, held) => series.fundingAt[t] === null ? 0 : -(held.perp ?? 0) * series.fundingAt[t];

/**
 * Multi-asset rotation. `universe` is { [asset]: alignedSeries } sharing
 * timestamps. Holds the carry in at most one asset at a time.
 */
export function fundingRotation(universe, { events, enterAnnual, exitAnnual, switchMarginAnnual }) {
  const assets = Object.keys(universe);
  let current = null;
  return t => {
    const scores = assets.map(asset => ({ asset, mean: trailingFunding(universe[asset], t, events) })).filter(item => item.mean !== null).map(item => ({ ...item, annual: item.mean }));
    if (scores.length === assets.length) {
      scores.sort((a, b) => b.annual - a.annual);
      const best = scores[0];
      const held = scores.find(item => item.asset === current);
      if (!current && best.annual > enterAnnual) current = best.asset;
      else if (current && held && held.annual < exitAnnual) current = best.annual > enterAnnual ? best.asset : null;
      else if (current && held && best.asset !== current && best.annual - held.annual > switchMarginAnnual) current = best.asset;
    }
    const positions = {};
    for (const asset of assets) { positions[`${asset}:spot`] = asset === current ? 1 : 0; positions[`${asset}:perp`] = asset === current ? -1 : 0; }
    return positions;
  };
}

export const rotationCredit = universe => (t, held) => Object.keys(universe).reduce((sum, asset) => {
  const rate = universe[asset].fundingAt[t];
  return rate === null ? sum : sum - (held[`${asset}:perp`] ?? 0) * rate;
}, 0);
