// Reply Radar + Mohamed Reply Cockpit.
//
// Composes the existing reply taxonomy (classifyUberReply). It adds the three
// guarantees the commercial loop needs and nothing that sends:
//   1. any material human reply STOPS all prospect automation for that thread;
//   2. a material reply becomes a cockpit item for Mohamed, who sends manually;
//   3. reply text is untrusted data: injection attempts are flagged and can
//      never change a classification into permission or an instruction.
// This module has no send path. `authority` is always MANUAL_MOHAMED.
import { classifyUberReply } from './uberreply-taxonomy.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const REPLY_RADAR_VERSION = 'uberbond.reply-radar.v1';
const MATERIAL = new Set(['positive', 'objection', 'referral', 'wrong_person', 'negative', 'optout', 'neutral']);
const PAUSE_ONLY = new Set(['automatic', 'out_of_office']);

const INJECTION = [
  /ignore (all |any )?(previous|prior|above) (instructions|rules)/i,
  /\b(system|developer) (prompt|message)\b/i,
  /\byou are (now )?(an?|the) (assistant|ai|agent|model)\b/i,
  /\b(send|forward|wire|transfer) .{0,40}(payment|funds|credentials|password|token)\b/i,
  /\bapprove (the |this )?(batch|send|authorization)\b/i,
  /<\s*(script|iframe)\b|javascript:/i
];

export const detectReplyInjection = text => INJECTION.filter(re => re.test(String(text || ''))).map(re => re.source);

const stripForDisplay = text => String(text || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f‪-‮⁦-⁩]/g, '').slice(0, 8000);

export function radarReply(reply = {}) {
  const body = stripForDisplay(reply.body || reply.text || '');
  const cls = classifyUberReply(body);
  const injection = detectReplyInjection(body);
  const material = MATERIAL.has(cls.label) || injection.length > 0;
  // An injection attempt never lowers scrutiny: it makes the thread material.
  const stop = injection.length > 0 || (material && !PAUSE_ONLY.has(cls.label));
  return {
    replyId: String(reply.id || reply.gmailId || ''),
    prospectId: String(reply.prospectId || ''),
    receivedAt: reply.receivedAt || reply.createdAt || null,
    label: cls.label,
    confidence: cls.confidence,
    reason: cls.reason,
    material,
    automation: stop ? 'STOP_ALL_PROSPECT_AUTOMATION' : PAUSE_ONLY.has(cls.label) ? 'PAUSE_SEQUENCE' : 'CONTINUE',
    suppressionRecommended: cls.suppressionRecommended || cls.label === 'optout',
    opportunitySignal: cls.opportunitySignal,
    injectionFlags: injection,
    untrustedBody: body
  };
}

/** Build the cockpit queue. Nothing here sends: each item carries a
 * suggested-draft slot Mohamed may copy, edit and send himself. */
export function compileReplyRadar({ replies = [], now = Date.now() } = {}) {
  const items = [];
  const haltedProspects = new Set();
  const paused = new Set();
  for (const r of replies) {
    const x = radarReply(r);
    if (x.automation === 'STOP_ALL_PROSPECT_AUTOMATION' && x.prospectId) haltedProspects.add(x.prospectId);
    if (x.automation === 'PAUSE_SEQUENCE' && x.prospectId) paused.add(x.prospectId);
    if (x.material) {
      const ageMin = Number.isFinite(Date.parse(x.receivedAt)) ? Math.max(0, Math.round((now - Date.parse(x.receivedAt)) / 60000)) : null;
      items.push({
        ...x,
        authority: 'MANUAL_MOHAMED',
        autoReplyAllowed: false,
        urgency: x.label === 'positive' || x.label === 'objection' ? 'HIGH' : x.label === 'optout' ? 'SUPPRESS_NOW' : 'NORMAL',
        ageMinutes: ageMin,
        draftSlot: { status: 'EMPTY_MOHAMED_WRITES_AND_SENDS', suggestionAllowed: !x.injectionFlags.length }
      });
    }
  }
  const order = { SUPPRESS_NOW: 0, HIGH: 1, NORMAL: 2 };
  items.sort((a, b) => order[a.urgency] - order[b.urgency] || String(a.receivedAt).localeCompare(String(b.receivedAt)));
  return {
    ok: true, version: REPLY_RADAR_VERSION, items,
    haltedProspects: [...haltedProspects].sort(), pausedProspects: [...paused].sort(),
    counts: { material: items.length, halted: haltedProspects.size, paused: paused.size },
    automaticHumanReplies: 0, outboundAuthority: 'NONE', businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

/** Guard used by dispatchers: refuse any automation for a halted prospect. */
export const assertProspectNotHalted = (radar, prospectId) => {
  if (radar?.haltedProspects?.includes(prospectId)) {
    const e = new Error('PROSPECT_HALTED_BY_HUMAN_REPLY'); e.code = 'PROSPECT_HALTED_BY_HUMAN_REPLY'; throw e;
  }
  return true;
};
