// Forward paper ledger for the Machiavelli quant lab.
//
// A paper result only counts if the decision was committed before the price
// that scores it existed. Each decision is appended to a hash chain with the
// public quote it was made against; a later mark appends the exit quote and
// the net paper P&L after the same cost profile the backtest used. Rewriting
// history breaks the chain. Nothing here can place an order.

import crypto from 'node:crypto';

export const QUANT_PAPER_LEDGER_VERSION = 'uberbond.quant-paper-ledger-1.1.0';
const sha256 = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const GENESIS = '0'.repeat(64);

const timeOf = record => Date.parse(record.type === 'MARK' ? record.markedAt : record.decidedAt);
const openDecision = (chain, strategy) => chain.find(record => record.type === 'DECISION' && record.strategy === strategy && !chain.some(mark => mark.type === 'MARK' && mark.decisionIndex === record.index));

function append(chain, body) {
  const record = { index: chain.length, previousHash: chain.length ? chain.at(-1).hash : GENESIS, ...body };
  return [...chain, { ...record, hash: sha256(record) }];
}

export function verifyPaperChain(chain = []) {
  let previous = GENESIS;
  for (const [index, record] of chain.entries()) {
    const { hash, ...body } = record;
    if (body.index !== index || body.previousHash !== previous || sha256(body) !== hash) return { ok: false, brokenAt: index };
    // Time only moves forward: a backdated record breaks the chain even if its hash is valid.
    if (index && !(timeOf(record) >= timeOf(chain[index - 1]))) return { ok: false, brokenAt: index, reason: 'TIME_ORDER' };
    previous = hash;
  }
  return { ok: true, head: previous, length: chain.length };
}

/** quotes: { [instrument]: { price, source, observedAt } } observed at decision time. */
export function recordPaperDecision(chain, { strategy, params, positions, quotes, decidedAt, dataThrough }) {
  if (!strategy || !positions || !quotes || !decidedAt) throw new Error('strategy, positions, quotes and decidedAt are required');
  for (const instrument of Object.keys(positions)) if (!(quotes[instrument]?.price > 0)) throw new Error(`no positive quote for ${instrument}`);
  if (!Number.isFinite(Date.parse(decidedAt))) throw new Error('decidedAt must be a timestamp');
  if (dataThrough && Date.parse(dataThrough) > Date.parse(decidedAt)) throw new Error('decision cannot use data newer than its own timestamp');
  for (const instrument of Object.keys(positions)) if (!(Date.parse(quotes[instrument].observedAt) <= Date.parse(decidedAt))) throw new Error(`quote for ${instrument} must be observed at or before the decision`);
  if (chain.length && Date.parse(decidedAt) < timeOf(chain.at(-1))) throw new Error('a decision cannot be dated before the last record');
  // One open decision per strategy: a losing decision cannot be quietly replaced.
  if (openDecision(chain, strategy)) throw new Error(`${strategy} has an unmarked decision; mark it first`);
  return append(chain, { type: 'DECISION', strategy, params, positions, quotes, decidedAt, dataThrough: dataThrough ?? null });
}

/**
 * Mark the open decision of a strategy against later quotes.
 * costBps: { [instrument]: bps per unit turnover }, charged on entry and exit.
 * carryFraction: optional settled funding credited over the holding window (fraction of notional).
 */
export function markPaperDecision(chain, { strategy, quotes, markedAt, costBps = {}, carryFraction = 0, capitalPerUnit = 1 }) {
  const decision = openDecision(chain, strategy);
  if (!decision) throw new Error(`no open decision for ${strategy}`);
  if (!(Date.parse(markedAt) > Date.parse(decision.decidedAt))) throw new Error('a mark must come after its decision');
  if (Date.parse(markedAt) < timeOf(chain.at(-1))) throw new Error('a mark cannot be dated before the last record');
  let pnl = carryFraction;
  for (const [instrument, position] of Object.entries(decision.positions)) {
    const entry = decision.quotes[instrument].price;
    const exit = quotes[instrument]?.price;
    if (!(exit > 0)) throw new Error(`no exit quote for ${instrument}`);
    const exitObservedAt = Date.parse(quotes[instrument]?.observedAt);
    if (!(Number.isFinite(exitObservedAt) &&
      exitObservedAt >= Date.parse(decision.decidedAt) &&
      exitObservedAt <= Date.parse(markedAt))) {
      throw new Error(`exit quote for ${instrument} must be observed between the decision and mark`);
    }
    pnl += position * (exit / entry - 1) - 2 * Math.abs(position) * (costBps[instrument] ?? 0) / 10_000;
  }
  return append(chain, { type: 'MARK', strategy, decisionIndex: decision.index, quotes, markedAt, netReturnOnCapital: pnl / capitalPerUnit, evidenceClass: 'PAPER' });
}

export function paperSummary(chain = []) {
  const marks = chain.filter(record => record.type === 'MARK');
  const byStrategy = {};
  for (const mark of marks) {
    const row = byStrategy[mark.strategy] ??= { marks: 0, compounded: 1 };
    row.marks += 1;
    row.compounded *= 1 + mark.netReturnOnCapital;
  }
  const open = chain.filter(record => record.type === 'DECISION' && !marks.some(mark => mark.decisionIndex === record.index)).map(record => ({ strategy: record.strategy, decidedAt: record.decidedAt }));
  return { version: QUANT_PAPER_LEDGER_VERSION, chain: verifyPaperChain(chain), openDecisions: open, strategies: Object.fromEntries(Object.entries(byStrategy).map(([name, row]) => [name, { marks: row.marks, netReturn: row.compounded - 1 }])), evidenceClass: 'PAPER', moneyClaim: 'NONE' };
}
