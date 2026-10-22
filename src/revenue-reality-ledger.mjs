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
// PROVIDER_CLEARED_PAYMENT_PROVEN, cleared and retained stages proven, no
// contradictions or reversals, digest intact) and the entry amount must equal
// its net provider-cleared revenue. One provider payment counts once. The
// digest proves integrity, not authenticity: the truth object must come from
// the canonical payment-renewal module, never be typed in by hand. Trading
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
// Any non-alphanumeric character separates words: sandbox.paypal.com and paypal-sandbox/WH-1 are synthetic.
const SYNTHETIC_RX = /(?:^|[^a-z0-9])(sandbox|synthetic|fixture|fake|test|simulated|paper)(?:[^a-z0-9]|$)/i;

// A verifier passes only by synchronously returning true. A throw is an
// unavailable provider and a returned promise is a pending check: both refuse.
const trustedVerifierPasses = (verify, input) => {
  if (typeof verify !== 'function') return false;
  try { return verify(input) === true; } catch { return false; }
};

/** Evidence each tier requires. Returns the list of missing/invalid items (empty = admissible). */
export function evidenceProblems(tier, evidence = {}, { amountCents = null, verifyClearedPayment = null, verifyProviderCharge = null, verifyVenueFills = null } = {}) {
  const problems = [];
  switch (tier) {
    case 'SIMULATED':
      if (!isHex64(evidence.experimentReceiptSha256)) problems.push('experimentReceiptSha256 (backtest/model receipt) required');
      break;
    case 'PAPER':
      if (evidence.forwardChronologyProven !== true || !nonEmpty(evidence.independentChronologyProofRef)) problems.push('independent forward chronology proof required; a backdated local hash chain is not time evidence');
      if (!isHex64(evidence.paperLedgerHeadSha256)) problems.push('paperLedgerHeadSha256 (hash-chained forward paper ledger) required');
      if (!Number.isSafeInteger(evidence.signalsRecordedBeforeOutcome) || evidence.signalsRecordedBeforeOutcome < 1) problems.push('signalsRecordedBeforeOutcome >= 1 required: paper results must be committed before prices are observed');
      break;
    case 'REALIZED_TRADING':
      if (!trustedVerifierPasses(verifyVenueFills, evidence)) problems.push(`independent trusted venue fill verifier ${typeof verifyVenueFills === 'function' ? 'unavailable or refused' : 'required'}`);
      if (!nonEmpty(evidence.venue)) problems.push('venue required');
      if (!Array.isArray(evidence.fillIds) || !evidence.fillIds.length || evidence.fillIds.some(id => !nonEmpty(id) || SYNTHETIC_RX.test(id))) problems.push('non-synthetic venue fill identifiers required');
      if (!nonEmpty(evidence.founderCapitalAuthorizationRef)) problems.push('founderCapitalAuthorizationRef required: no real-money trade exists without explicit founder authorization of market, broker, capital limit and risk');
      if (!Number.isFinite(evidence.feesCents)) problems.push('feesCents required: realized P&L is net of venue fees');
      break;
    case 'COLLECTED_RECEIPTS':
      if (!trustedVerifierPasses(verifyProviderCharge, evidence)) problems.push(`independent trusted provider charge verifier ${typeof verifyProviderCharge === 'function' ? 'unavailable or refused' : 'required'}`);
      if (!nonEmpty(evidence.providerEventRef) || SYNTHETIC_RX.test(evidence.providerEventRef)) problems.push('non-synthetic payment provider event reference required');
      if (!nonEmpty(evidence.counterparty)) problems.push('counterparty required');
      break;
    case 'CLEARED_CONTRIBUTION_PROFIT': {
      const truth = evidence.paymentTruth;
      if (!truth) { problems.push('canonical paymentTruth required'); break; }
      // A hash is integrity only, never provider authentication. Fail closed without an
      // independently connected trusted verifier. No provider is wired by default.
      try { if (typeof verifyClearedPayment !== 'function' || verifyClearedPayment(truth) !== true) problems.push('independent trusted cleared-payment verification required'); }
      catch { problems.push('independent trusted cleared-payment verifier unavailable'); }
      if (truth.status !== 'PROVIDER_CLEARED_PAYMENT_PROVEN') problems.push('payment truth status must be PROVIDER_CLEARED_PAYMENT_PROVEN');
      if (truth?.stages?.PAYMENT_RETAINED?.status !== 'PROVEN') problems.push('payment must be retained (not refunded, disputed or reversed)');
      if (!isHex64(truth.truthDigest) || truth.truthDigest !== canonicalPaymentTruthDigest(truth)) problems.push('payment truth digest missing or does not match its contents');
      if (truth.ok !== true) problems.push('payment truth must be ok');
      if (truth?.stages?.CLEARED_PAYMENT?.status !== 'PROVEN') problems.push('cleared-payment stage must be PROVEN');
      if (Array.isArray(truth.contradictions) && truth.contradictions.length) problems.push('payment truth carries contradictions');
      if (Number(truth?.economics?.reversedRevenueCents ?? 0) !== 0) problems.push('reversed revenue present');
      const refs = Array.isArray(truth.verifiedProviderEventRefs) ? truth.verifiedProviderEventRefs : [];
      if (!refs.length || refs.some(ref => !nonEmpty(ref) || SYNTHETIC_RX.test(ref))) problems.push('non-synthetic verified provider event references required');
      if (amountCents !== null && amountCents !== Number(truth?.economics?.netProviderClearedRevenueCents)) problems.push('amountCents must equal the net provider-cleared revenue in the payment truth');
      if (!Number.isFinite(evidence.attributableCostsCents) || evidence.attributableCostsCents < 0) problems.push('attributableCostsCents >= 0 required: contribution profit is receipts minus attributable costs');
      break;
    }
    default:
      problems.push(`unknown tier ${tier}`);
  }
  return problems;
}

/** Append one entry to a hash-chained ledger. Inadmissible entries are refused, not downgraded silently. */
export function appendRealityEntry(ledger = [], { tier, mechanismId, amountCents, currency = 'USD', evidence = {}, at }, providerAuthority = {}) {
  const problems = evidenceProblems(tier, evidence, { amountCents, ...providerAuthority });
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) problems.push('currency must be an uppercase ISO 4217 code');
  if (!nonEmpty(mechanismId)) problems.push('mechanismId required');
  const seen = moneyRefs(ledger);
  if (moneyRefsOf(tier, evidence).some(ref => seen.has(ref))) problems.push('this provider payment is already in the ledger: one payment counts once');
  if (!Number.isSafeInteger(amountCents)) problems.push('amountCents must be an integer number of cents');
  if (!nonEmpty(at) || Number.isNaN(Date.parse(at))) problems.push('at (ISO timestamp) required');
  if (problems.length) return { ok: false, status: 'REFUSED', tier, problems, ledger };
  const previousHash = ledger.length ? ledger.at(-1).entryHash : '0'.repeat(64);
  const body = { index: ledger.length, tier, mechanismId, amountCents, currency, evidence, at, previousHash };
  const entry = { ...body, entryHash: sha256(body) };
  return { ok: true, status: 'APPENDED', entry, ledger: [...ledger, entry] };
}

// Identities of real money events, so the same payment cannot be counted twice.
function moneyRefsOf(tier, evidence = {}) {
  if (tier === 'COLLECTED_RECEIPTS') return [`collected:${evidence.providerEventRef}`];
  if (tier === 'CLEARED_CONTRIBUTION_PROFIT') return [`cleared:${evidence.paymentTruth?.truthDigest}`, ...(evidence.paymentTruth?.verifiedProviderEventRefs ?? []).map(ref => `cleared-ref:${ref}`)];
  if (tier === 'REALIZED_TRADING') return (evidence.fillIds ?? []).map(id => `fill:${evidence.venue}:${id}`);
  return [];
}
const moneyRefs = ledger => new Set(ledger.flatMap(entry => moneyRefsOf(entry.tier, entry.evidence)));

export function verifyRealityChain(ledger = [], providerAuthority = {}) {
  let previous = '0'.repeat(64);
  const seen = new Set();
  for (const [index, entry] of ledger.entries()) {
    const { entryHash, ...body } = entry;
    if (body.index !== index || body.previousHash !== previous || sha256(body) !== entryHash) return { ok: false, brokenAt: index };
    if (!/^[A-Z]{3}$/.test(body.currency) || evidenceProblems(body.tier, body.evidence, { amountCents: body.amountCents, ...providerAuthority }).length) return { ok: false, brokenAt: index, reason: 'entry evidence no longer admissible' };
    const refs = moneyRefsOf(body.tier, body.evidence);
    if (refs.some(ref => seen.has(ref))) return { ok: false, brokenAt: index, reason: 'payment counted twice' };
    refs.forEach(ref => seen.add(ref));
    previous = entryHash;
  }
  return { ok: true, length: ledger.length, head: previous };
}

/** Per-tier, per-mechanism totals. Tiers are reported side by side and never added together. */
export function summarizeReality(ledger = [], providerAuthority = {}) {
  const chain = verifyRealityChain(ledger, providerAuthority);
  const byTier = Object.fromEntries(REALITY_TIERS.map(tier => [tier, { entries: 0, amountCents: 0, byCurrency: {} }]));
  const byMechanism = {};
  const byMechanismCurrency = {};
  for (const entry of ledger) {
    if (!REALITY_TIERS.includes(entry.tier)) continue;
    const tier = byTier[entry.tier];
    const cents = entry.tier === 'CLEARED_CONTRIBUTION_PROFIT' ? entry.amountCents - (entry.evidence.attributableCostsCents ?? 0) : entry.amountCents;
    tier.entries++;
    tier.byCurrency[entry.currency] = (tier.byCurrency[entry.currency] ?? 0) + cents;
    byMechanismCurrency[entry.mechanismId] ??= Object.fromEntries(REALITY_TIERS.map(t => [t, {}]));
    const bucket = byMechanismCurrency[entry.mechanismId][entry.tier];
    bucket[entry.currency] = (bucket[entry.currency] ?? 0) + cents;
  }
  for (const tier of REALITY_TIERS) {
    const values = Object.values(byTier[tier].byCurrency);
    byTier[tier].amountCents = values.length > 1 ? null : (values[0] ?? 0);
  }
  for (const [mechanism, tiers] of Object.entries(byMechanismCurrency)) {
    byMechanism[mechanism] = Object.fromEntries(Object.entries(tiers).map(([tier, currencies]) => {
      const values = Object.values(currencies);
      return [tier, values.length > 1 ? null : (values[0] ?? 0)];
    }));
  }
  const strongest = [...REALITY_TIERS].reverse().find(tier => byTier[tier].entries > 0) ?? null;
  // An entry that no longer verifies is not money: withhold every amount, keep the counts.
  if (!chain.ok) {
    for (const tier of REALITY_TIERS) Object.assign(byTier[tier], { amountCents: null, byCurrency: {} });
    for (const key of Object.keys(byMechanism)) delete byMechanism[key];
    for (const key of Object.keys(byMechanismCurrency)) delete byMechanismCurrency[key];
  }
  return {
    version: REVENUE_REALITY_LEDGER_VERSION, chain, byTier, byMechanism, byMechanismCurrency,
    amountsWithheld: chain.ok ? null : 'CHAIN_NOT_VERIFIED',
    strongestTierWithEvidence: chain.ok ? strongest : null,
    clearedContributionProfitCents: chain.ok ? byTier.CLEARED_CONTRIBUTION_PROFIT.amountCents : null,
    crossTierTotal: 'NOT_DEFINED: tiers measure different things and are never added',
    businessEffectAuthority: 'NONE', externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS)
  };
}

/**
 * Check a money claim ("FUNDING_CARRY made $120") against the ledger.
 * Returns the strongest tier that actually supports it and the honest wording.
 */
export function checkMoneyClaim(ledger, { mechanismId, claimedTier = 'CLEARED_CONTRIBUTION_PROFIT' }, providerAuthority = {}) {
  const summary = summarizeReality(ledger, providerAuthority);
  const row = summary.byMechanism[mechanismId] ?? null;
  // "Made money" needs a positive amount; a loss at a strong tier is evidence, not support.
  const supported = summary.chain.ok && row ? [...REALITY_TIERS].reverse().find(tier => row[tier] > 0) ?? null : null;
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
