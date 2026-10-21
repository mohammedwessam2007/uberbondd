// Revenue Reality Ledger.
//
//   SIMULATED  !=  PAPER  !=  REALIZED_TRADING  !=  COLLECTED_RECEIPTS  !=  CLEARED_CONTRIBUTION_PROFIT
//
// Five tiers of "money" that a machine like UberBond produces claims about,
// and that are routinely confused. Each tier demands its own kind of evidence;
// none implies the next; totals are never summed across tiers. A sentence
// such as "the strategy made $X" is checked against the ledger and rewritten
// to the strongest tier the evidence supports.
//
// Commercial clearing reuses the canonical payment-renewal truth (status
// PROVIDER_CLEARED_PAYMENT_PROVEN, payment retained, digest intact). Trading
// realization requires venue fill identifiers and a founder capital
// authorization reference. This module records; it never trades or charges.

import crypto from 'node:crypto';
import { canonicalPaymentTruthDigest } from './lead-path-sprint-fulfillment.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const REVENUE_REALITY_LEDGER_VERSION = 'uberbond.revenue-reality-ledger-1.0.0';
export const REALITY_TIERS = Object.freeze(['SIMULATED', 'PAPER', 'REALIZED_TRADING', 'COLLECTED_RECEIPTS', 'CLEARED_CONTRIBUTION_PROFIT']);

const sha256 = value => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const isHex64 = value => /^[a-f0-9]{64}$/.test(String(value ?? ''));
const nonEmpty = value => typeof value === 'string' && value.trim().length > 0;
const SYNTHETIC_RX = /(?:^|[-_:])(sandbox|synthetic|fixture|fake|test|simulated|paper)(?:[-_:]|$)/i;

/** Evidence each tier requires. Returns the list of missing/invalid items (empty = admissible). */
export function evidenceProblems(tier, evidence = {}) {
  const problems = [];
  switch (tier) {
    case 'SIMULATED':
      if (!isHex64(evidence.experimentReceiptSha256)) problems.push('experimentReceiptSha256 (backtest/model receipt) required');
      break;
    case 'PAPER':
      if (!isHex64(evidence.paperLedgerHeadSha256)) problems.push('paperLedgerHeadSha256 (hash-chained forward paper ledger) required');
      if (!Number.isSafeInteger(evidence.signalsRecordedBeforeOutcome) || evidence.signalsRecordedBeforeOutcome < 1) problems.push('signalsRecordedBeforeOutcome >= 1 required: paper results must be committed before prices are observed');
      break;
    case 'REALIZED_TRADING':
      if (!nonEmpty(evidence.venue)) problems.push('venue required');
      if (!Array.isArray(evidence.fillIds) || !evidence.fillIds.length || evidence.fillIds.some(id => !nonEmpty(id) || SYNTHETIC_RX.test(id))) problems.push('non-synthetic venue fill identifiers required');
      if (!nonEmpty(evidence.founderCapitalAuthorizationRef)) problems.push('founderCapitalAuthorizationRef required: no real-money trade exists without explicit founder authorization of market, broker, capital limit and risk');
      if (!Number.isFinite(evidence.feesCents)) problems.push('feesCents required: realized P&L is net of venue fees');
      break;
    case 'COLLECTED_RECEIPTS':
      if (!nonEmpty(evidence.providerEventRef) || SYNTHETIC_RX.test(evidence.providerEventRef)) problems.push('non-synthetic payment provider event reference required');
      if (!nonEmpty(evidence.counterparty)) problems.push('counterparty required');
      break;
    case 'CLEARED_CONTRIBUTION_PROFIT': {
      const truth = evidence.paymentTruth;
      if (!truth) { problems.push('canonical paymentTruth required'); break; }
      if (truth.status !== 'PROVIDER_CLEARED_PAYMENT_PROVEN') problems.push('payment truth status must be PROVIDER_CLEARED_PAYMENT_PROVEN');
      if (truth?.stages?.PAYMENT_RETAINED?.status !== 'PROVEN') problems.push('payment must be retained (not refunded, disputed or reversed)');
      if (!isHex64(truth.truthDigest) || truth.truthDigest !== canonicalPaymentTruthDigest(truth)) problems.push('payment truth digest missing or does not match its contents');
      if (!Number.isFinite(evidence.attributableCostsCents) || evidence.attributableCostsCents < 0) problems.push('attributableCostsCents >= 0 required: contribution profit is receipts minus attributable costs');
      break;
    }
    default:
      problems.push(`unknown tier ${tier}`);
  }
  return problems;
}

/** Append one entry to a hash-chained ledger. Inadmissible entries are refused, not downgraded silently. */
export function appendRealityEntry(ledger = [], { tier, mechanismId, amountCents, currency = 'USD', evidence = {}, at }) {
  const problems = evidenceProblems(tier, evidence);
  if (!nonEmpty(mechanismId)) problems.push('mechanismId required');
  if (!Number.isSafeInteger(amountCents)) problems.push('amountCents must be an integer number of cents');
  if (!nonEmpty(at) || Number.isNaN(Date.parse(at))) problems.push('at (ISO timestamp) required');
  if (problems.length) return { ok: false, status: 'REFUSED', tier, problems, ledger };
  const previousHash = ledger.length ? ledger.at(-1).entryHash : '0'.repeat(64);
  const body = { index: ledger.length, tier, mechanismId, amountCents, currency, evidence, at, previousHash };
  const entry = { ...body, entryHash: sha256(body) };
  return { ok: true, status: 'APPENDED', entry, ledger: [...ledger, entry] };
}

export function verifyRealityChain(ledger = []) {
  let previous = '0'.repeat(64);
  for (const [index, entry] of ledger.entries()) {
    const { entryHash, ...body } = entry;
    if (body.index !== index || body.previousHash !== previous || sha256(body) !== entryHash) return { ok: false, brokenAt: index };
    if (evidenceProblems(body.tier, body.evidence).length) return { ok: false, brokenAt: index, reason: 'entry evidence no longer admissible' };
    previous = entryHash;
  }
  return { ok: true, length: ledger.length, head: previous };
}

/** Per-tier, per-mechanism totals. Tiers are reported side by side and never added together. */
export function summarizeReality(ledger = []) {
  const chain = verifyRealityChain(ledger);
  const byTier = Object.fromEntries(REALITY_TIERS.map(tier => [tier, { entries: 0, amountCents: 0 }]));
  const byMechanism = {};
  for (const entry of ledger) {
    byTier[entry.tier].entries += 1;
    byTier[entry.tier].amountCents += entry.tier === 'CLEARED_CONTRIBUTION_PROFIT' ? entry.amountCents - entry.evidence.attributableCostsCents : entry.amountCents;
    byMechanism[entry.mechanismId] ??= Object.fromEntries(REALITY_TIERS.map(tier => [tier, 0]));
    byMechanism[entry.mechanismId][entry.tier] += entry.tier === 'CLEARED_CONTRIBUTION_PROFIT' ? entry.amountCents - entry.evidence.attributableCostsCents : entry.amountCents;
  }
  const strongest = [...REALITY_TIERS].reverse().find(tier => byTier[tier].entries > 0) ?? null;
  return {
    version: REVENUE_REALITY_LEDGER_VERSION,
    chain,
    byTier,
    byMechanism,
    strongestTierWithEvidence: strongest,
    clearedContributionProfitCents: byTier.CLEARED_CONTRIBUTION_PROFIT.amountCents,
    crossTierTotal: 'NOT_DEFINED: tiers measure different things and are never added',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS)
  };
}

/**
 * Check a money claim ("FUNDING_CARRY made $120") against the ledger.
 * Returns the strongest tier that actually supports it and the honest wording.
 */
export function checkMoneyClaim(ledger, { mechanismId, claimedTier = 'CLEARED_CONTRIBUTION_PROFIT' }) {
  const summary = summarizeReality(ledger);
  const row = summary.byMechanism[mechanismId] ?? null;
  // "Made money" needs a positive amount; a loss at a strong tier is evidence, not support.
  const supported = row ? [...REALITY_TIERS].reverse().find(tier => row[tier] > 0) ?? null : null;
  const claimedRank = REALITY_TIERS.indexOf(claimedTier);
  const supportedRank = supported ? REALITY_TIERS.indexOf(supported) : -1;
  return {
    mechanismId,
    claimedTier,
    supportedTier: supported,
    claimHolds: summary.chain.ok && supportedRank >= claimedRank && claimedRank >= 0,
    honestStatement: supported ? `${mechanismId}: strongest evidence is ${supported} (${(row[supported] / 100).toFixed(2)}). Nothing stronger is established.` : `${mechanismId}: no money of any tier is evidenced.`
  };
}
