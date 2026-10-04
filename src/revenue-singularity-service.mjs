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
import { buildConstellation, xray as xrayProspect } from './revenue-constellation.mjs';
import { compileOfferMarket } from './offer-market-maker.mjs';
import { compileUberClose } from './decision-twin.mjs';
import { rankPartners, diagnosticYield } from './partner-multiplier.mjs';
import { advanceDelivery } from './delivery-loop.mjs';
import { localizeFailure, marketEscape, wilson, reliabilityEnvelope } from './revenue-reliability.mjs';
import { compileContactHistory, RESULT_STATUS } from './prospect-contact-history.mjs';
import {
  evidenceBundleFromStoredProspect,
  qualificationObservationsFromStoredProspect,
  buyerFromStoredProspect
} from './prospect-evidence-bridge.mjs';
import { diagnosePaymentRail, IMPLEMENTED_PAYMENT_RAILS, summarizePaymentRail } from './payment-rail-doctor.mjs';
import { compressPayment } from './payment-compression.mjs';

const pick = (o, ...k) => k.map(x => o?.[x]).find(v => v !== undefined && v !== null && v !== '');
const HISTORY_COLLECTIONS = Object.freeze(['suppressions', 'prospects', 'outboundReservations', 'outboundEvents', 'replies', 'messages', 'providerEvents']);
const SNAPSHOT_COLLECTIONS = Object.freeze(['prospects', 'outboundEvents', 'replies', 'senderHealth', 'leads', 'suppressions']);

async function readCollection(store, key) {
  try {
    const rows = await store.list(key);
    return Array.isArray(rows) ? { ok: true, rows } : { ok: false, error: 'READ_NOT_A_LIST', rows: [] };
  } catch (error) {
    return { ok: false, error: `READ_FAILED:${String(error?.code || error?.name || 'error').slice(0, 40)}`, rows: [] };
  }
}

export async function snapshot(store, now = Date.now()) {
  const keys = [...new Set([...SNAPSHOT_COLLECTIONS, ...HISTORY_COLLECTIONS])];
  const reads = Object.fromEntries(await Promise.all(keys.map(async key => [key, await readCollection(store, key)])));
  let settings = {};
  try { settings = await store.getSettings() || {}; } catch { settings = {}; }
  const rows = key => reads[key]?.rows || [];
  const contactHistoryReads = Object.fromEntries(HISTORY_COLLECTIONS.map(key => [key, reads[key]]));
  return {
    prospects: rows('prospects'), outboundEvents: rows('outboundEvents'), replies: rows('replies'),
    senderHealth: rows('senderHealth'), leads: rows('leads'), suppressions: rows('suppressions'),
    contactHistoryReads, settings, now
  };
}

export function radarFromSnapshot(s) {
  return compileReplyRadar({
    now: s.now,
    replies: s.replies.map(r => ({ id: r.id, gmailId: r.gmailId, prospectId: r.prospectId, body: pick(r, 'body', 'text', 'snippet') || '', receivedAt: pick(r, 'receivedAt', 'createdAt') }))
  });
}

/** Build a Money Queue only from canonical evidence. Stored evidence bundles are
 * reused; older durable prospect facts are reconciled through the canonical
 * evidence bridge. Contact history is recomputed from the real ledgers on every
 * snapshot, never accepted from a hand-set boolean. */
export function moneyQueueFromSnapshot(s, { limit = 100 } = {}) {
  const candidates = s.prospects.map(p => {
    const offerProspect = { ...p, industry: p.industry || p.niche || p.vertical || '', vertical: p.vertical || p.niche || '' };
    const sel = selectUberReplyOffer({ ...offerProspect, fitEvidenceConfidence: p.fitEvidenceConfidence ?? p.problemEvidenceScore ?? 0 });
    const bundle = evidenceBundleFromStoredProspect(p, { suppressions: s.suppressions, now: new Date(s.now) });
    const observations = qualificationObservationsFromStoredProspect(p, { bundle, selectedOffer: sel, now: s.now });
    const qualification = bundle
      ? qualifyProspect({ bundle, observations, date: new Date(s.now) })
      : { eligible: false, blocks: ['no-attributable-evidence-bundle'] };
    const buyer = buyerFromStoredProspect(p);
    const history = buyer.email
      ? compileContactHistory({ email: buyer.email, reads: s.contactHistoryReads || {}, now: new Date(s.now) })
      : { status: RESULT_STATUS.CHECK_FAILED, overallContactHistoryHit: null, reasonCodes: ['buyer-email-required'] };
    return {
      prospectId: p.id, qualification,
      offerFit: sel.selected ? { offerId: sel.offer.offerId, score: sel.fit.score } : {},
      contactHistory: {
        usable: history.status === RESULT_STATUS.CLEAN,
        priorEffect: history.status === RESULT_STATUS.HIT,
        status: history.status,
        reasonCodes: history.reasonCodes || []
      },
      buyer,
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

export function offerMarketFromSnapshot(s) {
  const sendsBy = {}; const paidBy = {};
  const offerOf = new Map(s.prospects.map(p => {
    const normalized = { ...p, industry: p.industry || p.niche || p.vertical || '', vertical: p.vertical || p.niche || '' };
    return [p.id, selectUberReplyOffer({ ...normalized, fitEvidenceConfidence: p.fitEvidenceConfidence ?? 0 })?.offer?.offerId];
  }));
  for (const e of s.outboundEvents) if (e.eventType === 'sent') { const o = offerOf.get(e.prospectId); if (o) sendsBy[o] = (sendsBy[o] || 0) + 1; }
  for (const l of s.leads) if (l.paymentStatus === 'paid' && (l.paymentEvidenceRef || l.providerTransactionId || l.providerEventId)) { const o = offerOf.get(l.prospectId); if (o) paidBy[o] = (paidBy[o] || 0) + 1; }
  const outcomes = {}; for (const o of new Set([...Object.keys(sendsBy), ...Object.keys(paidBy)])) outcomes[o] = { sends: sendsBy[o] || 0, clearedPayments: paidBy[o] || 0 };
  return compileOfferMarket({ outcomes });
}

/** Read the live payment doctors without exposing credential values. Optional
 * durable verification/KYC evidence may be supplied through owner-maintained
 * settings. Absence stays absence and therefore cannot become LIVE_READY. */
export function paymentRailsFromSnapshot(s, env = process.env) {
  const verification = s.settings?.paymentRailVerificationReceipts || {};
  const kyc = s.settings?.paymentRailKycAttestations || {};
  return IMPLEMENTED_PAYMENT_RAILS.map(provider => {
    const report = diagnosePaymentRail({
      env, provider, mode: 'LIVE', at: new Date(s.now),
      verificationReceipt: verification?.[provider] || null,
      kycAttestation: kyc?.[provider] || null
    });
    const summary = summarizePaymentRail(report);
    return { provider, state: summary.state, liveReady: summary.liveReady === true, reasonCodes: summary.reasonCodes || [], ownerActionQueue: summary.ownerActionQueue || [] };
  });
}

/** Delivery state for one lead from stored fields only; absent evidence stays absent. */
export function deliveryFromSnapshot(s, leadId) {
  const l = s.leads.find(x => x.id === leadId);
  if (!l) return { ok: false, state: 'LEAD_NOT_FOUND' };
  return { ok: true, leadId, ...advanceDelivery({ payment: l.paymentEvidence || null, scope: l.scope, acceptanceCriteria: l.acceptanceCriteria, deliverableRefs: l.deliverableRefs, claimsVerified: l.claimsVerified, acceptance: l.acceptance, caseStudyPermission: l.caseStudyPermission, valueConfirmedByCustomer: l.valueConfirmedByCustomer, usedResult: l.usedResult, recurringSignal: l.recurringSignal }) };
}

/** DecisionTwin / UberClose for one lead plus the current provider-neutral live
 * payment readiness. A ready checkout is still not revenue. */
export function dealFromSnapshot(s, leadId, env = process.env) {
  const l = s.leads.find(x => x.id === leadId);
  if (!l) return { ok: false, state: 'LEAD_NOT_FOUND' };
  const rails = paymentRailsFromSnapshot(s, env);
  const amountCents = Number(l.amountCents || l.priceCents || 0);
  const paymentPath = compressPayment({ rails, buyerRegion: l.buyerRegion || l.country || null, amountCents, currency: l.currency || 'USD' });
  return {
    ok: true, leadId,
    ...compileUberClose({ deal: { stage: l.dealStage, contacts: l.buyingGroup || [], paymentEvidence: l.paymentEvidence ? { cleared: l.paymentEvidence.status === 'cleared' && l.paymentEvidence.source === 'provider', providerTransactionId: l.paymentEvidence.providerTransactionId } : null, lastObjection: l.lastObjection } }),
    paymentReadiness: rails,
    paymentPath
  };
}

/** Owner-maintained partner list lives in settings.revenuePartners (never inferred). */
export async function partnersFromStore(store) {
  const settings = await store.getSettings();
  const partners = Array.isArray(settings.revenuePartners) ? settings.revenuePartners : [];
  return { ...rankPartners({ partners }), diagnostics: diagnosticYield(settings.revenueDiagnostics || {}), source: 'settings.revenuePartners (owner maintained)' };
}
