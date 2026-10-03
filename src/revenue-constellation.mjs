// Revenue Constellation: a truthful, runtime-backed model of the commercial
// organism. Every node and edge derives from a stored record; there are no
// decorative nodes. Uncertainty and truth class travel with each element so the
// renderer can show what is known, inferred or unknown.
//
// Pure: no I/O. The caller passes a snapshot read from the store.
//   levels: 0 organism (offers/senders/infra/stage clusters) -> 1 clusters ->
//           2 prospects -> 3 X-Ray (via xray())
//   time:   `at` rebuilds the picture as it was (events <= at), enabling replay
//   scale:  prospects beyond maxNodes collapse into (stage x offer) clusters
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const CONSTELLATION_VERSION = 'uberbond.revenue-constellation.v1';
export const STAGE_ORDER = Object.freeze(['DISCOVERED', 'QUEUED', 'SENT', 'REPLIED', 'HALTED', 'PAID']);
export const LENSES = Object.freeze(['pipeline', 'economic', 'proof', 'buyer', 'infrastructure', 'uncertainty']);

const t = v => { const n = Date.parse(v); return Number.isFinite(n) ? n : null; };
const EVENT_KINDS = new Set(['sent', 'send_uncertain', 'hard_bounce', 'soft_bounce', 'complaint', 'reply', 'unsubscribe']);

const isClearedLead = l => l?.paymentStatus === 'paid' && Boolean(l?.paymentEvidenceRef || l?.providerTransactionId || l?.providerEventId);

export function collectEvents({ outboundEvents = [], replies = [], leads = [] } = {}) {
  const ev = [];
  for (const e of outboundEvents) {
    const at = t(e.occurredAt || e.createdAt);
    if (at !== null && EVENT_KINDS.has(e.eventType)) ev.push({ at, type: e.eventType, prospectId: e.prospectId || null, inbox: e.inbox || null, id: e.id });
  }
  for (const r of replies) {
    const at = t(r.receivedAt || r.createdAt);
    if (at !== null) ev.push({ at, type: 'reply', prospectId: r.prospectId || null, id: r.id, label: r.label || null });
  }
  for (const l of leads) {
    const at = t(l.paidAt || l.updatedAt);
    if (at !== null && isClearedLead(l)) ev.push({ at, type: 'cleared_payment', prospectId: l.prospectId || null, id: l.id, amountCents: Number(l.amountCents || 0) || null });
  }
  return ev.sort((a, b) => a.at - b.at || String(a.id).localeCompare(String(b.id)));
}

export function stageAt(prospect, events, atMs, haltedIds = new Set()) {
  const mine = events.filter(e => e.prospectId === prospect.id && e.at <= atMs);
  if (mine.some(e => e.type === 'cleared_payment')) return 'PAID';
  if (haltedIds.has(prospect.id) || mine.some(e => e.type === 'unsubscribe' || e.type === 'complaint')) return 'HALTED';
  if (mine.some(e => e.type === 'reply')) return 'REPLIED';
  if (mine.some(e => e.type === 'sent')) return 'SENT';
  if (prospect.queued) return 'QUEUED';
  return 'DISCOVERED';
}

export function buildConstellation({
  prospects = [], outboundEvents = [], replies = [], senderHealth = [], leads = [], moneyQueue = null, radar = null, gspotRun = null,
  infra = [], offers = [], now = Date.now(), at = null, maxNodes = 400, expand = null
} = {}) {
  const atMs = at ? (t(at) ?? now) : now;
  const events = collectEvents({ outboundEvents, replies, leads });
  const visibleEvents = events.filter(e => e.at <= atMs);
  const halted = new Set(radar?.haltedProspects || []);
  const rank = new Map((moneyQueue?.items || []).map(i => [i.prospectId, i]));
  const nodes = []; const edges = [];
  const put = n => { nodes.push(n); return n; };

  put({ id: 'core:gspot', type: 'core', label: 'G-SPOT', truth: 'RUNTIME', mass: 10, uncertainty: 0,
    state: gspotRun ? { runId: gspotRun.runId, state: gspotRun.state, stages: stageHistogram(gspotRun) } : { state: 'NO_RUN' } });

  const offerIds = [...new Set([...offers.map(o => o.offerId), ...prospects.map(p => p.offerId).filter(Boolean)])].sort();
  for (const o of offerIds) { put({ id: `offer:${o}`, type: 'offer', label: o, truth: 'CONFIG', mass: 4, uncertainty: 0.3 }); edges.push({ from: 'core:gspot', to: `offer:${o}`, kind: 'governs' }); }

  for (const s of senderHealth) {
    put({ id: `sender:${s.inbox}`, type: 'sender', label: s.inbox, truth: 'RUNTIME', mass: 3, uncertainty: 0.2,
      state: { paused: Boolean(s.paused), complaintsToday: s.complaintsToday || 0, hardBouncesToday: s.hardBouncesToday || 0, failureStreak: s.failureStreak || 0 }, health: s.paused || (s.complaintsToday || 0) > 0 ? 'DEGRADED' : 'OK' });
    edges.push({ from: 'core:gspot', to: `sender:${s.inbox}`, kind: 'sends-through' });
  }
  for (const i of infra) { put({ id: `infra:${i.id}`, type: 'infra', label: i.id, truth: i.observedAt ? 'OBSERVED' : 'UNKNOWN', mass: 2, uncertainty: i.observedAt ? 0.1 : 1, health: i.status || 'UNKNOWN', observedAt: i.observedAt || null }); edges.push({ from: 'core:gspot', to: `infra:${i.id}`, kind: 'depends-on' }); }

  // prospects -> individually or clustered
  const staged = prospects.filter(p => { const c = t(p.createdAt); return c === null || c <= atMs; }).map(p => ({ p, stage: stageAt(p, events, atMs, halted) }));
  const clustered = staged.length > maxNodes;
  const buckets = new Map();
  if (clustered) {
    for (const { p, stage } of staged) { const key = `${stage}|${p.offerId || 'none'}`; (buckets.get(key) || buckets.set(key, []).get(key)).push(p); }
    for (const [key, members] of buckets) {
      const [stage, offerId] = key.split('|');
      const id = `cluster:${key}`;
      if (expand === id) { for (const p of members.slice(0, maxNodes)) addProspect(p, stage); continue; }
      const mass = members.reduce((s, p) => s + massOf(p, rank, leads), 0);
      put({ id, type: 'cluster', label: `${stage} · ${offerId}`, stage, count: members.length, truth: 'RUNTIME', mass: Math.max(1, Math.log2(1 + members.length)) + mass, uncertainty: 0.5, expandable: true });
      edges.push({ from: offerId !== 'none' ? `offer:${offerId}` : 'core:gspot', to: id, kind: 'contains', weight: members.length });
    }
  } else for (const { p, stage } of staged) addProspect(p, stage);

  function addProspect(p, stage) {
    const q = rank.get(p.id);
    put({ id: `prospect:${p.id}`, type: 'prospect', label: p.company || p.domain || p.id, stage, offerId: p.offerId || null, truth: 'RUNTIME',
      mass: massOf(p, rank, leads), rank: q?.rank ?? null, lane: q?.lane ?? null, uncertainty: q ? Math.max(0, 1 - (q.explanation?.qualification?.evidenceQuality ?? 0)) : 1, halted: halted.has(p.id) });
    edges.push({ from: p.offerId ? `offer:${p.offerId}` : 'core:gspot', to: `prospect:${p.id}`, kind: 'targets' });
  }

  // causal trails from real events
  const present = new Set(nodes.map(n => n.id));
  for (const e of visibleEvents) {
    if (!e.prospectId || !present.has(`prospect:${e.prospectId}`)) continue;
    if (e.type === 'sent' && e.inbox && present.has(`sender:${e.inbox}`)) edges.push({ from: `sender:${e.inbox}`, to: `prospect:${e.prospectId}`, kind: 'sent', at: e.at, causal: true });
    if (e.type === 'reply') edges.push({ from: `prospect:${e.prospectId}`, to: 'core:gspot', kind: 'reply', at: e.at, causal: true });
    if (e.type === 'cleared_payment') edges.push({ from: `prospect:${e.prospectId}`, to: 'core:gspot', kind: 'cleared-payment', at: e.at, causal: true });
  }

  const cleared = visibleEvents.filter(e => e.type === 'cleared_payment');
  return {
    version: CONSTELLATION_VERSION, generatedAt: new Date(now).toISOString(), at: new Date(atMs).toISOString(), replay: atMs !== now,
    lenses: LENSES, levels: ['organism', 'cluster', 'prospect', 'xray'], clustered, maxNodes,
    nodes, edges, events: visibleEvents.slice(-500).map(e => ({ at: new Date(e.at).toISOString(), type: e.type, prospectId: e.prospectId, inbox: e.inbox || null })),
    timeRange: events.length ? { from: new Date(events[0].at).toISOString(), to: new Date(events[events.length - 1].at).toISOString() } : null,
    economics: { clearedPayments: cleared.length, clearedAmountCents: cleared.reduce((s, e) => s + (e.amountCents || 0), 0), note: 'Only payments with provider evidence count as cleared.' },
    truthBoundary: 'Every element derives from a stored record. Mass is a conservative prior until cleared payments exist; it is not revenue.',
    outboundAuthority: 'NONE', externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

function massOf(p, rank, leads) {
  const q = rank.get(p.id);
  const cleared = leads.filter(l => l.prospectId === p.id && isClearedLead(l)).reduce((s, l) => s + (Number(l.amountCents) || 0), 0);
  return Math.max(0.5, Math.log10(10 + cleared / 100) + (q ? Math.max(0, q.explanation?.expectedContributionCents || 0) / 1000 : 0));
}
function stageHistogram(run) { const h = {}; for (const i of run.items || []) h[i.stage] = (h[i.stage] || 0) + 1; return h; }

/** Prospect X-Ray: everything known (and explicitly unknown) about one prospect. */
export function xray({ prospectId, prospects = [], outboundEvents = [], replies = [], leads = [], moneyQueue = null, radar = null, gspotRun = null, now = Date.now() } = {}) {
  const p = prospects.find(x => x.id === prospectId);
  if (!p) return { ok: false, state: 'PROSPECT_NOT_FOUND' };
  const events = collectEvents({ outboundEvents, replies, leads }).filter(e => e.prospectId === prospectId);
  const q = (moneyQueue?.items || []).find(i => i.prospectId === prospectId);
  const item = (gspotRun?.items || []).find(i => i.prospectId === prospectId);
  const radarItems = (radar?.items || []).filter(i => i.prospectId === prospectId);
  const unknowns = [];
  if (!q) unknowns.push('not-in-money-queue (not qualified or no demand evidence)');
  if (!item) unknowns.push('not-in-current-gspot-run');
  if (!events.length) unknowns.push('no-outbound-events');
  return {
    ok: true, version: CONSTELLATION_VERSION, prospect: { id: p.id, company: p.company || null, domain: p.domain || null, offerId: p.offerId || null },
    stage: stageAt(p, collectEvents({ outboundEvents, replies, leads }), now, new Set(radar?.haltedProspects || [])),
    moneyQueue: q ? { rank: q.rank, lane: q.lane, explanation: q.explanation } : null,
    gspot: item ? { stage: item.stage, blocks: item.blocks, history: item.history, proofRef: item.evidence?.proofRef || null, messageDigest: item.evidence?.messageDigest || null, effect: item.effect ? { idempotencyKey: item.effect.idempotencyKey, settledAt: item.effect.settledAt || null } : null } : null,
    timeline: events.map(e => ({ at: new Date(e.at).toISOString(), type: e.type, inbox: e.inbox || null })),
    replies: radarItems.map(r => ({ label: r.label, automation: r.automation, authority: r.authority, injectionFlags: r.injectionFlags })),
    unknowns, outboundAuthority: 'NONE'
  };
}
