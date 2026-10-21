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

export const REVENUE_REALITY_LEDGER_VERSION = 'uberbond.revenue-reality-ledger-1.1.0';
export const REALITY_TIERS = Object.freeze(['SIMULATED', 'PAPER', 'REALIZED_TRADING', 'COLLECTED_RECEIPTS', 'CLEARED_CONTRIBUTION_PROFIT']);

const sha256 = value => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const isHex64 = value => /^[a-f0-9]{64}$/.test(String(value ?? ''));
const nonEmpty = value => typeof value === 'string' && value.trim().length > 0;
const SYNTHETIC_RX = /(?:^|[-_:])(sandbox|synthetic|fixture|fake|test|simulated|paper)(?:[-_:]|$)/i;
// Trust callbacks MUST be supplied by the authenticated server boundary, never by entry JSON.
// A callback supplied by untrusted code is not independent payment or exchange evidence.
const provenBy = (context, key, ...args) => {
  try { return typeof context?.[key] === 'function' && context[key](...args) === true; }
  catch { return false; }
};

/** Evidence each tier requires. Returns the list of missing/invalid items (empty = admissible). */
export function evidenceProblems(tier, evidence = {}, trusted = {}) {
  const problems = [];
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return ['evidence must be an object'];
  switch (tier) {
    case 'SIMULATED':
      if (!isHex64(evidence.experimentReceiptSha256)) problems.push('experimentReceiptSha256 (backtest/model receipt) required');
      break;
    case 'PAPER':
      if (!isHex64(evidence.paperLedgerHeadSha256)) problems.push('paperLedgerHeadSha256 (hash-chained forward paper ledger) required');
      if (!Number.isSafeInteger(evidence.signalsRecordedBeforeOutcome) || evidence.signalsRecordedBeforeOutcome < 1) problems.push('signalsRecordedBeforeOutcome >= 1 required: paper results must be committed before prices are observed');
      if (!provenBy(trusted, 'verifyExternalTimestamp', evidence)) problems.push('independent pre-outcome timestamp witness required; internal hashes do not prove chronology');
      break;
    case 'REALIZED_TRADING':
      if (!nonEmpty(evidence.venue)) problems.push('venue required');
      if (!Array.isArray(evidence.fillIds) || !evidence.fillIds.length || evidence.fillIds.some(id => !nonEmpty(id) || SYNTHETIC_RX.test(id))) problems.push('non-synthetic venue fill identifiers required');
      if (!nonEmpty(evidence.founderCapitalAuthorizationRef)) problems.push('founderCapitalAuthorizationRef required: no real-money trade exists without explicit founder authorization of market, broker, capital limit and risk');
      if (!Number.isSafeInteger(evidence.feesCents) || evidence.feesCents < 0) problems.push('feesCents required: nonnegative integer venue fees');
      if (!provenBy(trusted, 'verifyVenueFills', evidence)) problems.push('independently verified venue fills required; arbitrary fill IDs are not exchange evidence');
      break;
    case 'COLLECTED_RECEIPTS':
      if (!nonEmpty(evidence.providerEventRef) || SYNTHETIC_RX.test(evidence.providerEventRef)) problems.push('non-synthetic payment provider event reference required');
      if (!nonEmpty(evidence.counterparty)) problems.push('counterparty required');
      if (!provenBy(trusted, 'verifyCollectedProviderReceipt', evidence)) problems.push('independently verified provider receipt required; arbitrary event IDs are not proof');
      break;
    case 'CLEARED_CONTRIBUTION_PROFIT': {
      const truth = evidence.paymentTruth;
      if (!truth) { problems.push('canonical paymentTruth required'); break; }
      if (truth.status !== 'PROVIDER_CLEARED_PAYMENT_PROVEN') problems.push('payment truth status must be PROVIDER_CLEARED_PAYMENT_PROVEN');
      if (truth?.stages?.PAYMENT_RETAINED?.status !== 'PROVEN') problems.push('payment must be retained (not refunded, disputed or reversed)');
      if (!isHex64(truth.truthDigest) || truth.truthDigest !== canonicalPaymentTruthDigest(truth)) problems.push('payment truth digest missing or does not match its contents');
      if (!Number.isSafeInteger(evidence.attributableCostsCents) || evidence.attributableCostsCents < 0) problems.push('nonnegative integer attributableCostsCents required');
      // An internally recomputable SHA is integrity only, never an independent provider receipt.
      if (!provenBy(trusted, 'verifyClearedPayment', truth, evidence)) problems.push('independent trusted payment verification required; local status and digest are self-attestable');
      break;
    }
    default:
      problems.push(`unknown tier ${tier}`);
  }
  return problems;
}

/** Append one entry to a hash-chained ledger. Inadmissible entries are refused, not downgraded silently. */
export function appendRealityEntry(ledger = [], { tier, mechanismId, amountCents, currency = 'USD', evidence = {}, at }, trusted = {}) {
  const problems = evidenceProblems(tier, evidence, trusted);
  if (!nonEmpty(mechanismId)) problems.push('mechanismId required');
  if (!Number.isSafeInteger(amountCents)) problems.push('amountCents must be an integer number of minor units');
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) problems.push('ISO-4217 uppercase currency required');
  if (!verifyRealityChain(ledger, trusted).ok) problems.push('existing ledger invalid or unauthenticated');
  if (!nonEmpty(at) || Number.isNaN(Date.parse(at))) problems.push('at (ISO timestamp) required');
  if (problems.length) return { ok: false, status: 'REFUSED', tier, problems, ledger };
  const previousHash = ledger.length ? ledger.at(-1).entryHash : '0'.repeat(64);
  const body = { index: ledger.length, tier, mechanismId, amountCents, currency, evidence, at, previousHash };
  const entry = { ...body, entryHash: sha256(body) };
  return { ok: true, status: 'APPENDED', entry, ledger: [...ledger, entry] };
}

export function verifyRealityChain(ledger = [], trusted = {}) {
  let previous = '0'.repeat(64);
  for (const [index, entry] of ledger.entries()) {
    const { entryHash, ...body } = entry;
    if (body.index !== index || body.previousHash !== previous || sha256(body) !== entryHash) return { ok: false, brokenAt: index };
    if (evidenceProblems(body.tier, body.evidence, trusted).length || !Number.isSafeInteger(body.amountCents) || !/^[A-Z]{3}$/.test(body.currency ?? '') || !nonEmpty(body.at) || Number.isNaN(Date.parse(body.at))) return { ok: false, brokenAt: index, reason: 'entry evidence or currency/amount invalid or unauthenticated' };
    previous = entryHash;
  }
  return { ok: true, length: ledger.length, head: previous };
}

/** Per-tier, per-mechanism totals. Tiers are reported side by side and never added together. */
export function summarizeReality(ledger = [], trusted = {}) {
  const chain = verifyRealityChain(ledger, trusted);
  const byTier = Object.fromEntries(REALITY_TIERS.map(tier => [tier, { entries: 0, amountCents: 0, byCurrency: {} }]));
  const byMechanism = {};
  // Refuse to present money aggregates from a broken or self-attested chain.
  if (!chain.ok) return { version: REVENUE_REALITY_LEDGER_VERSION, chain, byTier: null, byMechanism: null, strongestTierWithEvidence: null, clearedContributionProfitCents: null, crossTierTotal: 'NOT_DEFINED', businessEffectAuthority: 'NONE', externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS) };
  for (const entry of ledger) {
    const net = entry.tier === 'CLEARED_CONTRIBUTION_PROFIT' ? entry.amountCents - entry.evidence.attributableCostsCents : entry.amountCents;
    const row = byTier[entry.tier];
    row.entries += 1;
    row.byCurrency[entry.currency] = (row.byCurrency[entry.currency] ?? 0) + net;
    if (!Number.isSafeInteger(row.byCurrency[entry.currency])) return { version: REVENUE_REALITY_LEDGER_VERSION, chain: {ok:false,reason:'aggregated minor units exceed safe integer precision'}, byTier:null, byMechanism:null, strongestTierWithEvidence:null, clearedContributionProfitCents:null, crossTierTotal:'NOT_DEFINED', businessEffectAuthority:'NONE', externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS) };
    byMechanism[entry.mechanismId] ??= Object.fromEntries(REALITY_TIERS.map(tier => [tier, { byCurrency: {}, amountCents: 0 }]));
    const mechanism = byMechanism[entry.mechanismId][entry.tier];
    mechanism.byCurrency[entry.currency] = (mechanism.byCurrency[entry.currency] ?? 0) + net;
  }
  // Preserve legacy scalar only when currencies do not mix. No implicit FX conversion.
  for (const row of byTier ? Object.values(byTier) : []) {
    const amounts = Object.values(row.byCurrency);
    row.amountCents = amounts.length <= 1 ? (amounts[0] ?? 0) : null;
  }
  for (const groups of Object.values(byMechanism)) for (const row of Object.values(groups)) {
    const amounts = Object.values(row.byCurrency);
    row.amountCents = amounts.length <= 1 ? (amounts[0] ?? 0) : null;
  }
  const strongest = [...REALITY_TIERS].reverse().find(tier => byTier[tier].entries > 0) ?? null;
  return {
    version: REVENUE_REALITY_LEDGER_VERSION, chain, byTier, byMechanism,
    strongestTierWithEvidence: strongest,
    clearedContributionProfitCents: byTier.CLEARED_CONTRIBUTION_PROFIT.amountCents,
    clearedContributionProfitByCurrency: byTier.CLEARED_CONTRIBUTION_PROFIT.byCurrency,
    crossTierTotal: 'NOT_DEFINED: currencies and tiers may never be implicitly combined',
    businessEffectAuthority: 'NONE', externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS)
  };
}

/**
 * Check a money claim ("FUNDING_CARRY made $120") against the ledger.
 * Returns the strongest tier that actually supports it and the honest wording.
 */
export function checkMoneyClaim(ledger, { mechanismId, claimedTier = 'CLEARED_CONTRIBUTION_PROFIT' }, trusted = {}) {
  const summary = summarizeReality(ledger, trusted);
  const row = summary.byMechanism?.[mechanismId] ?? null;
  // "Made money" needs a positive amount; a loss at a strong tier is evidence, not support.
  const supported = row ? [...REALITY_TIERS].reverse().find(tier => row[tier].amountCents !== null && row[tier].amountCents > 0) ?? null : null;
  const claimedRank = REALITY_TIERS.indexOf(claimedTier);
  const supportedRank = supported ? REALITY_TIERS.indexOf(supported) : -1;
  return {
    mechanismId,
    claimedTier,
    supportedTier: supported,
    claimHolds: summary.chain.ok && supportedRank >= claimedRank && claimedRank >= 0,
    honestStatement: supported ? `${mechanismId}: strongest evidence is ${supported} (${row[supported].amountCents} minor units of ${Object.keys(row[supported].byCurrency)[0]}; consult source scale and evidence). Nothing stronger is established.` : `${mechanismId}: no money of any tier is evidenced.`
  };
}
