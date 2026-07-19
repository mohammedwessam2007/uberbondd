const REPLY_LABELS = Object.freeze([
  'interested', 'meeting-requested', 'asks-for-information', 'price-objection',
  'already-has-provider', 'not-now', 'not-interested', 'unsubscribe',
  'automatic-reply', 'bounce', 'complaint', 'unknown-needs-review'
]);

const LABEL_SET = new Set(REPLY_LABELS);
const POSITIVE = new Set(['interested', 'meeting-requested', 'asks-for-information']);
const OBJECTION = new Set(['price-objection', 'already-has-provider', 'not-now']);
const DOMAIN_SUPPRESSION = new Set(['unsubscribe', 'bounce', 'complaint']);

export { REPLY_LABELS };

function compact(value = '', maximum = 10000) {
  return String(value || '').replace(/\0/g, '').trim().slice(0, maximum);
}

export function visibleReplyText(parsed = {}) {
  const lines = compact(parsed.body || parsed.snippet).replace(/\r/g, '').split('\n');
  const kept = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(?:on .+ wrote:|from:\s|sent:\s|to:\s|subject:\s|-----original message-----)/i.test(trimmed)) break;
    if (/^>/.test(trimmed)) continue;
    kept.push(line);
  }
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 10000);
}

function result(label, confidence, reasonCode, source = 'deterministic') {
  return {
    label,
    confidence,
    reasonCode,
    source,
    humanReviewRequired: label === 'unknown-needs-review',
    humanReply: !['automatic-reply', 'bounce', 'complaint'].includes(label),
    stopsFollowup: true
  };
}

export function classifyReplyDeterministic(parsed = {}) {
  const subject = compact(parsed.subject, 500).toLowerCase();
  const body = visibleReplyText(parsed).toLowerCase();
  const from = compact(parsed.from, 500).toLowerCase();
  const autoSubmitted = compact(parsed.autoSubmitted, 120).toLowerCase();
  const text = `${subject}\n${body}`;

  if (/mailer-daemon|mail delivery subsystem|delivery status notification|undeliverable|address not found|recipient rejected|mailbox unavailable|550 5\.[0-9]\.[0-9]/.test(`${from}\n${text}`)) {
    return result('bounce', 0.99, 'delivery-failure-signal');
  }
  if (/spam complaint|reported (?:this )?(?:message )?as spam|feedback loop|complaint report/.test(text)) {
    return result('complaint', 0.98, 'complaint-signal');
  }
  if ((autoSubmitted && autoSubmitted !== 'no') || /automatic reply|auto-?reply|out of office|vacation responder|away from (?:the )?office|auto-submitted/.test(text)) {
    return result('automatic-reply', 0.97, 'automatic-reply-signal');
  }
  if (/\bunsubscribe\b|remove me|take me off|do not contact|don['’]?t contact|stop (?:emailing|contacting)|delete my (?:email|details)/.test(body)) {
    return result('unsubscribe', 0.99, 'explicit-unsubscribe');
  }
  if (/not interested|no thanks|not a fit|we['’]?ll pass|please don['’]?t send|do not send/.test(body)) {
    return result('not-interested', 0.97, 'explicit-not-interested');
  }
  if (/already (?:have|use|work|working) (?:with )?(?:an? )?(?:agency|provider|consultant|team)|(?:agency|provider|internal team) already handles|covered by (?:our|an?) (?:agency|provider|team)/.test(body)) {
    return result('already-has-provider', 0.95, 'existing-provider');
  }
  if (/not (?:right )?now|maybe later|next (?:month|quarter|year)|circle back|not a priority|too busy|revisit (?:this )?later/.test(body)) {
    return result('not-now', 0.94, 'timing-objection');
  }
  if (/too expensive|outside (?:our )?budget|no budget|can['’]?t afford|cannot afford|price is too high|cost is too high/.test(body)) {
    return result('price-objection', 0.96, 'price-objection');
  }
  if (/book (?:a )?(?:call|meeting)|schedule (?:a )?(?:call|meeting)|let['’]?s (?:talk|meet|schedule)|send (?:me )?(?:your )?calendar|what(?:'s| is) your availability|when can (?:we|you)/.test(body)) {
    return result('meeting-requested', 0.96, 'meeting-intent');
  }
  if (/send (?:me )?(?:more )?(?:details|information|info)|tell me more|how (?:does|would|do)\b|what (?:does|would|do)\b|can you (?:explain|share)|what(?:'s| is) (?:the )?(?:price|pricing|cost)|more information/.test(body)) {
    return result('asks-for-information', 0.93, 'information-request');
  }
  if (/\binterested\b|sounds good|worth exploring|please proceed|yes[,!. ]*$|^yes\b|happy to explore|open to (?:this|it|talking)/.test(body)) {
    return result('interested', 0.92, 'positive-intent');
  }
  return result('unknown-needs-review', 0.3, 'no-high-confidence-rule');
}

function normalizedAiResult(candidate = {}) {
  const label = String(candidate.label || '').trim().toLowerCase().replace(/[ _]+/g, '-');
  const confidence = Number(candidate.confidence || 0);
  if (!LABEL_SET.has(label) || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;
  return { label, confidence };
}

export async function classifyReplyWithFallback(parsed = {}, cfg = {}, aiClassifier = null) {
  const deterministic = classifyReplyDeterministic(parsed);
  if (deterministic.label !== 'unknown-needs-review' || !aiClassifier || cfg.provider === 'rules') return deterministic;
  try {
    const candidate = normalizedAiResult(await aiClassifier(cfg, visibleReplyText(parsed)));
    if (!candidate || candidate.confidence < 0.85) return deterministic;
    return result(candidate.label, candidate.confidence, 'ai-high-confidence', 'ai');
  } catch {
    return deterministic;
  }
}

export function extractMailbox(value = '') {
  const bracketed = /<([^<>\s]+@[^<>\s]+)>/.exec(String(value));
  const plain = /\b([A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i.exec(String(value));
  return String(bracketed?.[1] || plain?.[1] || '').trim().toLowerCase();
}

function messageId(value = '') {
  return compact(value, 500).replace(/\s+/g, '').toLowerCase();
}

function uniqueProspect(candidates, source, confidence) {
  const unique = [...new Map(candidates.filter(Boolean).map(prospect => [prospect.id, prospect])).values()];
  return unique.length === 1
    ? { prospect: unique[0], source, confidence, ambiguous: false }
    : { prospect: null, source: unique.length ? `${source}-ambiguous` : '', confidence: 0, ambiguous: unique.length > 1 };
}

export function matchReplyToProspect(parsed = {}, { prospects = [], messages = [], inbox = '' } = {}) {
  const eligible = prospect => !inbox || !prospect.inbox || prospect.inbox === inbox;
  if (parsed.threadId) {
    const direct = prospects.filter(prospect => eligible(prospect) && prospect.threadId === parsed.threadId);
    const viaMessages = messages
      .filter(message => (!inbox || !message.inbox || message.inbox === inbox) && message.threadId === parsed.threadId)
      .map(message => prospects.find(prospect => prospect.id === message.prospectId && eligible(prospect)));
    const match = uniqueProspect([...direct, ...viaMessages], 'gmail-thread', 1);
    if (match.prospect || match.ambiguous) return match;
  }
  const inReplyTo = messageId(parsed.inReplyTo);
  if (inReplyTo) {
    const viaReference = messages
      .filter(message => eligible(prospects.find(prospect => prospect.id === message.prospectId) || {}) && messageId(message.rfcMessageId) === inReplyTo)
      .map(message => prospects.find(prospect => prospect.id === message.prospectId));
    const match = uniqueProspect(viaReference, 'rfc-in-reply-to', 0.99);
    if (match.prospect || match.ambiguous) return match;
  }
  const sender = extractMailbox(parsed.from);
  if (sender) {
    const viaSender = prospects.filter(prospect => eligible(prospect) &&
      ['sent', 'replied', 'bounce', 'complaint', 'suppressed'].includes(String(prospect.status || '')) &&
      String(prospect.contact?.email || '').trim().toLowerCase() === sender);
    const match = uniqueProspect(viaSender, 'exact-sender-fallback', 0.8);
    if (match.prospect || match.ambiguous) return match;
  }
  return { prospect: null, source: 'unmatched', confidence: 0, ambiguous: false };
}

export function responseDraftFor(classification = {}, parsed = {}) {
  const inboundSubject = compact(parsed.subject, 150).split(/\r?\n/, 1)[0].replace(/^(?:re:\s*)+/i, '');
  const subject = `Re: ${inboundSubject || 'Your reply'}`.slice(0, 160);
  const bodies = {
    interested: 'Thanks for getting back to me. I’ll prepare a concise implementation outline tied to the website evidence for your review. Which outcome would be most useful to focus on?',
    'meeting-requested': 'Thanks for getting back to me. I can prepare a few meeting options for you to choose from. Which time zone should I use?',
    'asks-for-information': 'Thanks for getting back to me. I can prepare a concise outline tied to the website observation for your review. Which part would be most useful to expand on?'
  };
  const body = bodies[classification.label];
  if (!body) return null;
  return {
    status: 'needs-owner-approval',
    subject,
    body,
    source: 'deterministic',
    sendEligible: false,
    createdAt: new Date().toISOString()
  };
}

export function validateResponseDraft(input = {}) {
  const rawSubject = String(input.subject || '');
  const rawBody = String(input.body || '');
  const subject = compact(rawSubject, 160).replace(/[\r\n]+/g, ' ');
  const body = compact(rawBody, 1200);
  const reasons = [];
  if (!subject || !body) reasons.push('subject-and-body-required');
  if (rawSubject.length > 160) reasons.push('subject-too-long');
  if (rawBody.length > 1200) reasons.push('response-too-long');
  if (body.split(/\s+/).filter(Boolean).length > 120) reasons.push('response-too-long');
  if (/https?:\/\/|www\./i.test(body)) reasons.push('automatic-link-prohibited');
  if (/\b(?:guarantee|guaranteed|discount|limited time|urgent|contract|checkout|payment link|send (?:a )?proposal|attached proposal)\b/i.test(`${subject}\n${body}`)) reasons.push('commercial-automation-prohibited');
  if (/(?:[$€£]\s?\d|\b\d+(?:\.\d+)?\s?(?:usd|eur|gbp|aed|sar)\b)/i.test(body)) reasons.push('owner-priced-response-required');
  return { ok: reasons.length === 0, subject, body, reasons: [...new Set(reasons)], sendEligible: false };
}

export function suppressionPolicy(label = '') {
  return {
    suppressEmail: DOMAIN_SUPPRESSION.has(label) || label === 'not-interested',
    suppressDomain: DOMAIN_SUPPRESSION.has(label)
  };
}

export function prospectReplyPatch(classification = {}, at = new Date().toISOString()) {
  const label = classification.label || 'unknown-needs-review';
  const base = {
    replyLabel: label,
    replyClassification: classification,
    repliedAt: at,
    nextFollowupAt: null,
    needsReplyReview: classification.humanReviewRequired === true,
    updatedAt: at
  };
  if (label === 'unsubscribe') return { ...base, status: 'suppressed', acquisitionStatus: 'unsubscribed', unsubscribedAt: at };
  if (label === 'bounce') return { ...base, status: 'bounce', acquisitionStatus: 'bounced', bouncedAt: at };
  if (label === 'complaint') return { ...base, status: 'complaint', acquisitionStatus: 'complaint', complaintAt: at };
  if (label === 'not-interested') return { ...base, status: 'replied', acquisitionStatus: 'not-interested' };
  if (OBJECTION.has(label)) return { ...base, status: 'replied', acquisitionStatus: 'objection' };
  if (POSITIVE.has(label)) return { ...base, status: 'replied', acquisitionStatus: 'interested' };
  if (label === 'automatic-reply') return { ...base, status: 'replied', acquisitionStatus: 'replied', automaticReplyAt: at };
  return { ...base, status: 'replied', acquisitionStatus: 'replied' };
}
