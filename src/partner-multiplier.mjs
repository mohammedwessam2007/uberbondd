// Partner / distribution-node multiplier and diagnostic/inbound attribution.
// A partner is valued for the CLIENTS it can reach, discounted for unknowns,
// and never counted twice when several partners share one client. Attribution
// goes through the existing causal spine contract: first-touch is a hypothesis
// unless an event chain proves it.
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const PARTNER_MULTIPLIER_VERSION = 'uberbond.partner-multiplier.v1';

/** partners: [{ id, clientRefs:[], fit:0..1, marginShare:0..1, supportBurden:0..1, confirmed:boolean }] */
export function rankPartners({ partners = [] } = {}) {
  const seen = new Set(); const rows = [];
  for (const p of [...partners].sort((a, b) => (b.clientRefs?.length || 0) - (a.clientRefs?.length || 0) || String(a.id).localeCompare(String(b.id)))) {
    const clients = (p.clientRefs || []).filter(c => c && !seen.has(c));
    const overlap = (p.clientRefs || []).length - clients.length;
    clients.forEach(c => seen.add(c));
    const fit = Math.max(0, Math.min(1, Number(p.fit) || 0)); const margin = Math.max(0, Math.min(1, Number(p.marginShare) || 0)); const burden = Math.max(0, Math.min(1, Number(p.supportBurden) || 0));
    const confidence = p.confirmed ? 1 : 0.35; // an unconfirmed partner is a hypothesis
    rows.push({ id: p.id, uniqueClients: clients.length, overlapDiscarded: overlap, score: Math.round(clients.length * fit * (1 - margin * 0.5) * (1 - burden * 0.5) * confidence * 1000) / 1000, confirmed: Boolean(p.confirmed), basis: p.confirmed ? 'CONFIRMED_PARTNER' : 'UNCONFIRMED_HYPOTHESIS' });
  }
  rows.sort((a, b) => b.score - a.score || String(a.id).localeCompare(String(b.id)));
  return { version: PARTNER_MULTIPLIER_VERSION, rows, advisoryOnly: true, outboundAuthority: 'NONE', externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS } };
}

/** Attribute a paid outcome to a channel only along a proven chain of events. */
export function attributeOutcome({ chain = [] } = {}) {
  const sorted = [...chain].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const valid = sorted.every(e => Number.isFinite(Date.parse(e.at)) && e.evidenceRef);
  const first = sorted[0]?.channel || null; const last = [...sorted].reverse().find(e => e.channel)?.channel || null;
  const channels = [...new Set(sorted.map(e => e.channel).filter(Boolean))];
  return { proven: valid && sorted.length >= 2, channels, firstTouch: first, lastTouch: last, causalClaim: valid && channels.length === 1 ? 'SINGLE_CHANNEL_CHAIN' : 'MULTI_TOUCH_NOT_SEPARABLE', note: valid ? 'Attribution follows evidenced events only.' : 'Chain has undated or evidence-less events: attribution refused.', outboundAuthority: 'NONE' };
}

/** Diagnostics-as-distribution: a free diagnostic is only distribution if it is
 * evidence-backed, and inbound is attributed to it only when the buyer says so or the chain proves it. */
export function diagnosticYield({ diagnosticsServed = 0, inboundReplies = 0, paid = 0 } = {}) {
  const pos = diagnosticsServed ? inboundReplies / diagnosticsServed : null;
  return { diagnosticsServed, inboundReplies, paid, replyRate: pos, verdict: diagnosticsServed < 30 ? 'INSUFFICIENT_SAMPLE' : pos < 0.02 ? 'WEAK_DISTRIBUTION' : 'PROMISING_NOT_PROVEN', advisoryOnly: true };
}
