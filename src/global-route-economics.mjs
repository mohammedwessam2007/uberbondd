// ROUTE ECONOMICS: the funnel per route class, from trusted ledgers only.
//
//   route classification, route cost, external API cost, founder minutes,
//   expected reply probability, expected paid-conversion probability,
//   expected contribution, actual qualified positive replies, actual
//   opportunities, actual cleared payments, negative responses, unsubscribes,
//   complaints, bounces.
//
// Truth rules (shared with the outreach economics snapshot):
//   * UNKNOWN stays UNKNOWN: no cost receipts for a class means cost is
//     UNKNOWN, never 0. Founder minutes not recorded are UNKNOWN.
//   * Expected values are labelled PRIORS (they come from the tournament's
//     route-class priors) and are never mixed with measured frequencies.
//   * Actuals count only what the ledgers hold: provider-confirmed sends,
//     classified replies, provider events, provider-reconciled payments.
//   * Attribution needs a stamp. A prospect carries `globalRoute:{routeClass,
//     routeDigest}` once a route decision has been bound to its draft/approval.
//     Nothing writes that stamp today (cold dispatch is intentionally closed),
//     so the honest output until then is NO_ROUTE_ATTRIBUTION_RECORDED with all
//     actuals UNKNOWN, not an invented split.
//
// Read-only. No provider call, no send authority.

import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { ROUTE_CLASS_PRIORS, DEFAULT_ECONOMICS, FITNESS_PRIOR_LABEL } from './global-route-tournament.mjs';
import { reconcilePaymentRenewalTruthFromStore } from './payment-renewal-truth.mjs';

export const ROUTE_ECONOMICS_VERSION = 'uberbond.global-route-economics.v1';

const lower = value => String(value ?? '').trim().toLowerCase();
const asArray = value => (Array.isArray(value) ? value : []);
const UNKNOWN = reason => Object.freeze({ value: null, status: 'UNKNOWN', reason });
const known = value => Object.freeze({ value, status: 'KNOWN_FOR_SUPPLIED_RECEIPTS', reason: null });

export function compileRouteEconomics({
  prospects = [], outboundEvents = [], replies = [], providerEvents = [], costReceipts = [], founderMinutesByRouteClass = null,
  clearedPaymentsByProspect = null, economics = {}, now = new Date()
} = {}) {
  const e = { ...DEFAULT_ECONOMICS, ...(economics || {}) };
  const stamped = asArray(prospects).filter(p => p?.globalRoute && typeof p.globalRoute.routeClass === 'string' && p.globalRoute.routeClass);
  const unstamped = asArray(prospects).length - stamped.length;
  const classOf = new Map(stamped.map(p => [String(p.id), p.globalRoute.routeClass]));
  const emailClass = new Map(stamped.filter(p => p.contact?.email).map(p => [lower(p.contact.email), p.globalRoute.routeClass]));
  const classes = [...new Set(stamped.map(p => p.globalRoute.routeClass))].sort();

  const classForProspect = row => classOf.get(String(row?.prospectId || '')) || emailClass.get(lower(row?.recipientEmail || row?.leadEmail || '')) || null;
  const byClass = {};
  for (const cls of classes) {
    const priors = ROUTE_CLASS_PRIORS[cls];
    const classProspects = stamped.filter(p => p.globalRoute.routeClass === cls);
    const sends = asArray(outboundEvents).filter(ev => lower(ev?.eventType) === 'sent' && classForProspect(ev) === cls).length;
    const repliesFor = asArray(replies).filter(r => classForProspect(r) === cls);
    const label = r => lower(r?.classification?.label || r?.label);
    const pevents = asArray(providerEvents).filter(ev => classForProspect(ev) === cls);
    const receipts = asArray(costReceipts).filter(r => r?.routeClass === cls);
    const knownReceipts = receipts.filter(r => typeof r.costCents === 'number' && Number.isFinite(r.costCents) && r.costCents >= 0);
    const monetary = !receipts.length ? UNKNOWN('no-cost-receipts-for-route-class') : knownReceipts.length === receipts.length ? known(knownReceipts.reduce((s, r) => s + r.costCents, 0)) : UNKNOWN('some-cost-receipts-unknown');
    const external = receipts.filter(r => lower(r.stage) === 'discovery' || lower(r.stage) === 'enrichment' || lower(r.stage) === 'verification');
    const externalKnown = external.length && external.every(r => typeof r.costCents === 'number' && Number.isFinite(r.costCents) && r.costCents >= 0);
    const minutes = founderMinutesByRouteClass && Number.isFinite(Number(founderMinutesByRouteClass[cls])) ? known(Number(founderMinutesByRouteClass[cls])) : UNKNOWN('founder-minutes-not-recorded');
    const cleared = clearedPaymentsByProspect ? classProspects.map(p => clearedPaymentsByProspect.get?.(String(p.id)) || clearedPaymentsByProspect[String(p.id)]).filter(Boolean) : null;
    byClass[cls] = {
      routeClass: cls,
      prospects: classProspects.length,
      routeCostCents: monetary,
      externalApiCostCents: external.length ? (externalKnown ? known(external.reduce((s, r) => s + r.costCents, 0)) : UNKNOWN('some-api-cost-receipts-unknown')) : UNKNOWN('no-api-cost-receipts-for-route-class'),
      founderMinutes: minutes,
      expected: priors ? {
        replyProbability: Math.min(0.95, Number(e.baseReplyRate) * priors.replyMultiplier),
        paidConversionProbability: Number(e.paidConversionGivenReply),
        contributionCents: (e.dealContributionCents !== null && e.dealContributionCents !== undefined && e.dealContributionCents !== '' && Number.isFinite(Number(e.dealContributionCents))) ? Math.round(Math.min(0.95, Number(e.baseReplyRate) * priors.replyMultiplier) * Number(e.paidConversionGivenReply) * Number(e.dealContributionCents)) : null,
        label: FITNESS_PRIOR_LABEL
      } : { replyProbability: null, paidConversionProbability: null, contributionCents: null, label: FITNESS_PRIOR_LABEL },
      actual: {
        providerConfirmedSends: sends,
        qualifiedPositiveReplies: repliesFor.filter(r => label(r) === 'positive').length,
        opportunities: classProspects.filter(p => ['opportunity', 'meeting', 'offer', 'invoice', 'paid', 'delivery', 'accepted', 'recurring'].includes(lower(p.opportunityStage))).length,
        negativeResponses: repliesFor.filter(r => ['negative', 'objection', 'wrong_person'].includes(label(r))).length,
        unsubscribes: repliesFor.filter(r => label(r) === 'optout').length + pevents.filter(ev => /unsub/.test(lower(ev.eventType))).length,
        complaints: pevents.filter(ev => /complaint|spam_report|spamreport/.test(lower(ev.eventType))).length,
        bounces: pevents.filter(ev => /bounce/.test(lower(ev.eventType))).length,
        clearedPayments: cleared === null ? UNKNOWN('per-prospect-provider-cleared-payments-not-read') : known(cleared.reduce((s, c) => s + (Number(c.verifiedPaymentCount) || 0), 0)),
        clearedNetCents: cleared === null ? UNKNOWN('per-prospect-provider-cleared-payments-not-read') : known(cleared.reduce((s, c) => s + (Number(c.netCents) || 0), 0))
      }
    };
  }
  return Object.freeze({
    version: ROUTE_ECONOMICS_VERSION,
    generatedAt: new Date(now).toISOString(),
    attribution: { status: stamped.length ? 'ATTRIBUTED' : 'NO_ROUTE_ATTRIBUTION_RECORDED', stampedProspects: stamped.length, unstampedProspects: unstamped, stampWriter: 'NONE_ACTIVE__AWAITING_GOVERNED_DRAFT_STEP' },
    byRouteClass: byClass,
    readOnly: true, sendAuthority: false, externalEffectAuthority: 'NONE', externalEffects: 0, externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
    truthBoundary: 'Unknown cost is UNKNOWN, never zero. Expected figures are labelled priors, not measurements. Actuals count only ledger facts, and attribution requires a route stamp that nothing writes until the governed draft step binds one; until then no split by route class is invented.'
  });
}

export async function buildRouteEconomics({ store, costReceipts = [], founderMinutesByRouteClass = null, economics = {}, now = new Date() } = {}) {
  if (!store || typeof store.list !== 'function') throw new Error('store-required');
  const [prospects, outboundEvents, replies, providerEvents] = await Promise.all([store.list('prospects'), store.list('outboundEvents'), store.list('replies'), store.list('providerEvents')]);
  let cleared = null;
  const stamped = asArray(prospects).filter(p => p?.globalRoute?.routeClass && p.leadId);
  if (stamped.length) {
    cleared = new Map();
    for (const p of stamped) {
      try {
        const truth = await reconcilePaymentRenewalTruthFromStore(store, { leadId: p.leadId });
        const econ = truth?.economics;
        if (econ) cleared.set(String(p.id), { verifiedPaymentCount: econ.verifiedPaymentCount, netCents: econ.currency === 'USD' ? econ.byCurrency?.USD?.netCents : null });
      } catch { cleared = null; break; }
    }
  }
  return compileRouteEconomics({ prospects, outboundEvents, replies, providerEvents, costReceipts, founderMinutesByRouteClass, clearedPaymentsByProspect: cleared, economics, now });
}
