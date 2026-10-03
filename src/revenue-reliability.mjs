// Revenue Reliability layer: statistics that keep the commercial loop honest.
// Recommendation-only. Nothing here sends, spends or changes authority.
//   - wilson(): conservative interval, so tiny samples never look like facts
//   - correlationFirewall(): signals/evidence sharing an upstream source count once
//   - localizeFailure(): the EARLIEST funnel stage that is statistically broken
//   - marketEscape(): when a segment/channel/offer should be left (not retried)
//   - allocateContextual(): champion/challenger split with conservative bounds
//   - counterfactualAutopsy(): loss review that refuses causal claims w/o holdout
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const REVENUE_RELIABILITY_VERSION = 'uberbond.revenue-reliability.v1';
export const FUNNEL = Object.freeze(['SENT', 'DELIVERED', 'REPLIED', 'QUALIFIED_REPLY', 'PRICED', 'PAID', 'ACCEPTED']);
const Z = 1.645;
const r4 = x => Math.round(x * 1e4) / 1e4;

export function wilson(successes, n, z = Z) {
  if (!(n > 0)) return { n: 0, p: null, lower: 0, upper: 1 };
  const s = Math.max(0, Math.min(successes, n)); const p = s / n; const d = 1 + z * z / n;
  const c = p + z * z / (2 * n); const m = z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n);
  return { n, p: r4(p), lower: r4(Math.max(0, (c - m) / d)), upper: r4(Math.min(1, (c + m) / d)) };
}

/** Evidence items carry `sourceKey` (the upstream origin). Items sharing a key
 * are one observation, not many: ten copies of one directory listing are one. */
export function correlationFirewall(items = []) {
  const groups = new Map();
  for (const it of items) {
    const key = String(it?.sourceKey || it?.evidenceRef || '').trim();
    const k = key || `__unkeyed_${groups.size}`;
    (groups.get(k) || groups.set(k, []).get(k)).push(it);
  }
  const unkeyed = items.filter(i => !String(i?.sourceKey || i?.evidenceRef || '').trim()).length;
  return {
    rawCount: items.length, independentCount: groups.size,
    collapsed: items.length - groups.size,
    unkeyedTreatedAsIndependentButFlagged: unkeyed,
    groups: [...groups].map(([sourceKey, g]) => ({ sourceKey, count: g.length }))
  };
}

/** counts: { SENT, DELIVERED, ... } cumulative per stage. Expected floors are
 * the lowest conversion we would accept; a stage is BROKEN only when even the
 * optimistic bound (Wilson upper) is below the floor with an adequate sample. */
export function localizeFailure(counts = {}, floors = {}, { minSample = 30 } = {}) {
  const defaults = { DELIVERED: 0.9, REPLIED: 0.02, QUALIFIED_REPLY: 0.25, PRICED: 0.4, PAID: 0.15, ACCEPTED: 0.8 };
  const f = { ...defaults, ...floors };
  const stages = [];
  let firstBroken = null; let firstUnknown = null;
  for (let i = 1; i < FUNNEL.length; i++) {
    const from = counts[FUNNEL[i - 1]] || 0; const to = counts[FUNNEL[i]] || 0;
    const w = wilson(to, from);
    let status = 'OK';
    if (from < minSample) status = 'INSUFFICIENT_SAMPLE';
    else if (w.upper < f[FUNNEL[i]]) status = 'BROKEN';
    stages.push({ stage: FUNNEL[i], from, to, ...w, floor: f[FUNNEL[i]], status });
    if (status === 'BROKEN' && !firstBroken) firstBroken = FUNNEL[i];
    if (status === 'INSUFFICIENT_SAMPLE' && !firstUnknown) firstUnknown = FUNNEL[i];
  }
  return {
    stages, earliestBrokenStage: firstBroken,
    verdict: firstBroken ? 'ATTACK_EARLIEST_BROKEN_STAGE' : firstUnknown ? 'UNKNOWN_COLLECT_MORE_BEFORE_CHANGING_ANYTHING' : 'NO_BROKEN_STAGE_DETECTED',
    note: 'A downstream stage is never blamed while an upstream stage is broken or unmeasured.',
    advisoryOnly: true
  };
}

/** Leave a market only on evidence, and never on a tiny sample. */
export function marketEscape({ sends = 0, positiveReplies = 0, paid = 0, complaints = 0, hardBounces = 0, minSends = 60, floorPositive = 0.01 } = {}) {
  const pos = wilson(positiveReplies, sends);
  const safety = complaints > 0 || (sends > 0 && hardBounces / sends > 0.03);
  if (safety) return { decision: 'PAUSE_AND_INVESTIGATE', reason: complaints > 0 ? 'complaint-observed' : 'hard-bounce-rate-above-3pct', positive: pos, advisoryOnly: true };
  if (sends < minSends) return { decision: 'KEEP_TESTING', reason: 'insufficient-sample', positive: pos, advisoryOnly: true };
  if (paid === 0 && pos.upper < floorPositive) return { decision: 'ESCAPE_MARKET_PRESERVE_RESURRECTION_CONDITION', reason: 'upper-bound-of-positive-rate-below-floor', positive: pos, advisoryOnly: true };
  return { decision: 'KEEP_TESTING', reason: 'bounds-not-conclusive', positive: pos, advisoryOnly: true };
}

/** Champion gets the bulk; challengers get a bounded exploration share that
 * shrinks as the champion's lower bound proves itself. Deterministic. */
export function allocateContextual(arms = [], { totalSlots = 10, minExplore = 0.1, maxExplore = 0.3 } = {}) {
  if (!arms.length || totalSlots <= 0) return { allocations: [], champion: null, advisoryOnly: true };
  const scored = arms.map(a => { const w = wilson(a.positive || 0, a.sends || 0); return { ...a, w, score: a.sends ? w.lower : 0 }; })
    .sort((x, y) => y.score - x.score || String(x.id).localeCompare(String(y.id)));
  const champ = scored[0];
  const explore = Math.max(minExplore, Math.min(maxExplore, 0.3 - champ.score * 2));
  const challengerSlots = scored.length > 1 ? Math.max(1, Math.round(totalSlots * explore)) : 0;
  const champSlots = totalSlots - challengerSlots;
  // challengers share by optimistic bound (information value), not by hype
  const ch = scored.slice(1); const weights = ch.map(a => 0.05 + a.w.upper); const wsum = weights.reduce((a, b) => a + b, 0) || 1;
  const allocations = [{ id: champ.id, role: 'CHAMPION', slots: champSlots }];
  let left = challengerSlots;
  ch.forEach((a, i) => { const s = i === ch.length - 1 ? left : Math.min(left, Math.round(challengerSlots * weights[i] / wsum)); left -= s; allocations.push({ id: a.id, role: 'CHALLENGER', slots: s }); });
  return { allocations, champion: champ.id, exploreShare: r4(explore), advisoryOnly: true };
}

export function counterfactualAutopsy({ outcome = 'LOST', treated = null, holdout = null, notes = [] } = {}) {
  const have = treated && holdout && treated.n >= 30 && holdout.n >= 30;
  if (!have) return { outcome, causalClaim: 'NOT_ESTABLISHED', reason: holdout ? 'sample-too-small' : 'no-holdout', lesson: 'Record the observation; do not attribute cause.', notes, advisoryOnly: true };
  const a = wilson(treated.positive, treated.n); const b = wilson(holdout.positive, holdout.n);
  const separated = a.lower > b.upper || b.lower > a.upper;
  return { outcome, causalClaim: separated ? (a.lower > b.upper ? 'TREATMENT_BETTER_NON_OVERLAPPING_BOUNDS' : 'HOLDOUT_BETTER_NON_OVERLAPPING_BOUNDS') : 'NOT_ESTABLISHED', treated: a, holdout: b, notes, advisoryOnly: true };
}

export const reliabilityEnvelope = body => ({ ...body, version: REVENUE_RELIABILITY_VERSION, outboundAuthority: 'NONE', externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS } });
