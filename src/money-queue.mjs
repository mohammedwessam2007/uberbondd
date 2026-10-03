// Canonical Money Queue: the single ranked answer to "who is worth a governed
// first touch next, and why". It composes -- never replaces -- the existing
// qualification pipeline (fit + admissibility), offer genome (offer fit) and
// contact history (prior effects). Demand evidence (explicit demand, switch
// windows, stacked signals) only RANKS candidates that are already admissible;
// it can never admit one the gates refused.
//
// Pure and deterministic: no I/O, no clock reads except the injected `now`.
// Authority: none. Ranking is not permission.
import { createHash } from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const MONEY_QUEUE_VERSION = 'uberbond.money-queue.v1';

// kind -> { cls: independence class, weight, halfLifeDays }
// Explicit demand = the buyer publicly stated a need/intent. Switch window = a
// structural moment when incumbents are being re-evaluated. Both decay: stale
// demand is not demand.
export const SIGNAL_KINDS = Object.freeze({
  explicit_demand_rfp:        { cls: 'buyer_statement', weight: 1.0,  halfLifeDays: 21, explicit: true },
  explicit_demand_inbound:    { cls: 'buyer_statement', weight: 1.0,  halfLifeDays: 14, explicit: true },
  explicit_demand_hiring:     { cls: 'buyer_statement', weight: 0.7,  halfLifeDays: 45, explicit: true },
  switch_window_vendor_change:{ cls: 'switch_window',   weight: 0.8,  halfLifeDays: 30 },
  switch_window_leadership:   { cls: 'switch_window',   weight: 0.55, halfLifeDays: 60 },
  switch_window_funding:      { cls: 'switch_window',   weight: 0.5,  halfLifeDays: 60 },
  observed_defect:            { cls: 'observed_problem',weight: 0.8,  halfLifeDays: 30 },
  public_complaint:           { cls: 'observed_problem',weight: 0.6,  halfLifeDays: 30 },
  tech_change:                { cls: 'observed_problem',weight: 0.45, halfLifeDays: 90 },
  firmographic_fit:           { cls: 'static_fit',      weight: 0.3,  halfLifeDays: 365 }
});

const clamp01 = x => Math.max(0, Math.min(1, x));
const round = (x, p = 4) => Math.round(x * 10 ** p) / 10 ** p;
const DAY = 86400000;

/** Freshness-weighted strength of one signal in [0,weight]. Unknown kinds and
 * undated or future-dated signals contribute nothing: unknown stays unknown. */
export function signalStrength(signal, now) {
  const def = SIGNAL_KINDS[signal?.kind];
  if (!def) return { strength: 0, reason: 'UNKNOWN_SIGNAL_KIND' };
  const observed = Date.parse(signal.observedAt);
  if (!Number.isFinite(observed)) return { strength: 0, reason: 'UNDATED_SIGNAL' };
  if (observed > now + 60000) return { strength: 0, reason: 'FUTURE_DATED_SIGNAL' };
  if (!signal.evidenceRef) return { strength: 0, reason: 'NO_EVIDENCE_REF' };
  const ageDays = Math.max(0, (now - observed) / DAY);
  const decay = 0.5 ** (ageDays / def.halfLifeDays);
  return { strength: def.weight * decay, decay: round(decay), ageDays: round(ageDays, 1), cls: def.cls, explicit: Boolean(def.explicit) };
}

/** Stack signals with independence discounting: within one class only the
 * strongest counts fully (correlated evidence), further same-class signals close
 * only 25% of the remaining gap; different classes add independently (noisy-OR). */
export function stackSignals(signals = [], now = Date.now()) {
  const byClass = new Map();
  const detail = [];
  for (const s of signals) {
    const r = signalStrength(s, now);
    detail.push({ kind: s?.kind, evidenceRef: s?.evidenceRef, ...r });
    if (r.strength <= 0) continue;
    const list = byClass.get(r.cls) || [];
    list.push(r.strength);
    byClass.set(r.cls, list);
  }
  let miss = 1;
  const classes = {};
  for (const [cls, list] of byClass) {
    list.sort((a, b) => b - a);
    // strongest counts fully; each further same-class signal only closes 25% of the remaining gap
    const eff = clamp01(list.slice(1).reduce((acc, x) => 1 - (1 - acc) * (1 - 0.25 * x), list[0]));
    classes[cls] = round(eff);
    miss *= 1 - eff;
  }
  return { score: round(1 - miss), classes, detail, explicitDemand: detail.some(d => d.explicit && d.strength > 0) };
}

/** Conservative demand-to-conversion mapping. Without measured cleared revenue
 * the point estimate is a deliberately low prior shrunk toward zero; with
 * measured outcomes the Wilson lower bound replaces it. Never an optimistic
 * guess. */
export function conservativeConversion({ demandScore, observedSends = 0, observedPaid = 0 }) {
  const prior = 0.002 + 0.02 * clamp01(demandScore); // 0.2%..2.2% first-touch-to-paid prior
  if (observedSends < 30) return { probability: round(prior * 0.5, 5), basis: 'PRIOR_SHRUNK_NO_MEASURED_OUTCOMES', measured: false };
  const n = observedSends; const p = observedPaid / n; const z = 1.645;
  const lower = (p + z * z / (2 * n) - z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n)) / (1 + z * z / n);
  return { probability: round(Math.max(0, lower), 5), basis: 'WILSON_LOWER_BOUND_MEASURED', measured: true };
}

/**
 * candidates: [{ prospectId, qualification, offerFit, contactHistory, signals,
 *               economics:{ listPriceCents, deliveryMinutes }, buyer:{role,resolved} }]
 * qualification: output of qualifyProspect(); contactHistory: {usable:boolean, priorEffect:boolean}
 */
export function compileMoneyQueue({ candidates = [], now = Date.now(), outcomes = {}, founderMinuteCostCents = 6000 / 60, limit = 100 } = {}) {
  const ranked = [];
  const excluded = [];
  for (const c of candidates) {
    const id = String(c?.prospectId || '');
    const reasons = [];
    if (!id) reasons.push('MISSING_PROSPECT_ID');
    if (!c?.qualification || c.qualification.eligible !== true) reasons.push('NOT_QUALIFIED', ...(c?.qualification?.blocks || []));
    if (!c?.contactHistory || c.contactHistory.usable !== true) reasons.push('CONTACT_HISTORY_UNVERIFIED');
    if (c?.contactHistory?.priorEffect === true) reasons.push('PRIOR_EFFECT_UNRESOLVED');
    if (!c?.offerFit?.offerId) reasons.push('NO_OFFER_FIT');
    if (!c?.buyer?.resolved) reasons.push('BUYER_UNRESOLVED');
    if (reasons.length) { excluded.push({ prospectId: id, reasons: [...new Set(reasons)] }); continue; }

    const stack = stackSignals(c.signals || [], now);
    const fit = clamp01(Number(c.offerFit.score ?? 0));
    const quality = clamp01(Number(c.qualification.score ?? 0));
    const demand = stack.score;
    // Multiplicative: any missing dimension collapses the rank. Evidence
    // quality is a multiplier so thin evidence cannot be outweighed by a loud signal.
    const evidenceQuality = clamp01(Number(c.qualification.evidenceQuality ?? 0));
    const conv = conservativeConversion({ demandScore: demand, observedSends: outcomes.sends || 0, observedPaid: outcomes.paid || 0 });
    const price = Math.max(0, Number(c.economics?.listPriceCents || 0));
    const minutes = Math.max(0, Number(c.economics?.deliveryMinutes || 0));
    const expectedContributionCents = conv.probability * (price - minutes * founderMinuteCostCents);
    const base = demand * 0.4 + fit * 0.25 + quality * 0.15 + evidenceQuality * 0.2;
    const rankScore = base * (0.3 + 0.7 * evidenceQuality) * (stack.explicitDemand ? 1.15 : 1);
    ranked.push({
      prospectId: id,
      offerId: c.offerFit.offerId,
      rank: 0,
      rankScore: round(rankScore),
      lane: stack.explicitDemand ? 'EXPLICIT_DEMAND' : demand > 0 ? 'SIGNAL_STACK' : 'FIT_ONLY',
      explanation: {
        demand: { score: demand, classes: stack.classes, signals: stack.detail },
        offerFit: { offerId: c.offerFit.offerId, score: fit },
        qualification: { score: quality, evidenceQuality, tier: c.qualification.tier },
        conversion: conv,
        expectedContributionCents: round(expectedContributionCents, 2),
        expectedContributionBasis: conv.measured ? 'MEASURED_LOWER_BOUND' : 'CONSERVATIVE_PRIOR_NOT_REVENUE'
      },
      outboundAuthority: 'NONE'
    });
  }
  ranked.sort((a, b) => b.rankScore - a.rankScore || a.prospectId.localeCompare(b.prospectId));
  ranked.forEach((r, i) => { r.rank = i + 1; });
  const items = ranked.slice(0, limit);
  const digest = createHash('sha256').update(JSON.stringify(items.map(i => [i.prospectId, i.offerId, i.rankScore]))).digest('hex');
  return {
    ok: true, version: MONEY_QUEUE_VERSION, generatedAt: new Date(now).toISOString(), digest,
    items, excluded, counts: { ranked: ranked.length, shown: items.length, excluded: excluded.length },
    zeroRevenueModel: { measuredPaid: outcomes.paid || 0, measuredSends: outcomes.sends || 0, note: 'Expected contribution is a conservative prior until measured cleared outcomes exist; it is not revenue.' },
    outboundAuthority: 'NONE', businessEffectAuthority: 'NONE', externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}
