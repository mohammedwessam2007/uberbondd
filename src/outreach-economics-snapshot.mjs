// Production-reachable outreach economics, built on the EXISTING owners:
//   - compileOutreachEconomics          (funnel counts, cost receipts by stage/provider)
//   - reconcilePaymentRenewalTruthFromStore (provider-reconciled cleared revenue, refunds)
// It adds no ledger and no accounting engine. It only guarantees the two rules
// the compiler alone does not enforce at the surface:
//   1. UNKNOWN stays UNKNOWN: with no cost receipts every cost-denominated
//      metric is null/UNKNOWN, never 0; partial coverage is labelled a lower bound.
//   2. Revenue is provider-reconciled net cleared revenue only. An order whose
//      status merely says "completed" (a checkout) is not cleared revenue.
// Read-only: store.list / store.get only. No provider call, no send authority.
import { compileOutreachEconomics } from './ubereconomics-outreach.mjs';
import { reconcilePaymentRenewalTruthFromStore } from './payment-renewal-truth.mjs';

export const OUTREACH_ECONOMICS_SNAPSHOT_VERSION = 'uberbond.outreach-economics-snapshot.v1';

const asArray = value => (Array.isArray(value) ? value : []);
const lower = value => String(value ?? '').trim().toLowerCase();
// Coverage labels owned by compileOutreachEconomics, named once here.
const COVERAGE = Object.freeze({ NONE: 'NO_COST_RECEIPTS', PARTIAL: 'PARTIAL_COST_COVERAGE', COMPLETE: 'COST_RECEIPTS_COMPLETE_FOR_SUPPLIED_EVENTS' });
const UNKNOWN = reason => Object.freeze({ value: null, status: 'UNKNOWN', reason });

function ratio(numerator, denominator, coverage, label) {
  if (coverage === COVERAGE.NONE) return UNKNOWN('no-cost-data-supplied');
  if (!denominator) return UNKNOWN(`no-${label}-yet`);
  const value = Number((numerator / denominator).toFixed(2));
  return Object.freeze({ value, status: coverage === COVERAGE.PARTIAL ? 'LOWER_BOUND_PARTIAL_COST' : 'KNOWN_FOR_SUPPLIED_COST_RECEIPTS', reason: null });
}

export function compileOutreachEconomicsSnapshot({
  prospects = [], messages = [], replies = [], outboundEvents = [], orders = [], costReceipts = [], paymentTruth = null, ownerMinutes = null, now = new Date()
} = {}) {
  // USD-only: a receipt in another or an unstated currency is an unknown cost, not a guess.
  const usdReceipts = asArray(costReceipts).map(row => (lower(row?.currency) === 'usd' ? row : { ...row, costCents: null }));
  const base = compileOutreachEconomics({ prospects, messages, replies, orders: [], costReceipts: usdReceipts, ownerMinutes: 0 });
  const coverage = base.costs.costCoverageStatus;
  const providerConfirmedSends = asArray(outboundEvents).filter(event => lower(event?.eventType) === 'sent').length;
  const eligibleProspects = asArray(prospects).filter(row => /^allow/i.test(String(row?.recipientEligibility?.decision || row?.legalEligibility?.decision || ''))).length;
  const opportunities = base.counts.qualifiedConversations;
  const positive = base.counts.positiveReplies;
  const econ = paymentTruth?.economics || null;
  const singleCurrency = econ?.currency || null;
  const netClearedCents = econ ? econ.netProviderClearedRevenueCents : null;
  const totalCost = base.costs.totalCostCents;

  const revenue = !econ
    ? { status: 'UNKNOWN', reason: 'payment-truth-not-read', netProviderClearedRevenueCents: null, currency: null }
    : { status: econ.verifiedPaymentCount > 0 ? 'PROVIDER_CLEARED' : 'NONE_CLEARED', netProviderClearedRevenueCents: netClearedCents, currency: singleCurrency, currenciesPresent: econ.currenciesPresent, byCurrency: econ.byCurrency, verifiedPaymentCount: econ.verifiedPaymentCount, verifiedReversalCount: econ.verifiedReversalCount, unverifiedPositiveRevenueCents: econ.unverifiedPositiveRevenueCents };
  // Cost is USD cents; contribution needs a single USD revenue currency and known cost.
  const usdNet = econ && singleCurrency === 'USD' ? netClearedCents : (econ && econ.verifiedPaymentCount === 0 ? 0 : null);
  const contributionKnown = coverage === COVERAGE.COMPLETE && usdNet !== null;
  const contributionCents = contributionKnown ? usdNet - totalCost : null;
  const minutes = Number.isFinite(Number(ownerMinutes)) && Number(ownerMinutes) > 0 ? Number(ownerMinutes) : null;

  return Object.freeze({
    version: OUTREACH_ECONOMICS_SNAPSHOT_VERSION,
    generatedAt: new Date(now).toISOString(),
    counts: { prospects: base.counts.prospects, verifiedContacts: base.counts.verifiedContacts, eligibleProspects, providerConfirmedSends, positiveReplies: positive, opportunities, clearedPayments: econ ? econ.verifiedPaymentCount : null, refundsOrDisputes: econ ? econ.verifiedReversalCount : null },
    costs: { totalCostCents: coverage === COVERAGE.NONE ? null : totalCost, coverage, unknownCostCount: base.costs.unknownCostCount, byStage: coverage === COVERAGE.NONE ? null : base.costs.byStage, byProvider: coverage === COVERAGE.NONE ? null : base.costs.byProvider },
    revenue,
    unitEconomics: {
      costPerVerifiedProspectCents: ratio(totalCost, base.counts.verifiedContacts, coverage, 'verified-prospect'),
      costPerEligibleProspectCents: ratio(totalCost, eligibleProspects, coverage, 'eligible-prospect'),
      costPerProviderConfirmedSendCents: ratio(totalCost, providerConfirmedSends, coverage, 'provider-confirmed-send'),
      costPerQualifiedPositiveReplyCents: ratio(totalCost, positive, coverage, 'qualified-positive-reply'),
      costPerOpportunityCents: ratio(totalCost, opportunities, coverage, 'opportunity'),
      costPerClearedDollarCents: !contributionKnown || !usdNet || usdNet <= 0 ? UNKNOWN(coverage === COVERAGE.NONE ? 'no-cost-data-supplied' : 'no-cleared-usd-revenue-yet') : Object.freeze({ value: Number((totalCost / (usdNet / 100)).toFixed(2)), status: 'KNOWN_FOR_SUPPLIED_COST_RECEIPTS', reason: null }),
      clearedContributionPer1000SendsCents: !contributionKnown || !providerConfirmedSends ? UNKNOWN(!providerConfirmedSends ? 'no-provider-confirmed-sends-yet' : 'cost-or-revenue-not-fully-known') : Object.freeze({ value: Number(((contributionCents / providerConfirmedSends) * 1000).toFixed(2)), status: 'KNOWN_FOR_SUPPLIED_COST_RECEIPTS', reason: null }),
      clearedContributionPerFounderMinuteCents: !contributionKnown || !minutes ? UNKNOWN(!minutes ? 'founder-minutes-not-recorded' : 'cost-or-revenue-not-fully-known') : Object.freeze({ value: Number((contributionCents / minutes).toFixed(2)), status: 'KNOWN_FOR_SUPPLIED_COST_RECEIPTS', reason: null })
    },
    contributionCents: contributionKnown ? contributionCents : null,
    contributionStatus: contributionKnown ? 'KNOWN_FOR_SUPPLIED_COST_RECEIPTS' : 'UNKNOWN',
    readOnly: true, sendAuthority: false, externalEffects: 0,
    truthBoundary: 'Unknown costs stay UNKNOWN: with no cost receipts every cost-denominated metric is null, never zero. Revenue is provider-reconciled net cleared revenue only; sends, replies, opportunities, checkouts and orders that merely read "completed" never become revenue. Opens are not measured or optimized.'
  });
}

export async function buildOutreachEconomicsSnapshot({ store, costReceipts = [], ownerMinutes = null, now = new Date() } = {}) {
  if (!store || typeof store.list !== 'function') throw new Error('store-required');
  const [prospects, messages, replies, outboundEvents, orders] = await Promise.all([
    store.list('prospects'), store.list('messages'), store.list('replies'), store.list('outboundEvents'), store.list('orders')
  ]);
  let paymentTruth = null;
  try { paymentTruth = await reconcilePaymentRenewalTruthFromStore(store, {}); } catch { paymentTruth = null; }
  return compileOutreachEconomicsSnapshot({ prospects, messages, replies, outboundEvents, orders, costReceipts, paymentTruth, ownerMinutes, now });
}
