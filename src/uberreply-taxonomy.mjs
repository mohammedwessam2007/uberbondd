export const UBERREPLY_TAXONOMY_VERSION = 'uberbond.uberreply-taxonomy.v1';

export const UBERREPLY_LABELS = Object.freeze([
  'optout',
  'positive',
  'negative',
  'objection',
  'referral',
  'wrong_person',
  'out_of_office',
  'automatic',
  'neutral'
]);

const text = (value, max = 12000) => String(value ?? '').trim().slice(0, max);
const lower = value => text(value).toLowerCase();
const clamp = value => Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : 0;

const RULES = Object.freeze([
  {
    label: 'optout', confidence: 0.99,
    pattern: /\b(unsubscribe|remove me|remove this email|stop emailing|stop contacting|do not contact|don't contact|take me off|opt[ -]?out)\b/i,
    reason: 'explicit-contact-stop-request'
  },
  {
    label: 'out_of_office', confidence: 0.98,
    pattern: /\b(out of (?:the )?office|on (?:annual )?leave|away from (?:the )?office|on vacation|annual leave|return(?:ing)? on|back in the office)\b/i,
    reason: 'temporary-absence-autoreply'
  },
  {
    label: 'automatic', confidence: 0.96,
    pattern: /\b(automatic reply|auto[- ]?reply|automated response|do not reply|mailbox (?:is )?not monitored|delivery status notification|vacation responder)\b/i,
    reason: 'automatic-system-response'
  },
  {
    label: 'wrong_person', confidence: 0.94,
    pattern: /\b(wrong person|not the right person|you have the wrong|not my (?:area|department|responsibility)|i no longer work|no longer with|left the company)\b/i,
    reason: 'recipient-disclaims-relevance-or-role'
  },
  {
    label: 'referral', confidence: 0.9,
    pattern: /\b(contact|speak to|talk to|reach out to|email|try|best person is|right person is|looping in|copying|cc(?:'|’)ing)\b.{0,80}\b(?:my|our|the|her|him|them|team|colleague|manager|director|head|owner|ceo|cto|cmo|sales|marketing|operations)\b/i,
    reason: 'recipient-refers-to-another-contact'
  },
  {
    label: 'objection', confidence: 0.88,
    pattern: /\b(already (?:have|use|work with)|not (?:a )?priority|no budget|budget (?:is )?tight|too expensive|bad timing|not right now|maybe later|circle back|check back|under contract|happy with (?:our|the) current)\b/i,
    reason: 'commercial-or-timing-objection'
  },
  {
    label: 'negative', confidence: 0.93,
    pattern: /\b(no thanks|not interested|not a fit|we(?:'|’)ll pass|i(?:'|’)ll pass|please pass|not relevant|not for us)\b/i,
    reason: 'explicit-negative-interest'
  },
  {
    label: 'positive', confidence: 0.84,
    pattern: /\b(interested|send it|send (?:me|us) (?:the|more)|tell me more|sounds good|let(?:'|’)s talk|book|schedule|call|meeting|proposal|pricing|price|quote|demo|next steps?)\b/i,
    reason: 'positive-commercial-intent'
  }
]);

const ACTIONS = Object.freeze({
  optout: { sequence: 'STOP', ownerAction: 'NONE', suppress: true, snoozeDays: 0 },
  positive: { sequence: 'STOP', ownerAction: 'RESPOND', suppress: false, snoozeDays: 0 },
  negative: { sequence: 'STOP', ownerAction: 'NONE', suppress: true, snoozeDays: 0 },
  objection: { sequence: 'STOP', ownerAction: 'RESPOND', suppress: false, snoozeDays: 0 },
  referral: { sequence: 'STOP', ownerAction: 'RESPOND_AND_RESEARCH_REFERRAL', suppress: false, snoozeDays: 0 },
  wrong_person: { sequence: 'STOP', ownerAction: 'RESEARCH_CORRECT_CONTACT', suppress: true, snoozeDays: 0 },
  out_of_office: { sequence: 'SNOOZE', ownerAction: 'NONE', suppress: false, snoozeDays: 7 },
  automatic: { sequence: 'SNOOZE', ownerAction: 'NONE', suppress: false, snoozeDays: 7 },
  neutral: { sequence: 'STOP', ownerAction: 'REVIEW', suppress: false, snoozeDays: 0 }
});

export function classifyReplyTaxonomy(value = '') {
  const body = text(value);
  if (!body) return { version: UBERREPLY_TAXONOMY_VERSION, label: 'neutral', confidence: 0, reason: 'empty-reply', ...ACTIONS.neutral };
  for (const rule of RULES) {
    if (rule.pattern.test(body)) {
      return Object.freeze({
        version: UBERREPLY_TAXONOMY_VERSION,
        label: rule.label,
        confidence: rule.confidence,
        reason: rule.reason,
        ...ACTIONS[rule.label]
      });
    }
  }
  return Object.freeze({
    version: UBERREPLY_TAXONOMY_VERSION,
    label: 'neutral',
    confidence: 0.45,
    reason: 'no-decisive-deterministic-rule',
    ...ACTIONS.neutral
  });
}

export function normalizeReplyClassification(candidate = {}, replyText = '') {
  const deterministic = classifyReplyTaxonomy(replyText);
  const label = lower(candidate?.label, 60).replaceAll('-', '_').replaceAll(' ', '_');
  const aliases = {
    opt_out: 'optout',
    unsubscribe: 'optout',
    automatic_reply: 'automatic',
    auto_reply: 'automatic',
    ooo: 'out_of_office',
    wrongperson: 'wrong_person'
  };
  const normalized = aliases[label] || label;
  if (!UBERREPLY_LABELS.includes(normalized)) return deterministic;

  // High-confidence safety/absence rules dominate a model's broad label.
  if (['optout', 'out_of_office', 'automatic', 'wrong_person'].includes(deterministic.label)
      && deterministic.confidence >= 0.94) return deterministic;

  return Object.freeze({
    version: UBERREPLY_TAXONOMY_VERSION,
    label: normalized,
    confidence: clamp(candidate.confidence),
    reason: text(candidate.reason, 500) || 'normalized-model-classification',
    ...ACTIONS[normalized]
  });
}
