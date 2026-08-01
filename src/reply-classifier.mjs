// Canon/V3 integration -- premerge audit P1-009 (reply processing).
//
// V3's own terminal-event Set (`new Set(['reply','hard_bounce','complaint','opt_out',
// 'wrong_recipient','payment','won'])`, autonomous-revenue-factory.mjs) was disconnected from this
// repo's real reply pipeline (pipeline.mjs#pollReplies + ai.mjs#classifyReply), and named no
// 'wrong_recipient' detection anywhere. This module is the one canonical classifier every inbound
// reply -- Canon or pre-Canon -- can be routed through: it wraps the existing
// send-safety.mjs#classifyDeliverySignal (bounce/complaint/automatic) and ai.mjs#classifyReply
// (positive/negative/neutral/optout), and adds the previously-missing wrong-recipient detection,
// so every canonical class the mission names has exactly one detection path.
//
// Per mission item 8 ("any human reply cancels automated follow-ups unless an explicit policy
// exception exists"): every class EXCEPT 'automatic' (an out-of-office auto-responder is not a
// human reply) cancels outstanding follow-ups.
import { classifyDeliverySignal } from './send-safety.mjs';

export const CANONICAL_REPLY_CLASSES = Object.freeze([
  'bounce', 'complaint', 'automatic', 'optout', 'wrong_recipient', 'positive', 'negative', 'neutral'
]);

const WRONG_RECIPIENT_PATTERN = /wrong (person|department|contact|inbox)|not the right (person|contact|department)|you('ve| have) got the wrong|please remove me from this specific|no longer (works|work) (here|at)|this (person|employee) (has left|no longer works)/i;

/** Detects wrong-recipient signals ahead of the existing optout/positive keyword rules in
 * ai.mjs#classifyReply -- "please remove me, this isn't the right department" should classify as
 * wrong_recipient, not optout, since the recipient themselves is not declining on the
 * organization's behalf. */
function detectWrongRecipient(text = '') {
  return WRONG_RECIPIENT_PATTERN.test(String(text || ''));
}

/**
 * The one canonical classifier. `parsed` is a parsed inbound message (`{ from, subject, body }`,
 * as produced by gmail.mjs#parseGmailMessage); `classifyReplyFn` defaults to ai.mjs#classifyReply
 * (injectable for tests / to avoid a live AI call). Returns `{ label, confidence, reason }` with
 * `label` always one of CANONICAL_REPLY_CLASSES.
 */
export async function classifyCanonReply(parsed = {}, { cfg = { provider: 'rules' }, classifyReplyFn } = {}) {
  const delivery = classifyDeliverySignal(parsed);
  if (delivery) return delivery; // bounce | complaint | automatic
  if (detectWrongRecipient(parsed.body || '')) return { label: 'wrong_recipient', confidence: 0.9, reason: 'Wrong-recipient/departed-contact phrase' };
  const classify = classifyReplyFn || (async (c, text) => (await import('./ai.mjs')).classifyReply(c, text));
  const result = await classify(cfg, parsed.body || '');
  // ai.mjs#classifyReply's own vocabulary (optout/positive/neutral/negative/automatic) is already
  // canonical except it never returns wrong_recipient (handled above) or bounce/complaint (handled
  // by classifyDeliverySignal above) -- passed through unchanged otherwise.
  return result;
}

/** Every class cancels outstanding follow-ups except 'automatic' (an auto-responder is not a
 * human reply and must not stop the sequence -- mirrors pipeline.mjs#pollReplies's existing
 * automatic-reschedule behavior). */
export function cancelsFollowups(label) {
  return label !== 'automatic';
}

/**
 * Applies the same cancel/reschedule semantics pipeline.mjs#pollReplies already uses for the
 * pre-Canon flow, to the SAME `prospects` collection -- there is no separate Canon prospect/reply
 * truth. Callers pass an already-stored `reply` row and its `classification`.
 */
export async function applyReplyClassification(store, prospect, classification, { at = new Date(), automaticRescheduleDays = 7 } = {}) {
  const cancel = cancelsFollowups(classification.label);
  const patch = cancel
    ? { status: ['bounce', 'complaint'].includes(classification.label) ? classification.label : 'replied', replyLabel: classification.label, repliedAt: at.toISOString(), nextFollowupAt: null }
    : { status: 'sent', replyLabel: classification.label, automaticReplyAt: at.toISOString(), nextFollowupAt: new Date(at.getTime() + automaticRescheduleDays * 86400000).toISOString() };
  return store.patch('prospects', prospect.id, patch);
}
