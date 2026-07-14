import { normalizeDomain } from './utils.mjs';

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com','googlemail.com','yahoo.com','yahoo.co.uk','outlook.com','hotmail.com','live.com',
  'icloud.com','me.com','aol.com','proton.me','protonmail.com','gmx.com','mail.com','zoho.com'
]);
const RISKY_LOCAL_PART = /^(?:no-?reply|donotreply|do-?not-?reply|abuse|privacy|legal|webmaster|postmaster|security|mailer-daemon)$/i;

const COUNTRY_ALIASES = new Map(Object.entries({
  gb:'GB',uk:'GB','united kingdom':'GB','great britain':'GB',england:'GB',scotland:'GB',wales:'GB',
  ie:'IE',ireland:'IE',de:'DE',germany:'DE',fr:'FR',france:'FR',nl:'NL',netherlands:'NL',
  be:'BE',belgium:'BE',ch:'CH',switzerland:'CH',at:'AT',austria:'AT',es:'ES',spain:'ES',
  pt:'PT',portugal:'PT',it:'IT',italy:'IT',se:'SE',sweden:'SE',no:'NO',norway:'NO',
  dk:'DK',denmark:'DK',fi:'FI',finland:'FI',nz:'NZ','new zealand':'NZ',sg:'SG',singapore:'SG',
  us:'US',usa:'US','united states':'US','united states of america':'US',ca:'CA',canada:'CA',
  au:'AU',australia:'AU'
}));

const DEFAULT_TIMEZONES = new Map(Object.entries({
  GB:'Europe/London', IE:'Europe/Dublin', DE:'Europe/Berlin', FR:'Europe/Paris', NL:'Europe/Amsterdam',
  BE:'Europe/Brussels', CH:'Europe/Zurich', AT:'Europe/Vienna', ES:'Europe/Madrid', PT:'Europe/Lisbon',
  IT:'Europe/Rome', SE:'Europe/Stockholm', NO:'Europe/Oslo', DK:'Europe/Copenhagen', FI:'Europe/Helsinki',
  NZ:'Pacific/Auckland', SG:'Asia/Singapore'
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

export function emailDomain(email = '') {
  return String(email || '').trim().toLowerCase().split('@')[1] || '';
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
  const email = String(contact.email || '').trim().toLowerCase();
  const domain = emailDomain(email);
  const prospectDomain = normalizeDomain(prospect.website || prospect.domain || '');
  const local = email.split('@')[0] || '';
  if (!email || !domain || !prospectDomain) return { ok: false, reason: 'missing-contact' };
  if (FREE_EMAIL_DOMAINS.has(domain)) return { ok: false, reason: 'free-mail-contact' };
  if (RISKY_LOCAL_PART.test(local)) return { ok: false, reason: 'risky-mailbox' };
  if (!(domain === prospectDomain || domain.endsWith(`.${prospectDomain}`))) return { ok: false, reason: 'contact-domain-mismatch' };
  const published = contact.source === 'website';
  const positivelyVerified = String(contact.verified || '').toLowerCase() === 'valid';
  if (!published && !positivelyVerified) return { ok: false, reason: 'contact-not-published-or-verified' };
  return { ok: true, mode: published ? 'published' : 'verified', email, domain };
}

export function evidenceEligibility(prospect = {}, campaign = {}, cfg = {}) {
  const issue = prospect.issue || {};
  const confidence = Number(issue.confidence || 0);
  const threshold = Number(cfg.outbound?.minEvidenceConfidence ?? 0.75);
  if (!issue.title || issue.safeForOutreach === false) return { ok: false, reason: 'unsafe-or-missing-evidence' };
  if (!issue.evidenceUrl || !issue.evidenceExcerpt) return { ok: false, reason: 'incomplete-evidence' };
  if (confidence < threshold) return { ok: false, reason: 'low-evidence-confidence' };
  if (normalizeDomain(issue.evidenceUrl) !== normalizeDomain(prospect.website)) return { ok: false, reason: 'evidence-domain-mismatch' };
  if (Number(prospect.score?.total || 0) < Number(campaign.minScore || 0)) return { ok: false, reason: 'score-below-campaign-threshold' };
  return { ok: true };
}

export function evaluateSendEligibility({ prospect = {}, campaign = {}, cfg = {}, date = new Date(), followup = 0 } = {}) {
  if (!campaign.approved || !campaign.autoSend) return { ok: false, reason: 'campaign-not-enabled' };
  if (!cfg.outbound?.enabled) return { ok: false, reason: 'outbound-disabled' };
  if (cfg.outbound?.dryRun) return { ok: false, reason: 'outbound-dry-run' };
  if (!String(cfg.sender?.address || '').trim()) return { ok: false, reason: 'business-address-missing' };
  if (!String(prospect.draft || '').trim() && Number(followup || 0) === 0) return { ok: false, reason: 'draft-missing' };
  if (!String(prospect.unsubscribeUrl || '').startsWith('https://')) return { ok: false, reason: 'unsubscribe-link-missing' };
  if (!String(prospect.oneClickUnsubscribeUrl || '').startsWith('https://')) return { ok: false, reason: 'one-click-unsubscribe-missing' };

  const country = normalizeCountry(prospect.country || prospect.countryCode);
  const systemAllowlist = normalizeCountryList(cfg.outbound?.allowedCountries || []);
  const campaignAllowlist = normalizeCountryList(campaign.allowedCountries || []);
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
  const start = Number(cfg.outbound?.businessHourStart ?? 9);
  const end = Number(cfg.outbound?.businessHourEnd ?? 17);
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
