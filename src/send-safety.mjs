import crypto from 'node:crypto';
import { normalizeDomain } from './utils.mjs';
import { emailDomain, isFreePersonalEmail, isRiskyMailbox, isSameBusinessDomain, normalizeEmail } from './contacts.mjs';

const COUNTRY_ALIASES = new Map(Object.entries({
  gb:'GB',uk:'GB','united kingdom':'GB','great britain':'GB',england:'GB',scotland:'GB',wales:'GB',
  ie:'IE',ireland:'IE',de:'DE',germany:'DE',fr:'FR',france:'FR',nl:'NL',netherlands:'NL',
  be:'BE',belgium:'BE',ch:'CH',switzerland:'CH',at:'AT',austria:'AT',es:'ES',spain:'ES',
  pt:'PT',portugal:'PT',it:'IT',italy:'IT',se:'SE',sweden:'SE',no:'NO',norway:'NO',
  dk:'DK',denmark:'DK',fi:'FI',finland:'FI',nz:'NZ','new zealand':'NZ',sg:'SG',singapore:'SG',
  us:'US',usa:'US','united states':'US','united states of america':'US',ca:'CA',canada:'CA',
  au:'AU',australia:'AU',ae:'AE',uae:'AE','united arab emirates':'AE',
  sa:'SA','saudi arabia':'SA',qa:'QA',qatar:'QA',kw:'KW',kuwait:'KW',
  bh:'BH',bahrain:'BH',om:'OM',oman:'OM'
}));

const DEFAULT_TIMEZONES = new Map(Object.entries({
  GB:'Europe/London', IE:'Europe/Dublin', DE:'Europe/Berlin', FR:'Europe/Paris', NL:'Europe/Amsterdam',
  BE:'Europe/Brussels', CH:'Europe/Zurich', AT:'Europe/Vienna', ES:'Europe/Madrid', PT:'Europe/Lisbon',
  IT:'Europe/Rome', SE:'Europe/Stockholm', NO:'Europe/Oslo', DK:'Europe/Copenhagen', FI:'Europe/Helsinki',
  NZ:'Pacific/Auckland', SG:'Asia/Singapore', AE:'Asia/Dubai', SA:'Asia/Riyadh',
  QA:'Asia/Qatar', KW:'Asia/Kuwait', BH:'Asia/Bahrain', OM:'Asia/Muscat'
}));

export function normalizeCountry(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const lowered = raw.toLowerCase();
  return COUNTRY_ALIASES.get(lowered) || (raw.length === 2 ? raw.toUpperCase() : '');
}

export function normalizeCountryList(values = []) {
  const list = Array.isArray(values) ? values : String(values || '').split(',');
  return [...new Set(list.map(normalizeCountry).filter(Boolean))];
}

function validTimeZone(timeZone) {
  if (!timeZone) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date()); return true; }
  catch { return false; }
}

export function resolveRecipientTimeZone(prospect = {}) {
  const explicit = String(prospect.timeZone || prospect.timezone || '').trim();
  if (validTimeZone(explicit)) return explicit;
  const country = normalizeCountry(prospect.country || prospect.countryCode);
  return DEFAULT_TIMEZONES.get(country) || '';
}

export function localBusinessTime(timeZone, date = new Date()) {
  if (!validTimeZone(timeZone)) return { valid: false };
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return { valid: true, weekday: parts.weekday, hour: Number(parts.hour), minute: Number(parts.minute) };
}

export function contactEligibility(contact = {}, prospect = {}) {
  const email = normalizeEmail(contact.email || '');
  const domain = emailDomain(email);
  const prospectDomain = normalizeDomain(prospect.website || prospect.domain || '');
  if (!email || !domain || !prospectDomain) return { ok: false, reason: 'missing-contact' };
  if (isFreePersonalEmail(email)) return { ok: false, reason: 'free-mail-contact' };
  if (isRiskyMailbox(email)) return { ok: false, reason: 'risky-mailbox' };
  if (!isSameBusinessDomain(email, prospectDomain)) return { ok: false, reason: 'contact-domain-mismatch' };

  const evidence = Array.isArray(contact.evidence) ? contact.evidence : [];
  const supportedPublication = contact.published === true && evidence.some(item => {
    const sourceDomain = normalizeDomain(item?.sourceUrl || '');
    const sameSourceDomain = sourceDomain === prospectDomain || sourceDomain.endsWith(`.${prospectDomain}`);
    return item?.published === true && sameSourceDomain &&
      String(item.evidenceExcerpt || '').toLowerCase().includes(email);
  });
  if (contact.published === true && !supportedPublication) return { ok: false, reason: 'published-evidence-missing' };

  const status = String(contact.verificationStatus || contact.verified || '').toLowerCase();
  const externallyVerified = contact.externallyVerified === true && status === 'valid';
  if (!supportedPublication && !externallyVerified) return { ok: false, reason: 'contact-not-published-or-verified' };
  return { ok: true, mode: supportedPublication ? 'published' : 'externally_verified', email, domain };
}

export function evidenceEligibility(prospect = {}, campaign = {}, cfg = {}) {
  const issue = prospect.issue || {};
  const confidence = Number(issue.confidence || 0);
  const threshold = Math.max(
    Number(cfg.outbound?.minEvidenceConfidence ?? 0.75),
    Number(campaign.minimumEvidenceConfidence ?? campaign.minEvidenceConfidence ?? 0)
  );
  if (!issue.title || issue.safeForOutreach === false) return { ok: false, reason: 'unsafe-or-missing-evidence' };
  if (!issue.evidenceUrl || !issue.evidenceExcerpt) return { ok: false, reason: 'incomplete-evidence' };
  if (confidence < threshold) return { ok: false, reason: 'low-evidence-confidence' };
  if (normalizeDomain(issue.evidenceUrl) !== normalizeDomain(prospect.website)) return { ok: false, reason: 'evidence-domain-mismatch' };
  if (Number(prospect.score?.total || 0) < Number(campaign.minimumProspectScore ?? campaign.minScore ?? 0)) return { ok: false, reason: 'score-below-campaign-threshold' };
  return { ok: true };
}

export function deterministicCadenceSeconds(baseSeconds = 0, jitterSeconds = 0, key = '') {
  const base = Math.max(0, Math.floor(Number(baseSeconds || 0)));
  const jitter = Math.max(0, Math.min(3600, Math.floor(Number(jitterSeconds || 0))));
  if (!jitter) return base;
  const digest = crypto.createHash('sha256').update(String(key || 'outbound')).digest();
  return base + (digest.readUInt32BE(0) % (jitter + 1));
}

export function evaluateSendEligibility({ prospect = {}, campaign = {}, cfg = {}, date = new Date(), followup = 0, authorization = 'auto', simulation = false } = {}) {
  if (campaign.approved !== true || campaign.enabled === false) return { ok: false, reason: 'campaign-not-enabled' };
  const ownerApproved = authorization === 'owner-approved';
  if (ownerApproved) {
    if (Number(followup || 0) > 0) return { ok: false, reason: 'owner-approval-initial-only' };
    if (prospect.draftApproval?.status !== 'approved') return { ok: false, reason: 'owner-approval-required' };
    if (prospect.status !== 'scheduled') return { ok: false, reason: 'owner-schedule-required' };
  } else if (!campaign.autoSend) return { ok: false, reason: 'campaign-auto-send-disabled' };
  if (simulation) {
    if (cfg.outbound?.provider !== 'test') return { ok: false, reason: 'test-provider-required' };
    if (campaign.dryRun !== true || cfg.outbound?.dryRun !== true) return { ok: false, reason: 'test-provider-requires-dry-run' };
  } else {
    if (campaign.dryRun !== false) return { ok: false, reason: 'campaign-dry-run' };
    if (campaign.liveSendApproved !== true) return { ok: false, reason: 'campaign-live-send-not-approved' };
    if (!cfg.outbound?.enabled) return { ok: false, reason: 'outbound-disabled' };
    if (cfg.outbound?.dryRun) return { ok: false, reason: 'outbound-dry-run' };
    if (cfg.outbound?.liveSendApproved !== true) return { ok: false, reason: 'system-live-send-not-approved' };
    if (cfg.outbound?.provider !== 'gmail') return { ok: false, reason: 'gmail-provider-required' };
  }
  if (!String(cfg.sender?.address || '').trim()) return { ok: false, reason: 'business-address-missing' };
  if (!String(prospect.draft || '').trim() && Number(followup || 0) === 0) return { ok: false, reason: 'draft-missing' };
  if (Number(followup || 0) === 0) {
    const selectedDraft = prospect.outreach?.selected;
    if (selectedDraft?.quality?.passed !== true) return { ok: false, reason: 'draft-quality-gate' };
    if (String(selectedDraft.body || '').trim() !== String(prospect.draft || '').trim() || String(selectedDraft.subject || '').trim() !== String(prospect.subject || '').trim()) {
      return { ok: false, reason: 'draft-record-mismatch' };
    }
  }
  if (!String(prospect.unsubscribeUrl || '').startsWith('https://')) return { ok: false, reason: 'unsubscribe-link-missing' };
  if (!String(prospect.oneClickUnsubscribeUrl || '').startsWith('https://')) return { ok: false, reason: 'one-click-unsubscribe-missing' };
  const maximumFollowups = Number(campaign.maximumFollowups ?? campaign.maxFollowups ?? 0);
  if (Number(followup || 0) > maximumFollowups) return { ok: false, reason: 'followup-limit-exceeded' };
  if (Number(followup || 0) > 0 && (!prospect.threadId || !prospect.rfcMessageId)) return { ok: false, reason: 'followup-thread-metadata-missing' };
  const allowedInboxes = Array.isArray(campaign.allowedInboxes) ? campaign.allowedInboxes : [];
  if (allowedInboxes.length && !allowedInboxes.includes(prospect.inbox)) return { ok: false, reason: 'inbox-not-campaign-allowed' };

  const country = normalizeCountry(prospect.country || prospect.countryCode);
  const systemAllowlist = normalizeCountryList(cfg.outbound?.allowedCountries || []);
  const campaignAllowlist = normalizeCountryList(campaign.countries || campaign.allowedCountries || []);
  if (!country) return { ok: false, reason: 'country-missing' };
  if (!systemAllowlist.includes(country)) return { ok: false, reason: 'country-not-system-allowed', country };
  if (!campaignAllowlist.includes(country)) return { ok: false, reason: 'country-not-campaign-allowed', country };

  const contact = contactEligibility(prospect.contact, prospect);
  if (!contact.ok) return contact;
  const evidence = evidenceEligibility(prospect, campaign, cfg);
  if (!evidence.ok) return evidence;

  const timeZone = resolveRecipientTimeZone(prospect);
  if (!timeZone) return { ok: false, reason: 'recipient-timezone-missing' };
  const local = localBusinessTime(timeZone, date);
  const systemStart = Number(cfg.outbound?.businessHourStart ?? 9);
  const systemEnd = Number(cfg.outbound?.businessHourEnd ?? 17);
  const start = Math.max(systemStart, Number(campaign.businessHourStart ?? systemStart));
  const end = Math.min(systemEnd, Number(campaign.businessHourEnd ?? systemEnd));
  if (start >= end) return { ok: false, reason: 'business-hour-window-mismatch' };
  if (!local.valid) return { ok: false, reason: 'recipient-timezone-invalid' };
  if (['Sat', 'Sun'].includes(local.weekday) || local.hour < start || local.hour >= end) {
    return { ok: false, reason: 'outside-recipient-business-hours', timeZone, local };
  }
  return { ok: true, country, timeZone, local, contactMode: contact.mode };
}

export function sendIdempotencyKey(prospectId, followup = 0) {
  return followup > 0 ? `followup:${prospectId}:${followup}` : `initial:${prospectId}`;
}

export function classifyDeliverySignal(parsed = {}) {
  const from = String(parsed.from || '').toLowerCase();
  const subject = String(parsed.subject || '').toLowerCase();
  const body = String(parsed.body || '').toLowerCase();
  const haystack = `${from}\n${subject}\n${body}`;
  if (/mailer-daemon|postmaster|delivery status notification|undeliverable|address not found|recipient rejected|mailbox unavailable|550 5\.[0-9]\.[0-9]/.test(haystack)) {
    return { label: 'bounce', confidence: 0.98, reason: 'Delivery failure signal' };
  }
  if (/reported.*spam|spam complaint|abuse complaint|feedback loop/.test(haystack)) {
    return { label: 'complaint', confidence: 0.95, reason: 'Spam complaint signal' };
  }
  if (/out of office|automatic reply|auto-?reply|away from the office|vacation responder/.test(haystack)) {
    return { label: 'automatic', confidence: 0.92, reason: 'Automatic reply signal' };
  }
  return null;
}
