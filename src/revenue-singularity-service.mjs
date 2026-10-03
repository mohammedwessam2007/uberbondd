// Read/plan service that binds the Revenue Singularity modules to the store.
// Every function is read-only except `ingestDemandSignal` (appends one
// validated, evidence-referenced signal to a prospect) and the G-SPOT run
// bookkeeping inside createGspot. Nothing here sends, spends or deploys.
import { qualifyProspect } from './prospect-qualification-pipeline.mjs';
import { selectUberReplyOffer } from './uberreply-four-offer-genome.mjs';
import { compileMoneyQueue, SIGNAL_KINDS } from './money-queue.mjs';
import { compileReplyRadar } from './reply-radar.mjs';
import { compileProofLineage } from './proof-factory.mjs';
import { createGspot } from './gspot.mjs';
import { buildConstellation, xray as xrayProspect, collectEvents } from './revenue-constellation.mjs';
import { localizeFailure, marketEscape, wilson, reliabilityEnvelope } from './revenue-reliability.mjs';

const pick = (o, ...k) => k.map(x => o?.[x]).find(v => v !== undefined && v !== null && v !== '');
const listSafe = async (store, key) => { try { return await store.list(key); } catch { return []; } };

export async function snapshot(store, now = Date.now()) {
  const [prospects, outboundEvents, replies, senderHealth, leads, suppressions] = await Promise.all(
    ['prospects', 'outboundEvents', 'replies', 'senderHealth', 'leads', 'suppressions'].map(k => listSafe(store, k)));
  return { prospects, outboundEvents, replies, senderHealth, leads, suppressions, now };
}

export function radarFromSnapshot(s) {
  return compileReplyRadar({
    now: s.now,
    replies: s.replies.map(r => ({ id: r.id, gmailId: r.gmailId, prospectId: r.prospectId, body: pick(r, 'body', 'text', 'snippet') || '', receivedAt: pick(r, 'receivedAt', 'createdAt') }))
  });
}

/** Candidates come only from prospects that already carry the evidence the
 * existing gates need. Anything lacking it is excluded with a reason; nothing is
 * inferred or fabricated here. */
export function moneyQueueFromSnapshot(s, { limit = 100 } = {}) {
  const suppressed = new Set(s.suppressions.map(x => String(x.email || x.address || '').toLowerCase()).filter(Boolean));
  const sentTo = new Set(s.outboundEvents.filter(e => e.eventType === 'sent').map(e => e.prospectId));
  const candidates = s.prospects.map(p => {
    const email = String(pick(p.contact || {}, 'email') || p.email || '').toLowerCase();
    const qualification = p.evidenceBundle
      ? qualifyProspect({ bundle: p.evidenceBundle, observations: p.observations || {}, date: new Date(s.now) })
      : { eligible: false, blocks: ['no-evidence-bundle'] };
    const sel = selectUberReplyOffer({ industry: p.industry, tags: p.tags, fitEvidenceConfidence: p.fitEvidenceConfidence ?? p.problemEvidenceScore ?? 0, ...p });
    return {
      prospectId: p.id, qualification,
      offerFit: sel.selected ? { offerId: sel.offer.offerId, score: sel.fit.score } : {},
      contactHistory: { usable: p.contactHistoryVerified === true && !suppressed.has(email), priorEffect: sentTo.has(p.id) },
      buyer: { resolved: Boolean(email && (p.contact?.role || p.buyerRole)), role: p.contact?.role || p.buyerRole || null },
      signals: p.demandSignals || [],
      economics: { listPriceCents: Number(sel.offer?.standardPriceUsd || 0) * 100, deliveryMinutes: Number(sel.offer?.deliveryMinutes || 90) }
    };
  });
  const sends = s.outboundEvents.filter(e => e.eventType === 'sent').length;
  const paid = s.leads.filter(l => l.paymentStatus === 'paid' && (l.paymentEvidenceRef || l.providerTransactionId || l.providerEventId)).length;
  return compileMoneyQueue({ candidates, now: s.now, outcomes: { sends, paid }, limit });
}

export function reliabilityFromSnapshot(s) {
  const ev = s.outboundEvents;
  const sent = ev.filter(e => e.eventType === 'sent').length;
  const bounces = ev.filter(e => e.eventType === 'hard_bounce').length;
  const complaints = ev.filter(e => e.eventType === 'complaint').length;
  const replied = new Set(s.replies.map(r => r.prospectId).filter(Boolean)).size;
  const paid = s.leads.filter(l => l.paymentStatus === 'paid' && (l.paymentEvidenceRef || l.providerTransactionId || l.providerEventId)).length;
  const counts = { SENT: sent, DELIVERED: Math.max(0, sent - bounces), REPLIED: replied, QUALIFIED_REPLY: 0, PRICED: 0, PAID: paid, ACCEPTED: 0 };
  const radar = radarFromSnapshot(s);
  counts.QUALIFIED_REPLY = radar.items.filter(i => i.label === 'positive').length;
  return reliabilityEnvelope({
    counts, funnel: localizeFailure(counts),
    escape: marketEscape({ sends: sent, positiveReplies: counts.QUALIFIED_REPLY, paid, complaints, hardBounces: bounces }),
    positiveRate: wilson(counts.QUALIFIED_REPLY, sent),
    note: 'Advisory only. QUALIFIED_REPLY counts radar-classified positive replies; PRICED and ACCEPTED are not yet measured and stay 0 (unknown).'
  });
}

export function constellationFromSnapshot(s, { at = null, expand = null, gspotRun = null, infra = [] } = {}) {
  const radar = radarFromSnapshot(s);
  const moneyQueue = moneyQueueFromSnapshot(s);
  return buildConstellation({ ...s, radar, moneyQueue, gspotRun, infra, at, expand });
}

export function xrayFromSnapshot(s, prospectId, gspotRun = null) {
  return xrayProspect({ ...s, prospectId, radar: radarFromSnapshot(s), moneyQueue: moneyQueueFromSnapshot(s), gspotRun });
}

export async function ingestDemandSignal(store, { prospectId, kind, observedAt, evidenceRef, now = Date.now() } = {}) {
  if (!SIGNAL_KINDS[kind]) return { ok: false, error: 'UNKNOWN_SIGNAL_KIND' };
  const at = Date.parse(observedAt);
  if (!Number.isFinite(at) || at > now + 60000) return { ok: false, error: 'OBSERVED_AT_INVALID_OR_FUTURE' };
  if (!/^https?:\/\//i.test(String(evidenceRef || ''))) return { ok: false, error: 'EVIDENCE_REF_MUST_BE_PUBLIC_URL' };
  const p = await store.get('prospects', prospectId);
  if (!p) return { ok: false, error: 'PROSPECT_NOT_FOUND' };
  const existing = p.demandSignals || [];
  if (existing.some(x => x.kind === kind && x.evidenceRef === evidenceRef)) return { ok: true, duplicate: true };
  const signal = { kind, observedAt: new Date(at).toISOString(), evidenceRef: String(evidenceRef).slice(0, 1000) };
  await store.patch('prospects', prospectId, { demandSignals: [...existing, signal].slice(-50) });
  return { ok: true, signal, outboundAuthority: 'NONE' };
}

/** Evidence G-SPOT may consume for a prospect: only what is stored. Missing
 * pieces stay missing, so the item blocks at the exact stage that lacks them. */
export function gspotEvidenceFor(s, moneyQueue, radar) {
  const byId = new Map(s.prospects.map(p => [p.id, p]));
  const qById = new Map(moneyQueue.items.map(i => [i.prospectId, i]));
  const healthy = new Map(s.senderHealth.map(h => [h.inbox, h]));
  return prospectId => {
    const p = byId.get(prospectId) || {};
    const ev = { ...(p.gspotEvidence || {}) };
    const q = qById.get(prospectId);
    if (q) ev.qualification = { eligible: true, outboundAuthority: 'NONE' };
    if (!ev.proofRef && (p.proofFindings || p.issue)) {
      const l = compileProofLineage({ offerId: q?.offerId, prospect: p, issue: p.issue || null, audit: p.proofFindings || [], observedAt: p.proofObservedAt || null, now: s.now });
      if (l.ok && l.freshness === 'FRESH') { ev.proofRef = l.proofRef; ev.proofDigest = l.proofDigest; }
    }
    if (ev.senderId) { const h = healthy.get(ev.senderId); ev.senderHealthy = Boolean(h) && !h.paused; ev.senderQuarantined = Boolean(h?.paused || h?.quarantined); }
    ev.offerId = ev.offerId || q?.offerId;
    return ev;
  };
}

export const gspotFor = (store, radarHalted, now = () => Date.now()) => createGspot({ store, now, isHalted: id => radarHalted.has(id) });
