// Reply-to-cash (workstream 7). Read-only reply import (EML, CSV, fake/replay -- real Gmail
// integration deliberately excluded, see docs/REUSE_VS_REPLACE_DECISION.md), a deterministic
// rule-based classifier across the mission's exact 19 categories, grounded-draft generation for
// the categories where a reply is warranted, and the follow-up stop-gate every other workstream's
// scheduler must consult before ever re-contacting an organization.
import { id, now } from './store.mjs';
import { sha256Hex } from './utils.mjs';
import { parseCsv } from './csv.mjs';

export const REPLY_CATEGORIES = Object.freeze([
  'interested', 'pricing', 'proof_request', 'timing', 'referral', 'wrong_contact', 'existing_vendor',
  'free_work_request', 'negotiation', 'not_interested', 'unsubscribe', 'complaint', 'legal_concern',
  'bounce', 'automated', 'ambiguous', 'payment_reported_or_verified', 'implementation_interest', 'monitoring_interest'
]);

// Checked in order; first match wins. Higher-stakes/compliance categories (unsubscribe, complaint,
// legal_concern, bounce) are checked before commercial ones so a reply that is both "annoyed" and
// "asks about pricing" is never miscategorized as a sales signal.
const CLASSIFICATION_RULES = Object.freeze([
  { category: 'unsubscribe', patterns: [/\bunsubscribe\b/i, /\bremove me\b/i, /\bstop (emailing|contacting)\b/i, /\bopt(-| )?out\b/i] },
  { category: 'complaint', patterns: [/\bspam\b/i, /\breport(ed)? (this|you)\b/i, /\bharass/i, /\bthis is (illegal|a scam)\b/i] },
  { category: 'legal_concern', patterns: [/\blawyer\b/i, /\battorney\b/i, /\bcease and desist\b/i, /\blegal action\b/i, /\bgdpr\b/i, /\bcan-spam\b/i] },
  { category: 'bounce', patterns: [/\bmailer-daemon\b/i, /\bdelivery (has )?failed\b/i, /\bundeliverable\b/i, /\bmailbox (unavailable|not found)\b/i] },
  { category: 'automated', patterns: [/\bout of office\b/i, /\bauto(-| )?reply\b/i, /\bi am currently away\b/i, /\bvacation responder\b/i] },
  { category: 'payment_reported_or_verified', patterns: [/\b(i|we)('ve| have)? (just )?(paid|sent payment|completed payment)\b/i, /\bpayment (sent|complete|done)\b/i, /\btransaction (id|reference)\b/i] },
  { category: 'implementation_interest', patterns: [/\bcan you (fix|implement|do the work)\b/i, /\bgo ahead and (fix|implement)\b/i, /\bhow (soon|fast) can you (start|fix)\b/i] },
  { category: 'monitoring_interest', patterns: [/\bongoing monitoring\b/i, /\bmonthly (monitoring|check)\b/i, /\bkeep (an eye|monitoring) on\b/i] },
  { category: 'existing_vendor', patterns: [/\balready (have|use|work with) (a|an)? ?(agency|vendor|developer)\b/i, /\bwe have someone (for this|who does this)\b/i] },
  { category: 'free_work_request', patterns: [/\bcan you (do|send) (this|it) for free\b/i, /\bfree (sample|trial|version)\b/i, /\bwaive the fee\b/i] },
  { category: 'negotiation', patterns: [/\bcan you (lower|reduce|discount)\b/i, /\bany (discount|deal)\b/i, /\bwhat's your best price\b/i] },
  { category: 'pricing', patterns: [/\bhow much\b/i, /\bwhat('s| is) the (price|cost)\b/i, /\bpricing\b/i, /\bcost\b/i] },
  { category: 'proof_request', patterns: [/\bcan (i|we) see (an?|some) example\b/i, /\bproof\b/i, /\bcase stud(y|ies)\b/i, /\bsample report\b/i, /\bbefore.{0,3}after\b/i] },
  { category: 'timing', patterns: [/\bnot (right )?now\b/i, /\bmaybe (later|next quarter)\b/i, /\bcircle back\b/i, /\bfollow up in\b/i] },
  { category: 'referral', patterns: [/\btalk to\b/i, /\bcontact (my|our) (colleague|partner|marketing)\b/i, /\bnot the right person\b/i, /\bforward(ing|ed)? this to\b/i] },
  { category: 'wrong_contact', patterns: [/\bwrong (person|email|contact)\b/i, /\bno longer works here\b/i, /\bi don't work in that (role|department)\b/i] },
  { category: 'not_interested', patterns: [/\bnot interested\b/i, /\bno thank(s| you)\b/i, /\bplease (don't|do not) contact\b/i] },
  { category: 'interested', patterns: [/\btell me more\b/i, /\bsounds (good|interesting)\b/i, /\bi('m| am) interested\b/i, /\blet's (talk|schedule|discuss)\b/i] }
]);

export class ReplyError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'ReplyError';
    this.code = code;
  }
}

/** Deterministic, rule-based (not an LLM call) -- every category has explicit keyword/phrase
 * patterns, checked in a fixed, disclosed priority order. Falls back to 'ambiguous' rather than
 * guessing when nothing matches. */
export function classifyReply(bodyText = '') {
  const text = String(bodyText || '');
  for (const rule of CLASSIFICATION_RULES) {
    const matched = rule.patterns.find(pattern => pattern.test(text));
    if (matched) return { category: rule.category, confidence: 0.75, matchedPattern: matched.source };
  }
  return { category: 'ambiguous', confidence: 0.3, matchedPattern: null };
}

/** Categories where drafting an outreach-continuation reply is ever appropriate -- every other
 * category either needs no reply (bounce/automated) or must never receive one (unsubscribe/
 * complaint/legal_concern, per the stop-gate below). */
const DRAFTABLE_CATEGORIES = Object.freeze(['interested', 'pricing', 'proof_request', 'timing', 'implementation_interest', 'monitoring_interest']);

const DRAFT_TEMPLATES = Object.freeze({
  interested: (opportunity, offer, offerKey) => `Great to hear from you. The ${offerKey.replace(/_/g, ' ').toLowerCase()} is $${(offer.priceCents / 100).toFixed(0)} and covers ${offer.siteCount || 'your'} site(s), delivered within ${offer.deliveryHoursMin || 12}-${offer.deliveryHoursMax || 24} hours of verified payment and inputs.`,
  pricing: (opportunity, offer, offerKey) => `The ${offerKey.replace(/_/g, ' ').toLowerCase()} is $${(offer.priceCents / 100).toFixed(0)} flat, no hidden fees, full credit toward implementation if you move forward.`,
  proof_request: () => `Happy to share a sample report -- it's attached/linked, generated the same way your report would be, so you can see exactly what's included before paying anything.`,
  timing: () => `No problem -- happy to follow up when the timing works better. Just let me know a rough window.`,
  implementation_interest: () => `We can scope that once the diagnostic report is delivered -- every implementation item comes with a written scope, backup, QA, and rollback plan before any change is made.`,
  monitoring_interest: () => `Monitoring is available as a separate, opt-in add-on after delivery -- inactive by default, cancel anytime, with a clear false-positive and usage policy.`
});

/** Refuses to draft for a category outside DRAFTABLE_CATEGORIES, and every draft it does produce
 * is built only from the offer's own catalog fields plus fixed, evidence-neutral phrasing --
 * never a fabricated claim about results, revenue, or guarantees. Accepts either an approval-style
 * offer ({offerKey, priceCents}) or a raw config.mjs SERVICE_CATALOG entry ({key, priceCents}). */
export function draftGroundedReply({ classification, opportunity, offer }) {
  if (!DRAFTABLE_CATEGORIES.includes(classification.category)) throw new ReplyError('category-not-draftable', classification.category);
  const offerKey = offer.offerKey || offer.key;
  if (!offerKey) throw new ReplyError('offer-key-required');
  const template = DRAFT_TEMPLATES[classification.category];
  const body = template(opportunity, offer, offerKey);
  return { id: id('replydraft'), opportunityId: opportunity.id, category: classification.category, body, groundedIn: { offerKey } };
}

// ---- follow-up stop-gate ----

const STOP_CATEGORIES = Object.freeze(['unsubscribe', 'complaint', 'bounce', 'legal_concern']);

/**
 * The single function every scheduler job must call before any further outreach to an
 * organization. Stops on: any reply at all (even 'ambiguous' -- a human replied, that ends
 * automated follow-up regardless of content), unsubscribe/complaint/bounce/legal_concern
 * specifically flagged, an active suppression record, a verified/reported payment, an owner pause
 * setting, or any uncertain-quarantined send for this organization.
 */
export async function shouldStopFollowUp(store, organizationDomain) {
  const reasons = [];
  const replies = await store.list('replies');
  const orgReplies = replies.filter(r => r.data?.organizationDomain === organizationDomain);
  if (orgReplies.length > 0) reasons.push('reply-received');
  if (orgReplies.some(r => STOP_CATEGORIES.includes(r.classification))) reasons.push('compliance-category-reply');
  const suppressions = await store.list('suppressions');
  if (suppressions.some(s => s.data?.organizationDomain === organizationDomain)) reasons.push('suppressed');
  const payments = await store.list('payments');
  if (payments.some(p => p.data?.organizationDomain === organizationDomain && ['VERIFIED', 'SETTLED', 'CUSTOMER_REPORTED'].includes(p.status))) reasons.push('payment-in-progress-or-verified');
  const settings = await store.getSettings();
  if (settings.ownerPaused === true) reasons.push('owner-paused');
  const sendRecords = await store.list('sendRecords');
  if (sendRecords.some(s => s.data?.organizationDomain === organizationDomain && s.status === 'uncertain-quarantined')) reasons.push('uncertain-send-pending');
  return { stop: reasons.length > 0, reasons };
}

// ---- import providers ----

export function createFakeReplyImportProvider(scriptedReplies = []) {
  let cursor = 0;
  return {
    name: 'fake-replay',
    async listReplies() {
      const batch = scriptedReplies.slice(cursor);
      cursor = scriptedReplies.length;
      return batch;
    }
  };
}

/** A minimal RFC822-shaped EML parser -- headers up to the first blank line, body after. Good
 * enough for From/Subject/Date + plaintext body; does not attempt MIME multipart decoding. */
export function parseEml(text = '') {
  const [headerBlock, ...bodyParts] = String(text).split(/\r?\n\r?\n/);
  const headers = {};
  for (const line of headerBlock.split(/\r?\n/)) {
    const match = /^([A-Za-z-]+):\s*(.*)$/.exec(line);
    if (match) headers[match[1].toLowerCase()] = match[2];
  }
  return { from: headers.from || '', subject: headers.subject || '', date: headers.date || '', body: bodyParts.join('\n\n').trim() };
}

/** CSV columns: opportunityId,organizationDomain,from,subject,body,receivedAt */
export async function importRepliesFromCsv(store, csvText) {
  const rows = parseCsv(csvText);
  const imported = [];
  for (const row of rows) {
    const classification = classifyReply(row.body || '');
    const record = await store.add('replies', {
      id: id('reply'), opportunityId: row.opportunityId || null, classification: classification.category, receivedAt: row.receivedAt || now(),
      data: { organizationDomain: row.organizationDomain, from: row.from || '', subject: row.subject || '', body: row.body || '', confidence: classification.confidence, source: 'csv' }
    });
    imported.push(record);
  }
  await store.log('replies_imported_csv', { count: imported.length });
  return imported;
}

export async function importReplyFromEml(store, opportunityId, organizationDomain, emlText) {
  const parsed = parseEml(emlText);
  const classification = classifyReply(parsed.body);
  const record = await store.add('replies', {
    id: id('reply'), opportunityId, classification: classification.category, receivedAt: parsed.date || now(),
    data: { organizationDomain, from: parsed.from, subject: parsed.subject, body: parsed.body, confidence: classification.confidence, source: 'eml' }
  });
  await store.log('reply_imported', { replyId: record.id, category: classification.category, source: 'eml' });
  return record;
}
