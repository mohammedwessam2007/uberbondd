import { createHash } from 'node:crypto';
import {
  contactEligibility, evidenceEligibility, suppressionLookup, sendIdempotencyKey,
  normalizeCountry, normalizeCountryList, resolveRecipientTimeZone, localBusinessTime,
  evaluateSendEligibility, outboundVolumeWindow, countActiveOutboundReservations
} from './send-safety.mjs';

// Bump when the decision logic changes so past receipts stay attributable to the
// policy version that produced them.
export const POLICY_VERSION = 'deliverability-guard-1.0.0';

const STALE_RESERVATION_MS = 30 * 60 * 1000;

const UNSUPPORTED_CLAIM_PATTERNS = [
  { code: 'guarantee', pattern: /\bguarantee(d|s)?\b/i },
  { code: 'absolute-percentage', pattern: /\b100%\b/i },
  { code: 'risk-free', pattern: /\brisk[- ]free\b/i },
  { code: 'superlative-rank', pattern: /\b(best|#1|number one)\s+in\s+the\s+(world|industry|market)\b/i },
  { code: 'instant-results', pattern: /\binstant(ly)?\s+results?\b/i },
  { code: 'proven-to', pattern: /\bproven\s+to\b/i }
];

function detectUnsupportedClaims(text = '') {
  const haystack = String(text || '');
  return UNSUPPORTED_CLAIM_PATTERNS.filter(({ pattern }) => pattern.test(haystack)).map(({ code }) => code);
}

function ownerBurdenDescription(decision) {
  if (decision === 'ALLOW_LOCAL_PREPARATION') return 'No owner action required to prepare this draft locally; live sending remains structurally disabled regardless.';
  if (decision === 'REVIEW_REQUIRED') return 'Owner must review and explicitly approve before this prospect can ever be sent.';
  return 'Owner must resolve every listed reason code before this action can be reconsidered.';
}

function reversibleNextStep(decision) {
  if (decision === 'ALLOW_LOCAL_PREPARATION') return 'Prepare and store the draft locally only; no provider was called and no state outside the receipt was mutated.';
  if (decision === 'REVIEW_REQUIRED') return 'No state was mutated. Owner may approve the specific prospect or enable campaign.autoSend, then re-run the guard.';
  return 'No state was mutated. Resolve the listed reason codes, then re-run the guard; the prior denial is superseded by the newest decision.';
}

function malformedReceipt(reasons, timestamp) {
  return {
    decision: 'DENY',
    reasonCodes: reasons,
    denyReasonCodes: reasons,
    reviewReasonCodes: [],
    evidenceReferences: [],
    policyVersion: POLICY_VERSION,
    authorityUsed: null,
    suppressionResult: null,
    deduplicationResult: null,
    confidence: 0,
    costEstimate: { amountCents: 0, currency: 'USD', basis: 'no-action-taken' },
    ownerBurden: { manualStepsRequired: null, description: ownerBurdenDescription('DENY') },
    idempotencyKey: '',
    workspaceId: null,
    actionIdentity: null,
    timestamp,
    reversibleNextStep: reversibleNextStep('DENY')
  };
}

// A stable per-logical-send id (idempotencyKey) can and should stay the same
// across retries. actionIdentity is different on purpose: it is a content hash
// that changes whenever the message, recipient, evidence, authority, or policy
// version changes, so a receipt can be checked against the *current* action
// instead of just the current idempotency key.
function computeActionIdentity({ campaign, prospect, followup, subject, body }) {
  const material = {
    campaignId: campaign.id,
    prospectId: prospect.id,
    followup: Number(followup || 0),
    recipientEmail: String(prospect.contact?.email || '').trim().toLowerCase(),
    messageSubject: String(subject || prospect.subject || ''),
    messageBody: String(body || prospect.draft || ''),
    evidenceUrl: prospect.issue?.evidenceUrl || '',
    evidenceExcerpt: prospect.issue?.evidenceExcerpt || '',
    evidenceConfidence: Number(prospect.issue?.confidence || 0),
    campaignApproved: Boolean(campaign.approved),
    campaignAutoSend: Boolean(campaign.autoSend),
    policyVersion: POLICY_VERSION
  };
  return createHash('sha256').update(JSON.stringify(material)).digest('hex').slice(0, 32);
}

// Pure, side-effect-free deterministic gate. Reads existing canonical records
// (suppressions, outboundReservations, senderHealth, settings, accounts) and never
// writes, reserves, or calls a provider — even an ALLOW_LOCAL_PREPARATION result
// only means "safe to draft," not "safe to send."
export async function evaluateDeliverabilityGuard({
  store, prospect, campaign, cfg, date = new Date(), followup = 0, body, subject, excludeReservationId = ''
} = {}) {
  const referenceDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const referenceMs = referenceDate.getTime();
  const timestamp = referenceDate.toISOString();

  const malformed = [];
  if (!store || typeof store.list !== 'function') malformed.push('malformed-input-store');
  if (!prospect || !prospect.id) malformed.push('malformed-input-prospect');
  if (!campaign || !campaign.id) malformed.push('malformed-input-campaign');
  if (!cfg || typeof cfg !== 'object') malformed.push('malformed-input-config');
  if (malformed.length) return malformedReceipt(malformed, timestamp);

  const deny = [];
  const review = [];

  if (prospect.campaignId && prospect.campaignId !== campaign.id) deny.push('cross-campaign-mismatch');

  const idempotencyKey = sendIdempotencyKey(prospect.id, followup);

  const suppression = await suppressionLookup(store, { website: prospect.website, email: prospect.contact?.email });
  if (suppression.suppressed) deny.push(`suppressed:${suppression.reason || 'listed'}`);

  const existingReservations = await store.list('outboundReservations', { filters: { idempotencyKey } });
  const existingReservation = existingReservations.find(item => item.id !== excludeReservationId) || null;
  const deduplication = { duplicate: Boolean(existingReservation), idempotencyKey, existingReservation };
  if (existingReservation) {
    if (['sent', 'dispatching', 'uncertain'].includes(existingReservation.status)) {
      deny.push(`replay-idempotency-key:${existingReservation.status}`);
    } else if (existingReservation.status === 'reserved') {
      const age = referenceMs - Date.parse(existingReservation.reservedAt || existingReservation.createdAt || 0);
      if (Number.isFinite(age) && age > STALE_RESERVATION_MS) review.push('stale-reservation-detected');
      else deny.push('duplicate-reservation-in-progress');
    }
  }

  const contact = contactEligibility(prospect.contact, prospect);
  if (!contact.ok) deny.push(`contact:${contact.reason}`);

  const evidence = evidenceEligibility(prospect, campaign, cfg);
  if (!evidence.ok) deny.push(`evidence:${evidence.reason}`);

  const maxEvidenceAgeDays = Number(cfg.outbound?.maxEvidenceAgeDays ?? 45);
  const evidenceTimestamp = prospect.completedAt || prospect.crawl?.startedAt || '';
  if (evidenceTimestamp) {
    const ageMs = referenceMs - Date.parse(evidenceTimestamp);
    if (Number.isFinite(ageMs) && ageMs > maxEvidenceAgeDays * 86400000) deny.push('evidence-expired');
  }

  const country = normalizeCountry(prospect.country || prospect.countryCode);
  const systemAllowlist = normalizeCountryList(cfg.outbound?.allowedCountries || []);
  const campaignAllowlist = normalizeCountryList(campaign.allowedCountries || []);
  if (!country) deny.push('country-missing');
  else {
    if (!systemAllowlist.includes(country)) deny.push('country-not-system-allowed');
    if (!campaignAllowlist.includes(country)) deny.push('country-not-campaign-allowed');
  }

  const timeZone = resolveRecipientTimeZone(prospect);
  if (!timeZone) {
    deny.push('recipient-timezone-missing');
  } else {
    const local = localBusinessTime(timeZone, date);
    if (!local.valid) deny.push('recipient-timezone-invalid');
    else {
      const start = Number(cfg.outbound?.businessHourStart ?? 9);
      const end = Number(cfg.outbound?.businessHourEnd ?? 17);
      if (['Sat', 'Sun'].includes(local.weekday) || local.hour < start || local.hour >= end) deny.push('outside-safety-window');
    }
  }

  const claims = detectUnsupportedClaims(`${subject || prospect.subject || ''}\n${body || prospect.draft || ''}`);
  if (claims.length) deny.push(`unsupported-claims:${claims.join(',')}`);

  if (!String(cfg.sender?.address || '').trim()) deny.push('sender-identity-missing');

  const senderHealthRows = await store.list('senderHealth', { filters: { inbox: prospect.inbox } });
  const senderHealth = senderHealthRows[0] || null;
  if (senderHealth?.paused) deny.push(`sender-health-paused:${senderHealth.pauseReason || 'unknown'}`);

  const settings = await store.getSettings();
  if (settings?.outboundPaused) deny.push('global-outbound-paused');

  if (!campaign.approved) deny.push('authority-campaign-not-approved');
  if (campaign.expiresAt && Date.parse(campaign.expiresAt) < referenceMs) deny.push('authority-campaign-expired');
  if (campaign.approved && !campaign.autoSend) review.push('owner-review-required-autosend-disabled');

  const account = await store.findOne('accounts', { slot: prospect.inbox });
  if (!account?.connected) deny.push('provider-capability-absent');

  const configuredDaily = Number(cfg.caps?.[prospect.inbox] ?? 0);
  const campaignDaily = Number(campaign.dailyCaps?.[prospect.inbox] ?? configuredDaily);
  const dailyCap = Math.max(0, Math.min(campaignDaily, configuredDaily));
  const hourlyCap = Math.max(0, Number(cfg.outbound?.hourlyCaps?.[prospect.inbox] ?? 0));
  const { day, hour } = outboundVolumeWindow(timestamp);
  const inboxReservations = await store.list('outboundReservations', { filters: { inbox: prospect.inbox } });
  const { daily: dailyCount, hourly: hourlyCount } = countActiveOutboundReservations(inboxReservations, {
    inbox: prospect.inbox, day, hour, excludeReservationId
  });
  if (dailyCount >= dailyCap) deny.push('daily-volume-ceiling-exceeded');
  if (hourlyCount >= hourlyCap) deny.push('hourly-volume-ceiling-exceeded');

  const fullSendGate = evaluateSendEligibility({
    prospect: { ...prospect, draft: body || prospect.draft, subject: subject || prospect.subject },
    campaign, cfg, date, followup
  });

  const decision = deny.length ? 'DENY' : (review.length ? 'REVIEW_REQUIRED' : 'ALLOW_LOCAL_PREPARATION');

  return {
    decision,
    reasonCodes: decision === 'DENY' ? deny : (decision === 'REVIEW_REQUIRED' ? review : []),
    denyReasonCodes: deny,
    reviewReasonCodes: review,
    evidenceReferences: prospect.issue?.evidenceUrl
      ? [{ url: prospect.issue.evidenceUrl, excerpt: prospect.issue.evidenceExcerpt || '', confidence: Number(prospect.issue.confidence || 0) }]
      : [],
    policyVersion: POLICY_VERSION,
    authorityUsed: {
      campaignId: campaign.id,
      campaignApproved: Boolean(campaign.approved),
      campaignAutoSend: Boolean(campaign.autoSend),
      outboundStructurallyEnabled: Boolean(cfg.outbound?.enabled && !cfg.outbound?.dryRun),
      fullSendGate: { ok: fullSendGate.ok, reason: fullSendGate.reason || null }
    },
    suppressionResult: suppression,
    deduplicationResult: deduplication,
    confidence: Number(prospect.issue?.confidence || 0),
    costEstimate: { amountCents: 0, currency: 'USD', basis: 'gmail-api-no-per-send-fee' },
    ownerBurden: {
      manualStepsRequired: decision === 'ALLOW_LOCAL_PREPARATION' ? 0 : decision === 'REVIEW_REQUIRED' ? 1 : null,
      description: ownerBurdenDescription(decision)
    },
    idempotencyKey,
    workspaceId: campaign.id,
    actionIdentity: computeActionIdentity({ campaign, prospect, followup, subject, body }),
    timestamp,
    reversibleNextStep: reversibleNextStep(decision)
  };
}
