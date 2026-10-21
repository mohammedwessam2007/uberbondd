// Forward paper ledger for the Machiavelli quant lab.
//
// A paper result only counts if the decision was committed before the price
// that scores it existed. Each decision is appended to a hash chain with the
// public quote it was made against; a later mark appends the exit quote and
// the net paper P&L after the same cost profile the backtest used. Rewriting
// history breaks the chain. Nothing here can place an order.

import crypto from 'node:crypto';

export const QUANT_PAPER_LEDGER_VERSION = 'uberbond.quant-paper-ledger-1.0.0';
const sha256 = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const GENESIS = '0'.repeat(64);

function append(chain, body) {
  const record = { index: chain.length, previousHash: chain.length ? chain.at(-1).hash : GENESIS, ...body };
  return [...chain, { ...record, hash: sha256(record) }];
}

export function verifyPaperChain(chain = []) {
  let previous = GENESIS;
  for (const [index, record] of chain.entries()) {
    const { hash, ...body } = record;
    if (body.index !== index || body.previousHash !== previous || sha256(body) !== hash) return { ok: false, brokenAt: index };
    previous = hash;
  }
  // Internal SHA chains attest only to internal consistency, not append time.
  // A fully regenerated historical chain can pass every hash check.
  return { ok: true, head: previous, length: chain.length, forwardChronologyProven: false, evidenceClass: 'UNANCHORED_INTERNAL_PAPER_CHAIN' };
}

/** quotes: { [instrument]: { price, source, observedAt } } observed at decision time. */
export function recordPaperDecision(chain, { strategy, params, positions, quotes, decidedAt, dataThrough }) {
  if (!strategy || !positions || !quotes || !decidedAt) throw new Error('strategy, positions, quotes and decidedAt are required');
  for (const instrument of Object.keys(positions)) if (!(quotes[instrument]?.price > 0)) throw new Error(`no positive quote for ${instrument}`);
  if (dataThrough && Date.parse(dataThrough) > Date.parse(decidedAt)) throw new Error('decision cannot use data newer than its own timestamp');
  return append(chain, { type: 'DECISION', strategy, params, positions, quotes, decidedAt, dataThrough: dataThrough ?? null });
}

/**
 * Mark the latest open decision of a strategy against later quotes.
 * costBps: { [instrument]: bps per unit turnover }, charged on entry and exit.
 * carryFraction: optional settled funding credited over the holding window (fraction of notional).
 */
export function markPaperDecision(chain, { strategy, quotes, markedAt, costBps = {}, carryFraction = 0, capitalPerUnit = 1 }) {
  const decision = [...chain].reverse().find(record => record.type === 'DECISION' && record.strategy === strategy);
  if (!decision) throw new Error(`no open decision for ${strategy}`);
  if (chain.some(record => record.type === 'MARK' && record.decisionIndex === decision.index)) throw new Error('decision already marked');
  if (Date.parse(markedAt) <= Date.parse(decision.decidedAt)) throw new Error('a mark must come after its decision');
  let pnl = carryFraction;
  for (const [instrument, position] of Object.entries(decision.positions)) {
    const entry = decision.quotes[instrument].price;
    const exit = quotes[instrument]?.price;
    if (!(exit > 0)) throw new Error(`no exit quote for ${instrument}`);
    pnl += position * (exit / entry - 1) - 2 * Math.abs(position) * (costBps[instrument] ?? 0) / 10_000;
  }
  return append(chain, { type: 'MARK', strategy, decisionIndex: decision.index, quotes, markedAt, netReturnOnCapital: pnl / capitalPerUnit, evidenceClass: 'UNANCHORED_PAPER_SIMULATION' });
}

export function paperSummary(chain = []) {
  const marks = chain.filter(record => record.type === 'MARK');
  const byStrategy = {};
  for (const mark of marks) {
    const row = byStrategy[mark.strategy] ??= { marks: 0, compounded: 1 };
    row.marks += 1;
    row.compounded *= 1 + mark.netReturnOnCapital;
  }
  return { version: QUANT_PAPER_LEDGER_VERSION, chain: verifyPaperChain(chain), strategies: Object.fromEntries(Object.entries(byStrategy).map(([name, row]) => [name, { marks: row.marks, netReturn: row.compounded - 1 }])), evidenceClass: 'UNANCHORED_PAPER_SIMULATION', moneyClaim: 'NONE' };
}
