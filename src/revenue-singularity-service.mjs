// Read/plan service that binds the Revenue Singularity modules to the store.
// Every function is read-only except `ingestDemandSignal` (appends one
// validated, evidence-referenced signal to a prospect) and the G-SPOT run
// bookkeeping inside createGspot. Nothing here sends, spends or deploys.
import { qualifyProspect } from './prospect-qualification-pipeline.mjs';
import { selectUberReplyOffer } from './uberreply-four-offer-genome.mjs';
import { compileMoneyQueue, SIGNAL_KINDS, stackSignals } from './money-queue.mjs';
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
import { buildProspectEvidenceBundle, PROSPECT_EVIDENCE_VERSION } from './prospect-evidence-reconciliation.mjs';
import { diagnosePaymentRail, IMPLEMENTED_PAYMENT_RAILS, summarizePaymentRail } from './payment-rail-doctor.mjs';
import { compressPayment } from './payment-compression.mjs';

const pick = (o, ...k) => k.map(x => o?.[x]).find(v => v !== undefined && v !== null && v !== '');
const HISTORY_COLLECTIONS = Object.freeze(['suppressions', 'prospects', 'outboundReservations', 'outboundEvents', 'replies', 'messages', 'providerEvents']);
const SNAPSHOT_COLLECTIONS = Object.freeze(['prospects', 'outboundEvents', 'replies', 'senderHealth', 'leads', 'suppressions', 'leadSignals']);

// Thin in-service compatibility bridge from durable prospect records into the
// canonical evidence/qualification shapes. This deliberately stays inside the
// existing Revenue Singularity organ so one compatibility seam does not become
// a new architectural organ or semantic requirement. It never invents evidence
// and never grants outreach authority.
const SOURCE_MAP = Object.freeze({
  owner_import: 'owner_import', csv_import: 'owner_import', first_party_export: 'first_party', first_party: 'first_party',
  public_website: 'public_website', website: 'public_website', public_profile: 'public_profile',
  licensed_export: 'licensed_provider', licensed_provider: 'licensed_provider', provider_api: 'provider_api'
});
const CLASS_BY_SOURCE = Object.freeze({
  owner_import: 'DIRECT_FIRST_PARTY', first_party: 'DIRECT_FIRST_PARTY', public_website: 'DIRECT_PUBLIC',
  public_profile: 'DIRECT_PUBLIC', licensed_provider: 'LICENSED_PROVIDER', provider_api: 'LICENSED_PROVIDER'
});
const https = value => {
  try { const u = new URL(String(value || '')); return u.protocol === 'https:' && !u.username && !u.password ? u.toString() : ''; }
  catch { return ''; }
};
const clamp01 = value => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n > 1 ? n / 100 : n)) : null;
};
const sourceTypeOf = value => SOURCE_MAP[String(value || '').trim().toLowerCase()] || null;
const evidenceClassOf = sourceType => CLASS_BY_SOURCE[sourceType] || null;
const contactTitle = p => String(p?.contact?.role || p?.contact?.title || p?.buyerRole || '').trim();

function canonicalContactVerifications(contact = {}, email = '') {
  const candidates = [
    ...(Array.isArray(contact.verifications) ? contact.verifications : []),
    ...(contact.verification && typeof contact.verification === 'object' ? [contact.verification] : [])
  ];
  const route = String(email || '').trim().toLowerCase();
  return candidates.filter(item =>
    item?.version === PROSPECT_EVIDENCE_VERSION
    && String(item?.route || '').trim().toLowerCase() === route
  );
}

function contactCandidate(prospect = {}) {
  const c = prospect.contact || {};
  const email = String(c.email || prospect.email || '').trim().toLowerCase();
  if (!email) return null;
  const sourceType = sourceTypeOf(c.source || prospect.source);
  if (!sourceType) return null;
  // Identity/address provenance and deliverability provenance are separate facts.
  // A public page can establish that an address was published; it cannot turn a
  // legacy `verified: valid` string into mailbox-verifier evidence. Only durable
  // canonical verification records are reusable here. Missing verifier lineage
  // deliberately leaves the route in NEEDS_VERIFICATION.
  const route = {
    route: email,
    verifications: canonicalContactVerifications(c, email)
  };
  const name = String(c.name || prospect.contactName || '').trim();
  const role = contactTitle(prospect);
  const publicUrl = https(c.sourceUrl || (sourceType === 'public_website' ? prospect.website : ''));
  const person = (name || publicUrl) ? {
    companyId: String(prospect.id || ''),
    name,
    role,
    sourceType,
    sourceUrl: publicUrl,
    publicProfileUrl: sourceType === 'public_profile' ? publicUrl : '',
    evidenceClass: evidenceClassOf(sourceType),
    observedAt: c.observedAt || prospect.updatedAt || prospect.createdAt || null,
    exactIdentity: c.exact !== false,
    inferred: c.inferred === true
  } : null;
  return { route, person, evidenceClass: evidenceClassOf(sourceType), role };
}

/** Build only from durable fields with attributable provenance. Missing
 * provenance remains missing and therefore keeps qualification closed. */
export function evidenceBundleFromStoredProspect(prospect = {}, { suppressions = [], now = new Date() } = {}) {
  if (prospect?.evidenceBundle?.version === PROSPECT_EVIDENCE_VERSION) return prospect.evidenceBundle;
  if (prospect?.evidenceBundle && typeof prospect.evidenceBundle === 'object') return prospect.evidenceBundle;
  const candidate = contactCandidate(prospect);
  if (!candidate) return null;
  try {
    return buildProspectEvidenceBundle({
      prospectId: prospect.id,
      personCandidates: candidate.person ? [candidate.person] : [],
      contactRoutes: [candidate.route],
      suppressions,
      now
    });
  } catch {
    return null;
  }
}

const LEAD_SIGNAL_TO_DEMAND_KIND = Object.freeze({
  first_party_inquiry: 'explicit_demand_inbound',
  job_listing: 'explicit_demand_hiring',
  job_change: 'switch_window_leadership',
  new_hire: 'switch_window_leadership',
  promotion: 'switch_window_leadership',
  champion_job_change: 'switch_window_leadership',
  funding: 'switch_window_funding',
  technology: 'tech_change',
  website_change: 'tech_change',
  product_launch: 'tech_change',
  public_pain_point: 'public_complaint'
});
const LEAD_SIGNAL_SOURCES = new Set(['owner_import', 'first_party_export', 'public_website', 'provider_api', 'licensed_export']);

/** Compose existing lead intelligence into the Revenue Singularity demand model.
 * This is deliberately narrower than the lead signal taxonomy. Generic news,
 * provider `buying_intent`, traffic, visits, form submissions, relationships and
 * other ambiguous signals are not upgraded into demand here. The bridge is
 * read-only and requires fresh HTTPS evidence plus attributable source metadata. */
export function demandSignalsFromLeadLedger(prospect = {}, leadSignals = [], now = Date.now()) {
  const prospectId = String(prospect?.id || '');
  const out = [];
  const seen = new Set();
  const add = signal => {
    const kind = String(signal?.kind || '');
    const evidenceRef = https(signal?.evidenceRef);
    const observedAt = new Date(signal?.observedAt || '').toISOString?.();
    if (!kind || !SIGNAL_KINDS[kind] || !evidenceRef || !observedAt) return;
    const key = `${kind}|${evidenceRef}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ...signal, kind, evidenceRef, observedAt });
  };
  for (const signal of Array.isArray(prospect?.demandSignals) ? prospect.demandSignals : []) {
    const observed = Date.parse(signal?.observedAt || '');
    if (!Number.isFinite(observed) || observed > now + 60000) continue;
    add(signal);
  }
  for (const signal of Array.isArray(leadSignals) ? leadSignals : []) {
    if (String(signal?.prospectId || '') !== prospectId) continue;
    const kind = LEAD_SIGNAL_TO_DEMAND_KIND[String(signal?.type || '').trim().toLowerCase()];
    if (!kind) continue;
    const sourceType = String(signal?.sourceType || '').trim().toLowerCase();
    if (!LEAD_SIGNAL_SOURCES.has(sourceType)) continue;
    const evidenceRef = https(signal?.sourceUrl);
    if (!evidenceRef) continue;
    const observed = Date.parse(signal?.observedAt || '');
    if (!Number.isFinite(observed) || observed > now + 60000) continue;
    const expires = Date.parse(signal?.expiresAt || '');
    if (Number.isFinite(expires) && expires < now) continue;
    const confidence = clamp01(signal?.confidence);
    if (confidence !== null && confidence < 0.5) continue;
    add({
      kind,
      observedAt: new Date(observed).toISOString(),
      evidenceRef,
      source: 'leadSignals',
      leadSignalId: String(signal?.id || '').slice(0, 160),
      sourceType,
      confidence: confidence ?? null
    });
  }
  return out;
}

const roleFit = (offerId, role) => {
  const x = String(role || '').toLowerCase();
  if (!x) return 0;
  const executive = /\b(owner|founder|ceo|chief|president|partner|principal|director|head|vp|vice president)\b/.test(x);
  const byOffer = {
    LEAD_TO_BOOKING_LEAK_AUDIT: /client|account|performance|marketing|growth|operations|revenue|owner|founder|ceo/,
    AI_AGENT_RELEASE_GATE: /ai|agent|engineering|technical|technology|product|platform|qa|quality|cto|cio|owner|founder|ceo/,
    CLIENT_ROI_PROOF_SPRINT: /performance|marketing|growth|revenue|revops|analytics|client|account|cmo|owner|founder|ceo/,
    BILINGUAL_BOOKING_LEAK_AUDIT: /clinic|practice|operations|marketing|growth|booking|patient|general manager|owner|founder|ceo/
  };
  const matched = byOffer[offerId]?.test(x) || false;
  return matched ? (executive ? 0.95 : 0.82) : (executive ? 0.62 : 0.35);
};

/** Existing caller observations win. Only deterministic readings of stored,
 * attributable facts fill missing observations. */
export function qualificationObservationsFromStoredProspect(prospect = {}, { selectedOffer = null, now = Date.now(), demandSignals = null } = {}) {
  const observations = { ...(prospect.observations || {}) };
  const candidate = contactCandidate(prospect);
  const evidenceClass = candidate?.evidenceClass;
  const offerId = selectedOffer?.offer?.offerId || selectedOffer?.offerId || null;
  const offerScore = clamp01(selectedOffer?.fit?.score ?? selectedOffer?.score);
  if (!observations.buyerRoleFit && candidate?.role && evidenceClass) observations.buyerRoleFit = { value: roleFit(offerId, candidate.role), evidenceClass };

  const fit = clamp01(prospect.serviceFit ?? prospect.icpFit);
  const prospectSource = sourceTypeOf(prospect.source || prospect.sourceMetadata?.sourceType);
  const prospectEvidenceClass = evidenceClassOf(prospectSource);
  if (!observations.icpFit && fit !== null && prospectEvidenceClass) observations.icpFit = { value: fit, evidenceClass: prospectEvidenceClass };

  const issue = prospect.issue;
  if (!observations.painEvidence && issue && https(issue.evidenceUrl || issue.sourceUrl)) observations.painEvidence = { value: clamp01(issue.confidence) ?? 0.65, evidenceClass: 'DIRECT_PUBLIC' };

  const signals = stackSignals(Array.isArray(demandSignals) ? demandSignals : prospect.demandSignals || [], now);
  if (!observations.signalStrength && signals.score > 0) observations.signalStrength = { value: signals.score, evidenceClass: 'DIRECT_PUBLIC' };
  if (!observations.timing && signals.score > 0) observations.timing = { value: Math.min(1, signals.score), evidenceClass: 'DIRECT_PUBLIC' };
  if (!observations.offerFit && offerScore !== null) observations.offerFit = { value: offerScore, evidenceClass: 'MODEL_INFERENCE' };
  return observations;
}

export function buyerFromStoredProspect(prospect = {}) {
  const email = String(prospect?.contact?.email || prospect?.email || '').trim().toLowerCase();
  const role = contactTitle(prospect);
  return { resolved: Boolean(email && role), role: role || null, email: email || null };
}

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
    senderHealth: rows('senderHealth'), leads: rows('leads'), suppressions: rows('suppressions'), leadSignals: rows('leadSignals'),
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
 * reused; older durable prospect facts are reconciled in place. Contact history
 * is recomputed from real ledgers on every snapshot, never a hand-set boolean. */
export function moneyQueueFromSnapshot(s, { limit = 100 } = {}) {
  const candidates = s.prospects.map(p => {
    const offerProspect = { ...p, industry: p.industry || p.niche || p.vertical || '', vertical: p.vertical || p.niche || '' };
    const sel = selectUberReplyOffer({ ...offerProspect, fitEvidenceConfidence: p.fitEvidenceConfidence ?? p.problemEvidenceScore ?? 0 });
    const bundle = evidenceBundleFromStoredProspect(p, { suppressions: s.suppressions, now: new Date(s.now) });
    const signals = demandSignalsFromLeadLedger(p, s.leadSignals || [], s.now);
    const observations = qualificationObservationsFromStoredProspect(p, { selectedOffer: sel, now: s.now, demandSignals: signals });
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
      signals,
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

/** Read the live payment doctors without exposing credential values. Repository
 * settings are configuration, not provider-origin evidence, so this surface
 * deliberately does NOT pass settings values as verification receipts or KYC
 * attestations. Until trusted external receipts are bound into a canonical
 * ledger, the doctor must stay fail-closed rather than mint LIVE_READY. */
export function paymentRailsFromSnapshot(s, env = process.env) {
  return IMPLEMENTED_PAYMENT_RAILS.map(provider => {
    const report = diagnosePaymentRail({
      env, provider, mode: 'LIVE', at: new Date(s.now),
      verificationReceipt: null,
      kycAttestation: null
    });
    const summary = summarizePaymentRail(report);
    return {
      provider,
      state: summary.state,
      liveReady: summary.liveReady === true,
      reasonCodes: summary.reasonCodes || [],
      ownerActionQueue: summary.ownerActionQueue || [],
      evidenceBinding: 'TRUSTED_PROVIDER_RECEIPT_NOT_BOUND'
    };
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
